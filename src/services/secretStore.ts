import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const NANA_ROOT_STORAGE_KEY = 'nana-root';
export const API_KEY_SECRET_KEY = 'nana.api-key';
export const MAX_API_KEY_LENGTH = 2048;

const SECRET_FIELD_NAMES = new Set(['apikey', 'tempapikey']);

type JsonRecord = Record<string, unknown>;

export interface ApiKeyHydrationResult {
  apiKey: string;
  migratedLegacyKey: boolean;
  storage: 'secure-store' | 'session-memory';
}

export interface SanitizedPersistedRoot {
  value: JsonRecord;
  legacyApiKey: string;
  changed: boolean;
}

const isRecord = (value: unknown): value is JsonRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

export const usesNativeSecretStorage = () => Platform.OS === 'android' || Platform.OS === 'ios';

export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => redactSecrets(item)) as T;
  }

  if (!isRecord(value)) return value;

  const redacted: JsonRecord = {};
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_FIELD_NAMES.has(key.toLowerCase())) continue;
    redacted[key] = redactSecrets(child);
  }
  return redacted as T;
}

export function sanitizePersistedRootValue(value: unknown): SanitizedPersistedRoot {
  if (!isRecord(value)) {
    throw new Error('Stored Nana data is not a valid object.');
  }

  const state = isRecord(value.state) ? value.state : undefined;
  const legacyApiKey = typeof state?.apiKey === 'string' ? state.apiKey.trim() : '';
  const sanitized = redactSecrets(value);

  return {
    value: sanitized,
    legacyApiKey,
    changed: JSON.stringify(sanitized) !== JSON.stringify(value),
  };
}

export function sanitizePersistedRootJson(raw: string): SanitizedPersistedRoot & { raw: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Stored Nana data is not valid JSON.');
  }

  const result = sanitizePersistedRootValue(parsed);
  return { ...result, raw: JSON.stringify(result.value) };
}

function normalizeApiKey(apiKey: string): string {
  const normalized = apiKey.trim();
  if (normalized.length > MAX_API_KEY_LENGTH) {
    throw new Error(`API Key is too large to store securely (maximum ${MAX_API_KEY_LENGTH} characters).`);
  }
  return normalized;
}

export async function saveApiKey(apiKey: string): Promise<string> {
  const normalized = normalizeApiKey(apiKey);
  if (!usesNativeSecretStorage()) return normalized;

  try {
    if (!normalized) {
      await SecureStore.deleteItemAsync(API_KEY_SECRET_KEY);
      return '';
    }

    await SecureStore.setItemAsync(API_KEY_SECRET_KEY, normalized, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return normalized;
  } catch {
    throw new Error('Nana could not save the API Key securely. Your previous key is unchanged; please retry.');
  }
}

export async function loadApiKey(): Promise<string> {
  if (!usesNativeSecretStorage()) return '';

  try {
    return (await SecureStore.getItemAsync(API_KEY_SECRET_KEY))?.trim() || '';
  } catch {
    throw new Error('Nana could not read the securely stored API Key. Please retry.');
  }
}

export async function clearApiKey(): Promise<void> {
  if (!usesNativeSecretStorage()) return;

  try {
    await SecureStore.deleteItemAsync(API_KEY_SECRET_KEY);
  } catch {
    throw new Error('Nana could not clear the securely stored API Key. Please retry.');
  }
}

/**
 * Runs before Zustand hydration. A legacy key is removed from AsyncStorage only
 * after its SecureStore write succeeds. On web, the key is returned for this
 * page session and immediately removed from persistent browser storage.
 */
export async function prepareApiKeyForHydration(): Promise<ApiKeyHydrationResult> {
  const raw = await AsyncStorage.getItem(NANA_ROOT_STORAGE_KEY);
  let legacyApiKey = '';
  let migratedLegacyKey = false;
  let nativeApiKey = usesNativeSecretStorage() ? await loadApiKey() : '';

  if (raw) {
    const sanitized = sanitizePersistedRootJson(raw);
    legacyApiKey = sanitized.legacyApiKey;

    // A key already present in SecureStore is authoritative. This avoids a
    // stale legacy AsyncStorage value overwriting a newer securely saved key
    // if an earlier plaintext-cleanup write was interrupted.
    if (legacyApiKey && usesNativeSecretStorage() && !nativeApiKey) {
      nativeApiKey = await saveApiKey(legacyApiKey);
      migratedLegacyKey = true;
    }

    if (sanitized.changed) {
      await AsyncStorage.setItem(NANA_ROOT_STORAGE_KEY, sanitized.raw);
    }
  }

  return {
    apiKey: usesNativeSecretStorage() ? nativeApiKey : legacyApiKey,
    migratedLegacyKey,
    storage: usesNativeSecretStorage() ? 'secure-store' : 'session-memory',
  };
}
