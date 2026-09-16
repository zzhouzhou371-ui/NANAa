import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const loadTypeScriptModule = (sourcePath) => {
  const source = readFileSync(sourcePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: sourcePath,
  });
  const loadedModule = { exports: {} };
  const context = vm.createContext({ exports: loadedModule.exports, module: loadedModule, require, console, Date, Math });
  vm.runInContext(compiled.outputText, context, { filename: sourcePath });
  return loadedModule.exports;
};

const runtime = loadTypeScriptModule(resolve(root, 'src/services/voiceGestureRuntime.ts'));
const captureGuard = loadTypeScriptModule(resolve(root, 'src/components/voiceCaptureGuard.ts'));
const chatInputSource = readFileSync(resolve(root, 'src/components/ChatInputBar.tsx'), 'utf8');
const voiceOverlaySource = readFileSync(resolve(root, 'src/components/voice-gesture-overlay.tsx'), 'utf8');
const dynamicIslandSource = readFileSync(resolve(root, 'src/components/system/DynamicIsland.tsx'), 'utf8');
const rootLayoutSource = readFileSync(resolve(root, 'src/app/_layout.tsx'), 'utf8');
const callOverlaySource = readFileSync(resolve(root, 'src/components/CallOverlay.tsx'), 'utf8');
const nativeAudioSource = readFileSync(resolve(root, 'src/services/nativeAudioRuntime.ts'), 'utf8');
const errors = [];
const expect = (condition, message) => { if (!condition) errors.push(message); };
const viewportWidth = 390;
const trackMetrics = runtime.getVoiceGestureTrackMetrics(viewportWidth);
const targetPageX = {
  cancel: trackMetrics.trackLeft + trackMetrics.segmentWidth * 0.5,
  send: trackMetrics.trackLeft + trackMetrics.segmentWidth * 1.5,
  transcribe: trackMetrics.trackLeft + trackMetrics.segmentWidth * 2.5,
};
const press = (releasedAt, target = 'send', markStarted = true) => {
  let transition = runtime.reduceVoiceGesture(runtime.createVoiceGestureState(), { type: 'PRESS_IN', now: 0 });
  expect(transition.effect === 'start-capture', 'press in should request one capture start');
  if (markStarted) transition = runtime.reduceVoiceGesture(transition.state, { type: 'CAPTURE_STARTED', now: 0 });
  transition = runtime.reduceVoiceGesture(transition.state, {
    type: 'MOVE',
    pageX: targetPageX[target],
    viewportWidth,
    now: releasedAt,
  });
  return runtime.reduceVoiceGesture(transition.state, { type: 'PRESS_OUT', now: releasedAt });
};

expect(runtime.MIN_VOICE_GESTURE_DURATION_MS === 1000, 'minimum duration must be exactly 1000 ms');
expect(runtime.MAX_VOICE_GESTURE_DURATION_MS === 60000, 'maximum duration must be exactly 60000 ms');
expect(runtime.VOICE_GESTURE_TRACK_OUTER_GUTTER === 14, 'gesture geometry must match the visual track outer gutter');
expect(runtime.VOICE_GESTURE_TRACK_INSET === 8, 'gesture geometry must match the visual track inset');
expect(runtime.VOICE_GESTURE_SEGMENT_HYSTERESIS === 10, 'horizontal gesture segments must keep a 10 pt recovery hysteresis');
expect(Math.abs(trackMetrics.segmentWidth * 3 - trackMetrics.trackWidth) < 0.001, 'voice gesture track must split into three equal horizontal segments');

