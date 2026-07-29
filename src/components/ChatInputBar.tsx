import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, Platform, Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Keyboard as KeyboardIcon, Mic, Plus, Send, Smile } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { transcribeAudioCapture } from '../services/audioAiRuntime';
import { resolveVoiceProvider } from '../services/voiceProviderRuntime';
import { useNativeVoiceCapture } from '../services/nativeAudioRuntime';
import { deletePersistedMediaFile } from '../services/localMediaRepository';
import type { MediaCaptureResult } from '../services/mediaRuntime';
import { useNanaStore } from '../stores/nanaStore';
import { triggerHaptic } from '../utils/haptics';
import { EmojiPanel } from './EmojiPanel';
import { NeumorphicSurface, neumorphicPalette } from './neumorphic-surface';
import { PlusMenuPanel } from './PlusMenuPanel';
import { AnimatedPressable } from './primitives';
import { canCommitVoiceCapture, isMeasuredVoiceDurationSendable } from './voiceCaptureGuard';
import { hideVoiceGestureVisual, updateVoiceGestureVisual } from './voice-gesture-overlay';
import { setDynamicIslandRecordingState } from './system/DynamicIsland';

export type VoiceGesturePhase =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'cancelArmed'
  | 'transcribeArmed'
  | 'finishing'
  | 'converting'
  | 'tooShort'
  | 'permissionBlocked'
  | 'failed';

export const VOICE_MIN_DURATION_MS = 1000;
export const VOICE_MAX_DURATION_MS = 60_000;
export const VOICE_CANCEL_THRESHOLD = -64;
export const VOICE_CANCEL_RECOVERY_THRESHOLD = -40;
export const VOICE_TRANSCRIBE_X_RATIO = 0.62;

const PANEL_MAX_HEIGHT = 220;
const PANEL_MIN_HEIGHT = 196;
const ICON_SIZE = 44;
const nativeUiFont = Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' });

function VoiceGlassSurface({ active = false, radius = ICON_SIZE / 2 }: { active?: boolean; radius?: number }) {
  return (
    <NeumorphicSurface
      pointerEvents="none"
      depth={active ? 'inset' : 'raisedSmall'}
      tone={active ? 'accent' : 'base'}
      radius={radius}
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
    />
  );
}

