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

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';
const OPENAI_STT_MODELS = ['gpt-4o-mini-transcribe', 'whisper-1'];
const OPENAI_TTS_MODELS = ['gpt-4o-mini-tts', 'tts-1'];
const OPENAI_VOICES = new Set([
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable',
  'nova', 'onyx', 'sage', 'shimmer', 'verse',
]);

const normalizeBaseUrl = (apiUrl: string) => (apiUrl || GEMINI_BASE_URL).replace(/\/+$/, '');

const openAIRootUrl = (baseUrl: string) => baseUrl.replace(/\/(v1|v1beta)$/i, '');

const mimeTypeForUri = (uri: string, fallback = 'audio/m4a') => {
  const lowered = uri.toLowerCase().split('?')[0];
  if (lowered.endsWith('.mp3')) return 'audio/mpeg';
  if (lowered.endsWith('.wav')) return 'audio/wav';
  if (lowered.endsWith('.aac')) return 'audio/aac';
  if (lowered.endsWith('.caf')) return 'audio/x-caf';
  if (lowered.endsWith('.webm')) return 'audio/webm';
  if (lowered.endsWith('.mp4')) return 'audio/mp4';
  return fallback;
};

const fileNameForUri = (uri: string, fallback = 'voice.m4a') => {
  const clean = uri.split('?')[0].split('#')[0];
  const name = clean.substring(clean.lastIndexOf('/') + 1);
  return name || fallback;
};

const readApiError = async (response: Response) => {
  const payload = await readResponsePayload(response);
  return responseErrorMessage(response, payload);
};

const shouldTryAlternateAudioModel = (status: number) => (
  status === 400 || status === 404 || status === 422
);

const openAIHeaders = (apiKey: string) => ({
  Authorization: `Bearer ${apiKey.trim()}`,
});

async function transcribeOpenAICompatible(params: {
  baseUrl: string;
  apiKey: string;
  capture: MediaCaptureResult;
  language: string;
}): Promise<MediaCaptureResult> {
  if (!params.capture.localUri) {
    return { phase: 'failed', mediaKind: 'audio', errorMessage: 'No audio captured for transcription' };
  }

  const file = new File(params.capture.localUri);
  const endpoint = `${openAIRootUrl(params.baseUrl)}/v1/audio/transcriptions`;
  let lastError = '';

  for (const model of OPENAI_STT_MODELS) {
    const form = new FormData();
    form.append('file', file as unknown as Blob, fileNameForUri(params.capture.localUri));
    form.append('model', model);
    form.append('language', params.language.split('-')[0] || 'zh');

    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: openAIHeaders(params.apiKey),
      body: form,
    });

    if (response.ok) {
      const data = await response.json();
      return resolveSpeechToTextResult({
        transcript: data.text || data.transcript || '',
        localUri: params.capture.localUri,
        durationSec: params.capture.durationSec,
      });
    }

    lastError = await readApiError(response);
    if (!shouldTryAlternateAudioModel(response.status)) break;
  }

  return {
    phase: 'failed',
    mediaKind: 'audio',
    localUri: params.capture.localUri,
    durationSec: params.capture.durationSec,
    errorMessage: lastError || 'Speech-to-text failed',
  };
}

async function transcribeGeminiAudio(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  capture: MediaCaptureResult;
  language: string;
}): Promise<MediaCaptureResult> {
  if (!params.capture.localUri) {
    return { phase: 'failed', mediaKind: 'audio', errorMessage: 'No audio captured for transcription' };
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
  });

  if (!response.ok) {
    return {
      phase: 'failed',
      mediaKind: 'audio',
      localUri: params.capture.localUri,
      durationSec: params.capture.durationSec,
      errorMessage: await readApiError(response),
    };
  }

  const data = await response.json();
  return resolveSpeechToTextResult({
    transcript: data.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('').trim(),
    localUri: params.capture.localUri,
    durationSec: params.capture.durationSec,
  });
}

