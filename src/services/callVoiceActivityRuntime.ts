export const CALL_VOICE_ACTIVITY_SPEECH_DB = -42;
export const CALL_VOICE_ACTIVITY_SILENCE_DB = -50;
export const CALL_VOICE_ACTIVITY_SILENCE_MS = 1000;
export const CALL_VOICE_ACTIVITY_MAX_SEGMENT_MS = 20000;
export const CALL_VOICE_ACTIVITY_MIN_VOICED_MS = 160;
export const CALL_VOICE_ACTIVITY_MIN_VOICED_SAMPLES = 2;
export const CALL_VOICE_ACTIVITY_MIN_SILENCE_SAMPLES = 2;

export type CallVoiceActivityPhase = 'waiting' | 'potentialSpeech' | 'speech' | 'trailingSilence';
export type CallVoiceActivityEffect = 'none' | 'commit-capture' | 'restart-capture';

export interface CallVoiceActivityState {
  phase: CallVoiceActivityPhase;
  captureStartedAt: number;
  speechStartedAt?: number;
  silenceStartedAt?: number;
  voicedStartedAt?: number;
  voicedSampleCount?: number;
  silenceSampleCount?: number;
  lastSampleId?: number;
}

export interface CallVoiceActivityTransition {
  state: CallVoiceActivityState;
  effect: CallVoiceActivityEffect;
}

export const createCallVoiceActivityState = (now = Date.now()): CallVoiceActivityState => ({
  phase: 'waiting',
  captureStartedAt: now,
});

/**
 * A small, deterministic voice-activity detector around Expo Audio metering.
 * The gap between the speech and silence thresholds provides hysteresis so a
 * room hovering around one dB value cannot repeatedly open and close a turn.
 */
export const reduceCallVoiceActivity = (
  state: CallVoiceActivityState,
  event: { now: number; meteringDb?: number; sampleId?: number },
): CallVoiceActivityTransition => {
  const elapsed = Math.max(0, event.now - state.captureStartedAt);
  const hasMetering = Number.isFinite(event.meteringDb);
  const meteringDb = hasMetering ? event.meteringDb! : Number.NEGATIVE_INFINITY;
  const hasFreshSample = event.sampleId === undefined || event.sampleId !== state.lastSampleId;
  const sampledState = hasFreshSample && event.sampleId !== undefined
    ? { ...state, lastSampleId: event.sampleId }
    : state;

  if (elapsed >= CALL_VOICE_ACTIVITY_MAX_SEGMENT_MS) {
    return {
      state: sampledState,
      effect: state.phase === 'speech' || state.phase === 'trailingSilence'
        ? 'commit-capture'
        : 'restart-capture',
    };
  }

  if (state.phase === 'waiting') {
    if (hasFreshSample && hasMetering && meteringDb >= CALL_VOICE_ACTIVITY_SPEECH_DB) {
      return {
        state: {
          phase: 'potentialSpeech',
          captureStartedAt: state.captureStartedAt,
          voicedStartedAt: event.now,
          voicedSampleCount: 1,
          lastSampleId: event.sampleId,
        },
        effect: 'none',
      };
    }
    return { state: sampledState, effect: 'none' };
  }

  if (state.phase === 'potentialSpeech') {
    if (!hasFreshSample) return { state, effect: 'none' };
    if (!hasMetering || meteringDb < CALL_VOICE_ACTIVITY_SPEECH_DB) {
      return {
        state: {
          phase: 'waiting',
          captureStartedAt: state.captureStartedAt,
          lastSampleId: event.sampleId,
        },
        effect: 'none',
      };
    }

    const voicedSampleCount = (state.voicedSampleCount ?? 1) + 1;
    const voicedElapsed = Math.max(0, event.now - (state.voicedStartedAt ?? event.now));
    if (voicedSampleCount >= CALL_VOICE_ACTIVITY_MIN_VOICED_SAMPLES
      && voicedElapsed >= CALL_VOICE_ACTIVITY_MIN_VOICED_MS) {
      return {
        state: {
          phase: 'speech',
          captureStartedAt: state.captureStartedAt,
          speechStartedAt: state.voicedStartedAt ?? event.now,
          lastSampleId: event.sampleId,
        },
        effect: 'none',
      };
    }
    return {
      state: {
        ...state,
        voicedSampleCount,
        lastSampleId: event.sampleId,
      },
      effect: 'none',
    };
  }

  if (state.phase === 'speech') {
    if (hasFreshSample && hasMetering && meteringDb <= CALL_VOICE_ACTIVITY_SILENCE_DB) {
      return {
        state: {
          ...state,
          phase: 'trailingSilence',
          silenceStartedAt: event.now,
          silenceSampleCount: 1,
          lastSampleId: event.sampleId,
        },
        effect: 'none',
      };
    }
    return { state: sampledState, effect: 'none' };
  }

  if (hasFreshSample && hasMetering && meteringDb >= CALL_VOICE_ACTIVITY_SPEECH_DB) {
    return {
      state: {
        phase: 'speech',
        captureStartedAt: state.captureStartedAt,
        speechStartedAt: state.speechStartedAt,
        lastSampleId: event.sampleId,
      },
      effect: 'none',
    };
  }

  const silenceSampleCount = hasFreshSample && hasMetering && meteringDb <= CALL_VOICE_ACTIVITY_SILENCE_DB
    ? (state.silenceSampleCount ?? 1) + 1
    : (state.silenceSampleCount ?? 1);
  const trailingState = {
    ...sampledState,
    silenceSampleCount,
  };

  const silenceElapsed = Math.max(0, event.now - (state.silenceStartedAt ?? event.now));
  if (silenceElapsed >= CALL_VOICE_ACTIVITY_SILENCE_MS
    && silenceSampleCount >= CALL_VOICE_ACTIVITY_MIN_SILENCE_SAMPLES) {
    return { state: trailingState, effect: 'commit-capture' };
  }

  return { state: trailingState, effect: 'none' };
};
