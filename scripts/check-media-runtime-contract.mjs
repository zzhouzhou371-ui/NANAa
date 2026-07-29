import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const sourcePath = resolve(root, 'src/services/mediaRuntime.ts');
const source = readFileSync(sourcePath, 'utf8');

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
  fileName: sourcePath,
});

const module = { exports: {} };
const context = vm.createContext({
  exports: module.exports,
  module,
  require,
  console,
  Date,
  Math,
});

vm.runInContext(compiled.outputText, context, { filename: sourcePath });

const mediaRuntime = module.exports;
const errors = [];

function expect(condition, message) {
  if (!condition) errors.push(message);
}

function loadTypeScriptModule(filePath, mocks = {}) {
  const moduleSource = readFileSync(filePath, 'utf8');
  const moduleCompiled = ts.transpileModule(moduleSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filePath,
  });
  const loadedModule = { exports: {} };
  const localRequire = (specifier) => (
    Object.prototype.hasOwnProperty.call(mocks, specifier) ? mocks[specifier] : require(specifier)
  );
  const moduleContext = vm.createContext({
    exports: loadedModule.exports,
    module: loadedModule,
    require: localRequire,
    console,
    Date,
    Math,
    URL,
  });
  vm.runInContext(moduleCompiled.outputText, moduleContext, { filename: filePath });
  return loadedModule.exports;
}

const luna = {
  id: 'luna-id',
  name: 'Luna',
  avatar: 'L',
  desc: 'Gentle and caring.',
  preferredReplyMode: 'voice',
  supportsVoiceReply: true,
  voiceProfileId: 'voice_luna_01',
  supportsVideoPersona: true,
  videoPersonaAsset: 'persona/luna.mp4',
};

expect(typeof mediaRuntime.createVoiceMessageDraftFromCapture === 'function', 'createVoiceMessageDraftFromCapture must be exported');
expect(typeof mediaRuntime.startVoiceCaptureSession === 'function', 'startVoiceCaptureSession must be exported');
expect(typeof mediaRuntime.resolveSpeechToTextResult === 'function', 'resolveSpeechToTextResult must be exported');
expect(typeof mediaRuntime.createCharacterVoiceReplyDraft === 'function', 'createCharacterVoiceReplyDraft must be exported');
expect(typeof mediaRuntime.appendCallTranscriptLine === 'function', 'appendCallTranscriptLine must be exported');
expect(typeof mediaRuntime.startCallMediaSession === 'function', 'startCallMediaSession must be exported');
expect(typeof mediaRuntime.appendCallCaptureResult === 'function', 'appendCallCaptureResult must be exported');
expect(typeof mediaRuntime.normalizePermissionStatus === 'function', 'normalizePermissionStatus must be exported');
expect(typeof mediaRuntime.createPermissionGate === 'function', 'createPermissionGate must be exported');
expect(typeof mediaRuntime.completeVoiceCaptureSession === 'function', 'completeVoiceCaptureSession must be exported');
expect(typeof mediaRuntime.createVoiceCaptureResultFromRecording === 'function', 'createVoiceCaptureResultFromRecording must be exported');
expect(typeof mediaRuntime.createSpeechToTextJob === 'function', 'createSpeechToTextJob must be exported');
expect(typeof mediaRuntime.createSpeechSynthesisPlan === 'function', 'createSpeechSynthesisPlan must be exported');
expect(typeof mediaRuntime.createCameraCaptureResultFromPicture === 'function', 'createCameraCaptureResultFromPicture must be exported');
expect(typeof mediaRuntime.createVideoPersonaSession === 'function', 'createVideoPersonaSession must be exported');

