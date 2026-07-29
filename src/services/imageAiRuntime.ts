import { File } from 'expo-file-system';
import {
  fetchWithTimeout,
  readResponsePayload,
  responseErrorMessage,
} from './network';
import {
  diagnoseProviderCapability,
  type ProviderCapabilityEndpoint,
} from './providerCapabilityRuntime';

export type ImageAiErrorCode =
  | 'UNCONFIGURED'
  | 'UNSUPPORTED'
  | 'INVALID_URI'
  | 'FILE_MISSING'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_MIME'
  | 'PROVIDER_ERROR'
  | 'INVALID_RESPONSE';

export interface ImageAiResult {
  description: string;
  objects: string[];
  people: string[];
  sensitive: boolean;
  sensitiveCategories: string[];
  confidence: number;
}

export interface AnalyzeDurableImageInput {
  imageUri: string;
  vision: ProviderCapabilityEndpoint;
  language?: string;
  relationshipContext?: string;
  maxBytes?: number;
  timeoutMs?: number;
}

export class ImageAiRuntimeError extends Error {
  constructor(
    message: string,
    public readonly code: ImageAiErrorCode,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ImageAiRuntimeError';
  }
}

const DEFAULT_MAX_BYTES = 8 * 1_024 * 1_024;
const HARD_MAX_BYTES = 10 * 1_024 * 1_024;
const DEFAULT_TIMEOUT_MS = 45_000;

const cleanText = (value: unknown, maxLength: number) => (
  typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : ''
);

const normalizeList = (value: unknown, maxItems: number, maxLength: number) => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map(item => cleanText(item, maxLength))
      .filter(Boolean),
  )).slice(0, maxItems);
};

export function isDurableNanaImageUri(uri: unknown): uri is string {
  if (typeof uri !== 'string') return false;
  const normalized = uri.replace(/\\/g, '/').toLowerCase();
  return normalized.startsWith('file://')
    && normalized.includes('/nana-media/images/')
    && !normalized.includes('/cache/');
}

export function imageMimeTypeForUri(uri: string): string | null {
  const normalized = uri.toLowerCase().split('?')[0].split('#')[0];
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.gif')) return 'image/gif';
  return null;
}

const analysisPrompt = (language?: string, relationshipContext?: string) => {
  const requestedLanguage = cleanText(language, 32) || 'zh-CN';
  const context = cleanText(relationshipContext, 400);
  return [
    'Analyze this single image for a private role-play chat.',
    `Write the description and labels in ${requestedLanguage}.`,
    'Return only one JSON object with exactly these fields:',
    '{"description":"concise factual description","objects":["visible object"],"people":["non-identifying visible-person description"],"sensitive":false,"sensitiveCategories":[],"confidence":0.0}',
    'Do not identify real people. Do not guess hidden identity, relationships, ethnicity, health, or other sensitive traits.',
    'Mark sensitive=true for explicit sexual content, graphic violence, self-harm, exposed secrets/documents, or clearly dangerous activity.',
    context ? `Optional user-provided chat context (not evidence): ${context}` : '',
  ].filter(Boolean).join('\n');
};

const stripJsonFence = (value: string) => value
  .replace(/^```(?:json)?\s*/i, '')
  .replace(/\s*```$/i, '')
  .trim();

const extractJsonObject = (value: string) => {
  const stripped = stripJsonFence(value);
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(stripped.slice(start, end + 1));
    } catch {
      return null;
    }
  }
};

export function normalizeImageAiResult(value: unknown): ImageAiResult | null {
  const parsed = typeof value === 'string' ? extractJsonObject(value) : value;
  if (!parsed || typeof parsed !== 'object') return null;
  const source = parsed as Record<string, unknown>;
  const description = cleanText(source.description, 1_200);
  if (!description) return null;
  const rawSensitive = source.sensitive;
  const sensitive = rawSensitive === true
    || (typeof rawSensitive === 'string'
      && ['true', 'yes', 'sensitive'].includes(rawSensitive.toLowerCase()));
  const rawConfidence = typeof source.confidence === 'number'
    ? source.confidence
    : Number(source.confidence);

  return {
    description,
    objects: normalizeList(source.objects, 24, 80),
    people: normalizeList(source.people, 12, 160),
    sensitive,
    sensitiveCategories: normalizeList(source.sensitiveCategories, 8, 80),
    confidence: Number.isFinite(rawConfidence)
      ? Math.min(1, Math.max(0, rawConfidence))
      : 0.5,
  };
}

const openAIChatCompletionsUrl = (baseUrl: string) => (
  `${baseUrl.replace(/\/+$/, '').replace(/\/(v1|v1beta)$/i, '')}/v1/chat/completions`
);

