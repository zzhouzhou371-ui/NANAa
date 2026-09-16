import { useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { RotateCcw, Save, Trash2, X } from 'lucide-react-native';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import type { StickerAsset } from '../types';
import { normalizeStickerAsset } from '../services/stickerRuntime';
import { NeumorphicSurface, neumorphicPalette } from './neumorphic-surface';
import { AnimatedPressable } from './primitives';

export interface StickerPackEditorLabels {
  title?: string;
  name?: string;
  namePlaceholder?: string;
  tags?: string;
  tagsHint?: string;
  replace?: string;
  delete?: string;
  cancel?: string;
  save?: string;
  invalid?: string;
}

export interface StickerPackEditorOverlayProps {
  visible: boolean;
  sticker: StickerAsset | null;
  onClose: () => void;
  onSave: (sticker: StickerAsset) => void | Promise<void>;
  onDelete?: (stickerId: string) => void | Promise<void>;
  onRequestReplace?: (sticker: StickerAsset) => void | Promise<void>;
  labels?: StickerPackEditorLabels;
}

function parsedTags(value: string) {
  return value
    .split(/[,，\n]/u)
    .map(tag => tag.trim())
    .filter(Boolean);
}

export function StickerPackEditorOverlay({
  visible,
  sticker,
  onClose,
  onSave,
  onDelete,
  onRequestReplace,
  labels,
}: StickerPackEditorOverlayProps) {
  const { height } = useWindowDimensions();
  const editorSheetHeight = Math.min(680, Math.max(420, height * 0.82));
  const copy = useMemo(() => ({
    title: labels?.title ?? '编辑表情',
    name: labels?.name ?? '名称',
    namePlaceholder: labels?.namePlaceholder ?? '例如：开心点头',
    tags: labels?.tags ?? '语义标签',
    tagsHint: labels?.tagsHint ?? '用逗号分隔，角色会依据这些词选择表情',
    replace: labels?.replace ?? '更换图片',
    delete: labels?.delete ?? '删除',
    cancel: labels?.cancel ?? '取消',
    save: labels?.save ?? '保存',
    invalid: labels?.invalid ?? '名称不能为空',
  }), [labels]);
  const [name, setName] = useState('');
  const [tagText, setTagText] = useState('');
  const [showValidation, setShowValidation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!visible || !sticker) return;
    setName(sticker.name);
    setTagText(sticker.tags.join('，'));
    setShowValidation(false);
    setIsSaving(false);
  }, [sticker, visible]);

  const handleSave = async () => {
    if (!sticker || isSaving) return;
    const normalized = normalizeStickerAsset({
      ...sticker,
      name,
      tags: parsedTags(tagText),
    });
    if (!normalized || !name.trim()) {
      setShowValidation(true);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(normalized);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  if (!sticker) return null;

  return (
    <Modal
      animationType="none"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          backgroundColor: 'rgba(22, 15, 30, 0.38)',
        }}
      >
        <NeumorphicSurface
          testID="sticker-editor-sheet"
          depth="raised"
          tone="lavender"
          radius={24}
          style={{ height: editorSheetHeight, marginHorizontal: 10, marginBottom: 10 }}
          contentStyle={{ overflow: 'hidden' }}
        >
          <View
            style={{
              minHeight: 56,
              paddingHorizontal: 10,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel={copy.cancel}
              onPress={onClose}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={22} color={neumorphicPalette.onLightPrimary} />
            </AnimatedPressable>
            <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 17, fontWeight: '900' }}>
              {copy.title}
            </Text>
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel={copy.save}
              accessibilityState={{ disabled: isSaving }}
              disabled={isSaving}
              onPress={handleSave}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Save size={21} color={neumorphicPalette.berry} />
            </AnimatedPressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 4, paddingBottom: 28 }}
          >
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <NeumorphicSurface
                depth="inset"
                tone="lavender"
                radius={24}
                style={{ width: 132, height: 132 }}
                contentStyle={{ padding: 14 }}
              >
                <Image
                  source={{ uri: sticker.uri }}
                  accessibilityLabel={sticker.name}
                  autoplay={sticker.animated}
                  cachePolicy="memory-disk"
                  contentFit="contain"
                  style={{ width: '100%', height: '100%' }}
                />
              </NeumorphicSurface>
              <Text
                style={{
                  marginTop: 10,
                  color: neumorphicPalette.onLightSecondary,
                  fontSize: 12,
                  fontWeight: '700',
                }}
              >
                {sticker.scope === 'global' ? '全局表情' : '关系专属表情'}
                {sticker.animated ? ' · 动图' : ''}
              </Text>
            </View>

            <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 14, fontWeight: '800', marginBottom: 8 }}>
              {copy.name}
            </Text>
            <NeumorphicSurface
              depth="inset"
              tone="lavender"
              radius={16}
              style={{ minHeight: 50 }}
              contentStyle={{ justifyContent: 'center', paddingHorizontal: 14 }}
            >
              <TextInput
                accessibilityLabel={copy.name}
                value={name}
                onChangeText={value => {
                  setName(value);
                  if (value.trim()) setShowValidation(false);
                }}
                maxLength={48}
                placeholder={copy.namePlaceholder}
                placeholderTextColor="rgba(55,46,63,0.54)"
                style={{ color: neumorphicPalette.onLightPrimary, fontSize: 16, paddingVertical: 11 }}
              />
            </NeumorphicSurface>
            {showValidation ? (
              <Text style={{ color: neumorphicPalette.berry, fontSize: 12, marginTop: 6 }}>
                {copy.invalid}
              </Text>
            ) : null}

            <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 14, fontWeight: '800', marginTop: 18, marginBottom: 8 }}>
              {copy.tags}
            </Text>
            <NeumorphicSurface
              depth="inset"
              tone="lavender"
              radius={16}
              style={{ minHeight: 88 }}
              contentStyle={{ paddingHorizontal: 14, paddingVertical: 4 }}
            >
              <TextInput
                accessibilityLabel={copy.tags}
                value={tagText}
                onChangeText={setTagText}
                maxLength={360}
                multiline
                placeholder="开心，点头，安慰"
                placeholderTextColor="rgba(55,46,63,0.54)"
                textAlignVertical="top"
                style={{
                  minHeight: 78,
                  color: neumorphicPalette.onLightPrimary,
                  fontSize: 15,
                  lineHeight: 22,
                  paddingVertical: 11,
                }}
              />
            </NeumorphicSurface>
            <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 12, lineHeight: 18, marginTop: 7 }}>
              {copy.tagsHint}
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>
              {onRequestReplace ? (
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityLabel={copy.replace}
                  onPress={() => onRequestReplace(sticker)}
                  style={{ flex: 1, minHeight: 48, borderRadius: 17 }}
                >
                  <NeumorphicSurface
                    pointerEvents="none"
                    depth="raisedSmall"
                    tone="lavender"
                    radius={17}
                    style={{ position: 'absolute', inset: 0 }}
                    contentStyle={{ paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}
                  >
                    <RotateCcw size={17} color={neumorphicPalette.onLightPrimary} />
                    <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 14, fontWeight: '800' }}>
                      {copy.replace}
                    </Text>
                  </NeumorphicSurface>
                </AnimatedPressable>
              ) : null}
              {onDelete ? (
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityLabel={copy.delete}
                  onPress={async () => {
                    await onDelete(sticker.id);
                    onClose();
                  }}
                  style={{ flex: 1, minHeight: 48, borderRadius: 17 }}
                >
                  <NeumorphicSurface
                    pointerEvents="none"
                    depth="raisedSmall"
                    tone="berry"
                    radius={17}
                    style={{ position: 'absolute', inset: 0 }}
                    contentStyle={{ paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}
                  >
                    <Trash2 size={17} color={neumorphicPalette.onBerry} />
                    <Text style={{ color: neumorphicPalette.onBerry, fontSize: 14, fontWeight: '800' }}>
                      {copy.delete}
                    </Text>
                  </NeumorphicSurface>
                </AnimatedPressable>
              ) : null}
            </View>
          </ScrollView>
        </NeumorphicSurface>
      </KeyboardAvoidingView>
    </Modal>
  );
}
