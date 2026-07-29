import { useState } from 'react';
import { ActivityIndicator, Platform, View, Text, TextInput, ScrollView, Switch } from 'react-native';
import { Check, ImagePlus, Link2, Mic2, RotateCcw, Video } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { useNanaStore } from '../stores/nanaStore';
import { AnimatedPressable } from './primitives';
import type { ChatReplyPreference, ReplyMode } from '../types';
import { CharacterPortrait } from './CharacterPortrait';
import {
  cleanupReplacedAvatar,
  createCharacterAvatarStatePatch,
  pickCharacterAvatarFromLibrary,
  type CharacterAvatarDraftSnapshot,
} from '../services/nativeImagePickerRuntime';
import { normalizeAvatarValue } from '../services/avatarValueRuntime';
import { REMOTE_VOICE_PRESETS } from '../services/voiceProviderRuntime';
import { NeumorphicSurface, neumorphicPalette } from './neumorphic-surface';

const isImageAvatar = (avatar: string) => /^(https?:|data:|file:|content:|blob:)/.test(avatar.trim());
const isLocalAvatar = (avatar: string) => /^(data:|file:|content:|blob:)/.test(avatar.trim());
const defaultAvatarFor = (characterId: string | null, name: string) => {
  if (characterId === 'luna-id') return 'L';
  if (characterId === 'kai-id') return 'K';
  if (characterId === 'aria-id') return 'A';
  return name.trim()[0] || 'U';
};
const preferenceFromLegacy = (mode?: ReplyMode): ChatReplyPreference => {
  if (mode === 'text') return 'textOnly';
  if (mode === 'voice') return 'voicePreferred';
  return 'adaptive';
};
const legacyFromPreference = (preference?: ChatReplyPreference): ReplyMode => {
  if (preference === 'textOnly') return 'text';
  if (preference === 'voicePreferred') return 'voice';
  return 'auto';
};

function MediaToggle({
  label,
  value,
  onValueChange,
  testID,
}: {
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  testID?: string;
}) {
  return (
    <View style={{ minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5 }}>
      <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 13, fontWeight: '800', flex: 1, paddingRight: 10 }}>{label}</Text>
      <Switch
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: neumorphicPalette.lavender, true: neumorphicPalette.pinkGold }}
        thumbColor={neumorphicPalette.onLightPrimary}
      />
    </View>
  );
}

function CharacterField({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, fontWeight: '800', marginBottom: 8, paddingHorizontal: 4 }}>{label}</Text>
      <NeumorphicSurface
        depth="inset"
        tone="lavender"
        radius={16}
        style={{ minHeight: multiline ? 108 : 48 }}
        contentStyle={{ paddingHorizontal: 15, paddingVertical: multiline ? 12 : 0 }}
      >
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={neumorphicPalette.onLightSecondary}
          multiline={multiline}
          style={{
            flex: multiline ? 1 : undefined,
            minHeight: multiline ? 84 : 48,
            paddingVertical: 0,
            color: neumorphicPalette.onLightPrimary,
            fontSize: 15,
            textAlignVertical: multiline ? 'top' : 'center',
          }}
        />
      </NeumorphicSurface>
    </View>
  );
}

