import { useCallback, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';
import { configureNativeCallPlaybackAudioSession } from './nativeCallAudioRouteRuntime';

export interface NativeVoicePlaybackController {
  canPlay: boolean;
  isPlaying: boolean;
  positionSec: number;
  durationSec: number;
  progress: number;
  errorMessage?: string;
  toggle: () => Promise<boolean>;
}

interface SharedVoicePlaybackSnapshot {
  uri?: string;
  playing: boolean;
  currentTime: number;
  duration: number;
  didJustFinish: boolean;
  errorMessage?: string;
}

const idleSharedVoiceSnapshot: SharedVoicePlaybackSnapshot = {
  playing: false,
  currentTime: 0,
  duration: 0,
  didJustFinish: false,
};
let sharedVoicePlayer: AudioPlayer | null = null;
let sharedVoicePlayerSubscription: { remove: () => void } | null = null;
let sharedVoiceSnapshot = idleSharedVoiceSnapshot;
const sharedVoiceListeners = new Set<{
  audioUri?: string;
  listener: () => void;
}>();

const emitSharedVoiceSnapshot = (next: SharedVoicePlaybackSnapshot) => {
  const previousUri = sharedVoiceSnapshot.uri;
  sharedVoiceSnapshot = next;
  for (const entry of sharedVoiceListeners) {
    if (entry.audioUri === previousUri || entry.audioUri === next.uri) entry.listener();
  }
};

const subscribeSharedVoicePlayback = (audioUri: string | undefined, listener: () => void) => {
  const entry = { audioUri, listener };
  sharedVoiceListeners.add(entry);
  return () => sharedVoiceListeners.delete(entry);
};

const releaseSharedVoicePlayer = () => {
  sharedVoicePlayerSubscription?.remove();
  sharedVoicePlayerSubscription = null;
  if (sharedVoicePlayer) {
    try {
      sharedVoicePlayer.pause();
      sharedVoicePlayer.remove();
    } catch {
      // The native SharedObject may already be released during app teardown.
    }
  }
  sharedVoicePlayer = null;
  emitSharedVoiceSnapshot(idleSharedVoiceSnapshot);
};

const ensureSharedVoicePlayer = (audioUri: string) => {
  if (sharedVoicePlayer && sharedVoiceSnapshot.uri === audioUri) return sharedVoicePlayer;
  releaseSharedVoicePlayer();
  const player = createAudioPlayer(
    { uri: audioUri },
    { updateInterval: 120 },
  );
  sharedVoicePlayer = player;
  emitSharedVoiceSnapshot({
    ...idleSharedVoiceSnapshot,
    uri: audioUri,
  });
  sharedVoicePlayerSubscription = player.addListener('playbackStatusUpdate', status => {
    if (sharedVoicePlayer !== player) return;
    emitSharedVoiceSnapshot({
      uri: audioUri,
      playing: status.playing,
      currentTime: Number.isFinite(status.currentTime) ? Math.max(0, status.currentTime) : 0,
      duration: Number.isFinite(status.duration) ? Math.max(0, status.duration) : 0,
      didJustFinish: status.didJustFinish,
    });
  });
  return player;
};

export function useNativeVoicePlayback(audioUri?: string): NativeVoicePlaybackController {
  const subscribe = useCallback(
    (listener: () => void) => subscribeSharedVoicePlayback(audioUri, listener),
    [audioUri],
  );
  const getSnapshot = useCallback(
    () => sharedVoiceSnapshot.uri === audioUri ? sharedVoiceSnapshot : idleSharedVoiceSnapshot,
    [audioUri],
  );
  const status = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => idleSharedVoiceSnapshot,
  );
  const canPlay = !!audioUri && (Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web');
  const isActiveSource = !!audioUri && status.uri === audioUri;
  const positionSec = isActiveSource && Number.isFinite(status.currentTime)
    ? Math.max(0, status.currentTime)
    : 0;
  const durationSec = isActiveSource && Number.isFinite(status.duration)
    ? Math.max(0, status.duration)
    : 0;
  const progress = durationSec > 0 ? Math.min(1, positionSec / durationSec) : 0;

  const toggle = useCallback(async () => {
    if (!canPlay || !audioUri) return false;

    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
      releaseOneShotPlayer(activeOneShotPlayer, false);
      const player = ensureSharedVoicePlayer(audioUri);
      const latest = sharedVoiceSnapshot;
      if (latest.uri === audioUri && latest.playing) {
        player.pause();
        return true;
      }

      if (
        latest.uri === audioUri
        && (latest.didJustFinish || (latest.duration > 0 && latest.currentTime >= latest.duration - 0.1))
      ) {
        await player.seekTo(0);
      }
      player.play();
      return true;
    } catch (error) {
      emitSharedVoiceSnapshot({
        ...idleSharedVoiceSnapshot,
        uri: audioUri,
        errorMessage: error instanceof Error ? error.message : 'Could not play voice message',
      });
      return false;
    }
  }, [audioUri, canPlay]);

  return {
    canPlay,
    isPlaying: isActiveSource && status.playing,
    positionSec,
    durationSec,
    progress,
    errorMessage: isActiveSource ? status.errorMessage : undefined,
    toggle,
  };
}

let activeOneShotPlayer: AudioPlayer | null = null;
let activeOneShotCompletion: ((finished: boolean) => void) | null = null;
let activeOneShotCleanup: (() => void) | null = null;

const releaseOneShotPlayer = (player: AudioPlayer | null, finished = false) => {
  if (!player) return;
  if (activeOneShotPlayer === player) {
    const cleanup = activeOneShotCleanup;
    activeOneShotCleanup = null;
    cleanup?.();
  }
  try {
    player.pause();
    player.remove();
  } catch {
    // The native shared object may already be released during app teardown.
  }
  if (activeOneShotPlayer === player) {
    activeOneShotPlayer = null;
    const completion = activeOneShotCompletion;
    activeOneShotCompletion = null;
    completion?.(finished);
  }
};

export const playAudioUriOnce = async (
  audioUri?: string,
  options: { waitForCompletion?: boolean } = {},
): Promise<boolean> => {
  if (!audioUri) return false;

  try {
    releaseSharedVoicePlayer();
    const usingCallAudioSession = await configureNativeCallPlaybackAudioSession();
    if (!usingCallAudioSession) {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
    }
    releaseOneShotPlayer(activeOneShotPlayer, false);
    const player = createAudioPlayer(
      { uri: audioUri },
      { keepAudioSessionActive: usingCallAudioSession },
    );
    activeOneShotPlayer = player;
    if (!options.waitForCompletion) {
      const subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (!status.didJustFinish) return;
        releaseOneShotPlayer(player, true);
      });
      activeOneShotCleanup = () => subscription.remove();
      player.play();
      return true;
    }

    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (finished: boolean) => {
        if (settled) return;
        settled = true;
        releaseOneShotPlayer(player, finished);
      };
      activeOneShotCompletion = resolve;
      const subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) settle(true);
      });
      const safetyTimer = setTimeout(() => settle(false), 60000);
      activeOneShotCleanup = () => {
        clearTimeout(safetyTimer);
        subscription.remove();
      };
      player.play();
    });
  } catch {
    releaseOneShotPlayer(activeOneShotPlayer, false);
    return false;
  }
};

export const stopOneShotAudioPlayback = () => {
  releaseOneShotPlayer(activeOneShotPlayer, false);
};

export const stopSharedVoiceMessagePlayback = releaseSharedVoicePlayer;