if (typeof mediaRuntime.createVoiceMessageDraftFromCapture === 'function') {
  const readyCapture = mediaRuntime.createMockCaptureResult('I missed your voice today.');
  const draft = mediaRuntime.createVoiceMessageDraftFromCapture(readyCapture, 'voice');
  expect(draft?.type === 'voice', 'ready voice capture should create a voice draft');
  expect(draft?.transcript === 'I missed your voice today.', 'voice draft should preserve transcript text');
  expect(draft?.replyMode === 'voice', 'voice draft should preserve reply mode');
  expect(draft?.audioDurationSec > 0, 'voice draft should contain a positive duration');

  const recordedCapture = mediaRuntime.resolveSpeechToTextResult({
    transcript: 'This one came from the microphone.',
    durationSec: 7,
    localUri: 'file:///tmp/native-voice.m4a',
  });
  const recordedDraft = mediaRuntime.createVoiceMessageDraftFromCapture(recordedCapture, 'auto');
  expect(recordedDraft?.audioUri === 'file:///tmp/native-voice.m4a', 'voice draft should preserve captured audio URI');

  const failedCapture = mediaRuntime.createMockCaptureResult('');
  const failedDraft = mediaRuntime.createVoiceMessageDraftFromCapture(failedCapture, 'auto');
  expect(failedDraft === null, 'failed voice capture should not create a sendable draft');
}

if (typeof mediaRuntime.startVoiceCaptureSession === 'function') {
  const session = mediaRuntime.startVoiceCaptureSession();
  expect(session.phase === 'capturing', 'voice capture session should start in capturing phase');
}

if (typeof mediaRuntime.normalizePermissionStatus === 'function') {
  expect(mediaRuntime.normalizePermissionStatus({ granted: true }) === 'granted', 'granted native permission should normalize to granted');
  expect(mediaRuntime.normalizePermissionStatus({ granted: false, canAskAgain: true }) === 'undetermined', 'askable denied permission should normalize to undetermined');
  expect(mediaRuntime.normalizePermissionStatus({ granted: false, canAskAgain: false }) === 'denied', 'blocked native permission should normalize to denied');
  expect(mediaRuntime.normalizePermissionStatus('limited') === 'limited', 'limited permission should stay limited');
}

if (typeof mediaRuntime.createPermissionGate === 'function') {
  const grantedGate = mediaRuntime.createPermissionGate('voiceMessage', { microphone: 'granted' });
  expect(grantedGate.allowed === true, 'voice message permission gate should allow granted microphone');
  expect(grantedGate.missingPermissions.length === 0, 'granted voice message gate should have no missing permissions');

  const blockedGate = mediaRuntime.createPermissionGate('videoCall', { microphone: 'granted', camera: 'denied' });
  expect(blockedGate.allowed === false, 'video call permission gate should block denied camera');
  expect(blockedGate.missingPermissions.includes('camera'), 'video call permission gate should report missing camera');

  const missingMicrophoneGate = mediaRuntime.createPermissionGate('videoCall', { microphone: 'denied', camera: 'granted' });
  expect(missingMicrophoneGate.allowed === false, 'video call permission gate should block denied microphone');
  expect(missingMicrophoneGate.missingPermissions.includes('microphone'), 'video call permission gate should report missing microphone');

  const askableGate = mediaRuntime.createPermissionGate('voiceMessage', {
    microphone: { granted: false, canAskAgain: true, status: 'denied' },
  });
  expect(askableGate.canAskAgain === true, 'askable microphone denial must remain requestable');
  expect(askableGate.blockedPermissions.length === 0, 'askable microphone denial must not be marked permanently blocked');

  const permanentGate = mediaRuntime.createPermissionGate('voiceMessage', {
    microphone: { granted: false, canAskAgain: false, status: 'denied' },
  });
  expect(permanentGate.canAskAgain === false, 'permanent microphone denial must preserve canAskAgain=false');
  expect(permanentGate.blockedPermissions.includes('microphone'), 'permanent microphone denial must identify the blocked permission');
}

if (typeof mediaRuntime.resolveSpeechToTextResult === 'function') {
  const transcript = mediaRuntime.resolveSpeechToTextResult({
    transcript: 'This is the converted text.',
    durationSec: 8,
    localUri: 'file:///voice.m4a',
  });
  expect(transcript.phase === 'ready', 'STT result with transcript should be ready');
  expect(transcript.transcript === 'This is the converted text.', 'STT result should preserve transcript');
  expect(transcript.durationSec === 8, 'STT result should preserve duration');
  expect(transcript.localUri === 'file:///voice.m4a', 'STT result should preserve local URI');

  const failedTranscript = mediaRuntime.resolveSpeechToTextResult({ errorMessage: 'No speech detected' });
  expect(failedTranscript.phase === 'failed', 'STT result without transcript should fail');
  expect(failedTranscript.errorMessage === 'No speech detected', 'failed STT result should preserve error message');
}

