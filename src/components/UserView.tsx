import { useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { ImagePlus, Link2, RotateCcw } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { useNanaStore } from '../stores/nanaStore';
import { AnimatedPressable } from './primitives';
import { CharacterPortrait } from './CharacterPortrait';
import {
  cleanupReplacedAvatar,
  createUserAvatarStatePatch,
  pickCharacterAvatarFromLibrary,
} from '../services/nativeImagePickerRuntime';
import { normalizeAvatarValue } from '../services/avatarValueRuntime';
import { NeumorphicSurface, neumorphicPalette } from './neumorphic-surface';

const isImageAvatar = (avatar: string) => /^(https?:|data:|file:|content:|blob:)/.test(avatar.trim());
const isLocalAvatar = (avatar: string) => /^(data:|file:|content:|blob:)/.test(avatar.trim());

function UserField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
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
          onChangeText={onChangeText}
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

export function UserView() {
  const { t } = useApp();
  const tempMyName = useNanaStore(s => s.tempMyName);
  const tempMyAvatar = useNanaStore(s => s.tempMyAvatar);
  const tempMyDesc = useNanaStore(s => s.tempMyDesc);
  const myAvatar = useNanaStore(s => s.myAvatar);
  const set = useNanaStore.setState;
  const [avatarPickerBusy, setAvatarPickerBusy] = useState(false);
  const [showAvatarTextInput, setShowAvatarTextInput] = useState(false);

  const handleChooseAvatar = async () => {
    if (avatarPickerBusy) return;
    setAvatarPickerBusy(true);
    const previousAvatar = tempMyAvatar;
    try {
      const result = await pickCharacterAvatarFromLibrary({
        kind: 'user-avatar-draft',
        draft: { tempMyName, tempMyAvatar, tempMyDesc },
      });
      if (result.phase === 'ready' && result.localUri) {
        set({ tempMyAvatar: result.localUri });
        setShowAvatarTextInput(false);
        cleanupReplacedAvatar(previousAvatar, useNanaStore.getState());
      } else if (result.phase === 'failed') {
        set({ islandNotification: { title: t.photoLibrary, desc: t.portraitPickerError, status: 'error' } });
      }
    } finally {
      setAvatarPickerBusy(false);
    }
  };

  const handleAvatarTextChange = (value: string) => {
    const previousAvatar = tempMyAvatar;
    set({ tempMyAvatar: value });
    if (value !== previousAvatar) cleanupReplacedAvatar(previousAvatar, useNanaStore.getState());
  };

  const handleRestoreDefaultAvatar = () => {
    handleAvatarTextChange('U');
    setShowAvatarTextInput(false);
  };

  const handleUseAvatarText = () => {
    if (isLocalAvatar(tempMyAvatar)) handleAvatarTextChange('');
    setShowAvatarTextInput(true);
  };

  const handleSave = () => {
    const state = useNanaStore.getState();
    const previousAvatar = myAvatar;
    const candidate = tempMyAvatar.trim() || 'U';
    const normalizedAvatar = normalizeAvatarValue(candidate, Platform.OS === 'web' ? 'web' : 'native');
    if (!normalizedAvatar.ok) {
      set({ islandNotification: { title: t.avatarEmojiUrl, desc: t.portraitPickerError, status: 'error' } });
      return;
    }
    const avatarPatch = createUserAvatarStatePatch(state, normalizedAvatar.value || 'U');
    set({
      ...avatarPatch,
      myName: tempMyName.trim() || 'User',
      myDesc: tempMyDesc.trim() || 'I am a friendly user.',
    });
    cleanupReplacedAvatar(previousAvatar, useNanaStore.getState());
  };

  const avatarActions = [
    {
      key: 'restore',
      label: t.restoreDefaultPortrait,
      Icon: RotateCcw,
      tone: 'lavender' as const,
      onPress: handleRestoreDefaultAvatar,
    },
    {
      key: 'text',
      label: t.useAvatarText,
      Icon: Link2,
      tone: 'lavender' as const,
      onPress: handleUseAvatarText,
    },
  ];

  return (
    <ScrollView
      style={{ flex: 1 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: 3, paddingBottom: 36 }}
    >
      <View style={{ alignItems: 'center', marginBottom: 24 }}>
        <NeumorphicSurface
          testID="user-neumorphic-avatar"
          depth="raised"
          tone="pinkGold"
          radius={45}
          style={{ width: 90, height: 90 }}
          contentStyle={{ overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: 4 }}
        >
          <View style={{ flex: 1, alignSelf: 'stretch', borderRadius: 41, overflow: 'hidden' }}>
            <CharacterPortrait avatar={tempMyAvatar || myAvatar} fallback={tempMyName.trim()[0] || 'U'} fontSize={32} color={neumorphicPalette.onLightPrimary} />
          </View>
        </NeumorphicSurface>

        <View style={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 9, marginTop: 15 }}>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={t.choosePortrait}
            disabled={avatarPickerBusy}
            onPress={() => { void handleChooseAvatar(); }}
            style={{ minHeight: 44, borderRadius: 999 }}
          >
            <NeumorphicSurface
              pointerEvents="none"
              depth="raisedSmall"
              tone="pinkGold"
              radius={999}
              fill={false}
              contentStyle={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 15 }}
            >
              {avatarPickerBusy
                ? <ActivityIndicator size="small" color={neumorphicPalette.onLightPrimary} />
                : <ImagePlus size={16} color={neumorphicPalette.onLightPrimary} />}
              <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, fontWeight: '800' }}>
                {isImageAvatar(tempMyAvatar) ? t.changePortrait : t.choosePortrait}
              </Text>
            </NeumorphicSurface>
          </AnimatedPressable>
          {avatarActions.map(({ key, label, Icon, tone, onPress }) => (
            <AnimatedPressable key={key} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ minHeight: 44, borderRadius: 999 }}>
              <NeumorphicSurface
                pointerEvents="none"
                depth="raisedSmall"
                tone={tone}
                radius={999}
                fill={false}
                contentStyle={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 13 }}
              >
                <Icon size={15} color={neumorphicPalette.onLightPrimary} />
                <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, fontWeight: '800' }}>{label}</Text>
              </NeumorphicSurface>
            </AnimatedPressable>
          ))}
        </View>
      </View>

      <NeumorphicSurface
        testID="user-neumorphic-form"
        depth="raised"
        tone="lavender"
        radius={22}
        fill={false}
        contentStyle={{ padding: 16 }}
      >
        <UserField label={(t as any).name} value={tempMyName} onChangeText={(value) => set({ tempMyName: value })} placeholder={(t as any).name} />
        {showAvatarTextInput ? (
          <UserField
            label={t.avatarEmojiUrl}
            value={isLocalAvatar(tempMyAvatar) ? '' : tempMyAvatar}
            onChangeText={handleAvatarTextChange}
            placeholder="https://… / 🌐"
          />
        ) : null}
        <UserField label={(t as any).description} value={tempMyDesc} onChangeText={(value) => set({ tempMyDesc: value })} placeholder={(t as any).description} multiline />
        <AnimatedPressable accessibilityRole="button" accessibilityLabel={t.save} onPress={handleSave} style={{ minHeight: 50, borderRadius: 18 }}>
          <NeumorphicSurface
            pointerEvents="none"
            depth="raisedSmall"
            tone="pinkGold"
            radius={18}
            style={{ position: 'absolute', inset: 0 }}
            contentStyle={{ alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 15, fontWeight: '800' }}>{t.save}</Text>
          </NeumorphicSurface>
        </AnimatedPressable>
      </NeumorphicSurface>
    </ScrollView>
  );
}
