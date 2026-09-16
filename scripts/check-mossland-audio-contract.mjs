import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');

function loadTypeScriptModule(filePath, mocks = {}) {
  const source = readFileSync(filePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filePath,
  });
  const module = { exports: {} };
  const localRequire = specifier => (
    Object.prototype.hasOwnProperty.call(mocks, specifier)
      ? mocks[specifier]
      : require(specifier)
  );
  vm.runInContext(compiled.outputText, vm.createContext({
    exports: module.exports,
    module,
    require: localRequire,
    console,
    URL,
    Uint8Array,
    FormData: class ContractFormData {
      entries = [];
      append(name, value, fileName) {
        this.entries.push([name, value, fileName]);
      }
    },
  }), { filename: filePath });
  return module.exports;
}

class MockFile {
  constructor(uri) {
    this.uri = uri;
    this.exists = true;
    this.size = 1024;
  }

  async base64() {
    return 'bTRh';
  }
}

const calls = [];
let nextResponse;
const response = ({
  ok = true,
  status = 200,
  json = {},
  bytes = [1, 2, 3],
} = {}) => ({
  ok,
  status,
  headers: { get: () => null },
  text: async () => JSON.stringify(json),
  json: async () => json,
  arrayBuffer: async () => Uint8Array.from(bytes).buffer,
});
const writableFiles = [];
const speakableTextRuntime = loadTypeScriptModule(
  resolve(root, 'src/services/speakableText.ts'),
);
const voiceTranscriptionGuardRuntime = loadTypeScriptModule(
  resolve(root, 'src/services/voiceTranscriptionGuard.ts'),
);
const runtime = loadTypeScriptModule(
  resolve(root, 'src/services/audioAiRuntime.ts'),
  {
    'expo-file-system': { File: MockFile },
    './mediaRuntime': {
      resolveSpeechToTextResult: ({ transcript, localUri, durationSec }) => ({
        phase: transcript?.trim() ? 'ready' : 'failed',
        mediaKind: 'audio',
        transcript: transcript?.trim() || undefined,
        localUri,
        durationSec,
        errorMessage: transcript?.trim() ? undefined : 'No transcript captured',
      }),
      voiceDurationFromText: text => Math.max(1, Math.ceil(text.length / 4)),
    },
    './network': {
      fetchWithTimeout: async (url, init) => {
        calls.push({ url, init });
        return nextResponse;
      },
      isOfficialGeminiBaseUrl: baseUrl => new URL(baseUrl).hostname === 'generativelanguage.googleapis.com',
      readResponsePayload: async res => {
        const text = await res.text();
        return { data: text ? JSON.parse(text) : null, text };
      },
      responseErrorMessage: (res, payload) => payload.data?.error?.message || `HTTP ${res.status}`,
    },
    './localMediaRepository': {
      createWritableMediaFile: () => {
        const file = {
          uri: 'file:///documents/moss-tts.mp3',
          create() {},
          write(bytes) {
            writableFiles.push(bytes);
          },
        };
        return file;
      },
    },
    './speakableText': speakableTextRuntime,
    './voiceTranscriptionGuard': voiceTranscriptionGuardRuntime,
  },
);

const errors = [];
const expect = (condition, message) => {
  if (!condition) errors.push(message);
};