expect(captureGuard.canCommitVoiceCapture({ mounted: true, interrupted: false, currentToken: 7, finishingToken: 7 }), 'active matching capture token should be committable');
expect(!captureGuard.canCommitVoiceCapture({ mounted: false, interrupted: false, currentToken: 7, finishingToken: 7 }), 'unmounted chat must reject a finished capture');
expect(!captureGuard.canCommitVoiceCapture({ mounted: true, interrupted: true, currentToken: 7, finishingToken: 7 }), 'interrupted chat must reject a finished capture');
expect(!captureGuard.canCommitVoiceCapture({ mounted: true, interrupted: false, currentToken: 8, finishingToken: 7 }), 'stale capture token must be rejected');
expect(captureGuard.canCommitCallCapture({ mounted: true, connected: true, muted: false, currentSession: 4, finishingSession: 4 }), 'active matching call session should be committable');
expect(!captureGuard.canCommitCallCapture({ mounted: true, connected: true, muted: true, currentSession: 4, finishingSession: 4 }), 'muting during stop must reject call capture');
expect(!captureGuard.canCommitCallCapture({ mounted: true, connected: false, muted: false, currentSession: 4, finishingSession: 4 }), 'ending during stop must reject call capture');
expect(!captureGuard.canCommitCallCapture({ mounted: false, connected: true, muted: false, currentSession: 4, finishingSession: 4 }), 'unmounting during stop must reject call capture');
expect(!captureGuard.canCommitCallCapture({ mounted: true, connected: true, muted: false, currentSession: 5, finishingSession: 4 }), 'stale call session must reject call capture');
expect(!captureGuard.isMeasuredVoiceDurationSendable({ durationMillis: 999, durationSec: 1 }), '999 ms recorder duration must remain too short even when display seconds round to 1');
expect(captureGuard.isMeasuredVoiceDurationSendable({ durationMillis: 1000, durationSec: 1 }), '1000 ms recorder duration must be sendable');
expect(chatInputSource.includes('void cancelNativeVoiceCaptureRef.current();'), 'chat unmount cleanup must call the stable cancel ref');
expect(callOverlaySource.includes('void cancelCaptureRef.current();'), 'call unmount cleanup must call the stable cancel ref');
expect(chatInputSource.includes('gestureActiveRef.current = true;'), 'press-in must synchronously latch an active chat gesture');
expect(chatInputSource.includes("cancelArmedRef.current = target === 'cancel';"), 'horizontal cancellation must synchronously latch before React renders');
expect(chatInputSource.includes('const cancelRequested = cancelArmedRef.current;'), 'press-out must read the synchronous cancel latch');
expect(
  chatInputSource.includes('pressRetentionOffset={{ top: 44, right: screenWidth, bottom: 72, left: screenWidth }}'),
  'hold-to-talk must retain the responder across the complete horizontal track',
);
expect(
  chatInputSource.includes('projectVoiceGesturePageX({')
    && chatInputSource.includes('updateVoiceGesturePosition(resolveVoiceGestureTrackPosition(projectedPageX, screenWidth))'),
  'chat gesture movement must project from the press origin and publish a continuous track position',
);
expect(
  !chatInputSource.includes('deltaY')
    && !chatInputSource.includes('VOICE_CANCEL_THRESHOLD')
    && !chatInputSource.includes('VOICE_TRANSCRIBE_X_RATIO'),
  'voice segment selection must not require an upward slope or vertical threshold',
);
expect(chatInputSource.includes('durationMillis: capture.durationMillis'), 'chat minimum duration gate must use recorder-measured milliseconds');
expect(chatInputSource.includes("previousState !== 'active' && permissionBlockedRef.current"), 'returning from system settings must release the blocked permission UI for a fresh check');
expect(chatInputSource.includes('updateVoiceGestureVisual({'), 'chat capture must publish to the root voice visual layer');
expect(chatInputSource.includes('finalizeNativeVoiceCapture(capture)'), 'failed convert-to-text must retain the local recording for retry');
expect(chatInputSource.includes('retryableTranscriptionRef.current = retainedCapture'), 'failed convert-to-text must expose a retryable capture instead of discarding it');
const localSilenceGuardIndex = chatInputSource.indexOf("transcriptCapture.errorCode === 'noSpeechDetected'");
const retryableFallbackIndex = chatInputSource.indexOf('const retainedCapture = finalizeNativeVoiceCapture(capture);');
expect(
  localSilenceGuardIndex >= 0
    && localSilenceGuardIndex < retryableFallbackIndex
    && chatInputSource.slice(localSilenceGuardIndex, retryableFallbackIndex).includes("transcriptCapture.errorCode === 'audioTooShort'")
    && chatInputSource.slice(localSilenceGuardIndex, retryableFallbackIndex).includes('discardNativeVoiceCapture(capture);')
    && chatInputSource.slice(localSilenceGuardIndex, retryableFallbackIndex).includes('clearRetryableTranscription(true);')
    && chatInputSource.slice(localSilenceGuardIndex, retryableFallbackIndex).includes('clearVoiceGesture();'),
  'local silence and too-short rejections must discard capture and exit conversion before the retryable STT fallback',
);
expect(
  chatInputSource.slice(localSilenceGuardIndex, retryableFallbackIndex).includes("triggerHaptic('light');")
    && !chatInputSource.slice(localSilenceGuardIndex, retryableFallbackIndex).includes("triggerHaptic('error');"),
  'local silence rejection must use light cancellation feedback rather than an error haptic',
);
expect(
  chatInputSource.includes("if (voiceMode || voicePhase !== 'failed') return;")
    && chatInputSource.includes('clearRetryableTranscription(true);'),
  'leaving a failed transcription for the keyboard must discard stale retry state before voice mode is reopened',
);
expect(voiceOverlaySource.includes('meteringHistory: number[];'), 'voice visual layer must keep a rolling metering history');
expect(voiceOverlaySource.includes('const WAVE_SAMPLE_COUNT = 18;'), 'voice visual layer must retain exactly 18 recent metering samples');
expect(voiceOverlaySource.includes('previousSample * 0.52 + rawSample * 0.48'), 'voice visual layer must smooth recorder metering before rendering it');
expect(!voiceOverlaySource.includes('waveformBars'), 'voice visual layer must not fall back to a fixed decorative waveform');
expect(
  voiceOverlaySource.includes('const scaleY = resolveWaveScale(sample, phase, index);')
    && voiceOverlaySource.includes('scaleY,'),
  'recording waveform motion must use smoothed transform animation instead of repeated layout height changes',
);
expect(voiceOverlaySource.includes('testID="voice-gesture-control-track"'), 'voice gesture actions must share one continuous control track');
expect(voiceOverlaySource.includes('testID="voice-gesture-active-segment"'), 'voice gesture track must expose one moving inset active segment');
expect(
  voiceOverlaySource.includes('gesturePosition: number;')
    && voiceOverlaySource.includes('translateX: visual.gesturePosition * segmentWidth')
    && voiceOverlaySource.includes('const VOICE_TRACK_FOLLOW_MS = 40;')
    && voiceOverlaySource.includes('duration: reducedMotion ? 0 : VOICE_TRACK_FOLLOW_MS'),
  'voice gesture active segment must follow the continuous horizontal finger position within 40 ms',
);
expect(
  !voiceOverlaySource.includes('leftActionPath')
    && !voiceOverlaySource.includes('rightActionPath')
    && !voiceOverlaySource.includes('sendActionPath'),
  'voice gesture actions must not render as three separate fan-shaped cards',
);
expect(
  voiceOverlaySource.includes('duration: reducedMotion ? 0 : 180')
    && voiceOverlaySource.includes('easing: MOTION_EASE_OUT'),
  'voice gesture state motion must use an ease-out timing transition and stop under reduced motion',
);
expect(
  !voiceOverlaySource.includes('from={{ opacity')
    && !voiceOverlaySource.includes('animate={{ opacity'),
  'voice gesture state changes must not use opacity crossfades',
);
expect(voiceOverlaySource.includes('pointerEvents="none"'), 'root voice visual layer must remain read-only for the active responder');
expect(!voiceOverlaySource.includes('<Modal'), 'voice visual layer must not interrupt recording through a React Native Modal');
expect(voiceOverlaySource.includes('callOverlay.show'), 'voice visual layer must yield to the active call overlay');
expect(
  dynamicIslandSource.includes('`recording-copy-${recording?.phase}`')
    && dynamicIslandSource.includes('`call-copy-${callOverlay.status}-${callNotification.title}`')
    && dynamicIslandSource.includes('`ordinary-copy-${ordinaryNotification.status || \'idle\'}-${ordinaryNotification.title}`'),
  'dynamic island motion must react to semantic state rather than elapsed time',
);
expect(
  dynamicIslandSource.includes('const notificationOffsetX = useSharedValue(')
    && dynamicIslandSource.includes('const copyOffsetY = useSharedValue(0);')
    && dynamicIslandSource.includes('duration: 170'),
  'dynamic island state changes must reuse persistent layers with bounded position timing',
);
expect(
  !dynamicIslandSource.includes('AnimatePresence')
    && !dynamicIslandSource.includes('presentationKey')
    && !dynamicIslandSource.includes('notificationCopyKey')
    && !dynamicIslandSource.includes('from={{ opacity')
    && !dynamicIslandSource.includes('animate={{ opacity'),
  'dynamic island states must not remount keyed content or use opacity crossfades',
);
expect(!dynamicIslandSource.includes("type: 'spring'"), 'dynamic island must not use spring or bounce transitions');
expect(rootLayoutSource.indexOf('<VoiceGestureOverlay />') > rootLayoutSource.indexOf('</Stack>'), 'voice visual layer must mount above the chat stack inside the phone frame');
expect(callOverlaySource.includes('testID="call-mic-button"'), 'call microphone must be a persistent mute toggle');
expect(!callOverlaySource.includes('call-speak-button'), 'call UI must not expose push-to-talk');
expect(!callOverlaySource.includes('onPressIn='), 'call UI must not use press-and-hold gestures');
expect(callOverlaySource.includes('const canCommit = canCommitCallCapture'), 'automatic call stop completion must recheck its live session before sending');
expect(callOverlaySource.includes('discardCaptureRef.current(capture);'), 'automatic call capture must discard its cache file after every send attempt');
expect(callOverlaySource.includes("capture.phase !== 'processing' && capture.phase !== 'ready'"), 'automatic call capture must route every non-ready stop result through cancel cleanup');
expect(nativeAudioSource.includes('const finishPromiseRef = useRef<Promise<MediaCaptureResult> | null>(null);'), 'native finish must be idempotent while stop is in flight');
expect(nativeAudioSource.includes('const cancelPromiseRef = useRef<Promise<MediaCaptureResult> | null>(null);'), 'native cancel must be idempotent while cleanup is in flight');
expect(nativeAudioSource.includes('const recorderUri = activeRecorder.uri || status.url;'), 'native cancel must inspect the recorder URI even after an OS stop');
expect(nativeAudioSource.includes('for (const uri of temporaryUris) discardTemporaryMediaFile(uri);'), 'native cancel must best-effort delete every Nana-owned temporary URI');
expect(nativeAudioSource.includes("currentCapture.phase === 'capturing' || currentCapture.phase === 'requestingPermission'"), 'native finish must detect an OS-stopped in-flight capture');
expect(nativeAudioSource.includes("createFailedCapture('Voice recording was interrupted')"), 'native finish must return a terminal interrupted failure after OS-stop cleanup');

