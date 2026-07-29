import { Image } from 'expo-image';
import { Settings2, Sparkles } from 'lucide-react-native';
import { ScrollView, Text, View } from 'react-native';

import type { StickerAsset } from '../types';
import { filterStickersForChat, normalizeStickerAssets } from '../services/stickerRuntime';
import { NeumorphicSurface, neumorphicPalette } from './neumorphic-surface';
import { AnimatedPressable } from './primitives';

export interface StickerPanelProps {
  stickers: readonly StickerAsset[];
  onSelect: (sticker: StickerAsset) => void;
  characterId?: string;
  onManage?: () => void;
  emptyLabel?: string;
  manageLabel?: string;
  globalLabel?: string;
  relationshipLabel?: string;
}

export function StickerPanel({
  stickers,
  onSelect,
  characterId,
  onManage,
  emptyLabel = '还没有可用的表情包',
  manageLabel = '管理',
  globalLabel = '全局',
  relationshipLabel = '专属',
}: StickerPanelProps) {
  const visibleStickers = characterId
    ? filterStickersForChat(stickers, characterId)
    : normalizeStickerAssets(stickers);

  return (
    <View style={{ flex: 1, minHeight: 180 }}>
      <View
        style={{
          minHeight: 52,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Sparkles size={17} color={neumorphicPalette.onLightPrimary} strokeWidth={2.2} />
          <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 15, fontWeight: '800' }}>
            表情包
          </Text>
        </View>
        {onManage ? (
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={manageLabel}
            onPress={onManage}
            scale={0.92}
            style={{ minWidth: 70, height: 44, borderRadius: 22 }}
          >
            <NeumorphicSurface
              pointerEvents="none"
              depth="raisedSmall"
              tone="lavender"
              radius={22}
              style={{ position: 'absolute', inset: 0 }}
              contentStyle={{
                paddingHorizontal: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <Settings2 size={15} color={neumorphicPalette.onLightPrimary} />
              <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 13, fontWeight: '700' }}>
                {manageLabel}
              </Text>
            </NeumorphicSurface>
          </AnimatedPressable>
        ) : null}
      </View>

      {visibleStickers.length === 0 ? (
        <View
          style={{
            flex: 1,
            minHeight: 140,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 24,
            paddingBottom: 22,
          }}
        >
          <NeumorphicSurface
            depth="inset"
            tone="lavender"
            radius={18}
            fill={false}
            contentStyle={{ paddingHorizontal: 22, paddingVertical: 20, alignItems: 'center', gap: 7 }}
          >
            <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 15, fontWeight: '800' }}>
              {emptyLabel}
            </Text>
            <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 12, textAlign: 'center' }}>
              可在微信功能或角色资料里添加
            </Text>
          </NeumorphicSurface>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 10,
            paddingTop: 2,
            paddingBottom: 24,
            flexDirection: 'row',
            flexWrap: 'wrap',
          }}
        >
          {visibleStickers.map(sticker => (
            <View key={sticker.id} style={{ width: '25%', padding: 5 }}>
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel={`${sticker.name}，${sticker.scope === 'global' ? globalLabel : relationshipLabel}`}
                onPress={() => onSelect(sticker)}
                scale={0.9}
                style={{ width: '100%', aspectRatio: 1, borderRadius: 18 }}
              >
                <NeumorphicSurface
                  pointerEvents="none"
                  depth="raisedSmall"
                  tone={sticker.scope === 'relationship' ? 'champagnePink' : 'lavender'}
                  radius={18}
                  style={{ position: 'absolute', inset: 0 }}
                  contentStyle={{ padding: 8, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Image
                    source={{ uri: sticker.uri }}
                    accessibilityLabel={sticker.name}
                    autoplay={sticker.animated}
                    cachePolicy="memory-disk"
                    contentFit="contain"
                    transition={120}
                    style={{ width: '100%', height: '100%' }}
                  />
                </NeumorphicSurface>
              </AnimatedPressable>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

