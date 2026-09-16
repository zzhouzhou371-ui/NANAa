export const MIN_VOICE_GESTURE_DURATION_MS = 1_000;
export const MAX_VOICE_GESTURE_DURATION_MS = 60_000;
export const VOICE_GESTURE_TRACK_MAX_WIDTH = 402;
export const VOICE_GESTURE_TRACK_OUTER_GUTTER = 14;
export const VOICE_GESTURE_TRACK_INSET = 8;
export const VOICE_GESTURE_SEGMENT_HYSTERESIS = 10;

export type VoiceGesturePhase =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'cancelArmed'
  | 'transcribeArmed'
  | 'tooShort'
  | 'permissionBlocked'
  | 'failed'
  | 'finishing'
  | 'finished'
  | 'interrupted';

export type VoiceGestureOutcome =
  | 'send'
  | 'too-short'
  | 'drag-cancel'
  | 'transcribe'
  | 'max-duration'
  | 'interrupted';

export type VoiceGestureEffect =
  | 'none'
  | 'start-capture'
  | 'finish-capture'
  | 'discard-capture';

export interface VoiceGestureState {
  phase: VoiceGesturePhase;
  startedAt: number | null;
  elapsedMs: number;
  trackPosition: number;
  cancelArmed: boolean;
  transcribeArmed: boolean;
  captureStarted: boolean;
  finishRequested: boolean;
  outcome?: VoiceGestureOutcome;
}

export type VoiceGestureEvent =
  | { type: 'PRESS_IN'; now: number }
  | { type: 'CAPTURE_STARTED'; now: number }
  | { type: 'CAPTURE_PERMISSION_BLOCKED' }
  | { type: 'CAPTURE_FAILED' }
  | { type: 'MOVE'; pageX: number; viewportWidth: number; now: number }
  | { type: 'PRESS_OUT'; now: number }
  | { type: 'TICK'; now: number }
  | { type: 'CAPTURE_FINISHED' }
  | { type: 'CAPTURE_DISCARDED' }
  | { type: 'INTERRUPT'; now: number }
  | { type: 'RESET' };

export interface VoiceGestureTransition {
  state: VoiceGestureState;
  effect: VoiceGestureEffect;
}

export interface VoiceReleaseResolution {
  shouldSend: boolean;
  shouldDiscard: boolean;
  elapsedMs: number;
  outcome: Extract<VoiceGestureOutcome, 'send' | 'too-short' | 'drag-cancel'>;
}

export const createVoiceGestureState = (): VoiceGestureState => ({
  phase: 'idle',
  startedAt: null,
  elapsedMs: 0,
  trackPosition: 1,
  cancelArmed: false,
  transcribeArmed: false,
  captureStarted: false,
  finishRequested: false,
});

const withoutEffect = (state: VoiceGestureState): VoiceGestureTransition => ({
  state,
  effect: 'none',
});

const elapsedSince = (state: VoiceGestureState, now: number) => (
  state.startedAt === null ? 0 : Math.max(0, now - state.startedAt)
);

const isActive = (phase: VoiceGesturePhase) => (
  phase === 'starting' || phase === 'recording' || phase === 'cancelArmed' || phase === 'transcribeArmed'
);

export type VoiceGestureTarget = 'send' | 'cancel' | 'transcribe';

export const getVoiceGestureTrackMetrics = (viewportWidth: number) => {
  const safeViewportWidth = Math.max(1, viewportWidth);
  const controlWidth = Math.min(
    Math.max(1, safeViewportWidth - VOICE_GESTURE_TRACK_OUTER_GUTTER * 2),
    VOICE_GESTURE_TRACK_MAX_WIDTH,
  );
  const trackWidth = Math.max(1, controlWidth - VOICE_GESTURE_TRACK_INSET * 2);
  const trackLeft = (safeViewportWidth - controlWidth) / 2 + VOICE_GESTURE_TRACK_INSET;
  const segmentWidth = trackWidth / 3;
  return {
    trackLeft,
    trackWidth,
    segmentWidth,
    cancelBoundary: trackLeft + segmentWidth,
    transcribeBoundary: trackLeft + segmentWidth * 2,
  };
};

