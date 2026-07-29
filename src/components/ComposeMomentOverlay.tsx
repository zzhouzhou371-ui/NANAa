import { useState } from 'react';
import { Image as ExpoImage } from 'expo-image';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { ImagePlus, X } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { useNanaStore } from '../stores/nanaStore';
import type { Moment } from '../types';
import { AnimatedPressable } from './primitives';
import { pickPhotoFromLibrary } from '../services/nativeImagePickerRuntime';
import {
  NeumorphicSurface,
  neumorphicPalette,
} from './neumorphic-surface';

export interface ComposeMomentDraft {
  text: string;
  images: string[];
}

export interface ComposeMomentOverlayProps {
  onPublish?: (draft: ComposeMomentDraft) => void | Promise<void>;
}

export function ComposeMomentOverlay({
  onPublish,
}: ComposeMomentOverlayProps = {}) {
  const { t } = useApp();
  const momentText = useNanaStore(s => s.momentText);
  const momentImageUrl = useNanaStore(s => s.momentImageUrl);
  const myAvatar = useNanaStore(s => s.myAvatar);
  const myName = useNanaStore(s => s.myName);
  const set = useNanaStore.setState;
  const { width, height } = useWindowDimensions();
  const [publishing, setPublishing] = useState(false);
  const cardWidth = Math.min(width - 24, 390);
  const cardMaxHeight = Math.min(height * 0.78, 590);
  const canPublish = !publishing && (!!momentText.trim() || !!momentImageUrl);

  const handlePickImage = async () => {
    set({ islandNotification: { title: t.moment, desc: t.openingPhotoLibrary, status: 'processing' } });
    const capture = await pickPhotoFromLibrary();
    if (capture.canceled) {
      set({ islandNotification: null });
      return;
    }
    if (capture.phase !== 'ready' || !capture.localUri) {
      set({ islandNotification: { title: t.moment, desc: capture.errorMessage || t.photoAttachFailed, status: 'error' } });
      setTimeout(() => useNanaStore.setState({ islandNotification: null }), 2200);
      return;
    }
    set({ momentImageUrl: capture.localUri, islandNotification: null });
  };

  const close = () => {
    if (publishing) return;
    set({ showComposeMoment: false, momentText: '', momentImageUrl: '' });
  };

  const handlePublish = async () => {
    if (!canPublish) return;
    const draft: ComposeMomentDraft = {
      text: momentText.trim(),
      images: momentImageUrl ? [momentImageUrl] : [],
    };
    setPublishing(true);
    try {
      if (onPublish) {
        await onPublish(draft);
      } else {
        const timestamp = Date.now();
        const newMoment: Moment = {
          id: `moment:me:${timestamp}`,
          authorId: 'me',
          authorName: myName || t.me,
          avatar: myAvatar,
          text: draft.text,
          images: draft.images,
          timestamp,
          likes: [],
          comments: [],
          generationSource: 'user',
        };
        set(state => ({
          momentsList: [newMoment, ...state.momentsList],
        }));
      }
      set({
        showComposeMoment: false,
        momentText: '',
        momentImageUrl: '',
      });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundColor: 'rgba(42,31,54,0.24)',
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 12,
          paddingVertical: 24,
        }}
      >
        <NeumorphicSurface
          testID="compose-moment-neumorphic-sheet"
          depth="raised"
          tone="base"
          radius={20}
          fill={false}
          style={{ width: cardWidth, maxHeight: cardMaxHeight }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 13,
              paddingBottom: 16,
            }}
          >
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: 'rgba(55,46,63,0.28)',
                alignSelf: 'center',
                marginBottom: 15,
              }}
            />
            <Text
              style={{
                color: neumorphicPalette.onLightPrimary,
                fontSize: 20,
                fontWeight: '900',
                marginBottom: 13,
              }}
            >
              {t.postMoment}
            </Text>

            <NeumorphicSurface
              depth="inset"
              tone="composer"
              radius={16}
              fill={false}
              style={{ marginBottom: 12 }}
              contentStyle={{ paddingHorizontal: 13, paddingVertical: 10 }}
            >
              <TextInput
                value={momentText}
                onChangeText={value => set({ momentText: value })}
                placeholder={t.momentPlaceholder}
                placeholderTextColor="rgba(55,46,63,0.58)"
                multiline
                maxLength={1200}
                style={{
                  width: '100%',
                  minHeight: 112,
                  color: neumorphicPalette.onLightPrimary,
                  fontSize: 15,
                  lineHeight: 22,
                  textAlignVertical: 'top',
                }}
              />
            </NeumorphicSurface>

            {momentImageUrl ? (
              <View
                style={{
                  width: '100%',
                  height: 184,
                  borderRadius: 16,
                  overflow: 'hidden',
                  marginBottom: 12,
                  backgroundColor: 'rgba(48,37,55,0.10)',
                }}
              >
                <ExpoImage
                  source={{ uri: momentImageUrl }}
                  contentFit="cover"
                  transition={120}
                  cachePolicy="memory-disk"
                  style={{ width: '100%', height: '100%' }}
                  accessibilityLabel={t.chooseMomentPhoto}
                />
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityLabel={t.removePhoto}
                  onPress={() => set({ momentImageUrl: '' })}
                  style={{
                    position: 'absolute',
                    top: 7,
                    right: 7,
                    width: 44,
                    height: 44,
                    borderRadius: 15,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(48,37,55,0.82)',
                  }}
                >
                  <X size={18} color={neumorphicPalette.onBerry} />
                </AnimatedPressable>
              </View>
            ) : (
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel={t.chooseMomentPhoto}
                onPress={() => { void handlePickImage(); }}
                style={{ borderRadius: 16, marginBottom: 12 }}
              >
                <NeumorphicSurface
                  depth="raisedSmall"
                  tone="searchBlush"
                  radius={16}
                  fill={false}
                  contentStyle={{
                    minHeight: 52,
                    paddingHorizontal: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 9,
                  }}
                >
                  <ImagePlus size={19} color={neumorphicPalette.berry} />
                  <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 14, fontWeight: '800' }}>
                    {t.choosePhoto}
                  </Text>
                </NeumorphicSurface>
              </AnimatedPressable>
            )}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel={t.cancel}
                accessibilityState={{ disabled: publishing }}
                disabled={publishing}
                onPress={close}
                style={{ flex: 1, borderRadius: 15 }}
              >
                <NeumorphicSurface
                  depth="raisedSmall"
                  tone="soft"
                  radius={15}
                  contentStyle={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 15, fontWeight: '800' }}>
                    {t.cancel}
                  </Text>
                </NeumorphicSurface>
              </AnimatedPressable>
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel={t.publish}
                accessibilityState={{ disabled: !canPublish }}
                disabled={!canPublish}
                onPress={() => { void handlePublish(); }}
                style={{ flex: 1.25, minHeight: 48, borderRadius: 15 }}
              >
                <NeumorphicSurface
                  depth="raisedSmall"
                  tone="berry"
                  shadowProfile="dark"
                  radius={15}
                  contentStyle={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
                  style={{ opacity: canPublish ? 1 : 0.48 }}
                >
                  <Text style={{ color: neumorphicPalette.onBerry, fontSize: 15, fontWeight: '900' }}>
                    {publishing ? '…' : t.publish}
                  </Text>
                </NeumorphicSurface>
              </AnimatedPressable>
            </View>
          </ScrollView>
        </NeumorphicSurface>
      </KeyboardAvoidingView>
    </View>
  );
}