let transition = press(999);
expect(transition.effect === 'discard-capture' && transition.state.phase === 'tooShort' && transition.state.outcome === 'too-short', '999 ms must enter tooShort and discard');
transition = press(1000);
expect(transition.effect === 'finish-capture' && transition.state.outcome === 'send', '1000 ms must be sendable');

expect(
  runtime.projectVoiceGesturePageX({ startPageX: 82, currentPageX: 82, viewportWidth }) === viewportWidth / 2,
  'press origin must always project to the center send segment',
);
expect(
  runtime.projectVoiceGesturePageX({ startPageX: 250, currentPageX: 170, viewportWidth }) === viewportWidth / 2 - 80,
  'horizontal movement must preserve finger displacement independently of the original press point',
);
const adjacentSegmentMove = trackMetrics.segmentWidth / 2 + 1;
const projectedCancelX = runtime.projectVoiceGesturePageX({
  startPageX: 120,
  currentPageX: 120 - adjacentSegmentMove,
  viewportWidth,
});
expect(
  runtime.resolveVoiceGestureTarget({
    currentTarget: 'send',
    pageX: projectedCancelX,
    viewportWidth,
  }) === 'cancel',
  'one half-segment horizontal move from any press origin must reach the adjacent cancel segment',
);
expect(Math.abs(runtime.resolveVoiceGestureTrackPosition(targetPageX.cancel, viewportWidth) - 0) < 0.001, 'cancel segment center must map to visual position 0');
expect(Math.abs(runtime.resolveVoiceGestureTrackPosition(targetPageX.send, viewportWidth) - 1) < 0.001, 'send segment center must map to visual position 1');
expect(Math.abs(runtime.resolveVoiceGestureTrackPosition(targetPageX.transcribe, viewportWidth) - 2) < 0.001, 'transcribe segment center must map to visual position 2');