const extractOpenAIText = (data: any) => {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map(part => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim();
};

const extractGeminiText = (data: any) => (
  data?.candidates?.[0]?.content?.parts
    ?.map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim()
  || ''
);

async function requestGeminiVision(input: {
  endpoint: ProviderCapabilityEndpoint;
  base64: string;
  mimeType: string;
  prompt: string;
  timeoutMs: number;
}): Promise<string> {
  const baseUrl = input.endpoint.apiUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/v1beta/models/${encodeURIComponent(input.endpoint.model)}:generateContent?key=${encodeURIComponent(input.endpoint.apiKey)}`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: input.prompt },
          { inlineData: { mimeType: input.mimeType, data: input.base64 } },
        ],
      }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
      },
    }),
  }, input.timeoutMs);
  const payload = await readResponsePayload(response);
  if (!response.ok) {
    throw new ImageAiRuntimeError(
      responseErrorMessage(response, payload),
      'PROVIDER_ERROR',
    );
  }
  return extractGeminiText(payload.data);
}

async function requestOpenAICompatibleVision(input: {
  endpoint: ProviderCapabilityEndpoint;
  base64: string;
  mimeType: string;
  prompt: string;
  timeoutMs: number;
}): Promise<string> {
  const response = await fetchWithTimeout(openAIChatCompletionsUrl(input.endpoint.apiUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.endpoint.apiKey}`,
    },
    body: JSON.stringify({
      model: input.endpoint.model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: input.prompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:${input.mimeType};base64,${input.base64}`,
              detail: 'low',
            },
          },
        ],
      }],
      temperature: 0,
    }),
  }, input.timeoutMs);
  const payload = await readResponsePayload(response);
  if (!response.ok) {
    throw new ImageAiRuntimeError(
      responseErrorMessage(response, payload),
      'PROVIDER_ERROR',
    );
  }
  return extractOpenAIText(payload.data);
}

export async function analyzeDurableImage(
  input: AnalyzeDurableImageInput,
): Promise<ImageAiResult> {
  const diagnostic = diagnoseProviderCapability('vision', input.vision);
  if (diagnostic.status === 'unsupported') {
    throw new ImageAiRuntimeError(diagnostic.message, 'UNSUPPORTED');
  }
  if (diagnostic.status !== 'ready') {
    throw new ImageAiRuntimeError(diagnostic.message, 'UNCONFIGURED');
  }
  if (!isDurableNanaImageUri(input.imageUri)) {
    throw new ImageAiRuntimeError(
      'Image analysis requires a Nana-managed durable image URI.',
      'INVALID_URI',
    );
  }

  const mimeType = imageMimeTypeForUri(input.imageUri);
  if (!mimeType) {
    throw new ImageAiRuntimeError('Unsupported image type.', 'UNSUPPORTED_MIME');
  }

  let file: File;
  try {
    file = new File(input.imageUri);
  } catch (error) {
    throw new ImageAiRuntimeError('The selected image could not be opened.', 'FILE_MISSING', { cause: error });
  }
  if (!file.exists) {
    throw new ImageAiRuntimeError('The selected image is missing.', 'FILE_MISSING');
  }
  const maxBytes = Number.isFinite(input.maxBytes)
    ? Math.min(HARD_MAX_BYTES, Math.max(256 * 1_024, Number(input.maxBytes)))
    : DEFAULT_MAX_BYTES;
  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new ImageAiRuntimeError('The selected image is empty.', 'FILE_MISSING');
  }
  if (file.size > maxBytes) {
    throw new ImageAiRuntimeError(
      `The selected image is too large. Maximum size is ${Math.round(maxBytes / 1_024 / 1_024)} MB.`,
      'FILE_TOO_LARGE',
    );
  }

  const timeoutMs = Number.isFinite(input.timeoutMs)
    ? Math.min(60_000, Math.max(5_000, Number(input.timeoutMs)))
    : DEFAULT_TIMEOUT_MS;
  const base64 = await file.base64();
  const request = {
    endpoint: input.vision,
    base64,
    mimeType,
    prompt: analysisPrompt(input.language, input.relationshipContext),
    timeoutMs,
  };

  let rawText: string;
  try {
    rawText = input.vision.provider === 'officialGemini'
      ? await requestGeminiVision(request)
      : await requestOpenAICompatibleVision(request);
  } catch (error) {
    if (error instanceof ImageAiRuntimeError) throw error;
    throw new ImageAiRuntimeError(
      error instanceof Error ? error.message : 'Image analysis failed.',
      'PROVIDER_ERROR',
      { cause: error },
    );
  }

  const result = normalizeImageAiResult(rawText);
  if (!result) {
    throw new ImageAiRuntimeError(
      'The image service returned an invalid structured response.',
      'INVALID_RESPONSE',
    );
  }
  return result;
}
