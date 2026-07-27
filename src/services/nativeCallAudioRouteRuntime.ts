import { Platform } from 'react-native';
import { setAudioModeAsync } from 'expo-audio';

export type NativeCallAudioRoute = 'speaker' | 'earpiece';

export interface NativeCallAudioRouteResult {
  available: boolean;
  ok: boolean;
  route: NativeCallAudioRoute;
  errorMessage?: string;
}

const isNativePlatform = () => Platform.OS === 'ios' || Platform.OS === 'android';

let activeCallRoute: NativeCallAudioRoute | null = null;
let audioModeQueue: Promise<unknown> = Promise.resolve();

const enqueueAudioModeChange = <T,>(operation: () => Promise<T>): Promise<T> => {
  const next = audioModeQueue.then(operation, operation);
  audioModeQueue = next.then(() => undefined, () => undefined);
  return next;
};

const applyAudioMode = async (allowsRecording: boolean, route: NativeCallAudioRoute) => {
  await setAudioModeAsync({
    allowsRecording,
    playsInSilentMode: true,
    interruptionMode: 'doNotMix',
    shouldRouteThroughEarpiece: route === 'earpiece',
  });
};

const unavailableResult = (route: NativeCallAudioRoute): NativeCallAudioRouteResult => ({
  available: false,
  ok: false,
  route,
  errorMessage: 'Audio routing is only available in the mobile app',
});

export const isNativeCallAudioRouteAvailable = (): boolean => isNativePlatform();

export const getActiveNativeCallAudioRoute = (): NativeCallAudioRoute | null => activeCallRoute;

export const beginNativeCallAudioSession = async (
  initialRoute: NativeCallAudioRoute = 'speaker',
): Promise<NativeCallAudioRouteResult> => {
  if (!isNativePlatform()) return unavailableResult(initialRoute);

  return enqueueAudioModeChange(async () => {
    const previousRoute = activeCallRoute;
    try {
      await applyAudioMode(true, initialRoute);
      activeCallRoute = initialRoute;
      return { available: true, ok: true, route: initialRoute };
    } catch (error) {
      activeCallRoute = previousRoute;
      return {
        available: true,
        ok: false,
        route: previousRoute ?? initialRoute,
        errorMessage: error instanceof Error ? error.message : 'Could not start the call audio session',
      };
    }
  });
};

export const setNativeCallAudioRoute = async (
  route: NativeCallAudioRoute,
): Promise<NativeCallAudioRouteResult> => {
  if (!isNativePlatform()) return unavailableResult(activeCallRoute ?? route);

  return enqueueAudioModeChange(async () => {
    const previousRoute = activeCallRoute ?? 'speaker';
    if (!activeCallRoute) {
      return {
        available: true,
        ok: false,
        route: previousRoute,
        errorMessage: 'The call audio session is not active',
      };
    }

    try {
      await applyAudioMode(true, route);
      activeCallRoute = route;
      return { available: true, ok: true, route };
    } catch (error) {
      activeCallRoute = previousRoute;
      return {
        available: true,
        ok: false,
        route: previousRoute,
        errorMessage: error instanceof Error ? error.message : 'Could not change the call audio route',
      };
    }
  });
};

export const endNativeCallAudioSession = async (): Promise<NativeCallAudioRouteResult> => {
  const previousRoute = activeCallRoute ?? 'speaker';
  activeCallRoute = null;
  if (!isNativePlatform()) return unavailableResult(previousRoute);

  return enqueueAudioModeChange(async () => {
    activeCallRoute = null;
    try {
      await applyAudioMode(false, 'speaker');
      return { available: true, ok: true, route: 'speaker' };
    } catch (error) {
      return {
        available: true,
        ok: false,
        route: previousRoute,
        errorMessage: error instanceof Error ? error.message : 'Could not restore the audio session',
      };
    }
  });
};

/**
 * Voice messages normally release the recording session after capture. Calls keep
 * the play-and-record session alive so iOS can continue honoring the earpiece route.
 */
export const configureNativeVoiceCaptureAudioSession = async (): Promise<void> => {
  if (!isNativePlatform()) return;
  await enqueueAudioModeChange(async () => {
    await applyAudioMode(true, activeCallRoute ?? 'speaker');
  });
};

export const restoreAudioSessionAfterNativeVoiceCapture = async (): Promise<void> => {
  if (!isNativePlatform()) return;
  await enqueueAudioModeChange(async () => {
    const route = activeCallRoute;
    await applyAudioMode(route !== null, route ?? 'speaker');
  });
};

/**
 * Character audio is still part of the active call. Keep the play-and-record
 * session and selected route alive instead of switching to a generic media
 * playback session, which would silently force an earpiece call to speaker.
 */
export const configureNativeCallPlaybackAudioSession = async (): Promise<boolean> => {
  if (!isNativePlatform() || activeCallRoute === null) return false;
  return enqueueAudioModeChange(async () => {
    const route = activeCallRoute;
    if (route === null) return false;
    await applyAudioMode(true, route);
    return true;
  });
};
