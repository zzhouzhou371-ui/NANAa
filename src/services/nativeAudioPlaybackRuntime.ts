import { useCallback, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import {
  createAudioPlayer,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
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

export function useNativeVoicePlayback(audioUri?: string): NativeVoicePlaybackController {
  const source = useMemo(() => (audioUri ? { uri: audioUri } : null), [audioUri]);
  const player = useAudioPlayer(source, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const canPlay = !!audioUri && (Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web');
  const positionSec = Number.isFinite(status.currentTime) ? Math.max(0, status.currentTime) : 0;
  const durationSec = Number.isFinite(status.duration) ? Math.max(0, status.duration) : 0;
  const progress = durationSec > 0 ? Math.min(1, positionSec / durationSec) : 0;

  const toggle = useCallback(async () => {
    if (!canPlay) return false;

    try {
      setErrorMessage(undefined);
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      if (status.playing) {
        player.pause();
        return true;
      }

      if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.1)) {
        await player.seekTo(0);
      }
      player.play();
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not play voice message');
      return false;
    }
  }, [canPlay, player, status.currentTime, status.didJustFinish, status.duration, status.playing]);

  return {
    canPlay,
    isPlaying: status.playing,
    positionSec,
    durationSec,
    progress,
    errorMessage,
    toggle,
  };
}

let activeOneShotPlayer: AudioPlayer | null = null;
let activeOneShotCompletion: ((finished: boolean) => void) | null = null;

const releaseOneShotPlayer = (player: AudioPlayer | null, finished = false) => {
  if (!player) return;
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
        subscription.remove();
        releaseOneShotPlayer(player, true);
      });
      player.play();
      return true;
    }

    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (finished: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(safetyTimer);
        subscription.remove();
        releaseOneShotPlayer(player, finished);
      };
      activeOneShotCompletion = resolve;
      const subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) settle(true);
      });
      const safetyTimer = setTimeout(() => settle(false), 60000);
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
