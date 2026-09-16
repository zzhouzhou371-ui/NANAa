import {
  NetworkRequestError,
  fetchWithTimeout,
  readResponsePayload,
} from './network';
import { normalizeRemoteProactiveEndpoint } from './remoteProactiveRuntime';

const DEFAULT_REGISTRATION_TIMEOUT_MS = 12_000;

export interface RemoteProactiveEndpointConfig {
  endpoint: string;
  /** A Nana-backend credential. Never pass a model-provider API key here. */
  backendAccessToken: string;
  timeoutMs?: number;
}

export interface RemoteProactiveDeviceRegistration {
  schemaVersion: 1;
  installationId: string;
  expoPushToken: string;
  projectId: string;
  platform: 'android' | 'ios';
  appVersion?: string;
}

export type RemoteProactiveRegistrationResult =
  | { status: 'disabled' }
  | { status: 'registered'; serverDeviceId?: string }
  | {
      status: 'failed';
      kind: 'configuration' | 'cancelled' | 'timeout' | 'network' | 'http' | 'invalid-response';
      retryable: boolean;
      httpStatus?: number;
    };

const validOpaqueValue = (value: string, maximum: number) => {
  const text = value.trim();
  return !!text && text.length <= maximum && !/[\u0000-\u001f\u007f]/u.test(text);
};

const isRetryableHttpStatus = (status: number) => (
  status === 408 || status === 429 || status >= 500
);

export const registerRemoteProactiveDevice = async ({
  config,
  registration,
  signal,
}: {
  config?: RemoteProactiveEndpointConfig | null;
  registration: RemoteProactiveDeviceRegistration;
  signal?: AbortSignal;
}): Promise<RemoteProactiveRegistrationResult> => {
  if (!config) return { status: 'disabled' };
  const endpoint = normalizeRemoteProactiveEndpoint(config.endpoint);
  const backendAccessToken = config.backendAccessToken.trim();
  if (
    !endpoint
    || !validOpaqueValue(backendAccessToken, 2_048)
    || registration.schemaVersion !== 1
    || !validOpaqueValue(registration.installationId, 128)
    || !validOpaqueValue(registration.expoPushToken, 256)
    || !validOpaqueValue(registration.projectId, 128)
    || (registration.platform !== 'android' && registration.platform !== 'ios')
    || (registration.appVersion !== undefined && !validOpaqueValue(registration.appVersion, 64))
  ) {
    return { status: 'failed', kind: 'configuration', retryable: false };
  }

  try {
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${backendAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(registration),
      signal,
    }, Math.min(30_000, Math.max(2_000, config.timeoutMs || DEFAULT_REGISTRATION_TIMEOUT_MS)));
    if (!response.ok) {
      return {
        status: 'failed',
        kind: 'http',
        retryable: isRetryableHttpStatus(response.status),
        httpStatus: response.status,
      };
    }
    if (response.status === 204) return { status: 'registered' };
    const payload = await readResponsePayload(response);
    if (!payload.data || payload.data.accepted !== true) {
      return { status: 'failed', kind: 'invalid-response', retryable: false };
    }
    const serverDeviceId = typeof payload.data.deviceId === 'string'
      && validOpaqueValue(payload.data.deviceId, 128)
      ? payload.data.deviceId.trim()
      : undefined;
    return {
      status: 'registered',
      ...(serverDeviceId ? { serverDeviceId } : {}),
    };
  } catch (error) {
    if (error instanceof NetworkRequestError) {
      if (error.code === 'ABORTED') {
        return { status: 'failed', kind: 'cancelled', retryable: false };
      }
      if (error.code === 'TIMEOUT') {
        return { status: 'failed', kind: 'timeout', retryable: true };
      }
    }
    return { status: 'failed', kind: 'network', retryable: true };
  }
};
