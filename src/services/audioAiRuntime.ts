import { File } from 'expo-file-system';
import {
  resolveSpeechToTextResult,
  voiceDurationFromText,
  type MediaCaptureResult,
} from './mediaRuntime';
import {
  fetchWithTimeout,
  isOfficialGeminiBaseUrl,
  readResponsePayload,
  responseErrorMessage,
} from './network';
import { createWritableMediaFile } from './localMediaRepository';
import { toSpeakableText } from './speakableText';
import {
  evaluateLocalVoiceTranscription,
  type LocalVoiceTranscriptionRejection,
} from './voiceTranscriptionGuard';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';
const OPENAI_STT_MODELS = ['gpt-4o-mini-transcribe', 'whisper-1'];
const OPENAI_TTS_MODELS = ['tts-1', 'gpt-4o-mini-tts'];
const MOSSLAND_STT_MODEL = 'moss-transcribe';
const MOSSLAND_TTS_MODEL = 'moss-tts';
const MAX_TRANSCRIPTION_BYTES = 6 * 1024 * 1024;
const MAX_SYNTHESIZED_AUDIO_BYTES = 8 * 1024 * 1024;
const MAX_TTS_TEXT_LENGTH = 4_000;
const OPENAI_VOICES = new Set([
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable',
  'nova', 'onyx', 'sage', 'shimmer', 'verse',
]);

export type AudioAiErrorStage = 'input' | 'configuration' | 'request' | 'response' | 'decode' | 'storage';
export type AudioAiCaptureResult = MediaCaptureResult & {
  errorStage?: AudioAiErrorStage;
  errorCode?: LocalVoiceTranscriptionRejection;
};

const normalizeBaseUrl = (apiUrl: string) => (apiUrl || GEMINI_BASE_URL).replace(/\/+$/, '');

const openAIRootUrl = (baseUrl: string) => baseUrl.replace(/\/(v1|v1beta)$/i, '');

const hostnameIs = (baseUrl: string, hostname: string) => {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === hostname;
  } catch {
    return false;
  }
};

export const isOfficialMosslandBaseUrl = (baseUrl: string) => (
  hostnameIs(baseUrl, 'api.mosi.cn')
);

const isOfficialOpenAIBaseUrl = (baseUrl: string) => (
  hostnameIs(baseUrl, 'api.openai.com')
);

const mimeTypeForUri = (uri: string, fallback = 'audio/mp4') => {
  const lowered = uri.toLowerCase().split('?')[0];
  if (lowered.endsWith('.mp3')) return 'audio/mpeg';
  if (lowered.endsWith('.wav')) return 'audio/wav';
  if (lowered.endsWith('.aac')) return 'audio/aac';
  if (lowered.endsWith('.caf')) return 'audio/x-caf';
  if (lowered.endsWith('.webm')) return 'audio/webm';
  if (lowered.endsWith('.m4a') || lowered.endsWith('.mp4')) return 'audio/mp4';
  if (lowered.endsWith('.3gp') || lowered.endsWith('.3gpp')) return 'audio/3gpp';
  return fallback;
};

