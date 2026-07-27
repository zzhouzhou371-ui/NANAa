export type NetworkErrorCode = 'TIMEOUT' | 'ABORTED' | 'NETWORK';

export class NetworkRequestError extends Error {
  constructor(
    message: string,
    public readonly code: NetworkErrorCode,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'NetworkRequestError';
  }
}

const cleanMessage = (value: unknown) => {
  const text = typeof value === 'string' ? value : '';
  return text.replace(/\s+/g, ' ').trim().slice(0, 320);
};

export const isOfficialGeminiBaseUrl = (baseUrl: string) => {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === 'generativelanguage.googleapis.com';
  } catch {
    return false;
  }
};

export async function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1] = {},
  timeoutMs = 45_000,
): Promise<Response> {
  const controller = new AbortController();
  const upstreamSignal = init?.signal;
  let timedOut = false;

  const abortFromUpstream = () => controller.abort(upstreamSignal?.reason);
  if (upstreamSignal?.aborted) abortFromUpstream();
  else upstreamSignal?.addEventListener('abort', abortFromUpstream, { once: true });

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new NetworkRequestError('The request timed out. Check your connection and try again.', 'TIMEOUT', { cause: error });
    }
    if (controller.signal.aborted) {
      throw new NetworkRequestError('The request was cancelled.', 'ABORTED', { cause: error });
    }
    throw new NetworkRequestError('Could not reach the configured AI service.', 'NETWORK', { cause: error });
  } finally {
    clearTimeout(timeout);
    upstreamSignal?.removeEventListener('abort', abortFromUpstream);
  }
}

export async function readResponsePayload(response: Response): Promise<{ data: any; text: string }> {
  const text = await response.text().catch(() => '');
  if (!text) return { data: null, text: '' };

  try {
    return { data: JSON.parse(text), text };
  } catch {
    return { data: null, text };
  }
}

export function responseErrorMessage(
  response: Response,
  payload: { data: any; text: string },
) {
  const candidate = payload.data?.error?.message
    ?? payload.data?.error
    ?? payload.data?.message
    ?? payload.text;
  return cleanMessage(candidate) || `AI service returned HTTP ${response.status}`;
}
