import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import {
  createPermissionGate,
  createVoiceCaptureResultFromRecording,
  startVoiceCaptureSession,
  type MediaCaptureResult,
  type MediaPermissionStatus,
  type NativePermissionSnapshot,
  type PermissionGate,
} from './mediaRuntime';
import {
  discardTemporaryMediaFile,
  finalizeLocalMediaFile,
  isPersistedMediaUri,
} from './localMediaRepository';
import {
  configureNativeVoiceCaptureAudioSession,
  restoreAudioSessionAfterNativeVoiceCapture,
} from './nativeCallAudioRouteRuntime';

export interface NativeVoiceCaptureController {
  capture: MediaCaptureResult;
  permissionGate: PermissionGate;
  isNativeAvailable: boolean;
  isRecording: boolean;
  durationMillis: number;
  durationSec: number;
  metering?: number;
  errorMessage?: string;
  requestPermission: () => Promise<PermissionGate>;
  openPermissionSettings: () => Promise<void>;
  start: () => Promise<MediaCaptureResult>;
  finish: () => Promise<MediaCaptureResult>;
  stop: () => Promise<MediaCaptureResult>;
  cancel: () => Promise<MediaCaptureResult>;
  finalize: (capture?: MediaCaptureResult) => MediaCaptureResult;
  discard: (capture?: MediaCaptureResult) => void;
  reset: () => void;
}

const idleCapture: MediaCaptureResult = { phase: 'idle' };
const voiceRecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

const createFailedCapture = (errorMessage: string): MediaCaptureResult => ({
  phase: 'failed',
  errorMessage,
});

export const createMicrophonePermissionFailure = (gate: PermissionGate): MediaCaptureResult => ({
  ...(gate.canAskAgain
    ? createFailedCapture('Microphone permission is required for voice messages')
    : {
        phase: 'permissionBlocked' as const,
        errorMessage: 'Microphone access is blocked. Open system settings to allow voice messages.',
      }),
  mediaKind: 'audio',
});

export async function openNativePermissionSettings(): Promise<void> {
  await Linking.openSettings();
}

/**
 * Recording files remain cache-backed until the caller decides to send them.
 * This function is the single commit point for durable voice-message media.
 */
export function finalizeVoiceCapture(capture: MediaCaptureResult): MediaCaptureResult {
  if (!capture.localUri || (capture.mediaKind && capture.mediaKind !== 'audio')) return capture;
  if (Platform.OS === 'web' || !/^(file:|content:)/.test(capture.localUri)) return capture;
  if (isPersistedMediaUri(capture.localUri, 'audio')) return capture;

  try {
    return {
      ...capture,
      localUri: finalizeLocalMediaFile(capture.localUri, 'audio', 'm4a'),
    };
  } catch (error) {
    return {
      ...capture,
      phase: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Could not save voice recording',
    };
  }
}

export function discardVoiceCapture(capture?: MediaCaptureResult): void {
  discardTemporaryMediaFile(capture?.localUri);
}

