export type AiProviderCapability = 'text' | 'vision' | 'stt' | 'tts';
export type AiProviderKind = 'officialGemini' | 'officialMossland' | 'openAICompatible';
export type CapabilityStatus = 'ready' | 'disabled' | 'unconfigured' | 'unsupported' | 'invalid';

export interface ProviderCapabilityEndpoint {
  enabled: boolean;
  provider: AiProviderKind;
  apiUrl: string;
  apiKey: string;
  model: string;
}

export interface ProviderCapabilitySettings {
  schemaVersion: 1;
  text: ProviderCapabilityEndpoint;
  vision: ProviderCapabilityEndpoint;
  stt: ProviderCapabilityEndpoint;
  tts: ProviderCapabilityEndpoint;
}

export interface ProviderCapabilityDiagnostic {
  capability: AiProviderCapability;
  status: CapabilityStatus;
  configured: boolean;
  supportedByRuntime: boolean;
  provider: AiProviderKind;
  missingFields: ('apiUrl' | 'apiKey' | 'model')[];
  message: string;
  warnings: string[];
}

type CapabilityEndpointInput = Partial<ProviderCapabilityEndpoint> | null | undefined;

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';
const DEFAULT_MODELS: Record<AiProviderKind, Record<AiProviderCapability, string>> = {
  officialGemini: {
    text: 'gemini-2.5-flash',
    vision: 'gemini-2.5-flash',
    stt: 'gemini-2.5-flash',
    tts: '',
  },
  officialMossland: {
    text: '',
    vision: '',
    stt: 'moss-transcribe',
    tts: 'moss-tts',
  },
  openAICompatible: {
    text: '',
    vision: '',
    stt: 'gpt-4o-mini-transcribe',
    tts: 'tts-1',
  },
};

const cleanString = (value: unknown, maxLength = 512) => (
  typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : ''
);

const normalizeUrl = (value: unknown) => cleanString(value, 1_024).replace(/\/+$/, '');

export function inferAiProviderKind(apiUrl: unknown): AiProviderKind {
  const normalized = normalizeUrl(apiUrl);
  if (!normalized) return 'officialGemini';
  try {
    const hostname = new URL(normalized).hostname.toLowerCase();
    if (hostname === 'generativelanguage.googleapis.com') return 'officialGemini';
    if (hostname === 'api.mosi.cn') return 'officialMossland';
    return 'openAICompatible';
  } catch {
    return 'openAICompatible';
  }
}

export function normalizeProviderCapabilityEndpoint(
  capability: AiProviderCapability,
  input: CapabilityEndpointInput,
  fallback?: CapabilityEndpointInput,
): ProviderCapabilityEndpoint {
  const source = input && typeof input === 'object' ? input : {};
  const fallbackSource = fallback && typeof fallback === 'object' ? fallback : {};
  const apiUrl = normalizeUrl(source.apiUrl) || normalizeUrl(fallbackSource.apiUrl);
  const inferredProvider = inferAiProviderKind(apiUrl);
  const requestedProvider = source.provider ?? fallbackSource.provider;
  const provider: AiProviderKind = requestedProvider === 'officialGemini'
    || requestedProvider === 'officialMossland'
    || requestedProvider === 'openAICompatible'
    ? requestedProvider
    : inferredProvider;
  const hasAnyConfiguration = Boolean(
    apiUrl
    || cleanString(source.apiKey)
    || cleanString(source.model)
    || cleanString(fallbackSource.apiKey)
    || cleanString(fallbackSource.model),
  );
  const enabled = typeof source.enabled === 'boolean'
    ? source.enabled
    : typeof fallbackSource.enabled === 'boolean'
      ? fallbackSource.enabled
      : hasAnyConfiguration;

  return {
    enabled,
    provider,
    apiUrl: apiUrl || (provider === 'officialGemini' ? GEMINI_BASE_URL : ''),
    apiKey: cleanString(source.apiKey, 4_096) || cleanString(fallbackSource.apiKey, 4_096),
    model: cleanString(source.model) || cleanString(fallbackSource.model)
      || DEFAULT_MODELS[provider][capability],
  };
}

export function normalizeProviderCapabilitySettings(
  input: Partial<Record<AiProviderCapability, CapabilityEndpointInput>> | null | undefined,
  fallback?: CapabilityEndpointInput,
): ProviderCapabilitySettings {
  const source = input && typeof input === 'object' ? input : {};
  return {
    schemaVersion: 1,
    text: normalizeProviderCapabilityEndpoint('text', source.text, fallback),
    vision: normalizeProviderCapabilityEndpoint('vision', source.vision, fallback),
    stt: normalizeProviderCapabilityEndpoint('stt', source.stt, fallback),
    tts: normalizeProviderCapabilityEndpoint('tts', source.tts, fallback),
  };
}

