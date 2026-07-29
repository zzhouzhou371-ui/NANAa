import { useState } from 'react';
import { ActivityIndicator, View, Text, ScrollView, Switch } from 'react-native';
import { AudioLines, BellRing, ImagePlus, MessageCircle, Smile, Video } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { useNanaStore } from '../stores/nanaStore';
import { AnimatedPressable } from './primitives';
import { wechatTheme } from './wechatTheme';
import { CharacterPortrait } from './CharacterPortrait';
import { NeumorphicSurface, neumorphicPalette } from './neumorphic-surface';
import {
  cleanupReplacedAvatar,
  createCharacterAvatarStatePatch,
  pickCharacterAvatarFromLibrary,
  pickPhotoFromLibrary,
} from '../services/nativeImagePickerRuntime';

export function ProfileView() {
  const { t } = useApp();
  const activeProfileId = useNanaStore(s => s.activeProfileId);
  const characters = useNanaStore(s => s.characters);
  const setCharacterProactiveMessagingEnabled = useNanaStore(
    s => s.setCharacterProactiveMessagingEnabled,
  );
  const setCharacterProactiveMomentsMode = useNanaStore(
    s => s.setCharacterProactiveMomentsMode,
  );
  const setCharacterAutonomousImageSharingEnabled = useNanaStore(
    s => s.setCharacterAutonomousImageSharingEnabled,
  );
  const addCharacterMediaAsset = useNanaStore(s => s.addCharacterMediaAsset);
  const characterMediaAssets = useNanaStore(s => s.characterMediaAssets);
  const language = useNanaStore(s => s.themeConfig.language);
  const set = useNanaStore.setState;
  const [avatarPickerBusy, setAvatarPickerBusy] = useState(false);
  const [characterMediaPickerBusy, setCharacterMediaPickerBusy] = useState(false);

  const char = characters.find(c => c.id === activeProfileId);
  if (!char) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-[#71809B]">{t.noCharacters}</Text>
      </View>
    );
  }
  const replyPreference = char.chatReplyPreference
    || (char.preferredReplyMode === 'text' ? 'textOnly' : char.preferredReplyMode === 'voice' ? 'voicePreferred' : 'adaptive');
  const replyPreferenceLabel = replyPreference === 'textOnly'
    ? t.replyTextOnly
    : replyPreference === 'voicePreferred' ? t.replyVoicePreferred : t.replyAdaptive;
  const proactiveMessagingEnabled = char.proactiveMessagingEnabled !== false;
  const proactiveMomentsMode = char.proactiveMomentsMode || 'occasional';
  const autonomousImageSharingEnabled = char.autonomousImageSharingEnabled === true;
  const characterMediaCount = characterMediaAssets.filter(asset => asset.characterId === char.id).length;
  const isChinese = language === 'zh';

  const handleChooseAvatar = async () => {
    if (avatarPickerBusy) return;
    setAvatarPickerBusy(true);
    try {
      const result = await pickCharacterAvatarFromLibrary({
        kind: 'character-avatar',
        characterId: char.id,
      });
      if (result.phase === 'ready' && result.localUri) {
        const state = useNanaStore.getState();
        const currentCharacter = state.characters.find(item => item.id === char.id);
        if (!currentCharacter) return;
        set(createCharacterAvatarStatePatch(state, char.id, result.localUri));
        cleanupReplacedAvatar(currentCharacter.avatar, useNanaStore.getState());
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

  const handleAddCharacterMedia = async () => {
    if (characterMediaPickerBusy) return;
    setCharacterMediaPickerBusy(true);
    try {
      const result = await pickPhotoFromLibrary();
      if (result.phase === 'ready' && result.localUri) {
        addCharacterMediaAsset(char.id, result.localUri);
        set({
          islandNotification: {
            title: isChinese ? '角色图库' : 'Character gallery',
            desc: isChinese ? '图片已加入，角色可在合适时发送' : 'Photo added for the character to share at suitable moments',
            status: 'success',
          },
        });
      } else if (result.phase === 'failed') {
        set({
          islandNotification: {
            title: isChinese ? '角色图库' : 'Character gallery',
            desc: result.errorMessage || t.photoAttachFailed,
            status: 'error',
          },
        });
      }
    } finally {
      setCharacterMediaPickerBusy(false);
      setTimeout(() => useNanaStore.setState({ islandNotification: null }), 2200);
    }
  };

  return (
    <View className="flex-1">
      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        <View style={{ minHeight: 252, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 20, marginBottom: 12 }}>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={`${t.choosePortrait}: ${char.name}`}
            disabled={avatarPickerBusy}
            onPress={() => { void handleChooseAvatar(); }}
            style={{ width: 92, height: 92, marginBottom: 14 }}
          >
            <View style={{ width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <CharacterPortrait characterId={char.id} avatar={char.avatar} fallback={char.name[0] || 'N'} fontSize={36} />
            </View>
            <NeumorphicSurface
              tone="champagnePink"
              depth="raisedSmall"
              radius={16}
              fill={false}
              style={{ position: 'absolute', right: -3, bottom: -3, width: 32, height: 32 }}
              contentStyle={{ alignItems: 'center', justifyContent: 'center' }}
            >
              {avatarPickerBusy ? <ActivityIndicator size="small" color={neumorphicPalette.onLightPrimary} /> : <ImagePlus size={14} color={neumorphicPalette.onLightPrimary} />}
            </NeumorphicSurface>
          </AnimatedPressable>
          <Text style={{ color: wechatTheme.ink, fontSize: 24, fontWeight: '800', marginBottom: 4 }}>{char.name}</Text>
          {char.desc && (
            <Text style={{ color: wechatTheme.inkMuted, fontSize: 14, textAlign: 'center', marginBottom: 24, paddingHorizontal: 16, lineHeight: 21 }}>
              {char.desc}
            </Text>
          )}
        </View>

        <NeumorphicSurface
          tone="lavender"
          depth="raised"
          radius={17}
          fill={false}
          style={{ marginBottom: 16 }}
          contentStyle={{ paddingHorizontal: 16, paddingTop: 15, paddingBottom: 5 }}
        >
          <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 11, fontWeight: '700', marginBottom: 12 }}>
            {t.characterAbilities}
          </Text>
          <View>
            <View style={{ minHeight: 62, justifyContent: 'center', gap: 4, paddingHorizontal: 4, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: 'rgba(48,37,55,0.18)' }}>
              <View style={{ minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MessageCircle size={16} color={neumorphicPalette.onLightPrimary} />
                <Text style={{ flex: 1, minWidth: 0, color: neumorphicPalette.onLightPrimary, fontSize: 13, lineHeight: 18, fontWeight: '700' }}>{t.replyPreference}</Text>
              </View>
              <Text
                numberOfLines={1}
                style={{ marginLeft: 24, color: neumorphicPalette.onLightSecondary, fontSize: 11.5, lineHeight: 16, fontWeight: '600' }}
              >
                {replyPreferenceLabel}
              </Text>
            </View>
            <View
              style={{
                minHeight: 72,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 4,
                paddingVertical: 8,
                borderBottomWidth: 0.5,
                borderBottomColor: 'rgba(48,37,55,0.18)',
              }}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <BellRing size={16} color={neumorphicPalette.onLightPrimary} />
                  <Text style={{ flex: 1, minWidth: 0, color: neumorphicPalette.onLightPrimary, fontSize: 13, lineHeight: 18, fontWeight: '700' }}>
                    {t.proactiveMessages}
                  </Text>
                </View>
                <Text style={{ marginLeft: 24, color: neumorphicPalette.onLightSecondary, fontSize: 11.5, lineHeight: 16, fontWeight: '600' }}>
                  {proactiveMessagingEnabled ? t.proactiveMessagesOn : t.proactiveMessagesOff}
                </Text>
              </View>
              <Switch
                testID={`proactive-message-switch-${char.id}`}
                accessibilityLabel={`${char.name}: ${t.proactiveMessages}`}
                accessibilityHint={t.proactiveMessagesDesc}
                value={proactiveMessagingEnabled}
                onValueChange={enabled => {
                  setCharacterProactiveMessagingEnabled(char.id, enabled);
                }}
              />
            </View>
            <View
              style={{
                minHeight: 92,
                gap: 9,
                paddingHorizontal: 4,
                paddingVertical: 10,
                borderBottomWidth: 0.5,
                borderBottomColor: 'rgba(48,37,55,0.18)',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <BellRing size={16} color={neumorphicPalette.onLightPrimary} />
                <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 13, lineHeight: 18, fontWeight: '700' }}>
                  {isChinese ? '自主发朋友圈' : 'Autonomous moments'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 7, marginLeft: 24 }}>
                {([
                  ['off', isChinese ? '关闭' : 'Off'],
                  ['occasional', isChinese ? '偶尔' : 'Occasional'],
                  ['normal', isChinese ? '正常' : 'Normal'],
                ] as const).map(([mode, label]) => {
                  const selected = proactiveMomentsMode === mode;
                  return (
                    <AnimatedPressable
                      key={mode}
                      accessibilityRole="radio"
                      accessibilityLabel={label}
                      accessibilityState={{ selected }}
                      onPress={() => setCharacterProactiveMomentsMode(char.id, mode)}
                      style={{
                        flex: 1,
                        minHeight: 38,
                        borderRadius: 13,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: selected
                          ? 'rgba(217,170,186,0.82)'
                          : 'rgba(255,255,255,0.12)',
                      }}
                    >
                      <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 11.5, fontWeight: selected ? '900' : '700' }}>
                        {label}
                      </Text>
                    </AnimatedPressable>
                  );
                })}
              </View>
            </View>
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel={isChinese ? `${char.name}的局部表情包` : `${char.name}'s relationship stickers`}
              onPress={() => set({
                weChatPage: 'stickers',
                stickerManagerCharacterId: char.id,
              })}
              style={{
                minHeight: 58,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: 4,
                borderBottomWidth: 0.5,
                borderBottomColor: 'rgba(48,37,55,0.18)',
              }}
            >
              <Smile size={16} color={neumorphicPalette.onLightPrimary} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 13, fontWeight: '700' }}>
                  {isChinese ? '关系局部表情包' : 'Relationship stickers'}
                </Text>
                <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11.5, lineHeight: 16, marginTop: 2 }}>
                  {isChinese ? '只供你和这个角色在聊天里使用' : 'Only you and this character can use them'}
                </Text>
              </View>
            </AnimatedPressable>
            <View
              style={{
                minHeight: 82,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: 4,
                paddingVertical: 8,
                borderBottomWidth: 0.5,
                borderBottomColor: 'rgba(48,37,55,0.18)',
              }}
            >
              <ImagePlus size={16} color={neumorphicPalette.onLightPrimary} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 13, fontWeight: '700' }}>
                  {isChinese ? '角色自主发图片' : 'Character image sharing'}
                </Text>
                <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11.5, lineHeight: 16, marginTop: 2 }}>
                  {isChinese ? `已配置 ${characterMediaCount} 张，只发送你授权的图库图片` : `${characterMediaCount} approved photos; only your gallery is used`}
                </Text>
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityLabel={isChinese ? '添加角色图片' : 'Add character photo'}
                  disabled={characterMediaPickerBusy}
                  onPress={() => { void handleAddCharacterMedia(); }}
                  style={{ alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center', marginTop: 4 }}
                >
                  <Text style={{ color: neumorphicPalette.berry, fontSize: 12, fontWeight: '800' }}>
                    {characterMediaPickerBusy
                      ? (isChinese ? '正在选择…' : 'Choosing…')
                      : (isChinese ? '从相册添加' : 'Add from photos')}
                  </Text>
                </AnimatedPressable>
              </View>
              <Switch
                accessibilityLabel={isChinese ? `${char.name}自主发图片` : `${char.name} autonomous image sharing`}
                value={autonomousImageSharingEnabled}
                onValueChange={enabled => setCharacterAutonomousImageSharingEnabled(char.id, enabled)}
                disabled={characterMediaCount === 0}
              />
            </View>
            <View
              style={{
                minHeight: 72,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: 4,
                paddingVertical: 8,
                borderBottomWidth: 0.5,
                borderBottomColor: 'rgba(48,37,55,0.18)',
              }}
            >
              <AudioLines size={16} color={neumorphicPalette.onLightPrimary} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 13, fontWeight: '700' }}>
                  {t.voiceProfile}
                </Text>
                <Text numberOfLines={1} style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11.5, lineHeight: 16, marginTop: 2 }}>
                  {char.supportsVoiceReply
                    ? (char.voiceProfileId || 'alloy')
                    : (isChinese ? '未启用' : 'Not enabled')}
                </Text>
              </View>
              {char.supportsVoiceReply ? (
                <AnimatedPressable
                  testID={`profile-test-voice-${char.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.testVoice}: ${char.name}`}
                  onPress={() => {
                    void useNanaStore.getState().previewCharacterVoice({ characterId: char.id });
                  }}
                  style={{
                    minWidth: 76,
                    minHeight: 40,
                    borderRadius: 999,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 12,
                    backgroundColor: 'rgba(217,170,186,0.74)',
                  }}
                >
                  <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, fontWeight: '800' }}>
                    {t.testVoice}
                  </Text>
                </AnimatedPressable>
              ) : null}
            </View>
            <View style={{ minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 4 }}>
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Video size={16} color={neumorphicPalette.onLightPrimary} />
                <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: neumorphicPalette.onLightPrimary, fontSize: 13, fontWeight: '700' }}>{t.videoCall}</Text>
              </View>
              <Text
                numberOfLines={1}
                style={{ maxWidth: 110, color: neumorphicPalette.onLightSecondary, fontSize: 11.5, lineHeight: 16, fontWeight: '600', textAlign: 'right' }}
              >
                {char.supportsVideoPersona ? t.videoEnabled : t.noVideoPersona}
              </Text>
            </View>
          </View>
        </NeumorphicSurface>

        {/* Send Message */}
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={t.sendMessage}
          onPress={() => set({ activeChatId: char.id, weChatPage: 'chat' })}
          style={{ width: '100%', minHeight: 52, marginBottom: 28 }}
        >
          <NeumorphicSurface
            tone="pinkGold"
            depth="raisedSmall"
            radius={17}
            style={{ width: '100%', minHeight: 52 }}
            contentStyle={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}
          >
            <MessageCircle size={20} color={neumorphicPalette.onLightPrimary} strokeWidth={1.8} />
            <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 15, fontWeight: '700' }}>{t.sendMessage}</Text>
          </NeumorphicSurface>
        </AnimatedPressable>
      </ScrollView>
    </View>
  );
}
