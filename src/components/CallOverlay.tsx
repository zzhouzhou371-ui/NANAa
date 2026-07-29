import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  AppState,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { MotiView } from 'moti';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  PhoneOff,
  SwitchCamera,
  Video,
  VideoOff,
  Volume1,
  Volume2,
} from 'lucide-react-native';
import type { CameraType } from 'expo-camera';
import { useApp } from '../context/AppContext';
import {
  createCallVoiceActivityState,
  reduceCallVoiceActivity,
  type CallVoiceActivityState,
} from '../services/callVoiceActivityRuntime';
import { useNativeVoiceCapture } from '../services/nativeAudioRuntime';
import {
  beginNativeCallAudioSession,
  endNativeCallAudioSession,
  isNativeCallAudioRouteAvailable,
  setNativeCallAudioRoute,
  type NativeCallAudioRoute,
} from '../services/nativeCallAudioRouteRuntime';
import { NativeSelfCameraPreview } from '../services/nativeCameraRuntime';
import { NativeVideoPersonaView } from '../services/nativeVideoRuntime';
import type { MediaCaptureResult } from '../services/mediaRuntime';
import { useNanaStore } from '../stores/nanaStore';
import { triggerHaptic } from '../utils/haptics';
import { AnimatedPressable, NativeGradient } from './primitives';
import { neumorphicPalette } from './neumorphic-surface';
import { CharacterPortrait, resolveCharacterPortraitSource } from './CharacterPortrait';
import { SkyScene } from './system/SkyScene';
import { canCommitCallCapture } from './voiceCaptureGuard';
import { wechatTheme } from './wechatTheme';

const TEXT = '#F6EAE6';
const TEXT_MUTED = '#D2C3CA';
const CONTROL_INK = neumorphicPalette.onLightPrimary;
const DANGER = neumorphicPalette.berry;
const CALL_CONTROL_RAISED_SHADOW =
  '-4px -4px 9px rgba(255,252,255,0.25), 4px 5px 9px rgba(48,38,58,0.24), 1px 2px 3px rgba(42,32,52,0.22)';
const CALL_CONTROL_DANGER_SHADOW =
  '-4px -4px 9px rgba(255,226,239,0.18), 4px 5px 9px rgba(52,20,34,0.30), 1px 2px 3px rgba(45,16,29,0.28)';
const CALL_CONTROL_INSET_SHADOW =
  'inset 3px 3px 7px rgba(54,43,66,0.18), inset -3px -3px 7px rgba(255,252,255,0.24)';
const IS_WEB = Platform.OS === 'web';
const ENABLE_TEST_CALLS = process.env.EXPO_PUBLIC_NANA_TEST_CALLS === '1';
const SMOKE_FRONT_PREVIEW = require('../../assets/generated/nana-characters/aria-default.png');
const SMOKE_BACK_PREVIEW = require('../../assets/backgrounds/time-cycle-v1/dusk.png');

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => subscription.remove();
  }, []);
  return reduced;
}

