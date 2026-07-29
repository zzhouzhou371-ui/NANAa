import { ScrollView, Text, View } from 'react-native';
import { ChevronRight, Heart, Settings, Smile, Wallet } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { useNanaStore } from '../stores/nanaStore';
import { AnimatedPressable } from './primitives';
import { NeumorphicSurface, neumorphicPalette } from './neumorphic-surface';
import { CharacterPortrait } from './CharacterPortrait';

const meColors = {
  profile: '#B09EAE',
  wallet: '#D0B58F',
  stickers: '#D3AC8F',
  favorites: '#C9A1B2',
  settings: '#AABBC9',
} as const;

export function MeTab() {
  const { t } = useApp();
  const myAvatar = useNanaStore(s => s.myAvatar);
  const myName = useNanaStore(s => s.myName);
  const walletBalance = useNanaStore(s => s.walletBalance);
  const set = useNanaStore.setState;
  const setActiveApp = useNanaStore(s => s.setActiveApp);

  const menuItems = [
    {
      Icon: Wallet,
      color: meColors.wallet,
      label: t.wallet,
      subtitle: walletBalance ? `\u00A5${walletBalance}` : undefined,
      onPress: () => set({ weChatPage: 'wallet' }),
    },
    {
      Icon: Smile,
      color: meColors.stickers,
      label: t.stickers,
      subtitle: t.stickerSubtitle,
      onPress: () => set({
        weChatPage: 'stickers',
        stickerManagerCharacterId: null,
        activeProfileId: null,
      }),
    },
    {
      Icon: Heart,
      color: meColors.favorites,
      label: t.favorites,
      subtitle: t.favoritesSubtitle,
      onPress: () => {},
    },
    {
      Icon: Settings,
      color: meColors.settings,
      label: t.settings,
      subtitle: t.settingsSubtitle,
      onPress: () => setActiveApp('settings'),
    },
  ];

  return (
    <ScrollView
      style={{ flex: 1 }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 3, paddingBottom: 24 }}
    >
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={myName}
        onPress={() => setActiveApp('user')}
        style={{ marginBottom: 20, borderRadius: 22 }}
      >
        <NeumorphicSurface
          testID="me-neumorphic-profile"
          depth="raised"
          tone="incoming"
          shadowProfile="light"
          radius={22}
          style={{ width: '100%', minHeight: 104, backgroundColor: meColors.profile }}
          contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 15, paddingHorizontal: 17, paddingVertical: 16 }}
        >
          <NeumorphicSurface
            depth="raisedSmall"
            tone="searchBlush"
            shadowProfile="light"
            radius={20}
            style={{ width: 62, height: 62, backgroundColor: '#C7B6C3' }}
            contentStyle={{ alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
          >
            <CharacterPortrait
              avatar={myAvatar}
              fallback={myName.trim()[0] || 'U'}
              fontSize={24}
              color={neumorphicPalette.onLightPrimary}
            />
          </NeumorphicSurface>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 18, fontWeight: '800' }} numberOfLines={1}>
              {myName}
            </Text>
            <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 12, lineHeight: 16, marginTop: 3 }} numberOfLines={2}>
              {t.yourSharedWorldSide}
            </Text>
          </View>
          <ChevronRight size={18} color={neumorphicPalette.onLightSecondary} />
        </NeumorphicSurface>
      </AnimatedPressable>

      <NeumorphicSurface
        testID="me-neumorphic-group"
        depth="raised"
        tone="base"
        radius={22}
        fill={false}
        contentStyle={{ paddingHorizontal: 8, paddingVertical: 7 }}
      >
        {menuItems.map((item, index) => {
          const Icon = item.Icon;
          return (
            <View key={item.label}>
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel={item.label}
                onPress={item.onPress}
                style={{ minHeight: 68, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 8, paddingVertical: 9 }}
              >
                <NeumorphicSurface
                  depth="raisedSmall"
                  tone="searchBlush"
                  shadowProfile="light"
                  radius={14}
                  style={{ width: 44, height: 44, backgroundColor: item.color }}
                  contentStyle={{ alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon size={20} color={neumorphicPalette.onLightPrimary} strokeWidth={1.7} />
                </NeumorphicSurface>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 15, fontWeight: '800' }} numberOfLines={1}>
                    {item.label}
                  </Text>
                  {item.subtitle ? (
                    <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11, marginTop: 3 }} numberOfLines={1}>
                      {item.subtitle}
                    </Text>
                  ) : null}
                </View>
                <ChevronRight size={16} color={neumorphicPalette.onLightSecondary} />
              </AnimatedPressable>
              {index < menuItems.length - 1 ? (
                <View style={{ height: 1, marginLeft: 64, marginRight: 12, backgroundColor: 'rgba(48,37,55,0.16)' }} />
              ) : null}
            </View>
          );
        })}
      </NeumorphicSurface>
    </ScrollView>
  );
}
