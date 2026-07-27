import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const sourcePath = resolve(root, 'src/services/nativeCallAudioRouteRuntime.ts');
const source = readFileSync(sourcePath, 'utf8');
const playbackSource = readFileSync(resolve(root, 'src/services/nativeAudioPlaybackRuntime.ts'), 'utf8');
const errors = [];

function expect(condition, message) {
  if (!condition) errors.push(message);
}

function loadRuntime(platform, setAudioModeAsync) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: sourcePath,
  });
  const loadedModule = { exports: {} };
  const localRequire = specifier => {
    if (specifier === 'react-native') return { Platform: { OS: platform } };
    if (specifier === 'expo-audio') return { setAudioModeAsync };
    return require(specifier);
  };
  const context = vm.createContext({
    exports: loadedModule.exports,
    module: loadedModule,
    require: localRequire,
    console,
    Error,
    Promise,
  });
  vm.runInContext(compiled.outputText, context, { filename: sourcePath });
  return loadedModule.exports;
}

const calls = [];
let shouldFail = false;
const nativeRuntime = loadRuntime('ios', async mode => {
  calls.push(mode);
  if (shouldFail) throw new Error('route unavailable');
});

expect(nativeRuntime.isNativeCallAudioRouteAvailable(), 'iOS must expose native call audio routing');

const started = await nativeRuntime.beginNativeCallAudioSession('speaker');
expect(started.ok && started.route === 'speaker', 'call audio session must start on speaker');
expect(calls[0]?.allowsRecording === true, 'iOS call session must keep recording mode available for earpiece routing');
expect(calls[0]?.shouldRouteThroughEarpiece === false, 'speaker route must explicitly disable earpiece routing');

const switched = await nativeRuntime.setNativeCallAudioRoute('earpiece');
expect(switched.ok && switched.route === 'earpiece', 'speaker control must switch to the native earpiece route');
expect(calls.at(-1)?.shouldRouteThroughEarpiece === true, 'earpiece route must reach Expo Audio');

shouldFail = true;
const failedSwitch = await nativeRuntime.setNativeCallAudioRoute('speaker');
expect(!failedSwitch.ok && failedSwitch.route === 'earpiece', 'failed route changes must roll back to the last confirmed route');
expect(nativeRuntime.getActiveNativeCallAudioRoute() === 'earpiece', 'failed route changes must preserve runtime state');

shouldFail = false;
await nativeRuntime.configureNativeVoiceCaptureAudioSession();
expect(calls.at(-1)?.allowsRecording === true && calls.at(-1)?.shouldRouteThroughEarpiece === true, 'call recording must preserve the selected route');
await nativeRuntime.restoreAudioSessionAfterNativeVoiceCapture();
expect(calls.at(-1)?.allowsRecording === true && calls.at(-1)?.shouldRouteThroughEarpiece === true, 'finishing an automatic speech segment must keep the iOS call session and route active');
const callPlaybackConfigured = await nativeRuntime.configureNativeCallPlaybackAudioSession();
expect(callPlaybackConfigured, 'character playback must detect the active call session');
expect(calls.at(-1)?.allowsRecording === true && calls.at(-1)?.shouldRouteThroughEarpiece === true, 'character playback must preserve the confirmed earpiece route');
expect(playbackSource.includes('{ keepAudioSessionActive: usingCallAudioSession }'), 'one-shot character playback must keep an active call audio session alive');

const ended = await nativeRuntime.endNativeCallAudioSession();
expect(ended.ok, 'call audio cleanup must complete');
expect(calls.at(-1)?.allowsRecording === false, 'call cleanup must release recording mode');
expect(calls.at(-1)?.shouldRouteThroughEarpiece === false, 'call cleanup must restore the speaker default');
expect(nativeRuntime.getActiveNativeCallAudioRoute() === null, 'call cleanup must clear active route state');
expect(!await nativeRuntime.configureNativeCallPlaybackAudioSession(), 'generic playback must not impersonate a call after cleanup');

const webCalls = [];
const webRuntime = loadRuntime('web', async mode => webCalls.push(mode));
const webResult = await webRuntime.beginNativeCallAudioSession('speaker');
expect(!webRuntime.isNativeCallAudioRouteAvailable(), 'web must report call audio routing as unavailable');
expect(!webResult.ok && !webResult.available, 'web call audio routing must be explicitly unavailable');
expect(webCalls.length === 0, 'web must not pretend to apply a native audio route');

if (errors.length > 0) {
  console.error('Call audio route contract failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Call audio route contract passed.');
