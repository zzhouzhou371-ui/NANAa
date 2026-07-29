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
  const provider = inferAiProviderKind(apiUrl);
  const capabilityProvider = source === 'separate' ? 'openAICompatible' : provider;
  const chatModel = clean(input.chatModel);
  const sttModel = clean(input.voiceSttModel)
    || (capabilityProvider === 'officialGemini' ? chatModel || 'gemini-2.5-flash' : 'gpt-4o-mini-transcribe');
  const ttsModel = clean(input.voiceTtsModel)
    || (capabilityProvider === 'openAICompatible' ? 'tts-1' : '');
  const enabled = Boolean(apiKey);

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
  return inferAiProviderKind(apiUrl) === 'officialGemini'
    ? 'device'
    : REMOTE_VOICE_PRESETS.join(' / ');
}