const usesUnsupportedAndroid3gpRecording = (uri: string) => {
  const lowered = uri.toLowerCase().split(/[?#]/)[0];
  return lowered.endsWith('.3gp') || lowered.endsWith('.3gpp');
};

const redactAudioAiError = (value: unknown, apiKey?: string) => {
  let message = value instanceof Error
    ? value.message
    : typeof value === 'string'
      ? value
      : '';
  const trimmedKey = apiKey?.trim();
  if (trimmedKey) message = message.split(trimmedKey).join('[REDACTED]');
  return message
    .replace(/(authorization\s*[:=]\s*bearer)\s+[^\s,;]+/gi, '$1 [REDACTED]')
    .replace(/([?&](?:key|api[_-]?key|access[_-]?token)=)[^&#\s]+/gi, '$1[REDACTED]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320);
};

const failedAudioAiCapture = (
  capture: MediaCaptureResult,
  errorStage: AudioAiErrorStage,
  errorMessage: unknown,
  apiKey?: string,
  errorCode?: LocalVoiceTranscriptionRejection,
): AudioAiCaptureResult => ({
  phase: 'failed',
  mediaKind: 'audio',
  localUri: capture.localUri,
  durationMillis: capture.durationMillis,
  durationSec: capture.durationSec,
  transcript: capture.transcript,
  errorStage,
  errorCode,
  errorMessage: redactAudioAiError(errorMessage, apiKey) || 'Speech processing failed',
});

const withFailureStage = (
  result: MediaCaptureResult,
  errorStage: AudioAiErrorStage,
  apiKey?: string,
): AudioAiCaptureResult => (
  result.phase === 'failed'
    ? {
        ...result,
        errorStage,
        errorMessage: redactAudioAiError(result.errorMessage, apiKey) || 'Speech processing failed',
      }
    : result
);

const readApiError = async (response: Response, apiKey?: string) => {
  const payload = await readResponsePayload(response);
  return redactAudioAiError(responseErrorMessage(response, payload), apiKey);
};

const shouldTryAlternateAudioModel = (status: number) => (
  status === 400 || status === 404 || status === 422
);

const openAIHeaders = (apiKey: string) => ({
  Authorization: `Bearer ${apiKey.trim()}`,
});

const candidateModels = (
  preferred: string | undefined,
  defaults: readonly string[],
  allowFallbacks: boolean,
) => {
  const preferredModel = preferred?.trim();
  if (preferredModel && !allowFallbacks) return [preferredModel];
  return [...new Set(
    [preferredModel, ...defaults].filter((value): value is string => Boolean(value)),
  )];
};

async function transcribeOpenAICompatible(params: {
  baseUrl: string;
  apiKey: string;
  capture: MediaCaptureResult;
  language: string;
  model?: string;
  signal?: AbortSignal;
}): Promise<AudioAiCaptureResult> {
  if (!params.capture.localUri) {
    return failedAudioAiCapture(params.capture, 'input', 'No audio captured for transcription');
  }

  const file = new File(params.capture.localUri);
  const endpoint = `${openAIRootUrl(params.baseUrl)}/v1/audio/transcriptions`;
  let lastError = '';

  for (const model of candidateModels(
    params.model,
    OPENAI_STT_MODELS,
    isOfficialOpenAIBaseUrl(params.baseUrl),
  )) {
    const form = new FormData();
    form.append('file', file);
    form.append('model', model);
    form.append('language', params.language.split('-')[0] || 'zh');

    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: openAIHeaders(params.apiKey),
      body: form,
      signal: params.signal,
    }, 30_000);

    if (response.ok) {
      const data = await response.json();
      return withFailureStage(resolveSpeechToTextResult({
        transcript: data.text || data.transcript || '',
        localUri: params.capture.localUri,
        durationSec: params.capture.durationSec,
      }), 'decode', params.apiKey);
    }

    lastError = await readApiError(response, params.apiKey);
    if (!shouldTryAlternateAudioModel(response.status)) break;
  }

  return failedAudioAiCapture(
    params.capture,
    'response',
    lastError || 'Speech-to-text failed',
    params.apiKey,
  );
}

async function transcribeMossland(params: {
  baseUrl: string;
  apiKey: string;
  capture: MediaCaptureResult;
  signal?: AbortSignal;
}): Promise<AudioAiCaptureResult> {
  if (!params.capture.localUri) {
    return failedAudioAiCapture(params.capture, 'input', 'No audio captured for transcription');
  }

  const form = new FormData();
  form.append('file', new File(params.capture.localUri));
  form.append('model', MOSSLAND_STT_MODEL);
  form.append('response_format', 'json');
  const response = await fetchWithTimeout(
    `${openAIRootUrl(params.baseUrl)}/v1/audio/transcriptions`,
    {
      method: 'POST',
      headers: openAIHeaders(params.apiKey),
      body: form,
      signal: params.signal,
    },
    30_000,
  );
  const payload = await readResponsePayload(response);
  if (!response.ok) {
    return failedAudioAiCapture(
      params.capture,
      'response',
      responseErrorMessage(response, payload),
      params.apiKey,
    );
  }

  return withFailureStage(resolveSpeechToTextResult({
    transcript: typeof payload.data?.text === 'string'
      ? payload.data.text
      : payload.text,
    localUri: params.capture.localUri,
    durationSec: params.capture.durationSec,
  }), 'decode', params.apiKey);
}

async function transcribeGeminiAudio(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  capture: MediaCaptureResult;
  language: string;
  signal?: AbortSignal;
}): Promise<AudioAiCaptureResult> {
  if (!params.capture.localUri) {
    return failedAudioAiCapture(params.capture, 'input', 'No audio captured for transcription');
  }

  const file = new File(params.capture.localUri);
  const base64 = await file.base64();
  const endpoint = `${params.baseUrl}/v1beta/models/${params.model || 'gemini-2.5-flash'}:generateContent?key=${params.apiKey.trim()}`;
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          {
            text: `Transcribe this voice message in ${params.language || 'zh-CN'}. Return only the spoken text, with no explanation.`,
          },
          {
            inlineData: {
              mimeType: mimeTypeForUri(params.capture.localUri),
              data: base64,
            },
          },
        ],
      }],
      generationConfig: { temperature: 0 },
    }),
    signal: params.signal,
  }, 30_000);

  if (!response.ok) {
    return failedAudioAiCapture(
      params.capture,
      'response',
      await readApiError(response, params.apiKey),
      params.apiKey,
    );
  }

  const data = await response.json();
  return withFailureStage(resolveSpeechToTextResult({
    transcript: data.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('').trim(),
    localUri: params.capture.localUri,
    durationSec: params.capture.durationSec,
  }), 'decode', params.apiKey);
}