if (typeof mediaRuntime.completeVoiceCaptureSession === 'function') {
  const session = mediaRuntime.startVoiceCaptureSession();
  const processing = mediaRuntime.completeVoiceCaptureSession(session, {
    phase: 'processing',
    localUri: 'file:///tmp/voice.m4a',
    durationSec: 6,
  });
  expect(processing.phase === 'processing', 'voice capture session should accept processing handoff');
  expect(processing.localUri === 'file:///tmp/voice.m4a', 'voice capture processing state should preserve uri');

  const ready = mediaRuntime.completeVoiceCaptureSession(session, {
    transcript: 'Ready transcript.',
    durationSec: 4,
  });
  expect(ready.phase === 'ready', 'voice capture session should become ready with transcript');
  expect(ready.transcript === 'Ready transcript.', 'voice capture ready state should preserve transcript');

  const failed = mediaRuntime.completeVoiceCaptureSession(session, {
    errorMessage: 'Permission denied',
  });
  expect(failed.phase === 'failed', 'voice capture session should fail without transcript');
  expect(failed.errorMessage === 'Permission denied', 'voice capture failed state should preserve error');
}

if (typeof mediaRuntime.createVoiceCaptureResultFromRecording === 'function') {
  const recorded = mediaRuntime.createVoiceCaptureResultFromRecording({
    uri: 'file:///tmp/native-recording.m4a',
    durationMillis: 3200,
  });
  expect(recorded.phase === 'processing', 'native recording result should enter processing phase before STT');
  expect(recorded.localUri === 'file:///tmp/native-recording.m4a', 'native recording result should preserve uri');
  expect(recorded.durationMillis === 3200, 'native recording result should preserve exact duration milliseconds');
  expect(recorded.durationSec === 4, 'native recording result should round duration up to seconds');

  const belowMinimum = mediaRuntime.createVoiceCaptureResultFromRecording({
    uri: 'file:///tmp/native-recording-999.m4a',
    durationMillis: 999,
  });
  const atMinimum = mediaRuntime.createVoiceCaptureResultFromRecording({
    uri: 'file:///tmp/native-recording-1000.m4a',
    durationMillis: 1000,
  });
  expect(belowMinimum.durationMillis === 999, '999 ms capture must not be rounded before the sendability gate');
  expect(atMinimum.durationMillis === 1000, '1000 ms capture must preserve the exact boundary');

  const missingUri = mediaRuntime.createVoiceCaptureResultFromRecording({
    uri: null,
    durationMillis: 1000,
  });
  expect(missingUri.phase === 'failed', 'native recording result without uri should fail');
  expect(missingUri.errorMessage === 'No recording captured', 'native recording result without uri should explain failure');
}

if (typeof mediaRuntime.createSpeechToTextJob === 'function') {
  const recorded = mediaRuntime.createVoiceCaptureResultFromRecording({
    uri: 'file:///tmp/native-recording.m4a',
    durationMillis: 3200,
  });
  const job = mediaRuntime.createSpeechToTextJob({
    capture: recorded,
    language: 'zh-CN',
    provider: 'manual',
  });
  expect(job.phase === 'processing', 'STT job should wait in processing when audio exists without transcript');
  expect(job.localUri === 'file:///tmp/native-recording.m4a', 'STT job should preserve audio uri');
  expect(job.language === 'zh-CN', 'STT job should preserve language');
  expect(job.provider === 'manual', 'STT job should preserve provider');

  const readyJob = mediaRuntime.createSpeechToTextJob({
    capture: mediaRuntime.resolveSpeechToTextResult({ transcript: 'Already converted.' }),
    language: 'en-US',
    provider: 'mock',
  });
  expect(readyJob.phase === 'ready', 'STT job should be ready when transcript already exists');
  expect(readyJob.transcript === 'Already converted.', 'ready STT job should preserve transcript');
}

