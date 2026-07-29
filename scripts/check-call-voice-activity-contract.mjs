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

const runtime = loadTypeScriptModule(resolve(root, 'src/services/callVoiceActivityRuntime.ts'));
const overlaySource = readFileSync(resolve(root, 'src/components/CallOverlay.tsx'), 'utf8');
const cameraSource = readFileSync(resolve(root, 'src/services/nativeCameraRuntime.tsx'), 'utf8');
const typeSource = readFileSync(resolve(root, 'src/types/index.ts'), 'utf8');
const errors = [];
const expect = (condition, message) => { if (!condition) errors.push(message); };

expect(runtime.CALL_VOICE_ACTIVITY_SPEECH_DB === -42, 'speech must open at -42 dB');
expect(runtime.CALL_VOICE_ACTIVITY_SILENCE_DB === -50, 'silence must arm at -50 dB');
expect(runtime.CALL_VOICE_ACTIVITY_SILENCE_MS === 1000, 'trailing silence must be exactly 1000 ms');
expect(runtime.CALL_VOICE_ACTIVITY_MAX_SEGMENT_MS === 20000, 'a hands-free segment must stop at 20 seconds');
expect(runtime.CALL_VOICE_ACTIVITY_MIN_VOICED_MS === 160, 'speech must remain voiced for at least 160 ms');
expect(runtime.CALL_VOICE_ACTIVITY_MIN_VOICED_SAMPLES === 2, 'speech must require at least two fresh metering samples');

let transition = runtime.reduceCallVoiceActivity(runtime.createCallVoiceActivityState(0), { now: 10, meteringDb: -43, sampleId: 1 });
expect(transition.state.phase === 'waiting' && transition.effect === 'none', '-43 dB must remain waiting');
transition = runtime.reduceCallVoiceActivity(transition.state, { now: 20, meteringDb: -42, sampleId: 2 });
expect(transition.state.phase === 'potentialSpeech' && transition.effect === 'none', 'one -42 dB sample must only arm potential speech');
transition = runtime.reduceCallVoiceActivity(transition.state, { now: 190, meteringDb: -42, sampleId: 2 });
expect(transition.state.phase === 'potentialSpeech', 'polling one loud sample twice must not count as two frames');
transition = runtime.reduceCallVoiceActivity(transition.state, { now: 200, meteringDb: -42, sampleId: 3 });
expect(transition.state.phase === 'speech' && transition.effect === 'none', 'two fresh voiced samples over 160 ms must begin speech');
transition = runtime.reduceCallVoiceActivity(transition.state, { now: 300, meteringDb: -50, sampleId: 4 });
expect(transition.state.phase === 'trailingSilence' && transition.effect === 'none', '-50 dB must arm trailing silence');
transition = runtime.reduceCallVoiceActivity(transition.state, { now: 800, meteringDb: -55, sampleId: 5 });
expect(transition.effect === 'none', 'a second silence sample before one second must stay open');
transition = runtime.reduceCallVoiceActivity(transition.state, { now: 1299, meteringDb: -55, sampleId: 6 });
expect(transition.effect === 'none', '999 ms of silence must not commit');
transition = runtime.reduceCallVoiceActivity(transition.state, { now: 1300, meteringDb: -55, sampleId: 7 });
expect(transition.effect === 'commit-capture', 'a completed start followed by 1000 ms silence must commit');

let state = runtime.createCallVoiceActivityState(0);
state = runtime.reduceCallVoiceActivity(state, { now: 5, meteringDb: -40, sampleId: 1 }).state;
state = runtime.reduceCallVoiceActivity(state, { now: 170, meteringDb: -40, sampleId: 2 }).state;
state = runtime.reduceCallVoiceActivity(state, { now: 200, meteringDb: -51, sampleId: 3 }).state;
transition = runtime.reduceCallVoiceActivity(state, { now: 500, meteringDb: -41, sampleId: 4 });
expect(transition.state.phase === 'speech' && transition.effect === 'none', 'speech must recover from trailing silence at -42 dB or louder');

state = runtime.reduceCallVoiceActivity(runtime.createCallVoiceActivityState(0), { now: 10, meteringDb: -38, sampleId: 1 }).state;
transition = runtime.reduceCallVoiceActivity(state, { now: 260, meteringDb: -60, sampleId: 2 });
expect(transition.state.phase === 'waiting', 'a single noise spike must fall back to waiting without creating a turn');

transition = runtime.reduceCallVoiceActivity(runtime.createCallVoiceActivityState(0), { now: 19999, meteringDb: -80 });
expect(transition.effect === 'none', 'silent capture must remain open at 19999 ms');
transition = runtime.reduceCallVoiceActivity(runtime.createCallVoiceActivityState(0), { now: 20000, meteringDb: -80 });
expect(transition.effect === 'restart-capture', 'silent capture must restart at 20000 ms without a ghost turn');
state = runtime.reduceCallVoiceActivity(runtime.createCallVoiceActivityState(0), { now: 1, meteringDb: -40, sampleId: 1 }).state;
state = runtime.reduceCallVoiceActivity(state, { now: 170, meteringDb: -40, sampleId: 2 }).state;
transition = runtime.reduceCallVoiceActivity(state, { now: 20000, meteringDb: -40, sampleId: 3 });
expect(transition.effect === 'commit-capture', 'spoken capture must commit at the 20 second ceiling');

expect(typeSource.includes("export type CallInteractionMode = 'voiceActivity';"), 'call interaction type must be voiceActivity');
expect(overlaySource.includes('testID="call-mic-button"'), 'call shell must expose a microphone toggle');
expect(!overlaySource.includes('call-speak-button'), 'call shell must not expose a push-to-talk button');
expect(!overlaySource.includes('onPressIn='), 'call shell must not contain press-and-hold call controls');
expect(!overlaySource.includes('onPressOut='), 'call shell must not contain release-to-send call controls');
expect(overlaySource.includes('const currentCapture = nativeCaptureRef.current;'), 'VAD finish must inspect the controller capture after start promise cleanup');
expect(overlaySource.includes("currentCapture.phase === 'capturing'"), 'a completed recorder start must still be recognized as capturing');
expect(overlaySource.includes('captureIsActive\n        ? await finishCaptureRef.current()'), 'a VAD commit must stop the live recorder even after start ref is cleared');
expect(overlaySource.includes('callOverlay.speechPhase === \'idle\''), 'automatic listening must only run while the character is idle');
expect(
  overlaySource.includes('invalidateActiveCallVoiceInput(callStartedAtRef.current)'),
  'muting or backgrounding must delegate pending-call invalidation to the store',
);
expect(cameraSource.includes('facing?: CameraType;'), 'self camera preview must accept front/back facing');
expect(cameraSource.includes("mirror: facing === 'front'"), 'only the front camera may be mirrored');
expect(cameraSource.includes("createPermissionGate('videoPreview'"), 'camera preview must use its camera-only permission gate');
expect(!cameraSource.includes('useMicrophonePermissions'), 'camera preview must not request microphone permission');

if (errors.length) {
  console.error('Call voice activity contract failed:');
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}
console.log('Call voice activity contract passed.');
