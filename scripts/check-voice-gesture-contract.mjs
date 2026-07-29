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
const rootLayoutSource = readFileSync(resolve(root, 'src/app/_layout.tsx'), 'utf8');
const callOverlaySource = readFileSync(resolve(root, 'src/components/CallOverlay.tsx'), 'utf8');
const nativeAudioSource = readFileSync(resolve(root, 'src/services/nativeAudioRuntime.ts'), 'utf8');
const errors = [];
const expect = (condition, message) => { if (!condition) errors.push(message); };
const press = (releasedAt, translationY = 0, markStarted = true) => {
  let transition = runtime.reduceVoiceGesture(runtime.createVoiceGestureState(), { type: 'PRESS_IN', now: 0 });
  expect(transition.effect === 'start-capture', 'press in should request one capture start');
  if (markStarted) transition = runtime.reduceVoiceGesture(transition.state, { type: 'CAPTURE_STARTED', now: 0 });
  transition = runtime.reduceVoiceGesture(transition.state, { type: 'MOVE', translationY, now: releasedAt });
  return runtime.reduceVoiceGesture(transition.state, { type: 'PRESS_OUT', now: releasedAt });
};

expect(runtime.MIN_VOICE_GESTURE_DURATION_MS === 1000, 'minimum duration must be exactly 1000 ms');
expect(runtime.MAX_VOICE_GESTURE_DURATION_MS === 60000, 'maximum duration must be exactly 60000 ms');
expect(runtime.CANCEL_VOICE_GESTURE_TRANSLATION_Y === -64, 'cancel drag threshold must be exactly -64 pt');
expect(runtime.RECOVER_VOICE_GESTURE_TRANSLATION_Y === -40, 'cancel recovery threshold must be exactly -40 pt');
expect(runtime.TRANSCRIBE_VOICE_GESTURE_X_RATIO === 0.62, 'transcribe target must begin at 62% of the viewport width');

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
expect(chatInputSource.includes('cancelArmedRef.current = true;'), 'drag cancellation must synchronously latch before React renders');
expect(chatInputSource.includes('const cancelRequested = cancelArmedRef.current;'), 'press-out must read the synchronous cancel latch');
expect(chatInputSource.includes('pressRetentionOffset={{ top: 104, right: 44, bottom: 72, left: 44 }}'), 'hold-to-talk must retain the responder beyond the -64 pt cancel threshold');
expect(chatInputSource.includes('durationMillis: capture.durationMillis'), 'chat minimum duration gate must use recorder-measured milliseconds');
expect(chatInputSource.includes("previousState !== 'active' && permissionBlockedRef.current"), 'returning from system settings must release the blocked permission UI for a fresh check');
expect(chatInputSource.includes('updateVoiceGestureVisual({'), 'chat capture must publish to the root voice visual layer');
expect(chatInputSource.includes('finalizeNativeVoiceCapture(capture)'), 'failed convert-to-text must retain the local recording for retry');
expect(chatInputSource.includes('retryableTranscriptionRef.current = retainedCapture'), 'failed convert-to-text must expose a retryable capture instead of discarding it');
expect(
  chatInputSource.includes("if (voiceMode || voicePhase !== 'failed') return;")
    && chatInputSource.includes('clearRetryableTranscription(true);'),
  'leaving a failed transcription for the keyboard must discard stale retry state before voice mode is reopened',
);
expect(voiceOverlaySource.includes('meteringHistory: number[];'), 'voice visual layer must keep a rolling metering history');
expect(voiceOverlaySource.includes("slice(-18)"), 'voice visual layer must retain exactly 18 recent metering samples');
expect(!voiceOverlaySource.includes('waveformBars'), 'voice visual layer must not fall back to a fixed decorative waveform');
expect(voiceOverlaySource.includes('animate={{ scaleY: Math.max(0.14, sample) }}'), 'recording waveform motion must use transform animation instead of repeated layout height changes');
expect(voiceOverlaySource.includes('pointerEvents="none"'), 'root voice visual layer must remain read-only for the active responder');
expect(!voiceOverlaySource.includes('<Modal'), 'voice visual layer must not interrupt recording through a React Native Modal');
expect(voiceOverlaySource.includes('callOverlay.show'), 'voice visual layer must yield to the active call overlay');
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

let state = runtime.reduceVoiceGesture(runtime.createVoiceGestureState(), { type: 'PRESS_IN', now: 0 }).state;
state = runtime.reduceVoiceGesture(state, { type: 'CAPTURE_STARTED', now: 0 }).state;
transition = runtime.reduceVoiceGesture(state, { type: 'TICK', now: 60000 });
expect(transition.effect === 'finish-capture' && transition.state.outcome === 'max-duration', '60000 ms must auto-finish once');

for (const dragY of [-63, -40]) {
  transition = press(1200, dragY);
  expect(transition.effect === 'finish-capture', `${dragY} pt must remain sendable`);
}
transition = press(1200, -64);
expect(transition.effect === 'discard-capture' && transition.state.phase === 'cancelArmed' && transition.state.outcome === 'drag-cancel', '-64 pt must arm cancellation');

state = runtime.reduceVoiceGesture(runtime.createVoiceGestureState(), { type: 'PRESS_IN', now: 0 }).state;
state = runtime.reduceVoiceGesture(state, { type: 'CAPTURE_STARTED', now: 0 }).state;
state = runtime.reduceVoiceGesture(state, { type: 'MOVE', translationY: -64, now: 300 }).state;
expect(state.phase === 'cancelArmed' && state.cancelArmed, 'crossing -64 pt must enter cancelArmed');
state = runtime.reduceVoiceGesture(state, { type: 'MOVE', translationY: -41, now: 500 }).state;
expect(state.phase === 'cancelArmed' && state.cancelArmed, '-41 pt must stay cancelArmed because of hysteresis');
state = runtime.reduceVoiceGesture(state, { type: 'MOVE', translationY: -40, now: 700 }).state;
expect(state.phase === 'recording' && !state.cancelArmed, '-40 pt must recover from cancelArmed');

state = runtime.reduceVoiceGesture(runtime.createVoiceGestureState(), { type: 'PRESS_IN', now: 0 }).state;
state = runtime.reduceVoiceGesture(state, { type: 'CAPTURE_STARTED', now: 0 }).state;
state = runtime.reduceVoiceGesture(state, { type: 'MOVE', translationY: -64, pageX: 300, viewportWidth: 390, now: 500 }).state;
expect(state.phase === 'transcribeArmed' && state.transcribeArmed && !state.cancelArmed, 'upper-right target must arm transcription without arming cancel');
transition = runtime.reduceVoiceGesture(state, { type: 'PRESS_OUT', now: 1200 });
expect(transition.effect === 'finish-capture' && transition.state.outcome === 'transcribe', 'release over transcription target must finish capture for STT without sending voice');

transition = press(40, 0, false);
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