function CallControl({
  label,
  accessibilityLabel,
  accessibilityHint,
  icon,
  active = false,
  accent = false,
  danger = false,
  disabled = false,
  busy = false,
  size = 70,
  testID,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  accessibilityHint?: string;
  icon: ReactNode;
  active?: boolean;
  accent?: boolean;
  danger?: boolean;
  disabled?: boolean;
  busy?: boolean;
  size?: number;
  testID?: string;
  onPress?: () => void;
}) {
  const diameter = danger ? Math.max(68, size) : size;
  const materialColor = danger
    ? DANGER
    : accent
      ? neumorphicPalette.pinkGold
      : '#C9C0DC';
  const keyBedColor = danger ? '#71374D' : '#9B91AB';
  const keySkirtColor = danger ? '#81475C' : '#ADA3BD';
  const raisedShadow = danger ? CALL_CONTROL_DANGER_SHADOW : CALL_CONTROL_RAISED_SHADOW;
  const rimHighlight = danger ? 'rgba(255,225,237,0.14)' : 'rgba(255,252,255,0.20)';
  const rimShadow = danger ? 'rgba(56,21,35,0.22)' : 'rgba(58,47,69,0.16)';

  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked: active, disabled, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      scale={0.96}
      style={{ width: diameter + 24, minHeight: diameter + 31, alignItems: 'center', gap: 7 }}
    >
      <View
        style={{
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          borderCurve: 'continuous',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: keyBedColor,
          borderTopWidth: disabled ? 1 : 0.75,
          borderLeftWidth: disabled ? 1 : 0.75,
          borderRightWidth: disabled ? 1 : 0,
          borderBottomWidth: disabled ? 1 : 0,
          borderTopColor: rimHighlight,
          borderLeftColor: rimHighlight,
          borderRightColor: disabled ? rimHighlight : 'transparent',
          borderBottomColor: disabled ? rimHighlight : 'transparent',
          opacity: disabled ? 0.62 : 1,
        }}
      >
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 4,
            right: 2,
            bottom: 0,
            left: 2,
            borderRadius: (diameter - 4) / 2,
            backgroundColor: keySkirtColor,
            borderBottomWidth: 0.75,
            borderBottomColor: rimShadow,
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: active ? 4 : 1,
            left: 3,
            width: diameter - 6,
            height: diameter - 6,
            borderRadius: (diameter - 6) / 2,
            borderCurve: 'continuous',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: materialColor,
            boxShadow: active ? CALL_CONTROL_INSET_SHADOW : raisedShadow,
            borderTopWidth: active ? 0 : 0.75,
            borderLeftWidth: active ? 0 : 0.75,
            borderBottomWidth: active ? 0.75 : 0,
            borderRightWidth: active ? 0.75 : 0,
            borderTopColor: rimHighlight,
            borderLeftColor: rimHighlight,
            borderBottomColor: active ? rimHighlight : 'transparent',
            borderRightColor: active ? rimHighlight : 'transparent',
          }}
        >
          {icon}
        </View>
      </View>
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.2}
        style={{
          color: disabled ? 'rgba(210,195,202,0.56)' : TEXT_MUTED,
          fontSize: 12,
          lineHeight: 17,
          fontWeight: '600',
          textAlign: 'center',
          fontVariant: ['tabular-nums'],
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

export function CallOverlay() {
  const { t } = useApp();
  const callOverlay = useNanaStore(state => state.callOverlay);
  const myAvatar = useNanaStore(state => state.myAvatar);
  const myName = useNanaStore(state => state.myName);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const isTiny = width <= 330 || height < 620;
  const isVideo = callOverlay.type === 'video';
  const isConnected = callOverlay.status === 'connected';
  const isIncoming = callOverlay.status === 'incoming';
  const portraitSource = resolveCharacterPortraitSource(callOverlay.characterId, callOverlay.avatar);
  const nativeRouteAvailable = isNativeCallAudioRouteAvailable();
  const canSimulateRoute = IS_WEB && ENABLE_TEST_CALLS;
  const routeControlAvailable = nativeRouteAvailable || canSimulateRoute;

  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isCameraEnabled, setIsCameraEnabled] = useState(isVideo && (!IS_WEB || ENABLE_TEST_CALLS));
  const [cameraFacing, setCameraFacing] = useState<CameraType>('front');
  const [callTime, setCallTime] = useState(callOverlay.durationSec || 0);
  const [audioRoute, setAudioRoute] = useState<NativeCallAudioRoute>('speaker');
  const [audioRoutePending, setAudioRoutePending] = useState(false);
  const [feedback, setFeedback] = useState<string | undefined>();
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');

  const {
    capture: nativeCapture,
    start: startNativeVoiceCapture,
    finish: finishNativeVoiceCapture,
    cancel: cancelNativeVoiceCapture,
    discard: discardNativeVoiceCapture,
    reset: resetNativeVoiceCapture,
    isRecording: isNativeRecording,
    durationMillis: nativeDurationMillis,
    metering: nativeMetering,
    isNativeAvailable,
  } = useNativeVoiceCapture();

  const mountedRef = useRef(true);
  const micEnabledRef = useRef(isMicEnabled);
  const appActiveRef = useRef(isAppActive);
  const recorderActiveRef = useRef(isNativeRecording);
  const nativeCaptureRef = useRef(nativeCapture);
  const meteringRef = useRef(nativeMetering);
  const meteringSampleRef = useRef({ id: 0, durationMillis: -1 });
  const callStartedAtRef = useRef(callOverlay.startedAt);
  const listenerCycleRef = useRef(0);
  const captureStartRef = useRef<Promise<MediaCaptureResult> | null>(null);
  const voiceActivityRef = useRef<CallVoiceActivityState | null>(null);
  const finalizingRef = useRef(false);
  const endingCallRef = useRef(false);
  const startCaptureRef = useRef(startNativeVoiceCapture);
  const finishCaptureRef = useRef(finishNativeVoiceCapture);
  const cancelCaptureRef = useRef(cancelNativeVoiceCapture);
  const discardCaptureRef = useRef(discardNativeVoiceCapture);
  const resetCaptureRef = useRef(resetNativeVoiceCapture);
  const beginListeningRef = useRef<() => Promise<void>>(async () => undefined);
  const finishSegmentRef = useRef<(cycle: number) => Promise<void>>(async () => undefined);
  const restartSegmentRef = useRef<() => Promise<void>>(async () => undefined);
  const cancelListeningRef = useRef<() => Promise<void>>(async () => undefined);
  const cancelListeningPromiseRef = useRef<Promise<void> | null>(null);
  const invalidateCallInputRef = useRef<() => void>(() => undefined);

  micEnabledRef.current = isMicEnabled;
  appActiveRef.current = isAppActive;
  recorderActiveRef.current = isNativeRecording;
  nativeCaptureRef.current = nativeCapture;
  meteringRef.current = nativeMetering;
  if (nativeDurationMillis !== meteringSampleRef.current.durationMillis) {
    meteringSampleRef.current = {
      id: meteringSampleRef.current.id + 1,
      durationMillis: nativeDurationMillis,
    };
  }
  callStartedAtRef.current = callOverlay.startedAt;
  startCaptureRef.current = startNativeVoiceCapture;
  finishCaptureRef.current = finishNativeVoiceCapture;
  cancelCaptureRef.current = cancelNativeVoiceCapture;
  discardCaptureRef.current = discardNativeVoiceCapture;
  resetCaptureRef.current = resetNativeVoiceCapture;

  const showFeedback = (message: string) => {
    if (!mountedRef.current) return;
    setFeedback(message);
  };

  const canListenNow = () => {
    const current = useNanaStore.getState().callOverlay;
    return mountedRef.current
      && appActiveRef.current
      && micEnabledRef.current
      && isNativeAvailable
      && current.show
      && current.status === 'connected'
      && current.speechPhase === 'idle'
      && current.startedAt === callStartedAtRef.current;
  };

  const invalidateCallInput = () => {
    const current = useNanaStore.getState().callOverlay;
    if (!current.show || current.startedAt !== callStartedAtRef.current) return;
    useNanaStore.getState().invalidateActiveCallVoiceInput(callStartedAtRef.current);
  };
  invalidateCallInputRef.current = invalidateCallInput;

  const cancelListening = async () => {
    if (cancelListeningPromiseRef.current) {
      await cancelListeningPromiseRef.current;
      if (canListenNow()) void beginListeningRef.current();
      return;
    }

    listenerCycleRef.current += 1;
    voiceActivityRef.current = null;
    captureStartRef.current = null;
    const task = (async () => {
      await cancelCaptureRef.current();
      resetCaptureRef.current();
    })();
    cancelListeningPromiseRef.current = task;
    try {
      await task;
    } finally {
      if (cancelListeningPromiseRef.current === task) cancelListeningPromiseRef.current = null;
      if (canListenNow()) void beginListeningRef.current();
    }
  };
  cancelListeningRef.current = cancelListening;

  const beginListening = async () => {
    if (cancelListeningPromiseRef.current) {
      await cancelListeningPromiseRef.current;
      return;
    }
    if (!canListenNow() || finalizingRef.current || captureStartRef.current || recorderActiveRef.current) return;
    const cycle = listenerCycleRef.current + 1;
    listenerCycleRef.current = cycle;
    const startPromise = startCaptureRef.current();
    captureStartRef.current = startPromise;
    const capture = await startPromise;
    if (captureStartRef.current === startPromise) captureStartRef.current = null;

    const canContinue = canListenNow() && cycle === listenerCycleRef.current;
    if (!canContinue || capture.phase !== 'capturing') {
      discardCaptureRef.current(capture);
      if (capture.phase === 'failed' || capture.phase === 'permissionBlocked') {
        micEnabledRef.current = false;
        if (mountedRef.current) setIsMicEnabled(false);
        showFeedback(t.microphoneUnavailable);
      }
      await cancelCaptureRef.current();
      return;
    }

    voiceActivityRef.current = createCallVoiceActivityState(Date.now());
  };
  beginListeningRef.current = beginListening;

  const finishSegment = async (cycle: number) => {
    if (finalizingRef.current || cycle !== listenerCycleRef.current) return;
    finalizingRef.current = true;
    voiceActivityRef.current = null;
    let capture: MediaCaptureResult | undefined;

    try {
      const startedCapture = await captureStartRef.current || undefined;
      captureStartRef.current = null;
      const canFinish = canCommitCallCapture({
        mounted: mountedRef.current,
        connected: canListenNow(),
        muted: !micEnabledRef.current,
        currentSession: listenerCycleRef.current,
        finishingSession: cycle,
      });
      if (!canFinish) {
        discardCaptureRef.current(startedCapture);
        await cancelCaptureRef.current();
        return;
      }

      const currentCapture = nativeCaptureRef.current;
      const captureIsActive = startedCapture?.phase === 'capturing'
        || currentCapture.phase === 'capturing'
        || recorderActiveRef.current;
      capture = captureIsActive
        ? await finishCaptureRef.current()
        : startedCapture || currentCapture;
      const canCommit = canCommitCallCapture({
        mounted: mountedRef.current,
        connected: canListenNow(),
        muted: !micEnabledRef.current,
        currentSession: listenerCycleRef.current,
        finishingSession: cycle,
      });
      if (!canCommit || !capture || (capture.phase !== 'processing' && capture.phase !== 'ready') || !capture.localUri) {
        discardCaptureRef.current(capture);
        await cancelCaptureRef.current();
        return;
      }

      resetCaptureRef.current();
      await useNanaStore.getState().sendCallSpeech(capture);
    } catch {
      showFeedback(t.callSpeechFailed);
      await cancelCaptureRef.current();
    } finally {
      discardCaptureRef.current(capture);
      finalizingRef.current = false;
      if (canListenNow()) void beginListeningRef.current();
    }
  };
  finishSegmentRef.current = finishSegment;

  const restartSegment = async () => {
    if (finalizingRef.current) return;
    finalizingRef.current = true;
    voiceActivityRef.current = null;
    listenerCycleRef.current += 1;
    captureStartRef.current = null;
    try {
      await cancelCaptureRef.current();
      resetCaptureRef.current();
    } finally {
      finalizingRef.current = false;
      if (canListenNow()) void beginListeningRef.current();
    }
  };
  restartSegmentRef.current = restartSegment;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      listenerCycleRef.current += 1;
      voiceActivityRef.current = null;
      finalizingRef.current = false;
      // The capture hook invalidates operations during unmount, so this stable
      // cancel is idempotent and cannot touch a released SharedObject.
      void cancelCaptureRef.current();
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      const active = nextState === 'active';
      appActiveRef.current = active;
      if (!active) invalidateCallInputRef.current();
      setIsAppActive(active);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    micEnabledRef.current = true;
    endingCallRef.current = false;
    listenerCycleRef.current += 1;
    voiceActivityRef.current = null;
    setIsMicEnabled(true);
    setIsCameraEnabled(isVideo && (!IS_WEB || ENABLE_TEST_CALLS));
    setCameraFacing('front');
    setAudioRoute('speaker');
    setFeedback(undefined);
    void cancelListeningRef.current();
  }, [callOverlay.startedAt, isVideo]);

  useEffect(() => {
    if (!isConnected || !callOverlay.connectedAt) {
      setCallTime(callOverlay.durationSec || 0);
      return undefined;
    }
    const updateTime = () => setCallTime(Math.max(0, Math.floor((Date.now() - callOverlay.connectedAt!) / 1000)));
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, [callOverlay.connectedAt, callOverlay.durationSec, isConnected]);

  useEffect(() => {
    if (!isConnected || !isAppActive) return undefined;
    let current = true;
    setAudioRoutePending(nativeRouteAvailable);
    void beginNativeCallAudioSession('speaker').then(result => {
      if (!current || !mountedRef.current) return;
      if (result.ok) {
        setAudioRoute(result.route);
      } else if (result.available) {
        showFeedback(t.callAudioRouteFailed);
      }
      setAudioRoutePending(false);
    });

    return () => {
      current = false;
      void endNativeCallAudioSession();
    };
  }, [callOverlay.startedAt, isAppActive, isConnected, nativeRouteAvailable, t.callAudioRouteFailed]);

  useEffect(() => {
    const shouldListen = isConnected
      && isMicEnabled
      && isAppActive
      && isNativeAvailable
      && callOverlay.speechPhase === 'idle';
    if (shouldListen) {
      void beginListeningRef.current();
      return;
    }

    listenerCycleRef.current += 1;
    voiceActivityRef.current = null;
    void cancelListeningRef.current();
  }, [callOverlay.speechPhase, isAppActive, isConnected, isMicEnabled, isNativeAvailable]);

  useEffect(() => {
    if (!isNativeAvailable) return undefined;
    const timer = setInterval(() => {
      const state = voiceActivityRef.current;
      if (!state || !recorderActiveRef.current || finalizingRef.current) return;
      const transition = reduceCallVoiceActivity(state, {
        now: Date.now(),
        meteringDb: meteringRef.current,
        sampleId: meteringSampleRef.current.id,
      });
      voiceActivityRef.current = transition.state;
      if (transition.effect === 'commit-capture') {
        voiceActivityRef.current = null;
        void finishSegmentRef.current(listenerCycleRef.current);
      } else if (transition.effect === 'restart-capture') {
        voiceActivityRef.current = null;
        void restartSegmentRef.current();
      }
    }, 250);
    return () => clearInterval(timer);
  }, [isNativeAvailable]);

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = setTimeout(() => setFeedback(undefined), 2200);
    return () => clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (callOverlay.speechPhase !== 'failed' || !isConnected || !isMicEnabled) return undefined;
    showFeedback(t.callSpeechFailed);
    const startedAt = callOverlay.startedAt;
    const timer = setTimeout(() => {
      const current = useNanaStore.getState().callOverlay;
      if (current.show && current.startedAt === startedAt && current.status === 'connected' && current.speechPhase === 'failed') {
        useNanaStore.setState({ callOverlay: { ...current, speechPhase: 'idle', errorMessage: undefined } });
      }
    }, 1600);
    return () => clearTimeout(timer);
  }, [callOverlay.speechPhase, callOverlay.startedAt, isConnected, isMicEnabled, t.callSpeechFailed]);

  const formatTime = (seconds: number) => (
    `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  );
  const statusLabel = isIncoming
    ? t.callIncoming
    : callOverlay.status === 'ringing'
      ? t.callConnecting
      : isConnected
        ? formatTime(callTime)
        : callOverlay.status === 'ending'
          ? t.callEnding
          : t.callEnded;

  const answerCall = () => {
    triggerHaptic('light');
    useNanaStore.getState().answerCall();
  };

  const endCall = async () => {
    if (endingCallRef.current) return;
    endingCallRef.current = true;
    micEnabledRef.current = false;
    invalidateCallInputRef.current();
    listenerCycleRef.current += 1;
    voiceActivityRef.current = null;
    try {
      await cancelCaptureRef.current().catch(() => undefined);
      await endNativeCallAudioSession().catch(() => undefined);
    } finally {
      triggerHaptic('error');
      useNanaStore.getState().endActiveCall(isConnected ? 'completed' : isIncoming ? 'missed' : 'cancelled');
    }
  };

  const toggleMicrophone = () => {
    if (!isConnected) return;
    const next = !micEnabledRef.current;
    micEnabledRef.current = next;
    setIsMicEnabled(next);
    triggerHaptic('light');
    if (!next) {
      invalidateCallInputRef.current();
      void cancelListeningRef.current();
    } else {
      const current = useNanaStore.getState().callOverlay;
      if (current.speechPhase === 'failed') {
        useNanaStore.setState({ callOverlay: { ...current, speechPhase: 'idle', errorMessage: undefined } });
      }
    }
  };

  const toggleSpeaker = () => {
    if (!routeControlAvailable || audioRoutePending || !isConnected) return;
    const nextRoute: NativeCallAudioRoute = audioRoute === 'speaker' ? 'earpiece' : 'speaker';
    if (!nativeRouteAvailable && canSimulateRoute) {
      setAudioRoute(nextRoute);
      triggerHaptic('light');
      return;
    }
    setAudioRoutePending(true);
    void setNativeCallAudioRoute(nextRoute).then(result => {
      if (!mountedRef.current) return;
      if (result.ok) {
        setAudioRoute(result.route);
        triggerHaptic('light');
      } else {
        showFeedback(t.callAudioRouteFailed);
        triggerHaptic('error');
      }
      setAudioRoutePending(false);
    });
  };

  const toggleCamera = () => {
    if (!isConnected || (IS_WEB && !ENABLE_TEST_CALLS)) return;
    setIsCameraEnabled(value => !value);
    triggerHaptic('light');
  };

  const flipCamera = () => {
    if (!isConnected || !isCameraEnabled || (IS_WEB && !ENABLE_TEST_CALLS)) return;
    setCameraFacing(value => value === 'front' ? 'back' : 'front');
    triggerHaptic('light');
  };

  const controlSize = isTiny ? 64 : 70;
  const endControlSize = isTiny ? 68 : 76;
  const avatarSize = Math.round(Math.max(82, Math.min(112, width * 0.26)));
  const pipWidth = Math.round(Math.max(84, Math.min(112, width * 0.28)));
  const pipHeight = Math.round(pipWidth * 4 / 3);
  const timerTop = Math.max(insets.top + 8, height * 0.1 - 11);
  const voiceIdentityTop = height * 0.35 - avatarSize / 2;
  const voiceControlsTop = height * 0.82 - controlSize / 2;
  const videoControlsTop = height * 0.7 - controlSize / 2;
  const videoBottomCenter = height * (isTiny ? 0.885 : 0.9);
  const videoBottomTop = videoBottomCenter - endControlSize / 2;
  const cameraActive = isVideo && isConnected && isCameraEnabled;

  const microphoneControl = (
    <CallControl
      testID="call-mic-button"
      label={isMicEnabled ? t.microphoneOn : t.muted}
      accessibilityLabel={isMicEnabled ? t.microphoneOn : t.muted}
      active={isMicEnabled}
      disabled={!isConnected}
      size={controlSize}
      icon={isMicEnabled
        ? <Mic size={isTiny ? 25 : 28} strokeWidth={1.9} color={CONTROL_INK} />
        : <MicOff size={isTiny ? 25 : 28} strokeWidth={1.9} color={CONTROL_INK} />}
      onPress={toggleMicrophone}
    />
  );

  const endControl = (
    <CallControl
      testID="call-end-button"
      label={t.endCall}
      accessibilityLabel={t.endCall}
      danger
      size={endControlSize}
      icon={(
        <View style={{ transform: [{ rotate: '135deg' }] }}>
          <Phone size={isTiny ? 29 : 32} strokeWidth={2.4} color="white" />
        </View>
      )}
      onPress={endCall}
    />
  );

  const speakerControl = (
    <CallControl
      testID="call-speaker-button"
      label={!routeControlAvailable ? t.speaker : audioRoute === 'speaker' ? t.speakerOn : t.speakerOff}
      accessibilityLabel={!routeControlAvailable ? t.speakerUnavailable : audioRoute === 'speaker' ? t.speakerOn : t.earpiece}
      accessibilityHint={!routeControlAvailable ? t.callMobileOnly : undefined}
      active={audioRoute === 'speaker'}
      disabled={!isConnected || !routeControlAvailable}
      busy={audioRoutePending}
      size={controlSize}
      icon={audioRoute === 'speaker'
        ? <Volume2 size={isTiny ? 25 : 28} strokeWidth={1.9} color={CONTROL_INK} />
        : <Volume1 size={isTiny ? 25 : 28} strokeWidth={1.9} color={CONTROL_INK} />}
      onPress={toggleSpeaker}
    />
  );

  return (
    <MotiView
      role="dialog"
      aria-modal
      accessibilityLabel={`${callOverlay.name} ${isVideo ? t.videoCall : t.voiceCall}`}
      accessibilityViewIsModal
      importantForAccessibility="yes"
      from={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: 'timing', duration: reducedMotion ? 0 : 180 }}
      style={{ ...StyleSheet.absoluteFillObject, zIndex: 80, backgroundColor: '#0A0E1C' }}
    >
      <SkyScene />

      {portraitSource ? (
        <ExpoImage
          accessibilityIgnoresInvertColors
          source={portraitSource}
          contentFit="cover"
          contentPosition="center"
          transition={120}
          blurRadius={Platform.OS === 'android' || isVideo ? 0 : isTiny ? 10 : 14}
          style={[StyleSheet.absoluteFillObject, !isVideo ? { transform: [{ scale: 1.12 }] } : null]}
        />
      ) : isVideo ? (
        <View style={{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' }}>
          <CharacterPortrait
            characterId={callOverlay.characterId}
            avatar={callOverlay.avatar}
            fallback={callOverlay.name[0] || 'N'}
            fontSize={58}
            color={TEXT}
            contentFit="cover"
          />
        </View>
      ) : null}

      {isVideo && callOverlay.videoPersonaSourceUri ? (
        <NativeVideoPersonaView sourceUri={callOverlay.videoPersonaSourceUri} style={StyleSheet.absoluteFillObject} />
      ) : null}

      <NativeGradient
        direction="to-b"
        colors={isVideo
          ? ['rgba(7, 10, 24, 0.66)', 'rgba(12, 13, 30, 0.04)', 'rgba(29, 14, 30, 0.22)']
          : ['rgba(7, 10, 24, 0.52)', 'rgba(28, 20, 42, 0.44)', 'rgba(8, 9, 20, 0.72)']}
        borderRadius={0}
        style={StyleSheet.absoluteFillObject}
      >
        <View />
      </NativeGradient>
      <NativeGradient
        direction="to-t"
        colors={['rgba(7, 4, 8, 0.94)', 'rgba(61, 31, 46, 0.38)', 'rgba(7, 5, 9, 0)']}
        borderRadius={0}
        style={{ position: 'absolute', right: 0, bottom: 0, left: 0, height: isVideo ? height * 0.38 : height * 0.28 }}
      >
        <View />
      </NativeGradient>

      <View pointerEvents="none" style={{ position: 'absolute', top: timerTop, right: 0, left: 0, alignItems: 'center' }}>
        <Text
          accessibilityLiveRegion="polite"
          maxFontSizeMultiplier={1.3}
          style={{
            color: TEXT,
            fontSize: isTiny ? 16 : 18,
            lineHeight: 23,
            fontWeight: '600',
            fontVariant: ['tabular-nums'],
            textShadowColor: 'rgba(0,0,0,0.58)',
            textShadowRadius: 4,
          }}
        >
          {statusLabel}
        </Text>
      </View>

      {!isVideo ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: voiceIdentityTop, right: 0, left: 0, alignItems: 'center' }}>
          <MotiView
            from={{ scale: 0.995 }}
            animate={{ scale: reducedMotion || !isConnected ? 1 : 1.018 }}
            transition={{ type: 'timing', duration: 2400, loop: !reducedMotion && isConnected, repeatReverse: true }}
            style={{ alignItems: 'center' }}
          >
            <View
              style={{
                width: avatarSize,
                height: avatarSize,
                borderRadius: isTiny ? 12 : 15,
                borderCurve: 'continuous',
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(12, 9, 14, 0.72)',
              }}
            >
              <CharacterPortrait
                characterId={callOverlay.characterId}
                avatar={callOverlay.avatar}
                fallback={callOverlay.name[0] || 'N'}
                fontSize={44}
                color={TEXT}
                contentFit="cover"
              />
            </View>
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              style={{ color: TEXT, fontSize: isTiny ? 21 : 24, lineHeight: 31, fontWeight: '600', paddingTop: 15 }}
            >
              {callOverlay.name}
            </Text>
            {IS_WEB && !ENABLE_TEST_CALLS ? (
              <Text style={{ color: TEXT_MUTED, fontSize: 12, lineHeight: 18, paddingTop: 3 }}>
                {t.callMobileOnly}
              </Text>
            ) : null}
          </MotiView>
        </View>
      ) : null}

      {isVideo && isConnected ? (
        <View
          testID={`call-camera-preview-${isCameraEnabled ? cameraFacing : 'off'}`}
          accessibilityLabel={isCameraEnabled ? t.cameraOn : t.cameraOff}
          style={{
            position: 'absolute',
            top: Math.max(insets.top + 40, height * 0.075),
            right: isTiny ? 12 : 18,
            width: pipWidth,
            height: pipHeight,
            borderRadius: 11,
            borderCurve: 'continuous',
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(17, 12, 19, 0.88)',
            borderWidth: 0.75,
            borderColor: 'rgba(255, 232, 226, 0.2)',
          }}
        >
          {isCameraEnabled ? (
            <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}>
              {IS_WEB && ENABLE_TEST_CALLS ? (
                <ExpoImage
                  source={cameraFacing === 'front' ? SMOKE_FRONT_PREVIEW : SMOKE_BACK_PREVIEW}
                  contentFit="cover"
                  transition={0}
                  style={[
                    StyleSheet.absoluteFillObject,
                    cameraFacing === 'front' ? { transform: [{ scaleX: -1 }] } : null,
                  ]}
                />
              ) : (
                <>
                  <SkyScene variant="app" />
                  <View
                    style={{
                      width: Math.round(pipWidth * 0.5),
                      height: Math.round(pipWidth * 0.5),
                      borderRadius: Math.round(pipWidth * 0.25),
                      overflow: 'hidden',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(28,18,31,0.52)',
                      borderWidth: 0.5,
                      borderColor: 'rgba(255,235,228,0.2)',
                    }}
                  >
                    <CharacterPortrait
                      avatar={myAvatar}
                      fallback={myName?.[0] || 'U'}
                      fontSize={28}
                      color={TEXT}
                      contentFit="cover"
                    />
                  </View>
                </>
              )}
              {IS_WEB && !ENABLE_TEST_CALLS ? (
                <View style={{ position: 'absolute', right: 5, bottom: 5, left: 5, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(10,7,12,0.72)' }}>
                  <Text numberOfLines={1} style={{ color: TEXT_MUTED, fontSize: 9, lineHeight: 12, textAlign: 'center', fontWeight: '600' }}>
                    {t.mobileCamera}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : <VideoOff size={24} color={wechatTheme.inkSoft} />}
          <NativeSelfCameraPreview
            active={cameraActive}
            muted={!isMicEnabled}
            facing={cameraFacing}
            onPermissionGate={gate => {
              if (!gate.allowed) setIsCameraEnabled(false);
            }}
            onPreviewError={() => setIsCameraEnabled(false)}
            style={StyleSheet.absoluteFillObject}
          />
        </View>
      ) : null}

      {feedback ? (
        <View
          pointerEvents="none"
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          style={{
            position: 'absolute',
            top: isVideo ? height * 0.58 : height * 0.64,
            alignSelf: 'center',
            maxWidth: width - 48,
            paddingHorizontal: 13,
            paddingVertical: 8,
            borderRadius: 16,
            borderCurve: 'continuous',
            backgroundColor: 'rgba(20, 13, 22, 0.88)',
            borderWidth: 0.5,
            borderColor: 'rgba(255, 235, 228, 0.16)',
          }}
        >
          <Text style={{ color: '#F0D4D2', fontSize: 12, lineHeight: 17, textAlign: 'center' }}>
            {feedback}
          </Text>
        </View>
      ) : null}

      {isIncoming ? (
        <View
          style={{
            position: 'absolute',
            top: voiceControlsTop,
            right: 0,
            left: 0,
            flexDirection: 'row',
            justifyContent: 'center',
            gap: isTiny ? 38 : 56,
          }}
        >
          <CallControl label={t.answerCall} accessibilityLabel={t.answerCall} icon={<PhoneCall size={28} strokeWidth={2.1} color={CONTROL_INK} />} accent size={endControlSize} onPress={answerCall} />
          <CallControl label={t.declineCall} accessibilityLabel={t.declineCall} icon={<PhoneOff size={28} strokeWidth={2.1} color="white" />} danger size={endControlSize} onPress={endCall} />
        </View>
      ) : isVideo ? (
        <>
          <View
            style={{
              position: 'absolute',
              top: videoControlsTop,
              right: 0,
              left: 0,
              flexDirection: 'row',
              justifyContent: 'center',
              gap: isTiny ? 6 : 16,
            }}
          >
            {microphoneControl}
            {speakerControl}
            <CallControl
              testID="call-camera-button"
              label={isCameraEnabled ? t.cameraOn : t.cameraOff}
              accessibilityLabel={isCameraEnabled ? t.cameraOn : t.cameraOff}
              active={isCameraEnabled}
              disabled={!isConnected || (IS_WEB && !ENABLE_TEST_CALLS)}
              size={controlSize}
              icon={isCameraEnabled
                ? <Video size={isTiny ? 25 : 28} strokeWidth={1.9} color={CONTROL_INK} />
                : <VideoOff size={isTiny ? 25 : 28} strokeWidth={1.9} color={CONTROL_INK} />}
              onPress={toggleCamera}
            />
          </View>
          <View
            style={{
              position: 'absolute',
              top: videoBottomTop,
              right: 0,
              left: 0,
              flexDirection: 'row',
              alignItems: 'flex-start',
              justifyContent: 'center',
            }}
          >
            <View style={{ width: (isTiny ? 54 : 58) + 24 }} />
            {endControl}
            <CallControl
              testID="call-flip-camera-button"
              label={t.flipCamera}
              accessibilityLabel={t.flipCamera}
              disabled={!isConnected || !isCameraEnabled || (IS_WEB && !ENABLE_TEST_CALLS)}
              size={isTiny ? 54 : 58}
              icon={<SwitchCamera size={isTiny ? 23 : 25} strokeWidth={1.9} color={CONTROL_INK} />}
              onPress={flipCamera}
            />
          </View>
        </>
      ) : (
        <View
          style={{
            position: 'absolute',
            top: voiceControlsTop,
            right: 0,
            left: 0,
            flexDirection: 'row',
            justifyContent: 'center',
            gap: isTiny ? 6 : 16,
          }}
        >
          {microphoneControl}
          {endControl}
          {speakerControl}
        </View>
      )}
    </MotiView>
  );
}