let target = runtime.resolveVoiceGestureTarget({
  currentTarget: 'send',
  pageX: trackMetrics.cancelBoundary,
  viewportWidth,
});
expect(target === 'cancel', 'crossing the left equal-segment boundary must select cancel without any upward movement');
target = runtime.resolveVoiceGestureTarget({
  currentTarget: 'cancel',
  pageX: trackMetrics.cancelBoundary + runtime.VOICE_GESTURE_SEGMENT_HYSTERESIS - 1,
  viewportWidth,
});
expect(target === 'cancel', 'cancel must remain selected inside its recovery hysteresis');
target = runtime.resolveVoiceGestureTarget({
  currentTarget: 'cancel',
  pageX: trackMetrics.cancelBoundary + runtime.VOICE_GESTURE_SEGMENT_HYSTERESIS,
  viewportWidth,
});
expect(target === 'send', 'cancel must recover to send after leaving its hysteresis');
target = runtime.resolveVoiceGestureTarget({
  currentTarget: 'send',
  pageX: trackMetrics.transcribeBoundary,
  viewportWidth,
});
expect(target === 'transcribe', 'crossing the right equal-segment boundary must select transcription without any upward movement');
target = runtime.resolveVoiceGestureTarget({
  currentTarget: 'transcribe',
  pageX: trackMetrics.transcribeBoundary - runtime.VOICE_GESTURE_SEGMENT_HYSTERESIS + 1,
  viewportWidth,
});
expect(target === 'transcribe', 'transcription must remain selected inside its recovery hysteresis');
target = runtime.resolveVoiceGestureTarget({
  currentTarget: 'transcribe',
  pageX: trackMetrics.transcribeBoundary - runtime.VOICE_GESTURE_SEGMENT_HYSTERESIS,
  viewportWidth,
});
expect(target === 'send', 'transcription must recover to send after leaving its hysteresis');