if (typeof mediaRuntime.createSpeechSynthesisPlan === 'function') {
  const plan = mediaRuntime.createSpeechSynthesisPlan({
    character: luna,
    text: 'I can say this out loud.',
    language: 'en-US',
  });
  expect(plan.phase === 'ready', 'TTS plan should be ready for a voice-capable character');
  expect(plan.provider === 'expo-speech', 'TTS plan should use expo-speech provider');
  expect(plan.text === 'I can say this out loud.', 'TTS plan should preserve text');
  expect(plan.voiceProfileId === 'voice_luna_01', 'TTS plan should preserve character voice profile');
  expect(plan.language === 'en-US', 'TTS plan should preserve language');

  const blank = mediaRuntime.createSpeechSynthesisPlan({
    character: luna,
    text: '   ',
    language: 'en-US',
  });
  expect(blank.phase === 'failed', 'TTS plan should fail for blank text');
}

if (typeof mediaRuntime.createCameraCaptureResultFromPicture === 'function') {
  const picture = mediaRuntime.createCameraCaptureResultFromPicture({
    uri: 'file:///tmp/video-self-frame.jpg',
    width: 720,
    height: 1280,
  });
  expect(picture.phase === 'ready', 'camera picture result should be ready when uri exists');
  expect(picture.localUri === 'file:///tmp/video-self-frame.jpg', 'camera picture result should preserve uri');
  expect(picture.mediaKind === 'image', 'camera picture result should be marked as image');
  expect(picture.width === 720, 'camera picture result should preserve width');
  expect(picture.height === 1280, 'camera picture result should preserve height');

  const missingPicture = mediaRuntime.createCameraCaptureResultFromPicture({});
  expect(missingPicture.phase === 'failed', 'camera picture result without uri should fail');
}

if (typeof mediaRuntime.createVideoPersonaSession === 'function') {
  const persona = mediaRuntime.createVideoPersonaSession(luna);
  expect(persona.phase === 'ready', 'video persona session should be ready when asset exists');
  expect(persona.characterId === 'luna-id', 'video persona session should preserve character id');
  expect(persona.sourceUri === 'persona/luna.mp4', 'video persona session should preserve source uri');
  expect(persona.provider === 'expo-video', 'video persona session should use expo-video provider');

  const missingPersona = mediaRuntime.createVideoPersonaSession({ ...luna, supportsVideoPersona: false, videoPersonaAsset: '' });
  expect(missingPersona.phase === 'failed', 'video persona session should fail when no asset exists');
}

if (typeof mediaRuntime.createCharacterVoiceReplyDraft === 'function') {
  const voiceReply = mediaRuntime.createCharacterVoiceReplyDraft(luna, 'I can send this as voice.', 'auto');
  expect(voiceReply?.type === 'voice', 'voice-capable character should produce a voice reply draft');
  expect(voiceReply?.transcript === 'I can send this as voice.', 'voice reply draft should preserve reply text');

  const textOnly = mediaRuntime.createCharacterVoiceReplyDraft({ ...luna, supportsVoiceReply: false }, 'Text only.', 'voice');
  expect(textOnly === null, 'a character with voice replies disabled must remain text-only');
}

const voiceType = mediaRuntime.resolveCharacterReplyType(luna, 'auto', 'voice');
expect(voiceType === 'voice', 'voice-capable character should answer voice input with voice in auto mode');

const videoCall = mediaRuntime.createCallOverlayState('video', luna);
expect(videoCall.show === true, 'video call overlay should be visible');
expect(videoCall.type === 'video', 'video call overlay should keep call type');
expect(videoCall.status === 'ringing', 'video call overlay should start in ringing state');
expect(videoCall.direction === 'outgoing', 'video call overlay should default to outgoing direction');
expect(videoCall.hasVideoPersona === true, 'video call overlay should expose persona availability');
expect(videoCall.videoPersonaSourceUri === 'persona/luna.mp4', 'video call overlay should expose persona source uri');
expect(videoCall.transcript.length === 0, 'call overlay must not inject technical connecting text into visible captions');
expect(videoCall.interactionMode === 'voiceActivity', 'call overlay interaction mode must be fixed to hands-free voice activity');
expect(videoCall.speechPhase === 'idle', 'call overlay speech phase must be initialized');
expect(!('replyMode' in videoCall), 'call overlay must not expose the chat reply preference');

if (typeof mediaRuntime.appendCallTranscriptLine === 'function') {
  const updated = mediaRuntime.appendCallTranscriptLine(videoCall, {
    speaker: 'user',
    text: 'Can you hear me?',
    mode: 'speech',
  });
  expect(updated !== videoCall, 'call transcript append should return a new overlay object');
  expect(updated.transcript.length === videoCall.transcript.length + 1, 'call transcript append should add one line');
  expect(updated.transcript.at(-1)?.text === 'Can you hear me?', 'call transcript append should preserve line text');
}

