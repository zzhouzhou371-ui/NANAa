import { useState } from 'react';
import { ActivityIndicator, View, Text, ScrollView } from 'react-native';
import { ImagePlus, MessageCircle, Video } from 'lucide-react-native';
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
} from '../services/nativeImagePickerRuntime';

export function ProfileView() {
  const { t } = useApp();
  const activeProfileId = useNanaStore(s => s.activeProfileId);
  const characters = useNanaStore(s => s.characters);
  const set = useNanaStore.setState;
  const [avatarPickerBusy, setAvatarPickerBusy] = useState(false);

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