async function transcribeAudioCaptureUnsafe(params: {
  capture: MediaCaptureResult;
  apiUrl: string;
  apiKey: string;
  selectedModel: string;
  language: string;
  sttModel?: string;
  minimumDurationMillis?: number;
  signal?: AbortSignal;
}): Promise<AudioAiCaptureResult> {
  if (!params.capture.localUri) {
    if (params.capture.phase === 'ready' && params.capture.transcript?.trim()) return params.capture;
    return failedAudioAiCapture(params.capture, 'input', 'No audio captured for transcription');
  }
  const localDecision = evaluateLocalVoiceTranscription(
    params.capture,
    params.minimumDurationMillis,
  );
  if (!localDecision.allowed) {
    const chinese = params.language.toLowerCase().startsWith('zh');
    const message = localDecision.rejection === 'audioTooShort'
      ? (chinese ? '语音时间太短，请再说一次。' : 'The voice recording is too short. Please try again.')
      : (chinese ? '没有听到清晰的声音，请再说一次。' : 'No clear speech was detected. Please try again.');
    return failedAudioAiCapture(
      params.capture,
      'input',
      message,
      params.apiKey,
      localDecision.rejection,
    );
  }
  if (params.capture.phase === 'ready' && params.capture.transcript?.trim()) return params.capture;
  if (usesUnsupportedAndroid3gpRecording(params.capture.localUri)) {
    return failedAudioAiCapture(
      params.capture,
      'input',
      'This 3GP recording cannot be transcribed. Record a new voice message and try again.',
      params.apiKey,
    );
  }
  if (!params.apiKey.trim()) {
    return failedAudioAiCapture(
      params.capture,
      'configuration',
      'API key required for speech-to-text',
    );
  }
  if (!params.apiUrl.trim()) {
    return failedAudioAiCapture(
      params.capture,
      'configuration',
      'Voice API URL is required for speech-to-text',
      params.apiKey,
    );
  }
  const audioFile = new File(params.capture.localUri);
  if (!audioFile.exists) {
    return failedAudioAiCapture(
      params.capture,
      'input',
      'The recorded audio file is no longer available',
      params.apiKey,
    );
  }
  if (audioFile.size > MAX_TRANSCRIPTION_BYTES) {
    return failedAudioAiCapture(
      params.capture,
      'input',
      'The voice recording is too large to transcribe safely',
      params.apiKey,
    );
  }

  const baseUrl = normalizeBaseUrl(params.apiUrl);
  if (isOfficialMosslandBaseUrl(baseUrl)) {
    return transcribeMossland({
      baseUrl,
      apiKey: params.apiKey,
      capture: params.capture,
      signal: params.signal,
    });
  }
  if (isOfficialGeminiBaseUrl(baseUrl)) {
    return transcribeGeminiAudio({
      baseUrl,
      apiKey: params.apiKey,
      model: params.sttModel || params.selectedModel,
      capture: params.capture,
      language: params.language,
      signal: params.signal,
    });
  }

  return transcribeOpenAICompatible({
    baseUrl,
    apiKey: params.apiKey,
    capture: params.capture,
    language: params.language,
    model: params.sttModel,
    signal: params.signal,
  });
}