export const projectVoiceGesturePageX = ({
  startPageX,
  currentPageX,
  viewportWidth,
}: {
  startPageX: number;
  currentPageX: number;
  viewportWidth: number;
}) => viewportWidth / 2 + (currentPageX - startPageX);

export const resolveVoiceGestureTrackPosition = (pageX: number, viewportWidth: number) => {
  const { trackLeft, segmentWidth } = getVoiceGestureTrackMetrics(viewportWidth);
  const firstCenter = trackLeft + segmentWidth / 2;
  return Math.max(0, Math.min(2, (pageX - firstCenter) / segmentWidth));
};

export const resolveVoiceGestureTarget = ({
  currentTarget,
  pageX,
  viewportWidth,
}: {
  currentTarget: VoiceGestureTarget;
  pageX: number;
  viewportWidth: number;
}): VoiceGestureTarget => {
  const { cancelBoundary, transcribeBoundary } = getVoiceGestureTrackMetrics(viewportWidth);

  if (currentTarget === 'cancel') {
    if (pageX >= transcribeBoundary) return 'transcribe';
    if (pageX >= cancelBoundary + VOICE_GESTURE_SEGMENT_HYSTERESIS) return 'send';
    return 'cancel';
  }

  if (currentTarget === 'transcribe') {
    if (pageX <= cancelBoundary) return 'cancel';
    if (pageX <= transcribeBoundary - VOICE_GESTURE_SEGMENT_HYSTERESIS) return 'send';
    return 'transcribe';
  }

  if (pageX <= cancelBoundary) return 'cancel';
  if (pageX >= transcribeBoundary) return 'transcribe';
  return 'send';
};

export const resolveVoiceGestureRelease = (
  startedAt: number,
  releasedAt: number,
): VoiceReleaseResolution => {
  const elapsedMs = Math.max(0, releasedAt - startedAt);
  if (elapsedMs < MIN_VOICE_GESTURE_DURATION_MS) {
    return {
      shouldSend: false,
      shouldDiscard: true,
      elapsedMs,
      outcome: 'too-short',
    };
  }
  return {
    shouldSend: true,
    shouldDiscard: false,
    elapsedMs: Math.min(elapsedMs, MAX_VOICE_GESTURE_DURATION_MS),
    outcome: 'send',
  };
};

