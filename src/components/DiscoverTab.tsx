import { ScrollView, Text, View } from 'react-native';
import { ChevronRight, Gamepad2, Globe, QrCode, Search, ShoppingBag } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { useNanaStore } from '../stores/nanaStore';
import { AnimatedPressable } from './primitives';
import { NeumorphicSurface, neumorphicPalette } from './neumorphic-surface';

const discoverColors = {
  feature: '#AAA5C3',
  featureIcon: '#C8C3DE',
  nearby: '#ABC3B6',
  shop: '#D0B58F',
  games: '#C9A1B2',
  scan: '#AABBC9',
} as const;

export function DiscoverTab() {
  const { t } = useApp();
  const set = useNanaStore.setState;

  const items = [
    {
      Icon: Globe,
      color: discoverColors.featureIcon,
      label: t.moments,
      subtitle: t.postMoment || 'Share moments with characters',
      onPress: () => set({ weChatPage: 'moments' }),
    },
    {
      Icon: Search,
      color: discoverColors.nearby,
      label: t.searchNearby || 'Nearby',
      subtitle: 'Discover characters nearby',
      onPress: () => {},
    },
    {
      Icon: ShoppingBag,
      color: discoverColors.shop,
      label: t.shop || 'Shop',
      subtitle: 'Stickers & themes',
      onPress: () => {},
    },
    {
      Icon: Gamepad2,
      color: discoverColors.games,
      label: t.games || 'Games',
      subtitle: 'Play with AI characters',
      onPress: () => {},
    },
    {
      Icon: QrCode,
      color: discoverColors.scan,
      label: t.scan || 'Scan',
      subtitle: 'Scan QR to add characters',
      onPress: () => {},
    },
  ];
  const featured = items[0];

  return (
    <ScrollView
      style={{ flex: 1 }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 3, paddingBottom: 24 }}
    >
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={featured.label}
        onPress={featured.onPress}
        style={{ borderRadius: 22, marginBottom: 18 }}
      >
        <NeumorphicSurface
          testID="discover-neumorphic-feature"
          depth="raised"
          tone="incoming"
          shadowProfile="light"
          radius={22}
          style={{ minHeight: 100, backgroundColor: discoverColors.feature }}
          contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 15, paddingHorizontal: 17, paddingVertical: 15 }}
        >
          <NeumorphicSurface
            depth="raisedSmall"
            tone="searchBlush"
            shadowProfile="light"
            radius={18}
            style={{ width: 52, height: 52, backgroundColor: featured.color }}
            contentStyle={{ alignItems: 'center', justifyContent: 'center' }}
          >
            <Globe size={23} color={neumorphicPalette.onLightPrimary} strokeWidth={1.7} />
          </NeumorphicSurface>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: neumorphicPalette.onLightPrimary, fontSize: 17, fontWeight: '800' }}>
              {featured.label}
            </Text>
            <Text numberOfLines={2} style={{ color: neumorphicPalette.onLightSecondary, fontSize: 12, lineHeight: 16, marginTop: 3 }}>
              {featured.subtitle}
            </Text>
          </View>
          <ChevronRight size={18} color={neumorphicPalette.onLightSecondary} strokeWidth={1.8} />
        </NeumorphicSurface>
      </AnimatedPressable>

      <NeumorphicSurface
        testID="discover-neumorphic-group"
        depth="raised"
        tone="base"
        radius={22}
        fill={false}
        contentStyle={{ paddingHorizontal: 8, paddingVertical: 7 }}
      >
        {items.slice(1).map((item, index) => {
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
                  <Text numberOfLines={1} style={{ color: neumorphicPalette.onLightPrimary, fontSize: 15, fontWeight: '800' }}>
                    {item.label}
                  </Text>
                  <Text numberOfLines={1} style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11, marginTop: 3 }}>
                    {item.subtitle}
                  </Text>
                </View>
                <ChevronRight size={16} color={neumorphicPalette.onLightSecondary} strokeWidth={1.7} />
              </AnimatedPressable>
              {index < items.length - 2 ? (
                <View style={{ height: 1, marginLeft: 64, marginRight: 12, backgroundColor: 'rgba(48,37,55,0.16)' }} />
              ) : null}
            </View>
          );
        })}
      </NeumorphicSurface>
    </ScrollView>
  );
}
