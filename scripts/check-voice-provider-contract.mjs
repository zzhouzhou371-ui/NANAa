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
  }), { filename: filePath });
  return module.exports;
}

const capabilityRuntime = loadTypeScriptModule(
  resolve(root, 'src/services/providerCapabilityRuntime.ts'),
);
const runtime = loadTypeScriptModule(
  resolve(root, 'src/services/voiceProviderRuntime.ts'),
  { './providerCapabilityRuntime': capabilityRuntime },
);
const errors = [];
const expect = (condition, message) => {
  if (!condition) errors.push(message);
};

const geminiChat = runtime.resolveVoiceProvider({
  chatApiUrl: 'https://generativelanguage.googleapis.com',
  chatApiKey: 'gemini-key',
  chatModel: 'gemini-2.5-flash',
  voiceSttModel: 'gpt-4o-mini-transcribe',
});
expect(geminiChat.source === 'chat', 'voice must reuse chat settings by default');
expect(geminiChat.sttDiagnostic.status === 'ready', 'Gemini chat audio must support STT');
expect(geminiChat.stt.model === 'gemini-2.5-flash', 'Gemini STT must use the Gemini model instead of inheriting the OpenAI STT default');
expect(geminiChat.ttsDiagnostic.status === 'unsupported', 'Gemini TTS must expose device fallback instead of pretending to be remote');

const separate = runtime.resolveVoiceProvider({
  voiceProviderEnabled: true,
  voiceApiUrl: 'https://api.openai.com',
  voiceApiKey: 'voice-key',
  voiceSttModel: 'gpt-4o-mini-transcribe',
  voiceTtsModel: 'gpt-4o-mini-tts',
  chatApiUrl: 'https://generativelanguage.googleapis.com',
  chatApiKey: 'chat-key',
  chatModel: 'gemini-2.5-flash',
});
expect(separate.source === 'separate', 'enabled voice settings must not leak back to the chat provider');
expect(separate.stt.model === 'gpt-4o-mini-transcribe', 'the configured STT model must be preserved');
expect(separate.tts.model === 'gpt-4o-mini-tts', 'the configured TTS model must be preserved');
expect(separate.sttDiagnostic.status === 'ready', 'separate STT must diagnose as ready');
expect(separate.ttsDiagnostic.status === 'ready', 'separate TTS must diagnose as ready');
expect(runtime.REMOTE_VOICE_PRESETS.includes('coral'), 'the character editor must receive real voice presets');

const incompleteSeparate = runtime.resolveVoiceProvider({
  voiceProviderEnabled: true,
  voiceApiKey: 'voice-key',
});
expect(incompleteSeparate.sttDiagnostic.status === 'unconfigured', 'a separate voice service must require an explicit API URL');
expect(incompleteSeparate.ttsDiagnostic.status === 'unconfigured', 'separate TTS must not silently fall back to Gemini');

const mossland = runtime.resolveVoiceProvider({
  voiceProviderEnabled: true,
  voiceApiUrl: 'https://api.mosi.cn',
  voiceApiKey: 'mossland-key',
  voiceSttModel: 'gpt-4o-mini-transcribe',
  voiceTtsModel: 'gpt-4o-mini-tts',
});
expect(mossland.stt.provider === 'officialMossland', 'the official MOSI host must resolve to the Mossland provider');
expect(mossland.stt.model === 'moss-transcribe', 'Mossland STT must use the documented moss-transcribe model');
expect(mossland.tts.model === 'moss-tts', 'Mossland TTS must use the documented moss-tts model');
expect(mossland.sttDiagnostic.status === 'ready', 'configured Mossland STT must diagnose as ready');
expect(mossland.ttsDiagnostic.status === 'ready', 'configured Mossland TTS must diagnose as ready');
expect(runtime.voiceProfileHint('https://api.mosi.cn') === 'voice_id', 'Mossland character voice setup must request a voice_id');