if (typeof mediaRuntime.startCallMediaSession === 'function') {
  const voiceSession = mediaRuntime.startCallMediaSession('voice', luna);
  expect(voiceSession.type === 'voice', 'voice call session should keep call type');
  expect(voiceSession.phase === 'capturing', 'mock voice call session should start capturing');
  expect(voiceSession.requiredPermissions.includes('microphone'), 'voice call session should require microphone permission');
  expect(!voiceSession.requiredPermissions.includes('camera'), 'voice call session should not require camera permission');

  const videoSession = mediaRuntime.startCallMediaSession('video', luna);
  expect(videoSession.type === 'video', 'video call session should keep call type');
  expect(videoSession.requiredPermissions.includes('microphone'), 'video call session should require microphone permission');
  expect(videoSession.requiredPermissions.includes('camera'), 'video call session should require camera permission');
}

if (typeof mediaRuntime.appendCallCaptureResult === 'function') {
  const capture = mediaRuntime.resolveSpeechToTextResult({ transcript: 'I am here on the call.', durationSec: 5 });
  const updated = mediaRuntime.appendCallCaptureResult(videoCall, capture, 'user');
  expect(updated.transcript.at(-1)?.speaker === 'user', 'call capture append should preserve speaker');
  expect(updated.transcript.at(-1)?.text === 'I am here on the call.', 'call capture append should use transcript text');
  expect(updated.transcript.at(-1)?.mode === 'speech', 'call capture append should mark transcript as speech');

  const failed = mediaRuntime.appendCallCaptureResult(videoCall, { phase: 'failed', errorMessage: 'No speech' }, 'user');
  expect(failed === videoCall, 'failed call capture should not change the overlay transcript');

  const withUser = mediaRuntime.appendCallCaptureResult(videoCall, capture, 'user');
  const withCharacter = mediaRuntime.appendCallCaptureResult(
    withUser,
    mediaRuntime.resolveSpeechToTextResult({ transcript: 'I heard you clearly.' }),
    'char',
  );
  const ids = withCharacter.transcript.map(line => line.id);
  expect(new Set(ids).size === ids.length, 'call transcript line ids should be unique after rapid appends');
}

const localMediaCalls = { finalize: [], discard: [], openSettings: 0 };
let shouldFailFinalize = false;
const nativeAudioPath = resolve(root, 'src/services/nativeAudioRuntime.ts');
const nativeAudio = loadTypeScriptModule(nativeAudioPath, {
  react: {
    useCallback: value => value,
    useMemo: factory => factory(),
    useState: initial => [initial, () => undefined],
  },
  'react-native': {
    Platform: { OS: 'ios' },
    Linking: { openSettings: async () => { localMediaCalls.openSettings += 1; } },
  },
  'expo-audio': {
    getRecordingPermissionsAsync: async () => ({ granted: false, canAskAgain: true, status: 'denied' }),
    requestRecordingPermissionsAsync: async () => ({ granted: false, canAskAgain: true, status: 'denied' }),
    RecordingPresets: { LOW_QUALITY: {} },
    setAudioModeAsync: async () => undefined,
    useAudioRecorder: () => ({}),
    useAudioRecorderState: () => ({ isRecording: false, durationMillis: 0 }),
  },
  './mediaRuntime': mediaRuntime,
  './localMediaRepository': {
    discardTemporaryMediaFile: uri => { localMediaCalls.discard.push(uri); return true; },
    finalizeLocalMediaFile: uri => {
      localMediaCalls.finalize.push(uri);
      if (shouldFailFinalize) throw new Error('disk full');
      return 'file:///document/nana-media/audio/voice.m4a';
    },
    isPersistedMediaUri: uri => uri.includes('/document/nana-media/audio/'),
  },
  './nativeCallAudioRouteRuntime': {
    configureNativeVoiceCaptureAudioSession: async () => undefined,
    restoreAudioSessionAfterNativeVoiceCapture: async () => undefined,
  },
});