nextResponse = response({ json: { text: '你好，娜娜' } });
const sttResult = await runtime.transcribeAudioCapture({
  capture: {
    phase: 'ready',
    mediaKind: 'audio',
    localUri: 'file:///cache/voice.m4a',
    durationMillis: 2400,
    durationSec: 2.4,
    meteringSamplesDb: [-72, -36, -31, -54],
  },
  apiUrl: 'https://api.mosi.cn/',
  apiKey: 'secret-key',
  selectedModel: 'incorrect-chat-model',
  sttModel: 'incorrect-stt-model',
  language: 'zh-CN',
});
expect(sttResult.phase === 'ready' && sttResult.transcript === '你好，娜娜', 'Mossland STT must return the synchronous transcript');
expect(calls.length === 1, 'Mossland STT must make exactly one request');
expect(calls[0]?.url === 'https://api.mosi.cn/v1/audio/transcriptions', 'Mossland STT must call the documented endpoint');
const sttEntries = calls[0]?.init?.body?.entries || [];
expect(sttEntries.map(entry => entry[0]).join(',') === 'file,model,response_format', 'Mossland STT must send only documented multipart fields');
expect(sttEntries.find(entry => entry[0] === 'file')?.[1] instanceof MockFile, 'Mossland STT must append an expo-file-system File directly');
expect(sttEntries.find(entry => entry[0] === 'file')?.[2] === undefined, 'Mossland STT must let the Expo File provide its own multipart filename');
expect(sttEntries.find(entry => entry[0] === 'model')?.[1] === 'moss-transcribe', 'Mossland STT must force moss-transcribe');
expect(sttEntries.find(entry => entry[0] === 'response_format')?.[1] === 'json', 'Mossland STT must request JSON');
expect(calls[0]?.init?.headers?.Authorization === 'Bearer secret-key', 'Mossland STT must use bearer auth without exposing the key elsewhere');
expect(!calls[0]?.init?.headers?.['Content-Type'], 'Mossland STT must let expo/fetch generate the multipart boundary');

calls.length = 0;
const providerTextOnSilence = await runtime.transcribeAudioCapture({
  capture: {
    phase: 'ready',
    mediaKind: 'audio',
    transcript: 'hallucinated provider text',
    localUri: 'file:///documents/silence.m4a',
    durationMillis: 2400,
    meteringSamplesDb: [-88, -82, -79, -84],
  },
  apiUrl: 'https://api.mosi.cn',
  apiKey: 'secret-key',
  selectedModel: 'moss-transcribe',
  language: 'zh-CN',
});
expect(
  providerTextOnSilence.phase === 'failed'
    && providerTextOnSilence.errorCode === 'noSpeechDetected'
    && providerTextOnSilence.errorStage === 'input',
  'local silence evidence must override any stale or provider-supplied transcript',
);
expect(calls.length === 0, 'metered silence must never make a remote STT request');

calls.length = 0;
const unsupportedAndroidRecording = await runtime.transcribeAudioCapture({
  capture: {
    phase: 'processing',
    mediaKind: 'audio',
    localUri: 'file:///documents/legacy-android-recording.3gp',
    durationSec: 2,
  },
  apiUrl: 'https://api.mosi.cn',
  apiKey: 'secret-key',
  selectedModel: 'moss-transcribe',
  language: 'zh-CN',
});
expect(
  unsupportedAndroidRecording.phase === 'failed'
    && unsupportedAndroidRecording.errorStage === 'input'
    && unsupportedAndroidRecording.errorMessage.includes('3GP'),
  'legacy Android 3GP recordings must fail locally with an actionable format diagnostic',
);
expect(calls.length === 0, 'unsupported Android 3GP must fail before a provider request');

calls.length = 0;
nextResponse = response({
  json: {
    candidates: [{ content: { parts: [{ text: 'M4A transcript' }] } }],
  },
});
const geminiM4a = await runtime.transcribeAudioCapture({
  capture: {
    phase: 'processing',
    mediaKind: 'audio',
    localUri: 'file:///documents/android-recording.m4a',
    durationSec: 2,
  },
  apiUrl: 'https://generativelanguage.googleapis.com',
  apiKey: 'secret-key',
  selectedModel: 'gemini-2.5-flash',
  language: 'zh-CN',
});
const geminiBody = JSON.parse(calls[0]?.init?.body || '{}');
expect(geminiM4a.phase === 'ready', 'Gemini must accept the Android M4A transcription path');
expect(
  geminiBody.contents?.[0]?.parts?.[1]?.inlineData?.mimeType === 'audio/mp4',
  'M4A recordings must use their MP4 container MIME type for Gemini',
);

