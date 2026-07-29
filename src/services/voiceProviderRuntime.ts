import {
  diagnoseProviderCapability,
  inferAiProviderKind,
  normalizeProviderCapabilityEndpoint,
  type ProviderCapabilityDiagnostic,
  type ProviderCapabilityEndpoint,
} from './providerCapabilityRuntime';

export const REMOTE_VOICE_PRESETS = [
  'alloy',
  'coral',
  'nova',
  'onyx',
  'sage',
  'shimmer',
] as const;

export const MOSSLAND_API_URL = 'https://api.mosi.cn';
export const MOSSLAND_STT_MODEL = 'moss-transcribe';
export const MOSSLAND_TTS_MODEL = 'moss-tts';

export interface VoiceProviderStateInput {
  voiceProviderEnabled?: boolean;
  voiceApiUrl?: string;
  voiceApiKey?: string;
  voiceSttModel?: string;
  voiceTtsModel?: string;
  chatApiUrl?: string;
  chatApiKey?: string;
  chatModel?: string;
}

export interface ResolvedVoiceProvider {
  source: 'chat' | 'separate';
  stt: ProviderCapabilityEndpoint;
  tts: ProviderCapabilityEndpoint;
  sttDiagnostic: ProviderCapabilityDiagnostic;
  ttsDiagnostic: ProviderCapabilityDiagnostic;
  deviceTtsFallback: true;
}

const clean = (value: unknown, maxLength = 1_024) => (
  typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : ''
);

export function resolveVoiceProvider(input: VoiceProviderStateInput): ResolvedVoiceProvider {
  const source = input.voiceProviderEnabled ? 'separate' : 'chat';
  const apiUrl = source === 'separate'
    ? clean(input.voiceApiUrl)
    : clean(input.chatApiUrl);
  const apiKey = source === 'separate'
    ? clean(input.voiceApiKey, 4_096)
    : clean(input.chatApiKey, 4_096);
  const provider = source === 'separate' && !apiUrl
    ? 'openAICompatible'
    : inferAiProviderKind(apiUrl);
  const capabilityProvider = provider;
  const chatModel = clean(input.chatModel);
  const sttModel = capabilityProvider === 'officialMossland'
    ? MOSSLAND_STT_MODEL
    : source === 'chat' && capabilityProvider === 'officialGemini'
      ? chatModel || 'gemini-2.5-flash'
      : source === 'separate'
        ? clean(input.voiceSttModel) || 'gpt-4o-mini-transcribe'
        : 'gpt-4o-mini-transcribe';
  const ttsModel = capabilityProvider === 'officialMossland'
    ? MOSSLAND_TTS_MODEL
    : source === 'separate'
      ? clean(input.voiceTtsModel) || 'gpt-4o-mini-tts'
      : capabilityProvider === 'openAICompatible'
        ? 'gpt-4o-mini-tts'
        : '';
  const enabled = source === 'separate' ? true : Boolean(apiKey);

  const stt = normalizeProviderCapabilityEndpoint('stt', {
    enabled,
    provider: capabilityProvider,
    apiUrl,
    apiKey,
    model: sttModel,
  });
  const tts = normalizeProviderCapabilityEndpoint('tts', {
    enabled,
    provider: capabilityProvider,
    apiUrl,
    apiKey,
    model: ttsModel,
  });

  return {
    source,
    stt,
    tts,
    sttDiagnostic: diagnoseProviderCapability('stt', stt),
    ttsDiagnostic: diagnoseProviderCapability('tts', tts),
    deviceTtsFallback: true,
  };
}

export function voiceProfileHint(apiUrl: string): string {
  const provider = inferAiProviderKind(apiUrl);
  if (provider === 'officialGemini') return 'device';
  if (provider === 'officialMossland') return 'voice_id';
  return REMOTE_VOICE_PRESETS.join(' / ');
}