expect(typeof nativeAudio.finalizeVoiceCapture === 'function', 'native audio must export the voice commit point');
expect(typeof nativeAudio.discardVoiceCapture === 'function', 'native audio must export cache discard');
expect(typeof nativeAudio.openNativePermissionSettings === 'function', 'native audio must expose system settings navigation');

const cachedVoice = {
  phase: 'processing',
  mediaKind: 'audio',
  localUri: 'file:///cache/nana-voice.m4a',
  durationSec: 4,
};
const finalizedVoice = nativeAudio.finalizeVoiceCapture(cachedVoice);
expect(finalizedVoice.localUri === 'file:///document/nana-media/audio/voice.m4a', 'finalize must promote cache audio to durable documents');
expect(finalizedVoice.durationSec === 4 && finalizedVoice.phase === 'processing', 'finalize must preserve capture metadata and phase');

const durableVoice = { ...cachedVoice, localUri: 'file:///document/nana-media/audio/already.m4a' };
expect(nativeAudio.finalizeVoiceCapture(durableVoice) === durableVoice, 'finalize must be idempotent for durable Nana audio');
const remoteVoice = { ...cachedVoice, localUri: 'https://cdn.example.test/voice.m4a' };
expect(nativeAudio.finalizeVoiceCapture(remoteVoice) === remoteVoice, 'finalize must not copy or rewrite remote audio');

shouldFailFinalize = true;
const failedFinalize = nativeAudio.finalizeVoiceCapture(cachedVoice);
expect(failedFinalize.phase === 'failed', 'finalize storage failure must return a failed capture');
expect(failedFinalize.localUri === cachedVoice.localUri, 'finalize storage failure must retain the cache URI for cleanup');
shouldFailFinalize = false;

nativeAudio.discardVoiceCapture(cachedVoice);
expect(localMediaCalls.discard.includes(cachedVoice.localUri), 'discard must delegate cache cleanup to the safe media repository');

const askableFailure = nativeAudio.createMicrophonePermissionFailure(
  mediaRuntime.createPermissionGate('voiceMessage', { microphone: { granted: false, canAskAgain: true, status: 'denied' } }),
);
expect(askableFailure.phase === 'failed', 'askable microphone denial should remain a retryable failed phase');
const blockedFailure = nativeAudio.createMicrophonePermissionFailure(
  mediaRuntime.createPermissionGate('voiceMessage', { microphone: { granted: false, canAskAgain: false, status: 'denied' } }),
);
expect(blockedFailure.phase === 'permissionBlocked', 'permanent microphone denial must expose permissionBlocked');
await nativeAudio.openNativePermissionSettings();
expect(localMediaCalls.openSettings === 1, 'permission-blocked UI action must open native system settings');

const localMediaSource = readFileSync(resolve(root, 'src/services/localMediaRepository.ts'), 'utf8');
expect(localMediaSource.includes("'images' | 'audio' | 'avatars'"), 'local media repository must own a durable avatar directory');
expect(localMediaSource.includes('uriIsInside(uri, cacheRoot)'), 'temporary cleanup must be constrained to the app cache directory');
expect(localMediaSource.includes('readPersistedAvatarForExport'), 'media repository must expose avatar export encoding');
expect(localMediaSource.includes('stageImportedAvatar'), 'media repository must expose isolated avatar import staging');
expect(localMediaSource.includes('promoteStagedAvatar'), 'media repository must expose staged avatar promotion');
const imagePickerSource = readFileSync(resolve(root, 'src/services/nativeImagePickerRuntime.ts'), 'utf8');
expect(imagePickerSource.includes('ImageManipulator.manipulate'), 'avatar picker must normalize selected photos before persistence');
expect(imagePickerSource.includes('recoverPendingImagePickerSelection'), 'avatar picker must support Android process-death recovery');
expect(imagePickerSource.includes("kind: 'moment-photo'"), 'moment photo picker must persist an explicit draft recovery intent');
expect(imagePickerSource.includes("kind: 'sticker-import'"), 'multi-sticker picker must persist an explicit scope recovery intent');
expect(imagePickerSource.includes('createUserAvatarStatePatch'), 'user avatar changes must update persisted outgoing avatar references together');
expect(imagePickerSource.includes("message.sender === 'user' ? { ...message, avatar }"), 'user avatar patch must rewrite historical outgoing message avatars');
expect(imagePickerSource.includes("moment.authorId === 'me' || moment.authorId === 'user'"), 'user avatar patch must rewrite user-authored moment avatars');