export function reduceVoiceGesture(
  state: VoiceGestureState,
  event: VoiceGestureEvent,
): VoiceGestureTransition {
  if (event.type === 'RESET') return withoutEffect(createVoiceGestureState());

  if (event.type === 'PRESS_IN') {
    if (isActive(state.phase) || state.phase === 'finishing') {
      return withoutEffect(state);
    }
    return {
      state: {
        phase: 'starting',
        startedAt: event.now,
        elapsedMs: 0,
        trackPosition: 1,
        cancelArmed: false,
        transcribeArmed: false,
        captureStarted: false,
        finishRequested: false,
      },
      effect: 'start-capture',
    };
  }

  if (event.type === 'CAPTURE_STARTED') {
    if (state.phase !== 'starting' && state.phase !== 'cancelArmed' && state.phase !== 'transcribeArmed') return withoutEffect(state);
    return withoutEffect({
      ...state,
      phase: state.cancelArmed ? 'cancelArmed' : state.transcribeArmed ? 'transcribeArmed' : 'recording',
      captureStarted: true,
      startedAt: state.startedAt ?? event.now,
      elapsedMs: elapsedSince(state, event.now),
    });
  }

  if (event.type === 'CAPTURE_PERMISSION_BLOCKED') {
    if (state.phase !== 'starting' && state.phase !== 'cancelArmed' && state.phase !== 'transcribeArmed') return withoutEffect(state);
    return {
      state: { ...state, phase: 'permissionBlocked', finishRequested: true },
      effect: 'discard-capture',
    };
  }

  if (event.type === 'CAPTURE_FAILED') {
    if (state.phase !== 'starting' && state.phase !== 'cancelArmed' && state.phase !== 'transcribeArmed') return withoutEffect(state);
    return {
      state: { ...state, phase: 'failed', finishRequested: true },
      effect: 'discard-capture',
    };
  }

  if (event.type === 'MOVE') {
    if (!isActive(state.phase)) return withoutEffect(state);
    const currentTarget: VoiceGestureTarget = state.transcribeArmed
      ? 'transcribe'
      : state.cancelArmed
        ? 'cancel'
        : 'send';
    const target = resolveVoiceGestureTarget({
      currentTarget,
      pageX: event.pageX,
      viewportWidth: event.viewportWidth,
    });
    const cancelArmed = target === 'cancel';
    const transcribeArmed = target === 'transcribe';
    return withoutEffect({
      ...state,
      phase: cancelArmed
        ? 'cancelArmed'
        : transcribeArmed
          ? 'transcribeArmed'
          : (state.captureStarted ? 'recording' : 'starting'),
      elapsedMs: Math.min(elapsedSince(state, event.now), MAX_VOICE_GESTURE_DURATION_MS),
      trackPosition: resolveVoiceGestureTrackPosition(event.pageX, event.viewportWidth),
      cancelArmed,
      transcribeArmed,
    });
  }

  if (event.type === 'PRESS_OUT') {
    if (!isActive(state.phase) || state.finishRequested || state.startedAt === null) {
      return withoutEffect(state);
    }
    if (state.transcribeArmed) {
      return {
        state: {
          ...state,
          phase: 'finishing',
          elapsedMs: elapsedSince(state, event.now),
          finishRequested: true,
          outcome: 'transcribe',
        },
        effect: 'finish-capture',
      };
    }
    const resolution = state.cancelArmed
      ? {
          shouldSend: false,
          shouldDiscard: true,
          elapsedMs: elapsedSince(state, event.now),
          outcome: 'drag-cancel' as const,
        }
      : resolveVoiceGestureRelease(state.startedAt, event.now);
    if (resolution.shouldDiscard) {
      return {
        state: {
          ...state,
          phase: resolution.outcome === 'too-short' ? 'tooShort' : 'cancelArmed',
          elapsedMs: resolution.elapsedMs,
          finishRequested: true,
          outcome: resolution.outcome,
        },
        effect: 'discard-capture',
      };
    }
    return {
      state: {
        ...state,
        phase: 'finishing',
        elapsedMs: resolution.elapsedMs,
        finishRequested: true,
        outcome: 'send',
      },
      effect: 'finish-capture',
    };
  }

  if (event.type === 'TICK') {
    if (!isActive(state.phase) || state.finishRequested) return withoutEffect(state);
    const elapsedMs = elapsedSince(state, event.now);
    if (elapsedMs < MAX_VOICE_GESTURE_DURATION_MS) {
      return withoutEffect({ ...state, elapsedMs });
    }
    if (state.cancelArmed) {
      return {
        state: {
          ...state,
          phase: 'cancelArmed',
          elapsedMs: MAX_VOICE_GESTURE_DURATION_MS,
          finishRequested: true,
          outcome: 'drag-cancel',
        },
        effect: 'discard-capture',
      };
    }
    if (state.transcribeArmed) {
      return {
        state: {
          ...state,
          phase: 'finishing',
          elapsedMs: MAX_VOICE_GESTURE_DURATION_MS,
          finishRequested: true,
          outcome: 'transcribe',
        },
        effect: 'finish-capture',
      };
    }
    return {
      state: {
        ...state,
        phase: 'finishing',
        elapsedMs: MAX_VOICE_GESTURE_DURATION_MS,
        finishRequested: true,
        outcome: 'max-duration',
      },
      effect: 'finish-capture',
    };
  }

  if (event.type === 'INTERRUPT') {
    if (!isActive(state.phase) && state.phase !== 'finishing') return withoutEffect(state);
    return {
      state: {
        ...state,
        phase: 'interrupted',
        elapsedMs: Math.min(elapsedSince(state, event.now), MAX_VOICE_GESTURE_DURATION_MS),
        finishRequested: true,
        outcome: 'interrupted',
      },
      effect: 'discard-capture',
    };
  }

  if (event.type === 'CAPTURE_FINISHED') {
    if (state.phase !== 'finishing') return withoutEffect(state);
    return withoutEffect({ ...state, phase: 'finished' });
  }

  if (event.type === 'CAPTURE_DISCARDED') {
    return withoutEffect(state);
  }

  return withoutEffect(state);
}