calls.length = 0;
nextResponse = response();
const ttsResult = await runtime.synthesizeSpeechAudio({
  text: '[Sticker: wave] Good night 😊',
  apiUrl: 'https://api.mosi.cn',
  apiKey: 'secret-key',
  voiceProfileId: 'voice_luna_01',
  ttsModel: 'incorrect-model',
});
expect(ttsResult.phase === 'ready' && ttsResult.localUri === 'file:///documents/moss-tts.mp3', 'Mossland TTS must persist generated audio');
expect(calls.length === 1, 'Mossland TTS must make exactly one request');
expect(calls[0]?.url === 'https://api.mosi.cn/v1/audio/speech', 'Mossland TTS must call the documented endpoint');
const ttsBody = JSON.parse(calls[0]?.init?.body || '{}');
expect(Object.keys(ttsBody).join(',') === 'model,input,voice_id,response_format,delivery_method', 'Mossland TTS must send only documented JSON fields');
expect(ttsBody.model === 'moss-tts', 'Mossland TTS must force moss-tts');
expect(ttsBody.input === 'Good night', 'remote TTS must remove sticker markers and emoji from spoken input');
expect(ttsBody.voice_id === 'voice_luna_01', 'Mossland TTS must preserve the character voice_id');
expect(ttsBody.delivery_method === 'audio', 'Mossland TTS must request binary audio delivery');
expect(writableFiles.length === 1, 'Mossland TTS must write the returned audio exactly once');

calls.length = 0;
const missingVoice = await runtime.synthesizeSpeechAudio({
  text: '你好',
  apiUrl: 'https://api.mosi.cn',
  apiKey: 'secret-key',
});
expect(missingVoice.phase === 'failed' && missingVoice.errorMessage.includes('voice_id'), 'missing Mossland voice_id must be explicit and retryable');
expect(calls.length === 0, 'missing Mossland voice_id must fail before a network request');

calls.length = 0;
nextResponse = response({
  ok: false,
  status: 503,
  json: { error: { message: 'temporarily unavailable' } },
});
const failedStt = await runtime.transcribeAudioCapture({
  capture: {
    phase: 'ready',
    mediaKind: 'audio',
    localUri: 'file:///documents/retained.m4a',
    durationSec: 3,
  },
  apiUrl: 'https://api.mosi.cn',
  apiKey: 'secret-key',
  selectedModel: 'moss-transcribe',
  language: 'zh-CN',
});
expect(failedStt.phase === 'failed', 'failed Mossland STT must report failure');
expect(failedStt.errorStage === 'response', 'failed Mossland HTTP responses must retain the response-stage diagnostic');
expect(failedStt.localUri === 'file:///documents/retained.m4a', 'failed Mossland STT must retain the local audio URI for retry');
expect(failedStt.durationSec === 3, 'failed Mossland STT must retain recorded duration');

calls.length = 0;
nextResponse = response({
  ok: false,
  status: 401,
  json: { error: { message: 'bad credential secret-key at https://api.mosi.cn?api_key=secret-key' } },
});
const redactedStt = await runtime.transcribeAudioCapture({
  capture: {
    phase: 'ready',
    mediaKind: 'audio',
    localUri: 'file:///documents/retained.m4a',
    durationSec: 3,
  },
  apiUrl: 'https://api.mosi.cn',
  apiKey: 'secret-key',
  selectedModel: 'moss-transcribe',
  language: 'zh-CN',
});
expect(!redactedStt.errorMessage.includes('secret-key'), 'Mossland diagnostics must never echo the configured API key');
expect(redactedStt.errorMessage.includes('[REDACTED]'), 'Mossland diagnostics must redact secrets without flattening the provider response');

const networkSource = readFileSync(resolve(root, 'src/services/network.ts'), 'utf8');
expect(networkSource.includes("import { fetch as expoFetch } from 'expo/fetch';"), 'network requests must use the SDK 55 expo/fetch implementation');
expect(networkSource.includes('return await expoFetch('), 'the timeout wrapper must execute expo/fetch');

if (errors.length > 0) {
  console.error('Mossland audio contract failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Mossland audio contract passed.');
}