const pickerStorage = new Map();
const pickerCalls = { deleted: [], finalized: [] };
let pendingPickerResult = null;
let launchedPickerResult = { canceled: true, assets: null };
const asyncStorageMock = {
  getItem: async key => pickerStorage.get(key) ?? null,
  setItem: async (key, value) => { pickerStorage.set(key, value); },
  multiRemove: async keys => { keys.forEach(key => pickerStorage.delete(key)); },
};
const nativeImagePicker = loadTypeScriptModule(
  resolve(root, 'src/services/nativeImagePickerRuntime.ts'),
  {
    'react-native': { Platform: { OS: 'android' } },
    'expo-image-picker': {
      UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
      getPendingResultAsync: async () => pendingPickerResult,
      launchImageLibraryAsync: async () => launchedPickerResult,
      launchCameraAsync: async () => launchedPickerResult,
      requestCameraPermissionsAsync: async () => ({ granted: true }),
    },
    'expo-image-manipulator': {
      ImageManipulator: { manipulate: () => { throw new Error('Avatar normalization was not expected'); } },
      SaveFormat: { JPEG: 'jpeg' },
    },
    'expo-file-system': { File: class File {} },
    '@react-native-async-storage/async-storage': asyncStorageMock,
    './mediaRuntime': mediaRuntime,
    './localMediaRepository': {
      deletePersistedMediaFile: uri => {
        pickerCalls.deleted.push(uri);
        return true;
      },
      discardTemporaryMediaFile: () => false,
      finalizeLocalMediaFile: (uri, kind) => {
        pickerCalls.finalized.push({ uri, kind });
        return `file:///document/nana-media/${kind}/${uri.split('/').at(-1)}`;
      },
    },
  },
);

await nativeImagePicker.pickMomentPhotoFromLibrary({ text: 'draft survives' });
expect(
  !pickerStorage.has(nativeImagePicker.PENDING_IMAGE_PICKER_INTENT_KEY),
  'a normally canceled moment picker must clear its pending intent',
);
await nativeImagePicker.pickStickersFromLibrary({ scope: 'relationship', characterId: 'luna-id' });
expect(
  !pickerStorage.has(nativeImagePicker.PENDING_IMAGE_PICKER_INTENT_KEY),
  'a normally canceled sticker picker must clear its pending intent',
);

await asyncStorageMock.setItem(
  nativeImagePicker.PENDING_IMAGE_PICKER_INTENT_KEY,
  JSON.stringify({ kind: 'moment-photo', draft: { text: 'restored text' } }),
);
pendingPickerResult = {
  canceled: false,
  assets: [{
    uri: 'file:///cache/moment.jpg',
    fileName: 'moment.jpg',
    mimeType: 'image/jpeg',
    type: 'image',
    width: 1200,
    height: 800,
  }],
};
const recoveredMomentPhoto = await nativeImagePicker.recoverPendingImagePickerSelection();
expect(recoveredMomentPhoto?.intent.kind === 'moment-photo', 'Android recovery must preserve the moment-photo intent');
expect(
  recoveredMomentPhoto?.intent.draft?.text === 'restored text',
  'Android recovery must preserve the moment composer text',
);
expect(
  recoveredMomentPhoto?.result.phase === 'ready'
    && recoveredMomentPhoto.result.localUri.includes('/images/'),
  'Android moment recovery must promote the selected photo before restoring the composer',
);