async function transcribeAudioCaptureUnsafe(params: {
  capture: MediaCaptureResult;
  apiUrl: string;
  apiKey: string;
  selectedModel: string;
  language: string;
}): Promise<MediaCaptureResult> {
  if (params.capture.phase === 'ready' && params.capture.transcript?.trim()) return params.capture;
  if (!params.capture.localUri) {
    return { phase: 'failed', mediaKind: 'audio', errorMessage: 'No audio captured for transcription' };
  }
  if (!params.apiKey.trim()) {
    return {
      phase: 'failed',
      mediaKind: 'audio',
      localUri: params.capture.localUri,
      durationSec: params.capture.durationSec,
      errorMessage: 'API key required for speech-to-text',
    };
  }

  const baseUrl = normalizeBaseUrl(params.apiUrl);
  if (isOfficialGeminiBaseUrl(baseUrl)) {
    return transcribeGeminiAudio({
      baseUrl,
      apiKey: params.apiKey,
      model: params.selectedModel,
      capture: params.capture,
      language: params.language,
    });
  }

  return transcribeOpenAICompatible({
    baseUrl,
    apiKey: params.apiKey,
    capture: params.capture,
    language: params.language,
  });
}

export async function transcribeAudioCapture(params: {
  capture: MediaCaptureResult;
  apiUrl: string;
  apiKey: string;
  selectedModel: string;
  language: string;
}): Promise<MediaCaptureResult> {
  try {
    return await transcribeAudioCaptureUnsafe(params);
  } catch (error) {
    return {
      phase: 'failed',
      mediaKind: 'audio',
      localUri: params.capture.localUri,
      durationSec: params.capture.durationSec,
      errorMessage: error instanceof Error ? error.message : 'Speech-to-text failed',
    };
  }
}

const normalizeOpenAIVoice = (voiceProfileId?: string) => {
  const value = voiceProfileId?.trim().toLowerCase();
  return value && OPENAI_VOICES.has(value) ? value : 'alloy';
};

async function synthesizeOpenAICompatible(params: {
  baseUrl: string;
  apiKey: string;
  text: string;
  voiceProfileId?: string;
}): Promise<MediaCaptureResult> {
  const endpoint = `${openAIRootUrl(params.baseUrl)}/v1/audio/speech`;
  let lastError = '';

  for (const model of OPENAI_TTS_MODELS) {
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        ...openAIHeaders(params.apiKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: params.text,
        voice: normalizeOpenAIVoice(params.voiceProfileId),
        response_format: 'mp3',
      }),
    });

    if (response.ok) {
      const bytes = new Uint8Array(await response.arrayBuffer());
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

    lastError = await readApiError(response);
    if (!shouldTryAlternateAudioModel(response.status)) break;
  }

  return {
    phase: 'failed',
    mediaKind: 'audio',
    transcript: params.text,
    errorMessage: lastError || 'Text-to-speech failed',
  };
}

async function synthesizeSpeechAudioUnsafe(params: {
  text: string;
  apiUrl: string;
  apiKey: string;
  voiceProfileId?: string;
}): Promise<MediaCaptureResult> {
  const text = params.text.trim();
  if (!text) {
    return { phase: 'failed', mediaKind: 'audio', errorMessage: 'No text to synthesize' };
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

  const baseUrl = normalizeBaseUrl(params.apiUrl);
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
  });
}

export async function synthesizeSpeechAudio(params: {
  text: string;
  apiUrl: string;
  apiKey: string;
  voiceProfileId?: string;
}): Promise<MediaCaptureResult> {
  try {
    return await synthesizeSpeechAudioUnsafe(params);
  } catch (error) {
    return {
      phase: 'failed',
      mediaKind: 'audio',
      transcript: params.text.trim(),
      durationSec: voiceDurationFromText(params.text),
      errorMessage: error instanceof Error ? error.message : 'Text-to-speech failed',
    };
  }
}