export function createLegacyProviderCapabilitySettings(input: {
  apiUrl?: string;
  apiKey?: string;
  selectedModel?: string;
}): ProviderCapabilitySettings {
  const fallback: CapabilityEndpointInput = {
    enabled: true,
    apiUrl: input.apiUrl,
    apiKey: input.apiKey,
    model: input.selectedModel,
  };
  return normalizeProviderCapabilitySettings(undefined, fallback);
}

const runtimeSupports = (
  capability: AiProviderCapability,
  provider: AiProviderKind,
) => {
  if (provider === 'officialGemini') return capability !== 'tts';
  if (provider === 'officialMossland') return capability === 'stt' || capability === 'tts';
  return true;
};

export function diagnoseProviderCapability(
  capability: AiProviderCapability,
  endpoint: ProviderCapabilityEndpoint,
): ProviderCapabilityDiagnostic {
  const missingFields: ProviderCapabilityDiagnostic['missingFields'] = [];
  const warnings: string[] = [];

  if (!endpoint.enabled) {
    return {
      capability,
      status: 'disabled',
      configured: false,
      supportedByRuntime: runtimeSupports(capability, endpoint.provider),
      provider: endpoint.provider,
      missingFields,
      message: `${capability} is disabled by the user.`,
      warnings,
    };
  }

  const supportedByRuntime = runtimeSupports(capability, endpoint.provider);
  if (!supportedByRuntime) {
    return {
      capability,
      status: 'unsupported',
      configured: Boolean(endpoint.apiUrl && endpoint.apiKey),
      supportedByRuntime,
      provider: endpoint.provider,
      missingFields,
      message: `${capability} is not supported by Nana's ${endpoint.provider} runtime.`,
      warnings,
    };
  }

  if (!endpoint.apiUrl) missingFields.push('apiUrl');
  if (!endpoint.apiKey) missingFields.push('apiKey');
  if (!endpoint.model) missingFields.push('model');

  if (missingFields.length > 0) {
    return {
      capability,
      status: 'unconfigured',
      configured: false,
      supportedByRuntime: runtimeSupports(capability, endpoint.provider),
      provider: endpoint.provider,
      missingFields,
      message: `${capability} is not configured: missing ${missingFields.join(', ')}.`,
      warnings,
    };
  }

  try {
    const parsed = new URL(endpoint.apiUrl);
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
      return {
        capability,
        status: 'invalid',
        configured: false,
        supportedByRuntime: runtimeSupports(capability, endpoint.provider),
        provider: endpoint.provider,
        missingFields,
        message: `${capability} API URL must use HTTPS.`,
        warnings,
      };
    }
    const hostname = parsed.hostname.toLowerCase();
    const isGeminiHost = hostname === 'generativelanguage.googleapis.com';
    const isMosslandHost = hostname === 'api.mosi.cn';
    if (
      (endpoint.provider === 'officialGemini' && !isGeminiHost)
      || (endpoint.provider === 'officialMossland' && !isMosslandHost)
      || (endpoint.provider === 'openAICompatible' && (isGeminiHost || isMosslandHost))
    ) {
      return {
        capability,
        status: 'invalid',
        configured: false,
        supportedByRuntime: runtimeSupports(capability, endpoint.provider),
        provider: endpoint.provider,
        missingFields,
        message: `${capability} provider type does not match its API URL.`,
        warnings,
      };
    }
  } catch {
    return {
      capability,
      status: 'invalid',
      configured: false,
      supportedByRuntime: runtimeSupports(capability, endpoint.provider),
      provider: endpoint.provider,
      missingFields,
      message: `${capability} API URL is invalid.`,
      warnings,
    };
  }

  if (endpoint.provider === 'openAICompatible') {
    warnings.push(
      `The configured OpenAI-compatible service must implement Nana's ${capability} request shape.`,
    );
  }

  return {
    capability,
    status: 'ready',
    configured: true,
    supportedByRuntime,
    provider: endpoint.provider,
    missingFields,
    message: `${capability} is ready.`,
    warnings,
  };
}

export function diagnoseProviderCapabilities(
  settings: ProviderCapabilitySettings,
): Record<AiProviderCapability, ProviderCapabilityDiagnostic> {
  return {
    text: diagnoseProviderCapability('text', settings.text),
    vision: diagnoseProviderCapability('vision', settings.vision),
    stt: diagnoseProviderCapability('stt', settings.stt),
    tts: diagnoseProviderCapability('tts', settings.tts),
  };
}

export function requireReadyProviderCapability(
  capability: AiProviderCapability,
  endpoint: ProviderCapabilityEndpoint,
): ProviderCapabilityEndpoint {
  const diagnostic = diagnoseProviderCapability(capability, endpoint);
  if (diagnostic.status !== 'ready') throw new Error(diagnostic.message);
  return endpoint;
}
