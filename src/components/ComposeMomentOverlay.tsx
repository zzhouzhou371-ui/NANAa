import { View, Text, TextInput, Image, KeyboardAvoidingView, Platform, useWindowDimensions } from 'react-native';
import { ImagePlus, X } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { useNanaStore } from '../stores/nanaStore';
import { AnimatedPressable, NativeGradient } from './primitives';
import { pickPhotoFromLibrary } from '../services/nativeImagePickerRuntime';
import { createRelationshipTrace, upsertRelationshipTrace } from '../repositories/relationshipTraceRepository';

export function ComposeMomentOverlay() {
  const { t } = useApp();
  const momentText = useNanaStore(s => s.momentText);
  const momentImageUrl = useNanaStore(s => s.momentImageUrl);
  const myAvatar = useNanaStore(s => s.myAvatar);
  const set = useNanaStore.setState;
  const { width, height } = useWindowDimensions();
  const cardWidth = Math.min(width - 32, 370);
  const cardMaxHeight = Math.min(height * 0.72, 560);
  const canPublish = !!momentText.trim() || !!momentImageUrl;

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

  const handlePublish = () => {
    if (!canPublish) return;
    const timestamp = Date.now();
    const momentId = timestamp.toString();
    const newMoment = {
      id: momentId,
      authorId: 'me',
      authorName: t.me,
      avatar: myAvatar,
      text: momentText,
      images: momentImageUrl ? [momentImageUrl] : [],
      timestamp,
    };
    set(s => ({
      momentsList: [newMoment, ...s.momentsList],
      relationshipTraces: s.friends.reduce((traces, characterId) => upsertRelationshipTrace(traces, createRelationshipTrace({
        characterId,
        source: 'moment',
        sourceEventId: momentId,
        title: t.moment,
        summary: momentText.trim()
          ? t.momentPostedText.replace('{name}', s.myName || t.you).replace('{text}', momentText.trim())
          : t.momentPostedWithPhoto.replace('{name}', s.myName || t.you),
        occurredAt: timestamp,
        mediaUris: momentImageUrl ? [momentImageUrl] : undefined,
        recallWeight: 0.55,
        state: 'digested',
      })), s.relationshipTraces),
      showComposeMoment: false,
      momentText: '',
      momentImageUrl: '',
    }));
  };

  return (
    <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.3)' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 28 }}
      >
      <View
        style={{
          width: cardWidth,
          maxHeight: cardMaxHeight,
          borderRadius: 18,
          paddingHorizontal: 22,
          paddingTop: 16,
          paddingBottom: 20,
          backgroundColor: 'rgba(31,38,68,0.98)',
          borderWidth: 0.75,
          borderColor: 'rgba(242,170,152,0.3)',
          shadowColor: '#4F465F',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 2,
        }}
      >
        <View style={{ width: 44, height: 4, borderRadius: 999, backgroundColor: '#D8D2DF', alignSelf: 'center', marginBottom: 18 }} />
        <Text style={{ color: '#FFF1EA', fontSize: 22, fontWeight: '900', marginBottom: 16 }}>{t.postMoment}</Text>
        <TextInput
          value={momentText}
          onChangeText={(v) => set({ momentText: v })}
          placeholder={t.momentPlaceholder}
          placeholderTextColor="#9CA3AF"
          multiline
          style={{
            width: '100%',
            minHeight: 116,
            borderRadius: 18,
            paddingHorizontal: 16,
            paddingVertical: 14,
            marginBottom: 12,
            backgroundColor: 'rgba(255,241,235,0.9)',
            color: '#3F405C',
            fontSize: 15,
            textAlignVertical: 'top',
          }}
        />
        {momentImageUrl ? (
          <View style={{ width: 112, height: 112, borderRadius: 16, overflow: 'hidden', marginBottom: 12 }}>
            <Image source={{ uri: momentImageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            <AnimatedPressable
              accessibilityLabel={t.removePhoto}
              onPress={() => set({ momentImageUrl: '' })}
              style={{ position: 'absolute', top: 6, right: 6, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,16,35,0.72)' }}
            >
              <X size={17} color="#FFF1EA" />
            </AnimatedPressable>
          </View>
        ) : (
          <AnimatedPressable
            accessibilityLabel={t.chooseMomentPhoto}
            onPress={() => { void handlePickImage(); }}
            style={{ width: '100%', minHeight: 50, borderRadius: 16, marginBottom: 12, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: 'rgba(255,241,235,0.12)', borderWidth: 0.75, borderColor: 'rgba(242,170,152,0.24)' }}
          >
            <ImagePlus size={19} color="#F2AA98" />
            <Text style={{ color: '#FFF1EA', fontSize: 13, fontWeight: '700' }}>{t.choosePhoto}</Text>
          </AnimatedPressable>
        )}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <AnimatedPressable
            accessibilityLabel={t.cancel}
            onPress={() => set({ showComposeMoment: false, momentText: '', momentImageUrl: '' })}
            style={{ flex: 1, height: 46, borderRadius: 23, backgroundColor: '#F1EEF4', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#3F4A67', fontSize: 15, fontWeight: '800' }}>{t.cancel}</Text>
          </AnimatedPressable>
          <AnimatedPressable accessibilityLabel={t.publish} accessibilityState={{ disabled: !canPublish }} disabled={!canPublish} onPress={handlePublish} style={{ flex: 1.25, height: 46, borderRadius: 23, overflow: 'hidden', opacity: canPublish ? 1 : 0.46 }}>
            <NativeGradient direction="to-r" colors={['#E9A08F', '#B9798E']} borderRadius={23} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#FFF7F2', fontSize: 15, fontWeight: '900' }}>{t.publish}</Text>
            </NativeGradient>
          </AnimatedPressable>
        </View>
      </View>
      </KeyboardAvoidingView>
    </View>
  );
}