export function CharacterView() {
  const { t } = useApp();
  const characters = useNanaStore(s => s.characters);
  const editingCharId = useNanaStore(s => s.editingCharId);
  const characterEditorOpen = useNanaStore(s => s.characterEditorOpen);
  const newCharName = useNanaStore(s => s.newCharName);
  const newCharAvatar = useNanaStore(s => s.newCharAvatar);
  const newCharDesc = useNanaStore(s => s.newCharDesc);
  const newCharGender = useNanaStore(s => s.newCharGender);
  const newCharAge = useNanaStore(s => s.newCharAge);
  const newCharPreferredReplyMode = useNanaStore(s => s.newCharPreferredReplyMode);
  const newCharSupportsVoiceReply = useNanaStore(s => s.newCharSupportsVoiceReply);
  const newCharVoiceProfileId = useNanaStore(s => s.newCharVoiceProfileId);
  const newCharSupportsVideoPersona = useNanaStore(s => s.newCharSupportsVideoPersona);
  const newCharVideoPersonaAsset = useNanaStore(s => s.newCharVideoPersonaAsset);
  const friends = useNanaStore(s => s.friends);
  const set = useNanaStore.setState;
  const replyPreferences: ChatReplyPreference[] = ['adaptive', 'textOnly', 'voicePreferred'];
  const [avatarPickerBusy, setAvatarPickerBusy] = useState(false);
  const [showAvatarTextInput, setShowAvatarTextInput] = useState(false);
  const selectedReplyPreference = preferenceFromLegacy(newCharPreferredReplyMode);
  const replyPreferenceLabel = (preference: ChatReplyPreference) => ({
    adaptive: t.replyAdaptive,
    textOnly: t.replyTextOnly,
    voicePreferred: t.replyVoicePreferred,
  })[preference];

  const resetEditor = () => {
    setShowAvatarTextInput(false);
    set({
      editingCharId: null,
      characterEditorOpen: false,
      newCharName: '',
      newCharAvatar: '',
      newCharDesc: '',
      newCharGender: '',
      newCharAge: '',
      newCharPreferredReplyMode: 'auto',
      newCharSupportsVoiceReply: false,
      newCharVoiceProfileId: '',
      newCharSupportsVideoPersona: false,
      newCharVideoPersonaAsset: '',
    });
  };

  const currentDraftSnapshot = (): CharacterAvatarDraftSnapshot => ({
    editingCharId,
    newCharName,
    newCharAvatar,
    newCharDesc,
    newCharGender,
    newCharAge,
    newCharPreferredReplyMode,
    newCharSupportsVoiceReply,
    newCharVoiceProfileId,
    newCharSupportsVideoPersona,
    newCharVideoPersonaAsset,
  });

  const handleChooseAvatar = async () => {
    if (avatarPickerBusy) return;
    setAvatarPickerBusy(true);
    const previousAvatar = newCharAvatar;
    try {
      const result = await pickCharacterAvatarFromLibrary({
        kind: 'character-avatar-draft',
        draft: currentDraftSnapshot(),
      });
      if (result.phase === 'ready' && result.localUri) {
        set({ newCharAvatar: result.localUri });
        setShowAvatarTextInput(false);
        cleanupReplacedAvatar(previousAvatar, useNanaStore.getState());
      } else if (result.phase === 'failed') {
        set({
          islandNotification: {
            title: t.photoLibrary,
            desc: t.portraitPickerError,
            status: 'error',
          },
        });
      }
    } finally {
      setAvatarPickerBusy(false);
    }
  };

  const handleAvatarTextChange = (value: string) => {
    const previousAvatar = newCharAvatar;
    set({ newCharAvatar: value });
    if (value !== previousAvatar) cleanupReplacedAvatar(previousAvatar, useNanaStore.getState());
  };

  const handleRestoreDefaultAvatar = () => {
    handleAvatarTextChange(defaultAvatarFor(editingCharId, newCharName));
    setShowAvatarTextInput(false);
  };

  const handleUseAvatarText = () => {
    if (isLocalAvatar(newCharAvatar)) handleAvatarTextChange('');
    setShowAvatarTextInput(true);
  };

  const handleCancelEditor = () => {
    const state = useNanaStore.getState();
    const persistedAvatar = editingCharId
      ? state.characters.find(character => character.id === editingCharId)?.avatar
      : undefined;
    if (newCharAvatar && newCharAvatar !== persistedAvatar) {
      cleanupReplacedAvatar(newCharAvatar, state);
    }
    resetEditor();
  };

  const handleSave = () => {
    if (!newCharName.trim()) return;
    const state = useNanaStore.getState();
    const previousAvatar = editingCharId
      ? state.characters.find(character => character.id === editingCharId)?.avatar
      : undefined;
    const candidateAvatar = newCharAvatar.trim() || previousAvatar || 'U';
    const normalizedAvatar = normalizeAvatarValue(candidateAvatar, Platform.OS === 'web' ? 'web' : 'native');
    if (!normalizedAvatar.ok) {
      set({
        islandNotification: {
          title: t.avatarEmojiUrl,
          desc: t.portraitPickerError,
          status: 'error',
        },
      });
      return;
    }
    const nextAvatar = normalizedAvatar.value || 'U';
    if (editingCharId) {
      const avatarPatch = createCharacterAvatarStatePatch(state, editingCharId, nextAvatar);
      set({
        ...avatarPatch,
        characters: avatarPatch.characters.map(c =>
          c.id === editingCharId
            ? {
                ...c,
                name: newCharName.trim(),
                avatar: nextAvatar,
                desc: newCharDesc.trim(),
                gender: newCharGender.trim() || undefined,
                age: newCharAge.trim() || undefined,
                preferredReplyMode: newCharPreferredReplyMode,
                chatReplyPreference: selectedReplyPreference,
                supportsVoiceReply: newCharSupportsVoiceReply,
                voiceProfileId: newCharSupportsVoiceReply ? (newCharVoiceProfileId.trim() || undefined) : undefined,
                supportsVideoPersona: newCharSupportsVideoPersona,
                videoPersonaAsset: newCharSupportsVideoPersona ? (newCharVideoPersonaAsset.trim() || undefined) : undefined,
              }
            : c
        ),
        editingCharId: null,
        characterEditorOpen: false,
      });
      cleanupReplacedAvatar(previousAvatar, useNanaStore.getState());
    } else {
      const newChar = {
        id: Date.now().toString(),
        name: newCharName.trim(),
        avatar: nextAvatar,
        desc: newCharDesc.trim(),
        gender: newCharGender.trim() || undefined,
        age: newCharAge.trim() || undefined,
        preferredReplyMode: newCharPreferredReplyMode,
        chatReplyPreference: selectedReplyPreference,
        supportsVoiceReply: newCharSupportsVoiceReply,
        voiceProfileId: newCharSupportsVoiceReply ? (newCharVoiceProfileId.trim() || undefined) : undefined,
        supportsVideoPersona: newCharSupportsVideoPersona,
        videoPersonaAsset: newCharSupportsVideoPersona ? (newCharVideoPersonaAsset.trim() || undefined) : undefined,
        proactiveMessagingEnabled: true,
      };
      set({ characters: [...state.characters, newChar], editingCharId: null, characterEditorOpen: false });
    }
    resetEditor();
  };

  return (
    <View className="flex-1">
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingTop: characterEditorOpen ? 0 : 10,
          paddingBottom: 40,
        }}
      >
        {!characterEditorOpen && characters.map(c => (
          <AnimatedPressable
            key={c.id}
            testID={`character-row-${c.id}`}
            onPress={() => {
              setShowAvatarTextInput(false);
              set({
                characterEditorOpen: true,
                editingCharId: c.id,
                newCharName: c.name,
                newCharAvatar: c.avatar,
                newCharDesc: c.desc || '',
                newCharGender: c.gender || '',
                newCharAge: c.age || '',
                newCharPreferredReplyMode: c.chatReplyPreference
                  ? legacyFromPreference(c.chatReplyPreference)
                  : (c.preferredReplyMode || 'auto'),
                newCharSupportsVoiceReply: !!c.supportsVoiceReply,
                newCharVoiceProfileId: c.voiceProfileId || '',
                newCharSupportsVideoPersona: !!c.supportsVideoPersona,
                newCharVideoPersonaAsset: c.videoPersonaAsset || '',
              });
            }}
            style={{
              marginBottom: 22,
              borderRadius: 18,
              overflow: 'visible',
            }}
          >
            <NeumorphicSurface
              depth="raised"
              tone="lavender"
              radius={18}
              fill={false}
              contentStyle={{ minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}
            >
            <View className="w-12 h-12 rounded-xl items-center justify-center overflow-hidden" style={{ backgroundColor: neumorphicPalette.champagnePink }}>
              <CharacterPortrait characterId={c.id} avatar={c.avatar} fallback={c.name[0] || 'N'} fontSize={24} color={neumorphicPalette.onLightPrimary} />
            </View>
            <View className="flex-1">
              <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 15, fontWeight: '800' }}>{c.name}</Text>
              {(c.gender || c.age) ? (
                <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11 }} numberOfLines={1}>
                  {[c.gender, c.age].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
              {c.desc ? <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 12 }} numberOfLines={2}>{c.desc}</Text> : null}
              <View className="flex-row gap-1.5 mt-2 flex-wrap">
                {c.supportsVoiceReply && (
                  <View className="flex-row items-center gap-1 px-2 py-0.5 rounded-full" style={{ backgroundColor: neumorphicPalette.lavender, boxShadow: 'inset 2px 2px 5px rgba(54,43,67,0.24), inset -2px -2px 5px rgba(255,248,255,0.30)' }}>
                    <Mic2 size={10} color={neumorphicPalette.onLightPrimary} />
                    <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 10, fontWeight: '800' }}>{t.voiceBadge}</Text>
                  </View>
                )}
                {c.supportsVideoPersona && (
                  <View className="flex-row items-center gap-1 px-2 py-0.5 rounded-full" style={{ backgroundColor: neumorphicPalette.pinkGold, boxShadow: 'inset 2px 2px 5px rgba(54,43,67,0.24), inset -2px -2px 5px rgba(255,248,255,0.30)' }}>
                    <Video size={10} color={neumorphicPalette.onLightPrimary} />
                    <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 10, fontWeight: '800' }}>{t.videoBadge}</Text>
                  </View>
                )}
              </View>
            </View>
            {friends.includes(c.id) ? (
              <View style={{ minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8 }}>
                <Check size={13} color="#345848" strokeWidth={2.2} />
                <Text style={{ color: '#345848', fontSize: 11, fontWeight: '700' }}>{t.added}</Text>
              </View>
            ) : (
              <AnimatedPressable
                onPress={() => set({ friends: [...useNanaStore.getState().friends, c.id] })}
                style={{ minHeight: 36, borderRadius: 13 }}
              >
                <NeumorphicSurface
                  pointerEvents="none"
                  depth="raisedSmall"
                  tone="pinkGold"
                  radius={13}
                  contentStyle={{ paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 11, fontWeight: '800' }}>{t.add}</Text>
                </NeumorphicSurface>
              </AnimatedPressable>
            )}
            </NeumorphicSurface>
          </AnimatedPressable>
        ))}

        {characterEditorOpen && (
          <View
            className="rounded-2xl p-4 mb-8"
            style={{
              backgroundColor: neumorphicPalette.lavender,
              boxShadow: '-4px -4px 8px rgba(255,248,255,0.46), 4px 5px 8px rgba(54,43,67,0.22), inset 0 1px 1px rgba(255,255,255,0.22)',
            }}
          >
            <CharacterField label={t.name} value={newCharName} onChange={(v) => set({ newCharName: v })} placeholder={t.name} />
            <View className="items-center mb-4">
              <View style={{ width: 84, height: 84, borderRadius: 42, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                <CharacterPortrait
                  characterId={editingCharId}
                  avatar={newCharAvatar}
                  fallback={newCharName.trim()[0] || 'U'}
                  fontSize={32}
                  color={neumorphicPalette.onLightPrimary}
                />
              </View>
              <View className="flex-row flex-wrap justify-center gap-2 mt-3">
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityLabel="Choose portrait from phone photos"
                  disabled={avatarPickerBusy}
                  onPress={() => { void handleChooseAvatar(); }}
                  className="min-h-10 rounded-full flex-row items-center justify-center gap-2 px-4"
                  style={{ backgroundColor: neumorphicPalette.pinkGold, boxShadow: '-3px -3px 6px rgba(255,248,255,0.42), 3px 4px 6px rgba(54,43,67,0.20)' }}
                >
                  {avatarPickerBusy ? <ActivityIndicator size="small" color={neumorphicPalette.onLightPrimary} /> : <ImagePlus size={17} color={neumorphicPalette.onLightPrimary} />}
                  <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, fontWeight: '800' }}>{isImageAvatar(newCharAvatar) ? t.changePortrait : t.choosePortrait}</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  accessibilityRole="button"
                  onPress={handleRestoreDefaultAvatar}
                  className="min-h-10 rounded-full flex-row items-center justify-center gap-1.5 px-3"
                  style={{ backgroundColor: neumorphicPalette.lavender, boxShadow: '-3px -3px 6px rgba(255,248,255,0.42), 3px 4px 6px rgba(54,43,67,0.20)' }}
                >
                  <RotateCcw size={15} color={neumorphicPalette.onLightPrimary} />
                  <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, fontWeight: '800' }}>{t.restoreDefaultPortrait}</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  accessibilityRole="button"
                  onPress={handleUseAvatarText}
                  className="min-h-10 rounded-full flex-row items-center justify-center gap-1.5 px-3"
                  style={{ backgroundColor: neumorphicPalette.lavender, boxShadow: '-3px -3px 6px rgba(255,248,255,0.42), 3px 4px 6px rgba(54,43,67,0.20)' }}
                >
                  <Link2 size={15} color={neumorphicPalette.onLightPrimary} />
                  <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, fontWeight: '800' }}>{t.useAvatarText}</Text>
                </AnimatedPressable>
              </View>
            </View>
            {showAvatarTextInput ? (
              <CharacterField
                label={t.avatarEmojiUrl}
                value={isLocalAvatar(newCharAvatar) ? '' : newCharAvatar}
                onChange={handleAvatarTextChange}
                placeholder="https://…  /  🌙"
              />
            ) : null}
            <View className="flex-row gap-3">
              <View className="flex-1">
                <CharacterField label={t.gender} value={newCharGender} onChange={(v) => set({ newCharGender: v })} placeholder={t.gender} />
              </View>
              <View className="flex-1">
                <CharacterField label={t.age} value={newCharAge} onChange={(v) => set({ newCharAge: v })} placeholder={t.age} />
              </View>
            </View>
            <CharacterField label={t.description} value={newCharDesc} onChange={(v) => set({ newCharDesc: v })} placeholder={t.description} multiline />
            <View
              className="rounded-2xl p-3 mb-4"
              style={{
                backgroundColor: neumorphicPalette.lavender,
                boxShadow: 'inset 3px 3px 7px rgba(54,43,67,0.24), inset -3px -3px 7px rgba(255,248,255,0.30), 0 1px 0 rgba(255,255,255,0.14)',
              }}
            >
              <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 13, fontWeight: '800', marginBottom: 8 }}>{t.mediaAbilities || 'Media Abilities'}</Text>
              <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11, lineHeight: 16, marginBottom: 12 }}>
                {t.mediaAbilitiesDesc}
              </Text>
              <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, fontWeight: '800', marginBottom: 8 }}>{t.replyPreference}</Text>
              <View testID="character-reply-preference-row" className="flex-row gap-2 mb-3">
                {replyPreferences.map(preference => (
                  <View key={preference} style={{ flex: 1, minWidth: 0 }}>
                    <AnimatedPressable
                      onPress={() => set({ newCharPreferredReplyMode: legacyFromPreference(preference) })}
                      style={{
                        width: '100%',
                        minHeight: 36,
                        borderRadius: 999,
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingHorizontal: 5,
                        paddingVertical: 8,
                        backgroundColor: selectedReplyPreference === preference ? neumorphicPalette.pinkGold : neumorphicPalette.lavender,
                        boxShadow: selectedReplyPreference === preference
                          ? '-3px -3px 6px rgba(255,248,255,0.42), 3px 4px 6px rgba(54,43,67,0.20)'
                          : 'inset 2px 2px 5px rgba(54,43,67,0.24), inset -2px -2px 5px rgba(255,248,255,0.30)',
                      }}
                    >
                      <Text
                        numberOfLines={1}
                        style={{
                          color: neumorphicPalette.onLightPrimary,
                          fontSize: 10.5,
                          lineHeight: 14,
                          fontWeight: '800',
                        }}
                      >
                        {replyPreferenceLabel(preference)}
                      </Text>
                    </AnimatedPressable>
                  </View>
                ))}
              </View>
              <MediaToggle
                testID="character-voice-reply-toggle"
                label={t.voiceProfile || 'Voice profile'}
                value={newCharSupportsVoiceReply}
                onValueChange={(next) => set({ newCharSupportsVoiceReply: next })}
              />
              {newCharSupportsVoiceReply && (
                <View style={{ marginTop: 2, marginBottom: 14 }}>
                  <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, fontWeight: '800', marginBottom: 9, paddingHorizontal: 4 }}>
                    {t.voicePresets || 'Quick voice choices'}
                  </Text>
                  <View
                    accessibilityRole="radiogroup"
                    style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}
                  >
                    {REMOTE_VOICE_PRESETS.map(voiceId => {
                      const selected = (newCharVoiceProfileId.trim() || 'alloy') === voiceId;
                      return (
                        <AnimatedPressable
                          key={voiceId}
                          accessibilityRole="radio"
                          accessibilityLabel={voiceId}
                          accessibilityState={{ selected }}
                          onPress={() => set({ newCharVoiceProfileId: voiceId })}
                          style={{ minWidth: 74, minHeight: 40, borderRadius: 999 }}
                        >
                          <NeumorphicSurface
                            pointerEvents="none"
                            depth={selected ? 'inset' : 'raisedSmall'}
                            tone={selected ? 'pinkGold' : 'lavender'}
                            radius={999}
                            style={{ position: 'absolute', inset: 0 }}
                            contentStyle={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}
                          >
                            <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, fontWeight: '800' }}>
                              {voiceId}
                            </Text>
                          </NeumorphicSurface>
                        </AnimatedPressable>
                      );
                    })}
                  </View>
                  <CharacterField
                    label={t.voiceProfileId || 'Voice Profile ID'}
                    value={newCharVoiceProfileId}
                    onChange={(v) => set({ newCharVoiceProfileId: v })}
                    placeholder="alloy / custom voice ID"
                  />
                  <AnimatedPressable
                    testID="character-test-voice"
                    accessibilityRole="button"
                    accessibilityLabel={t.testVoice}
                    onPress={() => {
                      void useNanaStore.getState().previewCharacterVoice({
                        characterId: editingCharId || undefined,
                        characterName: newCharName.trim() || undefined,
                        voiceProfileId: newCharVoiceProfileId.trim() || 'alloy',
                      });
                    }}
                    style={{ minHeight: 46, borderRadius: 999 }}
                  >
                    <NeumorphicSurface
                      pointerEvents="none"
                      depth="raisedSmall"
                      tone="champagnePink"
                      radius={999}
                      style={{ position: 'absolute', inset: 0 }}
                      contentStyle={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 }}
                    >
                      <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 13, fontWeight: '800' }}>
                        {t.testVoice}
                      </Text>
                    </NeumorphicSurface>
                  </AnimatedPressable>
                </View>
              )}
              <MediaToggle
                testID="character-video-persona-toggle"
                label={t.videoPersona || 'Video persona'}
                value={newCharSupportsVideoPersona}
                onValueChange={(next) => set({ newCharSupportsVideoPersona: next })}
              />
              {newCharSupportsVideoPersona && (
                <CharacterField
                  label={t.videoPersonaAsset || 'Video Persona Asset'}
                  value={newCharVideoPersonaAsset}
                  onChange={(v) => set({ newCharVideoPersonaAsset: v })}
                  placeholder="live2d/luna.model3.json"
                />
              )}
            </View>
            <View className="flex-row gap-3">
              <AnimatedPressable
                onPress={handleCancelEditor}
                className="flex-1 py-3 rounded-full items-center"
                style={{ backgroundColor: neumorphicPalette.lavender, boxShadow: '-3px -3px 6px rgba(255,248,255,0.42), 3px 4px 6px rgba(54,43,67,0.20)' }}
              >
                <Text style={{ color: neumorphicPalette.onLightPrimary, fontWeight: '800' }}>{t.cancel}</Text>
              </AnimatedPressable>
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel={t.save}
                onPress={handleSave}
                className="flex-[2] py-3 rounded-full items-center"
                style={{ flex: 2, backgroundColor: neumorphicPalette.pinkGold, boxShadow: '-3px -3px 6px rgba(255,248,255,0.42), 3px 4px 6px rgba(54,43,67,0.20)' }}
              >
                <Text style={{ color: neumorphicPalette.onLightPrimary, fontWeight: '800' }}>{t.save}</Text>
              </AnimatedPressable>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