export async function transcribeAudioCapture(params: {
  capture: MediaCaptureResult;
  apiUrl: string;
  apiKey: string;
  selectedModel: string;
  language: string;
  sttModel?: string;
  minimumDurationMillis?: number;
  signal?: AbortSignal;
}): Promise<AudioAiCaptureResult> {
  try {
    return await transcribeAudioCaptureUnsafe(params);
  } catch (error) {
    return failedAudioAiCapture(
      params.capture,
      'request',
      error instanceof Error ? error.message : 'Speech-to-text failed',
      params.apiKey,
    );
  }
}

const resolveOpenAIVoice = (baseUrl: string, voiceProfileId?: string) => {
  const value = voiceProfileId?.replace(/\s+/g, ' ').trim().slice(0, 80);
  let officialOpenAI = false;
  try {
    officialOpenAI = new URL(baseUrl).hostname.toLowerCase() === 'api.openai.com';
  } catch {
    // The provider capability gate reports malformed URLs before this request.
  }
  if (!value) return { voice: 'alloy' };
  if (officialOpenAI && !OPENAI_VOICES.has(value.toLowerCase())) {
    return {
      voice: '',
      errorMessage: `"${value}" is not an OpenAI voice. Choose a supported voice or use device speech.`,
    };
  }
  return { voice: officialOpenAI ? value.toLowerCase() : value };
};

async function synthesizeOpenAICompatible(params: {
  baseUrl: string;
  apiKey: string;
  text: string;
  voiceProfileId?: string;
  model?: string;
  signal?: AbortSignal;
}): Promise<MediaCaptureResult> {
  const endpoint = `${openAIRootUrl(params.baseUrl)}/v1/audio/speech`;
  const resolvedVoice = resolveOpenAIVoice(params.baseUrl, params.voiceProfileId);
  if (!resolvedVoice.voice) {
    return {
      phase: 'failed',
      mediaKind: 'audio',
      transcript: params.text,
      errorMessage: resolvedVoice.errorMessage,
    };
  }
  let lastError = '';

  for (const model of candidateModels(
    params.model,
    OPENAI_TTS_MODELS,
    isOfficialOpenAIBaseUrl(params.baseUrl),
  )) {
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        ...openAIHeaders(params.apiKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: params.text,
        voice: resolvedVoice.voice,
        response_format: 'mp3',
      }),
      signal: params.signal,
    }, 30_000);

    if (response.ok) {
      const declaredLength = Number(response.headers.get('content-length') || 0);
      if (declaredLength > MAX_SYNTHESIZED_AUDIO_BYTES) {
        return {
          phase: 'failed',
          mediaKind: 'audio',
          transcript: params.text,
          errorMessage: 'The synthesized voice response is too large',
        };
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_SYNTHESIZED_AUDIO_BYTES) {
        return {
          phase: 'failed',
          mediaKind: 'audio',
          transcript: params.text,
          errorMessage: 'The synthesized voice response is too large',
        };
      }
      const file = createWritableMediaFile('audio', `tts-${Date.now()}-${Math.round(Math.random() * 10000)}.mp3`);
      file.create({ overwrite: true, intermediates: true });
      file.write(bytes);
      return {
        phase: 'ready',
        mediaKind: 'audio',
        transcript: params.text,
        localUri: file.uri,
        durationSec: voiceDurationFromText(params.text),
      };
    }

    lastError = await readApiError(response, params.apiKey);
    if (!shouldTryAlternateAudioModel(response.status)) break;
  }

  return {
    phase: 'failed',
    mediaKind: 'audio',
    transcript: params.text,
    errorMessage: lastError || 'Text-to-speech failed',
  };
}

const writeSynthesizedAudio = async (
  response: Response,
  text: string,
): Promise<MediaCaptureResult> => {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_SYNTHESIZED_AUDIO_BYTES) {
    return {
      phase: 'failed',
      mediaKind: 'audio',
      transcript: text,
      errorMessage: 'The synthesized voice response is too large',
    };
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_SYNTHESIZED_AUDIO_BYTES) {
    return {
      phase: 'failed',
      mediaKind: 'audio',
      transcript: text,
      errorMessage: 'The synthesized voice response is too large',
    };
  }
  const file = createWritableMediaFile(
    'audio',
    `tts-${Date.now()}-${Math.round(Math.random() * 10000)}.mp3`,
  );
  file.create({ overwrite: true, intermediates: true });
  file.write(bytes);
  return {
    phase: 'ready',
    mediaKind: 'audio',
    transcript: text,
    localUri: file.uri,
    durationSec: voiceDurationFromText(text),
  };
};

