import { useMemo } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import {
  VideoView,
  useVideoPlayer,
  type VideoSource,
} from 'expo-video';
import {
  createVideoPersonaSession,
  type VideoPersonaSession,
} from './mediaRuntime';
import type { Character } from '../types';

export const createNativeVideoPersonaSource = (
  session: VideoPersonaSession,
): VideoSource => {
  if (session.phase !== 'ready' || !session.sourceUri) return null;
  return { uri: session.sourceUri };
};

export function useNativeVideoPersona(character?: Character) {
  const session = useMemo(() => createVideoPersonaSession(character), [character]);
  const source = useMemo(() => createNativeVideoPersonaSource(session), [session]);
  const player = useVideoPlayer(source, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = false;
    videoPlayer.audioMixingMode = 'mixWithOthers';
    videoPlayer.staysActiveInBackground = false;
    videoPlayer.showNowPlayingNotification = false;
  });

  return {
    session,
    source,
    player,
  };
}

export function NativeVideoPersonaView({
  sourceUri,
  style,
}: {
  sourceUri?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const session = useMemo<VideoPersonaSession>(() => ({
    phase: sourceUri ? 'ready' : 'failed',
    provider: 'expo-video',
    characterName: 'AI',
    sourceUri,
    errorMessage: sourceUri ? undefined : 'No video persona source',
  }), [sourceUri]);
  const source = useMemo(() => createNativeVideoPersonaSource(session), [session]);
  const player = useVideoPlayer(source, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = false;
    videoPlayer.audioMixingMode = 'mixWithOthers';
    videoPlayer.staysActiveInBackground = false;
    videoPlayer.showNowPlayingNotification = false;
    if (source) videoPlayer.play();
  });

  if (!sourceUri) return null;

  return (
    <VideoView
      player={player}
      nativeControls={false}
      contentFit="cover"
      playsInline
      style={style}
    />
  );
}
