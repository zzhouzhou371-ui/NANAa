export function canCommitVoiceCapture({
  mounted,
  interrupted,
  currentToken,
  finishingToken,
}: {
  mounted: boolean;
  interrupted: boolean;
  currentToken: number;
  finishingToken: number;
}) {
  return mounted && !interrupted && currentToken === finishingToken;
}

export function canCommitCallCapture({
  mounted,
  connected,
  muted,
  currentSession,
  finishingSession,
}: {
  mounted: boolean;
  connected: boolean;
  muted: boolean;
  currentSession: number;
  finishingSession: number;
}) {
  return mounted && connected && !muted && currentSession === finishingSession;
}

export function isMeasuredVoiceDurationSendable({
  durationMillis,
  durationSec,
  minimumMillis = 1000,
}: {
  durationMillis?: number;
  durationSec?: number;
  minimumMillis?: number;
}) {
  const measuredMillis = durationMillis ?? Math.round(Math.max(0, durationSec || 0) * 1000);
  return measuredMillis >= minimumMillis;
}
