import { useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { ChevronLeft, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { ScrollView, Text, View } from 'react-native';

import type { StickerAsset, StickerScope } from '../types';
import { normalizeStickerAssets } from '../services/stickerRuntime';
import { NeumorphicSurface, neumorphicPalette } from './neumorphic-surface';
import { AnimatedPressable } from './primitives';
import { useStableViewportMetrics } from '../hooks/useStableViewportMetrics';
import {
  StickerPackEditorOverlay,
  type StickerPackEditorLabels,
} from './StickerPackEditorOverlay';

const SMOKE_EDITOR_STICKER: StickerAsset = {
  schemaVersion: 1,
  id: 'smoke-editor-sticker',
  uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  name: 'Sample sticker',
  tags: ['sample', 'reaction'],
  mimeType: 'image/png',
  animated: false,
  scope: 'global',
  createdAt: 1,
};

export interface StickerRelationshipOption {
  id: string;
  name: string;
  avatar?: string;
}

export interface StickerManagerLabels extends StickerPackEditorLabels {
  title?: string;
  global?: string;
  relationship?: string;
  add?: string;
  emptyGlobal?: string;
  emptyRelationship?: string;
  chooseRelationship?: string;
  edit?: string;
  delete?: string;
}

export interface StickerManagerViewProps {
  stickers: readonly StickerAsset[];
  relationships: readonly StickerRelationshipOption[];
  embedded?: boolean;
  onBack?: () => void;
  onRequestAdd: (scope: StickerScope, characterId?: string) => void | Promise<void>;
  onSave: (sticker: StickerAsset) => void | Promise<void>;
  onDelete: (stickerId: string) => void | Promise<void>;
  onRequestReplace?: (sticker: StickerAsset) => void | Promise<void>;
  initialCharacterId?: string;
  labels?: StickerManagerLabels;
}

export function StickerManagerView({
  stickers,
  relationships,
  embedded = false,
  onBack,
  onRequestAdd,
  onSave,
  onDelete,
  onRequestReplace,
  initialCharacterId,
  labels,
}: StickerManagerViewProps) {
  const { compact } = useStableViewportMetrics();
  const copy = useMemo(() => ({
    title: labels?.title ?? '表情包',
    global: labels?.global ?? '全局表情',
    relationship: labels?.relationship ?? '关系表情',
    add: labels?.add ?? '添加',
    emptyGlobal: labels?.emptyGlobal ?? '还没有全局表情',
    emptyRelationship: labels?.emptyRelationship ?? '这段关系还没有专属表情',
    chooseRelationship: labels?.chooseRelationship ?? '先选择一个角色',
    edit: labels?.edit ?? '编辑',
    delete: labels?.delete ?? '删除',
  }), [labels]);
  const [activeScope, setActiveScope] = useState<StickerScope>(
    initialCharacterId ? 'relationship' : 'global',
  );
  const [activeCharacterId, setActiveCharacterId] = useState(
    initialCharacterId ?? relationships[0]?.id ?? '',
  );
  const [editingSticker, setEditingSticker] = useState<StickerAsset | null>(null);
  const normalizedStickers = useMemo(() => normalizeStickerAssets(stickers), [stickers]);

  useEffect(() => {
    if (process.env.EXPO_PUBLIC_NANA_SMOKE !== '1' || process.env.EXPO_OS !== 'web') return;
    const scope = globalThis as typeof globalThis & {
      __NANA_SMOKE_OPEN_STICKER_EDITOR__?: () => void;
    };
    scope.__NANA_SMOKE_OPEN_STICKER_EDITOR__ = () => {
      setEditingSticker(SMOKE_EDITOR_STICKER);
    };
    return () => {
      delete scope.__NANA_SMOKE_OPEN_STICKER_EDITOR__;
    };
  }, []);

  useEffect(() => {
    if (
      relationships.length > 0
      && !relationships.some(relationship => relationship.id === activeCharacterId)
    ) {
      setActiveCharacterId(initialCharacterId ?? relationships[0].id);
    }
  }, [activeCharacterId, initialCharacterId, relationships]);

  const visibleStickers = normalizedStickers.filter(sticker =>
    activeScope === 'global'
      ? sticker.scope === 'global'
      : sticker.scope === 'relationship' && sticker.characterId === activeCharacterId,
  );
  const canAdd = activeScope === 'global' || Boolean(activeCharacterId);
  const addCharacterId = activeScope === 'relationship'
    ? activeCharacterId || undefined
    : undefined;
  const emptyLabel = activeScope === 'global' ? copy.emptyGlobal : copy.emptyRelationship;

  return (
    <View style={{ flex: 1, paddingHorizontal: compact ? 12 : 16, paddingTop: 4 }}>
      <View style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ width: 72, alignItems: 'flex-start' }}>
          {!embedded && onBack ? (
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel="返回"
              onPress={onBack}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <ChevronLeft size={26} color={neumorphicPalette.onDarkPrimary} />
            </AnimatedPressable>
          ) : null}
        </View>
        {!embedded ? (
          <Text style={{ color: neumorphicPalette.onDarkPrimary, fontSize: 20, fontWeight: '900' }}>
            {copy.title}
          </Text>
        ) : <View />}
        <View style={{ width: 72, alignItems: 'flex-end' }}>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={copy.add}
            accessibilityState={{ disabled: !canAdd }}
            disabled={!canAdd}
            onPress={() => onRequestAdd(activeScope, addCharacterId)}
            style={{ width: 44, height: 44, borderRadius: 22, opacity: canAdd ? 1 : 0.45 }}
          >
            <NeumorphicSurface
              pointerEvents="none"
              depth="raisedSmall"
              tone="champagnePink"
              radius={22}
              style={{ position: 'absolute', inset: 0 }}
              contentStyle={{ alignItems: 'center', justifyContent: 'center' }}
            >
              <Plus size={23} color={neumorphicPalette.onLightPrimary} />
            </NeumorphicSurface>
          </AnimatedPressable>
        </View>
      </View>

      <NeumorphicSurface
        depth="inset"
        tone="lavender"
        radius={18}
        style={{ minHeight: 50, marginTop: 6 }}
        contentStyle={{ flexDirection: 'row', gap: 5, padding: 5 }}
      >
        {([
          ['global', copy.global],
          ['relationship', copy.relationship],
        ] as const).map(([scope, label]) => {
          const selected = activeScope === scope;
          return (
            <AnimatedPressable
              key={scope}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              onPress={() => setActiveScope(scope)}
              style={{ flex: 1, minHeight: 40, borderRadius: 14 }}
            >
              {selected ? (
                <NeumorphicSurface
                  pointerEvents="none"
                  depth="raisedSmall"
                  tone="champagnePink"
                  radius={14}
                  style={{ position: 'absolute', inset: 0 }}
                />
              ) : null}
              <View pointerEvents="none" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text
                  style={{
                    color: neumorphicPalette.onLightPrimary,
                    fontSize: 14,
                    fontWeight: selected ? '900' : '700',
                  }}
                >
                  {label}
                </Text>
              </View>
            </AnimatedPressable>
          );
        })}
      </NeumorphicSurface>

      {activeScope === 'relationship' ? (
        relationships.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: 14, gap: 9, paddingHorizontal: 2 }}
          >
            {relationships.map(relationship => {
              const selected = relationship.id === activeCharacterId;
              return (
                <AnimatedPressable
                  key={relationship.id}
                  accessibilityRole="tab"
                  accessibilityLabel={relationship.name}
                  accessibilityState={{ selected }}
                  onPress={() => setActiveCharacterId(relationship.id)}
                  style={{ minWidth: 92, height: 46, borderRadius: 16 }}
                >
                  <NeumorphicSurface
                    pointerEvents="none"
                    depth={selected ? 'inset' : 'raisedSmall'}
                    tone={selected ? 'champagnePink' : 'lavender'}
                    radius={16}
                    style={{ position: 'absolute', inset: 0 }}
                    contentStyle={{ paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}
                  >
                    {relationship.avatar ? (
                      <Image
                        source={{ uri: relationship.avatar }}
                        accessibilityLabel=""
                        contentFit="cover"
                        style={{ width: 26, height: 26, borderRadius: 13 }}
                      />
                    ) : null}
                    <Text
                      numberOfLines={1}
                      style={{ maxWidth: 90, color: neumorphicPalette.onLightPrimary, fontSize: 13, fontWeight: '800' }}
                    >
                      {relationship.name}
                    </Text>
                  </NeumorphicSurface>
                </AnimatedPressable>
              );
            })}
          </ScrollView>
        ) : (
          <Text style={{ color: neumorphicPalette.onDarkSecondary, textAlign: 'center', fontSize: 13, paddingVertical: 16 }}>
            {copy.chooseRelationship}
          </Text>
        )
      ) : (
        <View style={{ height: 12 }} />
      )}

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 30, flexGrow: 1 }}
      >
        {visibleStickers.length === 0 ? (
          <View style={{ flex: 1, minHeight: compact ? 240 : 320, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 }}>
            <NeumorphicSurface
              depth="inset"
              tone="lavender"
              radius={20}
              fill={false}
              contentStyle={{ paddingHorizontal: 24, paddingVertical: 24, alignItems: 'center', gap: 12 }}
            >
              <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 16, fontWeight: '900', textAlign: 'center' }}>
                {emptyLabel}
              </Text>
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel={copy.add}
                accessibilityState={{ disabled: !canAdd }}
                disabled={!canAdd}
                onPress={() => onRequestAdd(activeScope, addCharacterId)}
                style={{ minWidth: 112, minHeight: 46, borderRadius: 17 }}
              >
                <NeumorphicSurface
                  pointerEvents="none"
                  depth="raisedSmall"
                  tone="champagnePink"
                  radius={17}
                  style={{ position: 'absolute', inset: 0 }}
                  contentStyle={{ flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }}
                >
                  <Plus size={18} color={neumorphicPalette.onLightPrimary} />
                  <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 14, fontWeight: '900' }}>
                    {copy.add}
                  </Text>
                </NeumorphicSurface>
              </AnimatedPressable>
            </NeumorphicSurface>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }}>
            {visibleStickers.map(sticker => (
              <View key={sticker.id} style={{ width: compact ? '50%' : '33.333%', padding: 5 }}>
                <NeumorphicSurface
                  depth="raisedSmall"
                  tone="lavender"
                  radius={18}
                  fill={false}
                  contentStyle={{ padding: 9 }}
                >
                  <AnimatedPressable
                    accessibilityRole="button"
                    accessibilityLabel={`${copy.edit} ${sticker.name}`}
                    onPress={() => setEditingSticker(sticker)}
                    style={{ width: '100%', aspectRatio: 1.12, borderRadius: 14 }}
                  >
                    <Image
                      source={{ uri: sticker.uri }}
                      accessibilityLabel={sticker.name}
                      autoplay={sticker.animated}
                      cachePolicy="memory-disk"
                      contentFit="contain"
                      transition={0}
                      style={{ width: '100%', height: '100%' }}
                    />
                  </AnimatedPressable>
                  <Text
                    numberOfLines={1}
                    style={{ color: neumorphicPalette.onLightPrimary, fontSize: 13, fontWeight: '800', marginTop: 7 }}
                  >
                    {sticker.name}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11, marginTop: 2, minHeight: 15 }}
                  >
                    {sticker.tags.join(' · ') || '未设置语义标签'}
                  </Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 }}>
                    <AnimatedPressable
                      accessibilityRole="button"
                      accessibilityLabel={`${copy.edit} ${sticker.name}`}
                      onPress={() => setEditingSticker(sticker)}
                      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Pencil size={17} color={neumorphicPalette.onLightPrimary} />
                    </AnimatedPressable>
                    <AnimatedPressable
                      accessibilityRole="button"
                      accessibilityLabel={`${copy.delete} ${sticker.name}`}
                      onPress={() => onDelete(sticker.id)}
                      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Trash2 size={17} color={neumorphicPalette.berry} />
                    </AnimatedPressable>
                  </View>
                </NeumorphicSurface>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <StickerPackEditorOverlay
        visible={Boolean(editingSticker)}
        sticker={editingSticker}
        labels={labels}
        onClose={() => setEditingSticker(null)}
        onSave={onSave}
        onDelete={onDelete}
        onRequestReplace={onRequestReplace}
      />
    </View>
  );
}