async function synthesizeMossland(params: {
  baseUrl: string;
  apiKey: string;
  text: string;
  voiceProfileId?: string;
  signal?: AbortSignal;
}): Promise<MediaCaptureResult> {
  const voiceId = params.voiceProfileId?.trim().slice(0, 160);
  if (!voiceId) {
    return {
      phase: 'failed',
      mediaKind: 'audio',
      transcript: params.text,
      durationSec: voiceDurationFromText(params.text),
      errorMessage: 'Mossland requires a voice_id before remote speech can be generated',
    };
  }

  const response = await fetchWithTimeout(
    `${openAIRootUrl(params.baseUrl)}/v1/audio/speech`,
    {
      method: 'POST',
      headers: {
        ...openAIHeaders(params.apiKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MOSSLAND_TTS_MODEL,
        input: params.text,
        voice_id: voiceId,
        response_format: 'mp3',
        delivery_method: 'audio',
      }),
      signal: params.signal,
    },
    30_000,
  );
  if (!response.ok) {
    return {
      phase: 'failed',
      mediaKind: 'audio',
      transcript: params.text,
      durationSec: voiceDurationFromText(params.text),
      errorMessage: await readApiError(response, params.apiKey),
    };
  }
  return writeSynthesizedAudio(response, params.text);
}

async function synthesizeSpeechAudioUnsafe(params: {
  text: string;
  apiUrl: string;
  apiKey: string;
  voiceProfileId?: string;
  ttsModel?: string;
  signal?: AbortSignal;
}): Promise<MediaCaptureResult> {
  const text = toSpeakableText(params.text).slice(0, MAX_TTS_TEXT_LENGTH);
  if (!text) {
    return { phase: 'failed', mediaKind: 'audio', errorMessage: 'No speakable text to synthesize' };
  }
  if (!params.apiKey.trim()) {
    return {
      phase: 'failed',
      mediaKind: 'audio',
      transcript: text,
      durationSec: voiceDurationFromText(text),
      errorMessage: 'API key required for remote text-to-speech',
    };
  }
  if (!params.apiUrl.trim()) {
    return {
      phase: 'failed',
      mediaKind: 'audio',
      transcript: text,
      durationSec: voiceDurationFromText(text),
      errorMessage: 'Voice API URL is required for remote text-to-speech',
    };
  }

  const baseUrl = normalizeBaseUrl(params.apiUrl);
  if (isOfficialMosslandBaseUrl(baseUrl)) {
    return synthesizeMossland({
      baseUrl,
      apiKey: params.apiKey,
      text,
      voiceProfileId: params.voiceProfileId,
      signal: params.signal,
    });
  }
  if (isOfficialGeminiBaseUrl(baseUrl)) {
    return {
      phase: 'failed',
      mediaKind: 'audio',
      transcript: text,
      durationSec: voiceDurationFromText(text),
      errorMessage: 'Remote speech audio is not configured for Gemini; using device speech fallback',
    };
  }

  return synthesizeOpenAICompatible({
    baseUrl,
    apiKey: params.apiKey,
    text,
    voiceProfileId: params.voiceProfileId,
    model: params.ttsModel,
    signal: params.signal,
  });
}

export async function synthesizeSpeechAudio(params: {
  text: string;
  apiUrl: string;
  apiKey: string;
  voiceProfileId?: string;
  ttsModel?: string;
  signal?: AbortSignal;
}): Promise<MediaCaptureResult> {
  try {
    return await synthesizeSpeechAudioUnsafe(params);
  } catch (error) {
    return {
      phase: 'failed',
      mediaKind: 'audio',
      transcript: params.text.trim(),
      durationSec: voiceDurationFromText(params.text),
      errorMessage: redactAudioAiError(
        error instanceof Error ? error.message : 'Text-to-speech failed',
        params.apiKey,
      ),
    };
  }
}