export function ChatInputBar() {
  const { t } = useApp();
  const chatInput = useNanaStore(state => state.chatInput);
  const chatPanel = useNanaStore(state => state.chatPanel);
  const activeChatId = useNanaStore(state => state.activeChatId);
  const blockedUsers = useNanaStore(state => state.blockedUsers);
  const stickers = useNanaStore(state => state.stickers);
  const sendSticker = useNanaStore(state => state.sendSticker);
  const callOverlayVisible = useNanaStore(state => state.callOverlay.show);
  const set = useNanaStore.setState;
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const panelHeight = Math.min(PANEL_MAX_HEIGHT, Math.max(PANEL_MIN_HEIGHT, screenHeight * 0.3));
  const activePanelHeight = chatPanel === 'plus' ? 132 : panelHeight;

  const isBlocked = activeChatId ? blockedUsers.includes(activeChatId) : false;
  const voiceMode = chatPanel === 'voice';
  const inputRef = useRef<TextInput>(null);
  const gestureStartYRef = useRef(0);
  const gestureStartedAtRef = useRef(0);
  const startPromiseRef = useRef<Promise<MediaCaptureResult> | null>(null);
  const releaseIntentRef = useRef<'none' | 'send' | 'cancel' | 'transcribe'>('none');
  const finalizingRef = useRef(false);
  const gestureTokenRef = useRef(0);
  const interruptedRef = useRef(false);
  const mountedRef = useRef(true);
  const gestureActiveRef = useRef(false);
  const cancelArmedRef = useRef(false);
  const transcribeArmedRef = useRef(false);
  const captureStartedRef = useRef(false);
  const permissionBlockedRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const [voicePhase, setVoicePhase] = useState<VoiceGesturePhase>('idle');
  const [retryableTranscription, setRetryableTranscription] = useState<MediaCaptureResult | null>(null);
  const [webElapsedSec, setWebElapsedSec] = useState(0);
  const [webMeteringSample, setWebMeteringSample] = useState(0.22);
  const {
    start: startNativeVoiceCapture,
    finish: finishNativeVoiceCapture,
    cancel: cancelNativeVoiceCapture,
    discard: discardNativeVoiceCapture,
    finalize: finalizeNativeVoiceCapture,
    reset: resetNativeVoiceCapture,
    isNativeAvailable: isNativeVoiceAvailable,
    isRecording: isNativeRecording,
    durationSec: nativeDurationSec,
    metering: nativeRecordingMetering,
  } = useNativeVoiceCapture();
  const cancelNativeVoiceCaptureRef = useRef(cancelNativeVoiceCapture);
  cancelNativeVoiceCaptureRef.current = cancelNativeVoiceCapture;
  const resetNativeVoiceCaptureRef = useRef(resetNativeVoiceCapture);
  resetNativeVoiceCaptureRef.current = resetNativeVoiceCapture;
  const retryableTranscriptionRef = useRef(retryableTranscription);
  retryableTranscriptionRef.current = retryableTranscription;

  const hasText = chatInput.trim().length > 0;
  const recordingActive = voicePhase === 'starting'
    || voicePhase === 'recording'
    || voicePhase === 'cancelArmed'
    || voicePhase === 'transcribeArmed'
    || isNativeRecording;
  const recordingDurationSec = isNativeVoiceAvailable ? nativeDurationSec : webElapsedSec;

  const clearVoiceGesture = useCallback((nextPhase: VoiceGesturePhase = 'idle') => {
    finalizingRef.current = false;
    gestureActiveRef.current = false;
    cancelArmedRef.current = false;
    transcribeArmedRef.current = false;
    captureStartedRef.current = false;
    permissionBlockedRef.current = false;
    releaseIntentRef.current = 'none';
    startPromiseRef.current = null;
    gestureStartedAtRef.current = 0;
    setWebElapsedSec(0);
    setWebMeteringSample(0.22);
    setVoicePhase(nextPhase);
  }, []);

  const showVoiceError = useCallback((description: string) => {
    set({
      islandNotification: {
        title: t.voiceMessage,
        desc: description,
        status: 'error',
      },
    });
    setTimeout(() => useNanaStore.setState({ islandNotification: null }), 2200);
  }, [set, t.voiceMessage]);

  const clearRetryableTranscription = useCallback((deleteAudio = false) => {
    const retryable = retryableTranscriptionRef.current;
    if (deleteAudio && retryable?.localUri) {
      deletePersistedMediaFile(retryable.localUri, 'audio');
    }
    retryableTranscriptionRef.current = null;
    setRetryableTranscription(null);
  }, []);

  const convertCaptureToText = useCallback(async (
    capture: MediaCaptureResult,
    finishingToken = gestureTokenRef.current,
  ) => {
    setVoicePhase('converting');
    const state = useNanaStore.getState();
    const voiceProvider = resolveVoiceProvider({
      voiceProviderEnabled: state.voiceProviderEnabled,
      voiceApiUrl: state.voiceApiUrl,
      voiceApiKey: state.voiceApiKey,
      voiceSttModel: state.voiceSttModel,
      voiceTtsModel: state.voiceTtsModel,
      chatApiUrl: state.apiUrl,
      chatApiKey: state.apiKey,
      chatModel: state.selectedModel,
    });
    const transcriptCapture = await transcribeAudioCapture({
      capture,
      apiUrl: voiceProvider.stt.apiUrl,
      apiKey: voiceProvider.stt.apiKey,
      selectedModel: voiceProvider.stt.model,
      sttModel: voiceProvider.stt.model,
      language: state.speechLanguage || 'zh-CN',
    });
    if (!canCommitVoiceCapture({
      mounted: mountedRef.current,
      interrupted: interruptedRef.current,
      currentToken: gestureTokenRef.current,
      finishingToken,
    })) {
      if (mountedRef.current) clearVoiceGesture();
      return;
    }

    const transcript = transcriptCapture.phase === 'ready'
      ? transcriptCapture.transcript?.trim()
      : '';
    if (!transcript) {
      const retainedCapture = finalizeNativeVoiceCapture(capture);
      resetNativeVoiceCapture();
      retryableTranscriptionRef.current = retainedCapture;
      setRetryableTranscription(retainedCapture);
      clearVoiceGesture('failed');
      showVoiceError(`${transcriptCapture.errorMessage || t.voiceInputPending} · ${t.retryMessage}`);
      return;
    }

    if (retryableTranscriptionRef.current?.localUri === capture.localUri) {
      clearRetryableTranscription(true);
    } else {
      discardNativeVoiceCapture(capture);
    }
    resetNativeVoiceCapture();
    clearVoiceGesture();
    set({ chatInput: transcript, chatPanel: 'none' });
    inputRef.current?.focus();
    triggerHaptic('success');
  }, [
    clearRetryableTranscription,
    clearVoiceGesture,
    discardNativeVoiceCapture,
    finalizeNativeVoiceCapture,
    resetNativeVoiceCapture,
    set,
    showVoiceError,
    t.retryMessage,
    t.voiceInputPending,
  ]);

  const retryTranscription = useCallback(() => {
    const capture = retryableTranscriptionRef.current;
    if (!capture?.localUri || finalizingRef.current) return;
    finalizingRef.current = true;
    interruptedRef.current = false;
    gestureTokenRef.current += 1;
    void convertCaptureToText(capture, gestureTokenRef.current);
  }, [convertCaptureToText]);

  const finishGesture = useCallback(async (intent: 'send' | 'cancel' | 'transcribe') => {
    if (finalizingRef.current) return;
    finalizingRef.current = true;
    gestureActiveRef.current = false;
    const finishingToken = gestureTokenRef.current;
    setVoicePhase('finishing');

    if (intent === 'cancel') {
      await cancelNativeVoiceCapture();
      triggerHaptic('light');
      clearVoiceGesture();
      return;
    }

    const capture = await finishNativeVoiceCapture();
    if (!canCommitVoiceCapture({
      mounted: mountedRef.current,
      interrupted: interruptedRef.current,
      currentToken: gestureTokenRef.current,
      finishingToken,
    })) {
      discardNativeVoiceCapture(capture);
      await cancelNativeVoiceCaptureRef.current();
      if (mountedRef.current) clearVoiceGesture();
      return;
    }
    if (capture.phase === 'permissionBlocked') {
      clearVoiceGesture();
      showVoiceError(capture.errorMessage || t.microphoneUnavailable);
      return;
    }
    if ((capture.phase !== 'ready' && capture.phase !== 'processing') || !capture.localUri) {
      discardNativeVoiceCapture(capture);
      await cancelNativeVoiceCaptureRef.current();
      clearVoiceGesture('failed');
      showVoiceError(capture.errorMessage || t.voiceInputPending);
      return;
    }
    if (!isMeasuredVoiceDurationSendable({
      durationMillis: capture.durationMillis,
      durationSec: capture.durationSec,
      minimumMillis: VOICE_MIN_DURATION_MS,
    })) {
      discardNativeVoiceCapture(capture);
      await cancelNativeVoiceCapture();
      triggerHaptic('error');
      clearVoiceGesture('tooShort');
      setTimeout(() => setVoicePhase(current => current === 'tooShort' ? 'idle' : current), 900);
      return;
    }

    if (intent === 'transcribe') {
      await convertCaptureToText(capture, finishingToken);
      return;
    }

    clearRetryableTranscription(true);
    resetNativeVoiceCapture();
    clearVoiceGesture();
    void useNanaStore.getState().sendChatMessage('voice', undefined, undefined, capture);
  }, [
    cancelNativeVoiceCapture,
    clearRetryableTranscription,
    clearVoiceGesture,
    convertCaptureToText,
    discardNativeVoiceCapture,
    finishNativeVoiceCapture,
    resetNativeVoiceCapture,
    showVoiceError,
    t.microphoneUnavailable,
    t.voiceInputPending,
  ]);

  const handleVoicePressIn = useCallback((pageY = 0) => {
    if (isBlocked || finalizingRef.current) return;
    clearRetryableTranscription(true);
    gestureStartYRef.current = pageY;
    gestureStartedAtRef.current = Date.now();
    gestureActiveRef.current = true;
    cancelArmedRef.current = false;
    transcribeArmedRef.current = false;
    captureStartedRef.current = false;
    permissionBlockedRef.current = false;
    const gestureToken = gestureTokenRef.current + 1;
    gestureTokenRef.current = gestureToken;
    interruptedRef.current = false;
    releaseIntentRef.current = 'none';
    setVoicePhase('starting');
    triggerHaptic('medium');

    if (!isNativeVoiceAvailable) {
      setVoicePhase('recording');
      return;
    }

    const startPromise = startNativeVoiceCapture();
    startPromiseRef.current = startPromise;
    void startPromise.then(capture => {
      if (interruptedRef.current || gestureTokenRef.current !== gestureToken) {
        discardNativeVoiceCapture(capture);
        void cancelNativeVoiceCapture();
        return;
      }
      if (capture.phase === 'permissionBlocked') {
        startPromiseRef.current = null;
        permissionBlockedRef.current = true;
        if (!gestureActiveRef.current || releaseIntentRef.current !== 'none') {
          clearVoiceGesture();
          showVoiceError(capture.errorMessage || t.microphoneUnavailable);
          return;
        }
        // Keep the hold gesture surface visible until the finger is released.
        // Permission failure is feedback after the gesture, never a replacement UI.
        setVoicePhase(current => current === 'cancelArmed' || current === 'transcribeArmed' ? current : 'recording');
        return;
      }
      if (capture.phase === 'failed') {
        clearVoiceGesture('failed');
        showVoiceError(capture.errorMessage || t.voiceInputPending);
        return;
      }
      captureStartedRef.current = true;
      startPromiseRef.current = null;
      const releaseIntent = releaseIntentRef.current;
      if (releaseIntent !== 'none') {
        void finishGesture(releaseIntent);
        return;
      }
      setVoicePhase(current => current === 'cancelArmed' || current === 'transcribeArmed' ? current : 'recording');
    });
  }, [
    clearVoiceGesture,
    clearRetryableTranscription,
    cancelNativeVoiceCapture,
    discardNativeVoiceCapture,
    finishGesture,
    isBlocked,
    isNativeVoiceAvailable,
    showVoiceError,
    startNativeVoiceCapture,
    t.microphoneUnavailable,
    t.voiceInputPending,
  ]);

  const handleVoiceMove = useCallback((pageY = 0, pageX = screenWidth / 2) => {
    if (!gestureActiveRef.current || finalizingRef.current) return;
    const deltaY = pageY - gestureStartYRef.current;
    if (deltaY <= VOICE_CANCEL_THRESHOLD) {
      const transcribeArmed = pageX >= screenWidth * VOICE_TRANSCRIBE_X_RATIO;
      if (transcribeArmed) {
        transcribeArmedRef.current = true;
        cancelArmedRef.current = false;
      } else {
        cancelArmedRef.current = true;
        transcribeArmedRef.current = false;
      }
      setVoicePhase(transcribeArmed ? 'transcribeArmed' : 'cancelArmed');
      return;
    }
    if (deltaY >= VOICE_CANCEL_RECOVERY_THRESHOLD) {
      cancelArmedRef.current = false;
      transcribeArmedRef.current = false;
      setVoicePhase(current => current === 'cancelArmed' || current === 'transcribeArmed' ? 'recording' : current);
    }
  }, [screenWidth]);

  const handleVoicePressOut = useCallback(() => {
    if (!gestureActiveRef.current || finalizingRef.current) return;
    const cancelRequested = cancelArmedRef.current;
    const transcribeRequested = transcribeArmedRef.current;
    const intent = cancelRequested ? 'cancel' : transcribeRequested ? 'transcribe' : 'send';
    gestureActiveRef.current = false;
    if (permissionBlockedRef.current) {
      clearVoiceGesture();
      showVoiceError(t.microphoneUnavailable);
      return;
    }
    if (!isNativeVoiceAvailable) {
      clearVoiceGesture('failed');
      showVoiceError(t.voiceMobileOnly);
      return;
    }
    if (!captureStartedRef.current && startPromiseRef.current) {
      releaseIntentRef.current = intent;
      return;
    }
    void finishGesture(intent);
  }, [clearVoiceGesture, finishGesture, isNativeVoiceAvailable, showVoiceError, t.microphoneUnavailable, t.voiceMobileOnly]);

  useEffect(() => {
    if (!recordingActive || isNativeVoiceAvailable) return undefined;
    const timer = setInterval(() => {
      const elapsedMs = Math.max(0, Date.now() - gestureStartedAtRef.current);
      setWebElapsedSec(Math.min(60, Math.floor(elapsedMs / 1000)));
      setWebMeteringSample(0.28 + Math.abs(Math.sin(elapsedMs / 83)) * 0.67);
    }, 40);
    return () => clearInterval(timer);
  }, [isNativeVoiceAvailable, recordingActive]);

  useEffect(() => {
    if (!recordingActive || recordingDurationSec < 60) return;
    releaseIntentRef.current = 'send';
    void finishGesture(transcribeArmedRef.current ? 'transcribe' : 'send');
  }, [finishGesture, recordingActive, recordingDurationSec]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      if (nextState === 'active') {
        if (previousState !== 'active' && permissionBlockedRef.current) {
          resetNativeVoiceCaptureRef.current();
          clearVoiceGesture();
        }
        return;
      }
      if (!gestureActiveRef.current && !finalizingRef.current) return;
      interruptedRef.current = true;
      gestureTokenRef.current += 1;
      releaseIntentRef.current = 'cancel';
      void cancelNativeVoiceCaptureRef.current().finally(() => clearVoiceGesture());
    });
    return () => subscription.remove();
  }, [clearVoiceGesture]);

  useEffect(() => {
    if (!callOverlayVisible || (!gestureActiveRef.current && !finalizingRef.current)) return;
    interruptedRef.current = true;
    gestureTokenRef.current += 1;
    releaseIntentRef.current = 'cancel';
    void cancelNativeVoiceCaptureRef.current().finally(() => clearVoiceGesture());
  }, [callOverlayVisible, clearVoiceGesture]);

  useEffect(() => {
    if (voiceMode || voicePhase !== 'failed') return;
    clearRetryableTranscription(true);
    resetNativeVoiceCaptureRef.current();
    clearVoiceGesture();
  }, [clearRetryableTranscription, clearVoiceGesture, voiceMode, voicePhase]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      interruptedRef.current = true;
      gestureTokenRef.current += 1;
      // Safe after useNativeVoiceCapture's disposal barrier was introduced.
      void cancelNativeVoiceCaptureRef.current();
    };
  }, []);

  const handleSend = () => {
    if (!hasText) return;
    triggerHaptic('light');
    void useNanaStore.getState().sendChatMessage('text');
  };

  const toggleVoiceMode = () => {
    triggerHaptic('light');
    inputRef.current?.blur();
    Keyboard.dismiss();
    if (gestureActiveRef.current || finalizingRef.current) {
      interruptedRef.current = true;
      gestureTokenRef.current += 1;
      releaseIntentRef.current = 'cancel';
      void cancelNativeVoiceCaptureRef.current().finally(() => clearVoiceGesture());
    }
    set({ chatPanel: voiceMode ? 'none' : 'voice' });
  };

  const openPanel = (panel: 'emoji' | 'plus') => {
    triggerHaptic('light');
    inputRef.current?.blur();
    Keyboard.dismiss();
    set({ chatPanel: chatPanel === panel ? 'none' : panel });
  };

  const voiceInstruction = voicePhase === 'cancelArmed'
    ? t.releaseToCancel
    : voicePhase === 'transcribeArmed'
      ? t.releaseToConvert
      : voicePhase === 'converting' || voicePhase === 'starting'
        ? t.processing
        : voicePhase === 'tooShort'
          ? t.recordingTooShort
          : recordingActive
            ? t.releaseToSend
            : t.holdToTalk;
  const voiceOverlayVisible = recordingActive || voicePhase === 'tooShort' || voicePhase === 'converting';
  const islandRecordingVisible = voiceOverlayVisible || voicePhase === 'finishing';
  const islandRecordingDurationSec = Math.min(VOICE_MAX_DURATION_MS / 1000, Math.floor(recordingDurationSec));
  const meteringLevel = nativeRecordingMetering == null
    ? webMeteringSample
    : Math.max(0.22, Math.min(1, (nativeRecordingMetering + 58) / 58));

  useEffect(() => {
    if (!voiceOverlayVisible) {
      hideVoiceGestureVisual();
      return;
    }
    updateVoiceGestureVisual({
      visible: true,
      phase: voicePhase,
      durationSec: recordingDurationSec,
      meteringLevel,
    });
  }, [meteringLevel, recordingDurationSec, voiceOverlayVisible, voicePhase]);

  useEffect(() => {
    if (!islandRecordingVisible) {
      setDynamicIslandRecordingState(null);
      return;
    }
    setDynamicIslandRecordingState({
      phase: voicePhase === 'idle' || voicePhase === 'permissionBlocked' || voicePhase === 'failed'
        ? 'recording'
        : voicePhase,
      title: t.voiceMessage,
      desc: voiceInstruction,
      durationSec: islandRecordingDurationSec,
    });
  }, [
    islandRecordingDurationSec,
    islandRecordingVisible,
    t.voiceMessage,
    voiceInstruction,
    voicePhase,
  ]);

  useEffect(() => () => {
    hideVoiceGestureVisual();
    setDynamicIslandRecordingState(null);
  }, []);

  const panelOpen = chatPanel === 'emoji' || chatPanel === 'plus';

  return (
    <View
      style={{
        width: screenWidth,
        maxWidth: '100%',
        alignSelf: 'stretch',
        flexShrink: 0,
        position: 'relative',
        backgroundColor: 'transparent',
        borderTopWidth: 0,
        borderTopColor: 'rgba(255, 232, 230, 0.1)',
        opacity: voiceOverlayVisible ? 0 : 1,
        transform: [{ translateY: voiceOverlayVisible ? 120 : 0 }],
      }}
    >
      <View style={{ width: screenWidth, maxWidth: '100%', minHeight: 60, paddingHorizontal: 7, paddingVertical: 8 }}>
        <NeumorphicSurface
          depth="raised"
          tone="composer"
          radius={18}
          style={{ width: screenWidth - 14, maxWidth: '100%', height: 48 }}
          contentStyle={{ overflow: 'visible' }}
        >
        {isBlocked ? (
          <View
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              zIndex: 8,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: neumorphicPalette.accent,
            }}
          >
            <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 13, fontWeight: '700' }}>{t.blocked}</Text>
          </View>
        ) : null}

        {voiceMode ? (
          <View
            collapsable={false}
            style={{ width: '100%', height: 48, position: 'relative' }}
          >
            <AnimatedPressable
              testID="chat-voice-toggle-button"
              accessibilityRole="button"
              accessibilityLabel={t.switchToKeyboard}
              accessibilityState={{ selected: true }}
              onPress={toggleVoiceMode}
              scale={0.96}
              style={{
                position: 'absolute',
                left: 0,
                top: 2,
                zIndex: 4,
                width: ICON_SIZE,
                height: ICON_SIZE,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 0,
              }}
            >
              <VoiceGlassSurface active />
              <View pointerEvents="none" style={{ zIndex: 3 }}>
                <KeyboardIcon size={20} color={neumorphicPalette.onLightPrimary} strokeWidth={1.8} />
              </View>
            </AnimatedPressable>

            <Pressable
              testID="voice-hold-button"
              accessible
              collapsable={false}
              accessibilityRole="button"
              accessibilityLabel={retryableTranscription ? `${t.retryMessage}, ${t.convertToText}` : recordingActive ? t.releaseToSend : t.holdToTalk}
              accessibilityHint={t.slideUpToCancel}
              disabled={voicePhase === 'finishing' || voicePhase === 'converting'}
              pressRetentionOffset={{ top: 104, right: 44, bottom: 72, left: 44 }}
              onPress={retryableTranscription ? retryTranscription : undefined}
              onPressIn={retryableTranscription ? undefined : event => handleVoicePressIn(event.nativeEvent.pageY)}
              onPressOut={retryableTranscription ? undefined : handleVoicePressOut}
              onTouchMove={retryableTranscription ? undefined : event => handleVoiceMove(event.nativeEvent.pageY, event.nativeEvent.pageX)}
              onPointerDown={event => {
                if (Platform.OS !== 'web') return;
                const target = event.currentTarget as unknown as { setPointerCapture?: (pointerId: number) => void };
                const pointerId = (event.nativeEvent as { pointerId?: number }).pointerId;
                if (pointerId !== undefined) target.setPointerCapture?.(pointerId);
              }}
              onPointerMove={retryableTranscription ? undefined : event => handleVoiceMove(event.nativeEvent.pageY, event.nativeEvent.pageX)}
              style={({ pressed }) => ({
                position: 'absolute',
                top: 0,
                left: ICON_SIZE + 6,
                right: ICON_SIZE * 2 + 12,
                height: 48,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 0,
                transform: [{ scale: pressed ? 0.988 : 1 }],
              })}
            >
              {({ pressed }) => (
                <>
                  <VoiceGlassSurface active={pressed} radius={12} />
                  <Text
                    pointerEvents="none"
                    numberOfLines={1}
                    style={{
                      maxWidth: '100%',
                      color: neumorphicPalette.onLightPrimary,
                      fontSize: 15,
                      lineHeight: 48,
                      fontWeight: '600',
                      fontFamily: nativeUiFont,
                      textAlign: 'center',
                      includeFontPadding: false,
                    }}
                  >
                    {voiceOverlayVisible
                      ? ''
                      : retryableTranscription
                        ? `${t.retryMessage} · ${t.convertToText}`
                        : voiceInstruction}
                  </Text>
                </>
              )}
            </Pressable>

            <AnimatedPressable
              testID="chat-voice-emoji-button"
              accessibilityRole="button"
              accessibilityLabel={t.openEmoji}
              onPress={() => openPanel('emoji')}
              scale={0.96}
              style={{
                position: 'absolute',
                right: ICON_SIZE + 6,
                top: 2,
                zIndex: 4,
                width: ICON_SIZE,
                height: ICON_SIZE,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 0,
              }}
            >
              <VoiceGlassSurface />
              <View pointerEvents="none" style={{ zIndex: 3 }}>
                <Smile size={20} color={neumorphicPalette.onLightPrimary} strokeWidth={1.8} />
              </View>
            </AnimatedPressable>

            <AnimatedPressable
              testID="chat-plus-button"
              accessibilityRole="button"
              accessibilityLabel={t.openAttachments}
              accessibilityState={{ expanded: false }}
              onPress={() => openPanel('plus')}
              scale={0.96}
              style={{
                position: 'absolute',
                right: 0,
                top: 2,
                zIndex: 4,
                width: ICON_SIZE,
                height: ICON_SIZE,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 0,
              }}
            >
              <VoiceGlassSurface />
              <View pointerEvents="none" style={{ zIndex: 3 }}>
                <Plus size={20} color={neumorphicPalette.onLightPrimary} strokeWidth={1.8} />
              </View>
            </AnimatedPressable>
          </View>
        ) : (
          <View style={{ width: '100%', height: 48, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AnimatedPressable
              testID="chat-voice-toggle-button"
              accessibilityRole="button"
              accessibilityLabel={t.voiceMessage}
              accessibilityState={{ selected: false }}
              onPress={toggleVoiceMode}
              scale={0.96}
              style={{
                width: ICON_SIZE,
                height: ICON_SIZE,
                flexShrink: 0,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 0,
              }}
            >
              <VoiceGlassSurface />
              <View pointerEvents="none" style={{ zIndex: 3 }}>
                <Mic size={20} color={neumorphicPalette.onLightPrimary} strokeWidth={1.8} />
              </View>
            </AnimatedPressable>

            <NeumorphicSurface
              depth="inset"
              tone="composer"
              radius={14}
              style={{
                flex: 1,
                minWidth: 0,
                height: 44,
              }}
              contentStyle={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingLeft: 14,
                paddingRight: 2,
              }}
            >
              <TextInput
                ref={inputRef}
                value={chatInput}
                onChangeText={value => set({ chatInput: value, chatPanel: 'none' })}
                onFocus={() => set({ chatPanel: 'none' })}
                placeholder={t.space}
                accessibilityLabel={t.space}
                placeholderTextColor={neumorphicPalette.onLightSecondary}
                style={{ flex: 1, minWidth: 0, height: 44, paddingVertical: 0, color: neumorphicPalette.onLightPrimary, fontSize: 15 }}
                returnKeyType="send"
                onSubmitEditing={handleSend}
                blurOnSubmit={false}
              />
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel={chatPanel === 'emoji' ? t.closeEmoji : t.openEmoji}
                accessibilityState={{ expanded: chatPanel === 'emoji' }}
                onPress={() => openPanel('emoji')}
                style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
              >
                <Smile size={20} color={neumorphicPalette.onLightPrimary} strokeWidth={1.7} />
              </AnimatedPressable>
            </NeumorphicSurface>

            {hasText ? (
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel={t.send || 'Send message'}
              onPress={handleSend}
              style={{ width: ICON_SIZE, height: ICON_SIZE, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
            >
              <NeumorphicSurface
                pointerEvents="none"
                depth="raisedSmall"
                tone="accent"
                radius={22}
                style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
              />
              <Send size={18} color={neumorphicPalette.onLightPrimary} strokeWidth={2} />
            </AnimatedPressable>
          ) : (
            <AnimatedPressable
              testID="chat-plus-button"
              accessibilityRole="button"
              accessibilityLabel={chatPanel === 'plus' ? t.closeAttachments : t.openAttachments}
              accessibilityState={{ expanded: chatPanel === 'plus' }}
              onPress={() => openPanel('plus')}
              scale={0.96}
              style={{
                width: ICON_SIZE,
                height: ICON_SIZE,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 0,
              }}
            >
              <VoiceGlassSurface active={chatPanel === 'plus'} />
              <View pointerEvents="none" style={{ zIndex: 3 }}>
                <Plus size={20} color={neumorphicPalette.onLightPrimary} strokeWidth={1.8} />
              </View>
            </AnimatedPressable>
            )}
          </View>
        )}
        </NeumorphicSurface>
      </View>

      {panelOpen ? (
        <NeumorphicSurface
          depth="raised"
          tone="composer"
          radius={18}
          style={{
            height: activePanelHeight,
            marginHorizontal: 8,
            marginBottom: 6,
          }}
          contentStyle={{ overflow: 'hidden' }}
        >
          {chatPanel === 'emoji'
            ? (
                <EmojiPanel
                  onSelect={emoji => set({ chatInput: chatInput + emoji })}
                  stickers={stickers}
                  characterId={activeChatId || undefined}
                  onSelectSticker={sticker => {
                    set({ chatPanel: 'none' });
                    void sendSticker(sticker.id);
                  }}
                  onManageStickers={() => set({
                    weChatPage: 'stickers',
                    stickerManagerCharacterId: activeChatId,
                    chatPanel: 'none',
                  })}
                />
              )
            : <PlusMenuPanel />}
        </NeumorphicSurface>
      ) : null}
    </View>
  );
}