await asyncStorageMock.setItem(
  nativeImagePicker.PENDING_IMAGE_PICKER_INTENT_KEY,
  JSON.stringify({ kind: 'sticker-import', scope: 'relationship', characterId: 'luna-id' }),
);
pendingPickerResult = {
  canceled: false,
  assets: [
    {
      uri: 'file:///cache/happy.gif',
      fileName: 'happy.gif',
      mimeType: 'image/gif',
      type: 'image',
      width: 256,
      height: 256,
      fileSize: 1024,
    },
    {
      uri: 'file:///cache/too-large.png',
      fileName: 'too-large.png',
      mimeType: 'image/png',
      type: 'image',
      width: 512,
      height: 512,
      fileSize: 9 * 1024 * 1024,
    },
  ],
};
const recoveredStickers = await nativeImagePicker.recoverPendingImagePickerSelection();
expect(
  recoveredStickers?.intent.kind === 'sticker-import'
    && recoveredStickers.intent.scope === 'relationship'
    && recoveredStickers.intent.characterId === 'luna-id',
  'Android recovery must retain the destination relationship for sticker imports',
);
expect(
  recoveredStickers?.result.purpose === 'sticker'
    && recoveredStickers.result.assets.length === 1
    && recoveredStickers.result.rejectedCount === 1
    && recoveredStickers.result.assets[0].animated,
  'Android sticker recovery must promote valid originals and reject invalid assets',
);
nativeImagePicker.discardPickedStickers(recoveredStickers.result.assets);
expect(
  pickerCalls.deleted.includes(recoveredStickers.result.assets[0].uri),
  'discarding an uncommitted recovered sticker import must remove its promoted files',
);

await asyncStorageMock.setItem(
  nativeImagePicker.PENDING_IMAGE_PICKER_INTENT_KEY,
  JSON.stringify({ kind: 'sticker-import', scope: 'global' }),
);
pendingPickerResult = { code: 'E_PICKER', message: 'Picker failed' };
const failedStickerRecovery = await nativeImagePicker.recoverPendingImagePickerSelection();
expect(
  failedStickerRecovery?.result.purpose === 'sticker'
    && failedStickerRecovery.result.errorMessage === 'Picker failed',
  'Android sticker recovery must surface native picker failures without fabricating assets',
);
expect(
  !pickerStorage.has(nativeImagePicker.PENDING_IMAGE_PICKER_INTENT_KEY),
  'Android recovery must consume the pending intent after success, cancel, or failure',
);

const avatarValue = loadTypeScriptModule(resolve(root, 'src/services/avatarValueRuntime.ts'));
expect(avatarValue.normalizeAvatarValue('🌙', 'web').ok, 'web avatar text/emoji must remain supported');
expect(avatarValue.normalizeAvatarValue('https://example.test/avatar.jpg', 'web').ok, 'web HTTPS avatars must remain supported');
expect(avatarValue.normalizeAvatarValue('data:image/png;base64,YQ==', 'web').ok, 'web image data URIs must remain supported');
expect(!avatarValue.normalizeAvatarValue('blob:https://example.test/temporary', 'web').ok, 'web blob avatars must be rejected before persistence');
expect(!avatarValue.normalizeAvatarValue('file:///outside/photo.jpg', 'native').ok, 'manually entered external native file URIs must be rejected');
expect(!avatarValue.normalizeAvatarValue('content://photos/1', 'native').ok, 'manually entered native content URIs must be rejected');
expect(avatarValue.normalizeAvatarValue('file:///doc/nana-media/avatars/user.jpg', 'native').ok, 'promoted Nana-managed native avatar URIs must be accepted');
expect(!avatarValue.hasNanaManagedAvatarPath('https://example.test/nana-media/avatars/user.jpg'), 'remote URLs must not be mistaken for Nana-managed local avatar files');
const userViewSource = readFileSync(resolve(root, 'src/components/UserView.tsx'), 'utf8');
const characterViewSource = readFileSync(resolve(root, 'src/components/CharacterView.tsx'), 'utf8');
expect(userViewSource.includes('saveUserIdentity'), 'UserView save must atomically apply the shared global identity patch');
expect(userViewSource.includes('normalizeAvatarValue'), 'UserView must validate avatar drafts before persistence');
expect(characterViewSource.includes('normalizeAvatarValue'), 'CharacterView must validate avatar drafts before persistence');
const storeSource = readFileSync(resolve(root, 'src/stores/nanaStore.ts'), 'utf8');
const sendCallSpeechStart = storeSource.indexOf('sendCallSpeech: async');
const sendCallSpeechSource = storeSource.slice(sendCallSpeechStart);
expect(sendCallSpeechSource.includes('appendCallTranscriptLine(s.callOverlay'), 'user call turns must persist as lightweight transcript lines');
expect(!sendCallSpeechSource.includes("appendCallCaptureResult(s.callOverlay, transcriptCapture, 'user')"), 'user call turns must not persist cache-backed audio URIs');

if (errors.length > 0) {
  console.error('Media runtime contract check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Media runtime contract check passed.');
}