const storeSource = readFileSync(resolve(root, 'src/stores/nanaStore.ts'), 'utf8');
const settingsSource = readFileSync(resolve(root, 'src/components/SettingsView.tsx'), 'utf8');
const characterSource = readFileSync(resolve(root, 'src/components/CharacterView.tsx'), 'utf8');
const profileSource = readFileSync(resolve(root, 'src/components/ProfileView.tsx'), 'utf8');
const playbackSource = readFileSync(resolve(root, 'src/services/nativeAudioPlaybackRuntime.ts'), 'utf8');
const speechSource = readFileSync(resolve(root, 'src/services/nativeSpeechRuntime.ts'), 'utf8');
const audioAiSource = readFileSync(resolve(root, 'src/services/audioAiRuntime.ts'), 'utf8');
const bubbleSource = readFileSync(resolve(root, 'src/components/ChatMessageBubble.tsx'), 'utf8');
const mediaSource = readFileSync(resolve(root, 'src/services/mediaRuntime.ts'), 'utf8');
const speakableSource = readFileSync(resolve(root, 'src/services/speakableText.ts'), 'utf8');
const transcriptionGuardSource = readFileSync(resolve(root, 'src/services/voiceTranscriptionGuard.ts'), 'utf8');

expect(storeSource.includes('resolveVoiceProvider({'), 'chat and call voice work must resolve the selected voice provider');
expect(settingsSource.includes('voiceProviderEnabled'), 'Settings must expose the separate voice provider switch');
expect(characterSource.includes('REMOTE_VOICE_PRESETS'), 'the character editor must expose supported voice choices');
expect(characterSource.includes('character-test-voice'), 'the character editor must allow voice preview before save');
expect(profileSource.includes('profile-test-voice-'), 'the character profile must expose a voice preview');
expect(playbackSource.includes('sharedVoicePlayer'), 'voice bubbles must share one player instead of allocating one per message');
expect(!playbackSource.includes('useAudioPlayer('), 'voice bubble playback must not allocate a React audio player per bubble');
expect(playbackSource.includes('updateInterval: 120'), 'voice playback must publish smooth low-cost progress updates');
expect(!playbackSource.includes("if (status.didJustFinish) {\n      setTimeout"), 'finished shared playback must preserve its final position so replay can seek accurately');
expect(speechSource.includes('getAvailableVoicesAsync'), 'device fallback must resolve an installed system voice');
expect(speechSource.includes('void Speech.stop();'), 'device speech timeout must stop audio before call recording resumes');
expect(audioAiSource.includes('is not an OpenAI voice'), 'unsupported official voice IDs must fail honestly instead of silently changing voice');
expect(audioAiSource.includes('MAX_TRANSCRIPTION_BYTES = 6 * 1024 * 1024'), 'speech transcription must keep base64 memory bounded');
expect(audioAiSource.includes("form.append('response_format', 'json')"), 'Mossland STT must request the documented synchronous JSON response');
expect(audioAiSource.includes("voice_id: voiceId"), 'Mossland TTS must send the documented voice_id field');
expect(!audioAiSource.includes('moss-transcribe-diarize'), 'Nana must not invent or opt into an undocumented streaming transcription flow');
expect(bubbleSource.includes('speakSpeechSynthesisPlan'), 'stored voice messages without remote audio must remain playable through device speech');
expect(bubbleSource.includes('onLongPress={selectMode || !hasTranscript ? undefined : handleTranscriptMenu}'), 'voice transcripts must be revealed from a long-press action instead of a permanent control');
expect(bubbleSource.includes('voice-transcript-action-'), 'the long-press transcript menu must expose a focused action target');
expect(bubbleSource.includes('const [transcriptOpen, setTranscriptOpen] = useState(false)'), 'voice transcripts must be hidden by default');
expect(bubbleSource.includes('VOICE_TRANSCRIPT_LAYOUT = LinearTransition'), 'transcript expansion must use a native layout transition instead of JS height animation');
expect(bubbleSource.includes('.duration(160)') && bubbleSource.includes('.reduceMotion(ReduceMotion.System)'), 'transcript layout motion must stay short and respect reduced-motion settings');
expect(bubbleSource.includes('layout={VOICE_TRANSCRIPT_LAYOUT}'), 'the voice bubble must apply the native layout transition to its changing content size');
expect(bubbleSource.includes('transcriptMenuOpen || canPlayVoice'), 'the transcript action must remain tappable even when the voice audio itself cannot play');
const voiceBubbleSource = bubbleSource.slice(
  bubbleSource.indexOf('function VoiceBubbleContent'),
  bubbleSource.indexOf('const formatVoiceDuration'),
);
expect(!voiceBubbleSource.includes('animate={{ opacity'), 'transcript interactions must not fade content in or out');
expect(!voiceBubbleSource.includes("type: 'spring'"), 'transcript interactions must not use spring or bounce motion');
expect(!voiceBubbleSource.includes('transcriptContentHeight'), 'voice bubbles must not render and measure a duplicate hidden transcript');
expect(!voiceBubbleSource.includes('animate={{ height'), 'voice bubbles must not animate layout height on the JS render path');
expect((voiceBubbleSource.match(/\{msg\.transcript\}/g) || []).length === 1, 'each voice bubble must render transcript text only once');
expect(bubbleSource.includes('useReducedMotion()'), 'voice playback motion must respect the device reduced-motion setting');
expect(bubbleSource.includes('playedAmount'), 'voice waveform bars must respond continuously to playback progress');
expect(bubbleSource.includes('clockFocusAmount'), 'real audio playback must keep a restrained active window on the current playback position');
expect(bubbleSource.includes('indeterminate={deviceSpeaking && !playback.canPlay}'), 'device-speech fallback must use an honest activity scan instead of fake audio amplitudes');
expect(mediaSource.includes('toSpeakableText(text)'), 'device speech plans must strip non-speakable content at their boundary');
expect(audioAiSource.includes('toSpeakableText(params.text)'), 'remote TTS requests must strip non-speakable content at their boundary');
expect(speakableSource.includes('Extended_Pictographic'), 'speakable-text cleanup must remove Unicode emoji');
expect(speakableSource.includes('SPEAKABLE_CHARACTER_PATTERN'), 'symbol-only replies must not enter TTS');
expect(storeSource.includes("if (replyType === 'voice' && charVoiceDraft)"), 'symbol-only chat replies must fall back to their original visible text without starting TTS');
expect(storeSource.includes("if (replyType === 'voice' && toSpeakableText(replyText))"), 'symbol-only call replies must remain as captions without starting TTS');
expect(transcriptionGuardSource.includes('VOICE_TRANSCRIPTION_SPEECH_DB = -45'), 'local transcription must use a conservative measured speech-energy threshold');
expect(transcriptionGuardSource.includes('VOICE_TRANSCRIPTION_MIN_VOICED_SAMPLES = 2'), 'one microphone spike must not be enough to start STT');
const transcribeUnsafeSource = audioAiSource.slice(
  audioAiSource.indexOf('async function transcribeAudioCaptureUnsafe'),
  audioAiSource.indexOf('export async function transcribeAudioCapture'),
);
expect(transcribeUnsafeSource.indexOf('evaluateLocalVoiceTranscription(') < transcribeUnsafeSource.lastIndexOf("params.capture.phase === 'ready'"), 'local silence must be checked before an existing transcript can be accepted');
expect(storeSource.includes("voiceTranscriptionStatus: localSpeechRejected ? 'unavailable' : 'failed'"), 'sent silent audio must remain a normal voice bubble instead of showing a retry failure');
expect(storeSource.includes('cancelActiveCallVoiceRequest();'), 'ending or replacing a call must cancel in-flight voice requests');
expect(storeSource.includes('stopSharedVoiceMessagePlayback();'), 'calls must release chat voice playback before starting');
expect(storeSource.includes('invalidateActiveCallVoiceInput:'), 'mute and background transitions must abort active STT, model, and TTS work');
expect(storeSource.includes("deletePersistedMediaFile(speechAudio.localUri, 'audio')"), 'call voice audio must be removed after playback');
expect(storeSource.includes("deletePersistedMediaFile(remoteAudio.localUri, 'audio')"), 'voice preview audio must be removed after playback');
expect(playbackSource.includes('activeOneShotCleanup'), 'interrupted one-shot playback must clear listeners and safety timers');

if (errors.length > 0) {
  console.error('Voice provider contract failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Voice provider contract passed.');
}