let state = runtime.reduceVoiceGesture(runtime.createVoiceGestureState(), { type: 'PRESS_IN', now: 0 }).state;
state = runtime.reduceVoiceGesture(state, { type: 'CAPTURE_STARTED', now: 0 }).state;
transition = runtime.reduceVoiceGesture(state, { type: 'TICK', now: 60000 });
expect(transition.effect === 'finish-capture' && transition.state.outcome === 'max-duration', '60000 ms must auto-finish once');

transition = press(1200, 'cancel');
expect(
  transition.effect === 'discard-capture'
    && transition.state.phase === 'cancelArmed'
    && transition.state.outcome === 'drag-cancel',
  'release over the left segment must cancel and discard',
);

state = runtime.reduceVoiceGesture(runtime.createVoiceGestureState(), { type: 'PRESS_IN', now: 0 }).state;
state = runtime.reduceVoiceGesture(state, { type: 'CAPTURE_STARTED', now: 0 }).state;
state = runtime.reduceVoiceGesture(state, {
  type: 'MOVE',
  pageX: targetPageX.transcribe,
  viewportWidth,
  now: 500,
}).state;
expect(state.phase === 'transcribeArmed' && state.transcribeArmed && !state.cancelArmed, 'right segment must arm transcription without an upward slope');
transition = runtime.reduceVoiceGesture(state, { type: 'PRESS_OUT', now: 1200 });
expect(transition.effect === 'finish-capture' && transition.state.outcome === 'transcribe', 'release over transcription target must finish capture for STT without sending voice');

transition = press(40, 'send', false);
expect(transition.effect === 'discard-capture' && transition.state.outcome === 'too-short', 'rapid release before recorder start must discard safely');

transition = press(1200);
const duplicateFinish = runtime.reduceVoiceGesture(transition.state, { type: 'PRESS_OUT', now: 1300 });
expect(duplicateFinish.effect === 'none', 'repeated finish events must be idempotent');
const finished = runtime.reduceVoiceGesture(transition.state, { type: 'CAPTURE_FINISHED' });
expect(finished.state.phase === 'finished' && finished.effect === 'none', 'capture completion must not request another side effect');

state = runtime.reduceVoiceGesture(runtime.createVoiceGestureState(), { type: 'PRESS_IN', now: 10 }).state;
state = runtime.reduceVoiceGesture(state, { type: 'CAPTURE_STARTED', now: 15 }).state;
transition = runtime.reduceVoiceGesture(state, { type: 'INTERRUPT', now: 500 });
expect(transition.state.phase === 'interrupted' && transition.effect === 'discard-capture', 'interruption must request cache cleanup');
const afterDiscard = runtime.reduceVoiceGesture(transition.state, { type: 'CAPTURE_DISCARDED' });
expect(afterDiscard.state.phase === 'interrupted' && afterDiscard.effect === 'none', 'interruption cleanup must be one-shot');
const reset = runtime.reduceVoiceGesture(afterDiscard.state, { type: 'RESET' });
expect(reset.state.phase === 'idle' && reset.effect === 'none', 'reset must return to idle without side effects');

state = runtime.reduceVoiceGesture(runtime.createVoiceGestureState(), { type: 'PRESS_IN', now: 0 }).state;
transition = runtime.reduceVoiceGesture(state, { type: 'CAPTURE_PERMISSION_BLOCKED' });
expect(transition.state.phase === 'permissionBlocked' && transition.effect === 'discard-capture', 'permanent denial must expose permissionBlocked and clean up');
state = runtime.reduceVoiceGesture(runtime.createVoiceGestureState(), { type: 'PRESS_IN', now: 0 }).state;
transition = runtime.reduceVoiceGesture(state, { type: 'CAPTURE_FAILED' });
expect(transition.state.phase === 'failed' && transition.effect === 'discard-capture', 'capture start failure must expose failed and clean up');

if (errors.length) {
  console.error('Voice gesture contract failed:');
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}
console.log('Voice gesture contract passed.');