export function useNativeVoiceCapture(): NativeVoiceCaptureController {
  const recorder = useAudioRecorder(voiceRecordingOptions);
  const recorderState = useAudioRecorderState(recorder, 250);
  const [capture, setCapture] = useState<MediaCaptureResult>(idleCapture);
  const [microphonePermission, setMicrophonePermission] = useState<MediaPermissionStatus | NativePermissionSnapshot>('undetermined');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const isNativeAvailable = Platform.OS === 'ios' || Platform.OS === 'android';
  const recorderRef = useRef(recorder);
  const recorderStateRef = useRef(recorderState);
  const captureRef = useRef(capture);
  const operationVersionRef = useRef(0);
  const disposedRef = useRef(false);
  const finishPromiseRef = useRef<Promise<MediaCaptureResult> | null>(null);
  const cancelPromiseRef = useRef<Promise<MediaCaptureResult> | null>(null);
  const voiceMeteringSamplesRef = useRef<number[]>([]);
  const lastVoiceMeteringDurationRef = useRef(-1);
  recorderRef.current = recorder;
  recorderStateRef.current = recorderState;
  captureRef.current = capture;

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      // useAudioRecorder owns and releases the native SharedObject during
      // unmount. Invalidate every pending operation before that release and do
      // not touch the recorder from component cleanup callbacks.
      disposedRef.current = true;
      operationVersionRef.current += 1;
      captureRef.current = idleCapture;
      void restoreAudioSessionAfterNativeVoiceCapture().catch(() => undefined);
    };
  }, []);

  const commitCapture = useCallback((nextCapture: MediaCaptureResult) => {
    captureRef.current = nextCapture;
    if (disposedRef.current) return;
    setCapture(nextCapture);
  }, []);

  const recordVoiceMeteringSample = useCallback((metering: number | undefined, durationMillis: number) => {
    if (!Number.isFinite(metering) || durationMillis <= lastVoiceMeteringDurationRef.current) return;
    lastVoiceMeteringDurationRef.current = durationMillis;
    voiceMeteringSamplesRef.current = [
      ...voiceMeteringSamplesRef.current,
      Math.max(-160, Math.min(0, metering!)),
    ].slice(-240);
  }, []);

  useEffect(() => {
    if (!recorderState.isRecording) return;
    recordVoiceMeteringSample(recorderState.metering, Math.max(0, recorderState.durationMillis));
  }, [
    recorderState.durationMillis,
    recorderState.isRecording,
    recorderState.metering,
    recordVoiceMeteringSample,
  ]);

  const permissionGate = useMemo(
    () => createPermissionGate('voiceMessage', { microphone: microphonePermission }),
    [microphonePermission],
  );

  const requestMicrophoneGate = useCallback(async () => {
    if (disposedRef.current) {
      return createPermissionGate('voiceMessage', {
        microphone: { granted: false, canAskAgain: false, status: 'denied' },
      });
    }
    if (!isNativeAvailable) {
      const denied = { granted: false, canAskAgain: false, status: 'denied' };
      const gate = createPermissionGate('voiceMessage', { microphone: denied });
      if (!disposedRef.current) setMicrophonePermission(denied);
      return gate;
    }

    const existingPermission = await getRecordingPermissionsAsync();
    if (disposedRef.current) {
      return createPermissionGate('voiceMessage', { microphone: existingPermission });
    }
    let nextPermission: NativePermissionSnapshot = existingPermission;
    const existingGate = createPermissionGate('voiceMessage', { microphone: existingPermission });

    if (!existingGate.allowed && existingGate.canAskAgain) {
      nextPermission = await requestRecordingPermissionsAsync();
    }

    if (!disposedRef.current) setMicrophonePermission(nextPermission);
    return createPermissionGate('voiceMessage', { microphone: nextPermission });
  }, [isNativeAvailable]);

  const openPermissionSettings = useCallback(openNativePermissionSettings, []);

  const start = useCallback(async () => {
    if (disposedRef.current) return idleCapture;
    if (!isNativeAvailable) {
      const failed = createFailedCapture('Native voice recording requires a device build');
      commitCapture(failed);
      setErrorMessage(failed.errorMessage);
      return failed;
    }

    const startingVersion = operationVersionRef.current;
    const wasCancelled = () => disposedRef.current || operationVersionRef.current !== startingVersion;
    setErrorMessage(undefined);

    try {
      if (recorderState.isRecording || recorder.isRecording || capture.phase === 'capturing') {
        return capture;
      }

      commitCapture({ phase: 'requestingPermission' });
      const gate = await requestMicrophoneGate();
      if (wasCancelled()) return idleCapture;
      if (!gate.allowed) {
        const failed = createMicrophonePermissionFailure(gate);
        commitCapture(failed);
        setErrorMessage(failed.errorMessage);
        return failed;
      }

      await configureNativeVoiceCaptureAudioSession();
      if (wasCancelled()) {
        await restoreAudioSessionAfterNativeVoiceCapture().catch(() => undefined);
        return idleCapture;
      }
      await recorder.prepareToRecordAsync();
      if (wasCancelled()) {
        await restoreAudioSessionAfterNativeVoiceCapture().catch(() => undefined);
        return idleCapture;
      }
      voiceMeteringSamplesRef.current = [];
      lastVoiceMeteringDurationRef.current = -1;
      recorder.record();

      if (wasCancelled()) {
        if (!disposedRef.current) {
          try {
            await recorder.stop();
            if (!disposedRef.current) {
              const status = recorder.getStatus();
              discardTemporaryMediaFile(recorder.uri || status.url);
            }
          } catch {
            // The OS or hook lifecycle may already have released the recorder.
          }
        }
        await restoreAudioSessionAfterNativeVoiceCapture().catch(() => undefined);
        return idleCapture;
      }

      const started = startVoiceCaptureSession();
      commitCapture(started);
      return started;
    } catch (error) {
      await restoreAudioSessionAfterNativeVoiceCapture().catch(() => undefined);
      if (wasCancelled()) return idleCapture;
      const failed = createFailedCapture(error instanceof Error ? error.message : 'Could not start voice recording');
      commitCapture(failed);
      setErrorMessage(failed.errorMessage);
      return failed;
    }
  }, [capture, commitCapture, isNativeAvailable, recorder, recorderState.isRecording, requestMicrophoneGate]);

  const finish = useCallback(() => {
    if (disposedRef.current) return Promise.resolve(idleCapture);
    if (cancelPromiseRef.current) return cancelPromiseRef.current;
    if (finishPromiseRef.current) return finishPromiseRef.current;

    const finishingVersion = operationVersionRef.current;
    const task = (async () => {
      if (disposedRef.current) return idleCapture;
      const currentCapture = captureRef.current;
      if (!isNativeAvailable) {
        return currentCapture.phase === 'failed'
          ? currentCapture
          : createFailedCapture('Native voice recording requires a device build');
      }

      if (disposedRef.current) return idleCapture;
      const activeRecorder = recorderRef.current;
      const activeRecorderState = recorderStateRef.current;
      if (!activeRecorderState.isRecording && !activeRecorder.isRecording) {
        if (currentCapture.phase === 'capturing' || currentCapture.phase === 'requestingPermission') {
          const temporaryUris = new Set<string>();
          if (currentCapture.localUri) temporaryUris.add(currentCapture.localUri);
          try {
            const status = activeRecorder.getStatus();
            const recorderUri = activeRecorder.uri || status.url;
            if (recorderUri) temporaryUris.add(recorderUri);
          } catch {
            if (activeRecorder.uri) temporaryUris.add(activeRecorder.uri);
          }
          for (const uri of temporaryUris) discardTemporaryMediaFile(uri);
          if (operationVersionRef.current !== finishingVersion) return idleCapture;
          const interrupted = createFailedCapture('Voice recording was interrupted');
          commitCapture(interrupted);
          setErrorMessage(interrupted.errorMessage);
          await restoreAudioSessionAfterNativeVoiceCapture().catch(() => undefined);
          return interrupted;
        }
        return currentCapture;
      }

      try {
        recordVoiceMeteringSample(
          activeRecorderState.metering,
          Math.max(0, activeRecorderState.durationMillis),
        );
        await activeRecorder.stop();
        if (disposedRef.current || operationVersionRef.current !== finishingVersion) return idleCapture;
        const status = activeRecorder.getStatus();
        const stopped = createVoiceCaptureResultFromRecording({
          uri: activeRecorder.uri || status.url,
          durationMillis: status.durationMillis || activeRecorderState.durationMillis || Math.round(activeRecorder.currentTime * 1000),
          meteringSamplesDb: [...voiceMeteringSamplesRef.current],
        });
        if (operationVersionRef.current !== finishingVersion) {
          discardVoiceCapture(stopped);
          return idleCapture;
        }
        commitCapture(stopped);
        setErrorMessage(stopped.errorMessage);
        return stopped;
      } catch (error) {
        if (operationVersionRef.current !== finishingVersion) return idleCapture;
        const failed = createFailedCapture(error instanceof Error ? error.message : 'Could not stop voice recording');
        commitCapture(failed);
        setErrorMessage(failed.errorMessage);
        return failed;
      } finally {
        await restoreAudioSessionAfterNativeVoiceCapture().catch(() => undefined);
      }
    })();

    finishPromiseRef.current = task;
    void task.finally(() => {
      if (finishPromiseRef.current === task) finishPromiseRef.current = null;
    });
    return task;
  }, [commitCapture, isNativeAvailable, recordVoiceMeteringSample]);

  const cancel = useCallback(() => {
    if (disposedRef.current) return Promise.resolve(idleCapture);
    if (cancelPromiseRef.current) return cancelPromiseRef.current;
    operationVersionRef.current += 1;

    const task = (async () => {
      if (disposedRef.current) return idleCapture;
      const activeRecorder = recorderRef.current;
      const activeRecorderState = recorderStateRef.current;
      const currentCapture = captureRef.current;
      const temporaryUris = new Set<string>();
      if (currentCapture.localUri) temporaryUris.add(currentCapture.localUri);

      if (isNativeAvailable) {
        try {
          if (!disposedRef.current && (activeRecorderState.isRecording || activeRecorder.isRecording)) {
            await activeRecorder.stop();
          }
        } catch {
          // OS interruption can stop the recorder before Nana receives cleanup.
        }

        try {
          if (disposedRef.current) return idleCapture;
          const status = activeRecorder.getStatus();
          const recorderUri = activeRecorder.uri || status.url;
          if (recorderUri) temporaryUris.add(recorderUri);
        } catch {
          // A released SharedObject has no safe readable properties.
        }
      }

      for (const uri of temporaryUris) discardTemporaryMediaFile(uri);
      voiceMeteringSamplesRef.current = [];
      lastVoiceMeteringDurationRef.current = -1;
      if (!disposedRef.current) {
        commitCapture(idleCapture);
        setErrorMessage(undefined);
      }
      if (isNativeAvailable) {
        await restoreAudioSessionAfterNativeVoiceCapture().catch(() => undefined);
      }
      return idleCapture;
    })();

    cancelPromiseRef.current = task;
    void task.finally(() => {
      if (cancelPromiseRef.current === task) cancelPromiseRef.current = null;
    });
    return task;
  }, [commitCapture, isNativeAvailable]);

  const finalize = useCallback((candidate: MediaCaptureResult = capture) => {
    const finalized = finalizeVoiceCapture(candidate);
    if (disposedRef.current) return finalized;
    commitCapture(finalized);
    setErrorMessage(finalized.errorMessage);
    return finalized;
  }, [capture, commitCapture]);

  const discard = useCallback((candidate: MediaCaptureResult = capture) => {
    discardVoiceCapture(candidate);
  }, [capture]);

  const reset = useCallback(() => {
    if (disposedRef.current) return;
    voiceMeteringSamplesRef.current = [];
    lastVoiceMeteringDurationRef.current = -1;
    commitCapture(idleCapture);
    setErrorMessage(undefined);
  }, [commitCapture]);

  return {
    capture,
    permissionGate,
    isNativeAvailable,
    isRecording: recorderState.isRecording || recorder.isRecording || capture.phase === 'capturing',
    durationMillis: Math.max(0, recorderState.durationMillis),
    durationSec: Math.max(0, Math.ceil(recorderState.durationMillis / 1000)),
    metering: recorderState.metering,
    errorMessage,
    requestPermission: requestMicrophoneGate,
    openPermissionSettings,
    start,
    finish,
    stop: finish,
    cancel,
    finalize,
    discard,
    reset,
  };
}
