import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Share } from 'react-native';
import {
  NANA_PERSIST_VERSION,
  selectNanaPersistedState,
  useNanaStore,
} from '../stores/nanaStore';
import {
  NANA_ROOT_STORAGE_KEY,
  clearApiKey,
  redactSecrets,
  sanitizePersistedRootValue,
} from './secretStore';
import {
  clearPersistedMedia,
  deleteFinalAvatar,
  deleteStagedAvatar,
  isPersistedMediaUri,
  pruneUnreferencedAvatarFiles,
  promoteStagedAvatar,
  readPersistedAvatarForExport,
  stageImportedAvatar,
} from './localMediaRepository';
import { hasNanaManagedAvatarPath, isPortableAvatarDataUri } from './avatarValueRuntime';
import {
  flushDurableChatHistory,
  readDurableChatHistory,
  replaceDurableChatHistory,
} from './chatHistoryPersistence';

const EXPORT_FORMAT = 'nana-export';
const EXPORT_VERSION = 2;
const MAX_IMPORT_CHARACTERS = 5 * 1024 * 1024;
const MAX_IMPORT_KEYS = 32;
export const MAX_AVATAR_MANIFEST_ENTRIES = 64;
export const MAX_AVATAR_BYTES = 512 * 1024;
export const MAX_AVATAR_MANIFEST_BYTES = 3 * 1024 * 1024;

type JsonRecord = Record<string, unknown>;
type ImportEntry = [string, string];

const ARRAY_STATE_FIELDS = new Set([
  'friends', 'characters', 'savedAvatars', 'momentsList', 'worldBookEntries',
  'onlinePresets', 'offlinePresets', 'callLogs', 'blockedUsers',
  'relationshipTraces',
]);
const RECORD_STATE_FIELDS = new Set([
  'chatHistory',
  'themeConfig',
  'lastForwardedMsgId',
  'unreadCounts',
  'paymentsById',
  'proactiveChatSchedules',
  'conversationContinuityByCharacter',
]);
const STRING_STATE_FIELDS = new Set([
  'selectedModel', 'myDesc', 'apiUrl', 'myAvatar', 'myName', 'walletBalance',
  'momentsBg', 'activeOnlinePresetId', 'activeOfflinePresetId', 'speechLanguage',
]);
const BOOLEAN_STATE_FIELDS = new Set(['showMemoryDebug', 'autoTTS']);
const NUMBER_STATE_FIELDS = new Set(['memoryWindowSize', 'walletBalanceMinor']);
const ALLOWED_STATE_FIELDS = new Set([
  ...ARRAY_STATE_FIELDS,
  ...RECORD_STATE_FIELDS,
  ...STRING_STATE_FIELDS,
  ...BOOLEAN_STATE_FIELDS,
  ...NUMBER_STATE_FIELDS,
]);

export interface NanaExportDocument {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  data: Record<string, unknown>;
  avatarMedia?: NanaAvatarMediaManifest;
}

export interface NanaAvatarMediaEntry {
  id: string;
  sourceUri: string;
  mimeType: string;
  extension: string;
  byteLength: number;
  base64: string;
}

export interface NanaAvatarMediaManifest {
  version: 1;
  avatars: NanaAvatarMediaEntry[];
}

export interface ParsedImportBundle {
  entries: ImportEntry[];
  avatarMedia?: NanaAvatarMediaManifest;
}

const isRecord = (value: unknown): value is JsonRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const errorMessage = (error: unknown, fallback: string) => (
  error instanceof Error ? error.message : fallback
);

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const AVATAR_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

const base64ByteLength = (value: string) => {
  if (!value || value.length % 4 !== 0 || !BASE64_PATTERN.test(value)) return null;
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return (value.length / 4) * 3 - padding;
};

function validateAvatarMedia(value: unknown): NanaAvatarMediaManifest | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.avatars)) {
    throw new Error('The Nana avatar media manifest is invalid.');
  }
  if (value.avatars.length > MAX_AVATAR_MANIFEST_ENTRIES) {
    throw new Error(`The Nana avatar media manifest exceeds ${MAX_AVATAR_MANIFEST_ENTRIES} avatars.`);
  }

  const ids = new Set<string>();
  const sourceUris = new Set<string>();
  let totalBytes = 0;
  const avatars = value.avatars.map((candidate, index): NanaAvatarMediaEntry => {
    if (!isRecord(candidate)) throw new Error(`Avatar media entry ${index + 1} is invalid.`);
    const { id, sourceUri, mimeType, extension, byteLength, base64 } = candidate;
    const decodedLength = typeof base64 === 'string' ? base64ByteLength(base64) : null;
    if (
      typeof id !== 'string'
      || !/^avatar-[a-z0-9-]{1,64}$/i.test(id)
      || ids.has(id)
      || typeof sourceUri !== 'string'
      || !hasNanaManagedAvatarPath(sourceUri)
      || sourceUris.has(sourceUri)
      || typeof mimeType !== 'string'
      || !AVATAR_MIME_TYPES.has(mimeType)
      || typeof extension !== 'string'
      || !/^[a-z0-9]{2,5}$/i.test(extension)
      || typeof byteLength !== 'number'
      || !Number.isSafeInteger(byteLength)
      || byteLength <= 0
      || decodedLength !== byteLength
    ) {
      throw new Error(`Avatar media entry ${index + 1} is invalid.`);
    }
    if (byteLength > MAX_AVATAR_BYTES) {
      throw new Error(`Avatar media entry ${index + 1} exceeds 512 KiB.`);
    }
    totalBytes += byteLength;
    if (totalBytes > MAX_AVATAR_MANIFEST_BYTES) {
      throw new Error('The Nana avatar media manifest exceeds 3 MiB in total.');
    }
    const entry: NanaAvatarMediaEntry = {
      id: id as string,
      sourceUri: sourceUri as string,
      mimeType: mimeType as string,
      extension: (extension as string).toLowerCase(),
      byteLength: byteLength as number,
      base64: base64 as string,
    };
    ids.add(entry.id);
    sourceUris.add(entry.sourceUri);
    return entry;
  });
  return { version: 1, avatars };
}

const PAYMENT_STATUSES = new Set(['sending', 'pending', 'completed', 'declined', 'expired', 'refunded', 'failed']);
const PAYMENT_FUNDS_STATES = new Set(['held', 'captured', 'released']);
const PAYMENT_REACTION_STATES = new Set(['idle', 'scheduled', 'processing', 'resolved', 'failed']);

const paymentFundsStateMatchesStatus = (status: unknown, fundsState: unknown) => {
  if (status === 'sending' || status === 'pending') return fundsState === 'held';
  if (status === 'completed') return fundsState === 'captured';
  return fundsState === 'released';
};

function validateOptionalFiniteNumber(payment: JsonRecord, field: string): void {
  const value = payment[field];
  if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error(`Invalid Nana payment field: ${field}.`);
  }
}

function validatePaymentsById(value: unknown): void {
  if (!isRecord(value)) throw new Error('Invalid Nana state field: paymentsById must be an object.');
  for (const [id, candidate] of Object.entries(value)) {
    if (!isRecord(candidate)) throw new Error(`Invalid Nana payment: ${id}.`);
    if (
      candidate.schemaVersion !== 1
      || candidate.id !== id
      || typeof candidate.chatId !== 'string'
      || (candidate.kind !== 'transfer' && candidate.kind !== 'redPacket')
      || (candidate.direction !== 'outgoing' && candidate.direction !== 'incoming')
      || typeof candidate.senderId !== 'string'
      || typeof candidate.recipientId !== 'string'
      || typeof candidate.amountMinor !== 'number'
      || !Number.isSafeInteger(candidate.amountMinor)
      || candidate.amountMinor <= 0
      || (candidate.kind === 'redPacket' && candidate.amountMinor > 20_000)
      || candidate.currency !== 'CNY'
      || !PAYMENT_STATUSES.has(candidate.status as string)
      || !PAYMENT_FUNDS_STATES.has(candidate.fundsState as string)
      || !paymentFundsStateMatchesStatus(candidate.status, candidate.fundsState)
      || typeof candidate.createdAt !== 'number'
      || !Number.isFinite(candidate.createdAt)
      || typeof candidate.updatedAt !== 'number'
      || !Number.isFinite(candidate.updatedAt)
      || typeof candidate.expiresAt !== 'number'
      || !Number.isFinite(candidate.expiresAt)
      || !PAYMENT_REACTION_STATES.has(candidate.reactionState as string)
      || typeof candidate.reactionAttempts !== 'number'
      || !Number.isSafeInteger(candidate.reactionAttempts)
      || candidate.reactionAttempts < 0
    ) {
      throw new Error(`Invalid Nana payment: ${id}.`);
    }
    if (candidate.note !== undefined && (
      typeof candidate.note !== 'string' || Array.from(candidate.note).length > 32
    )) {
      throw new Error(`Invalid Nana payment note: ${id}.`);
    }
    if (candidate.reactionDecision !== undefined
      && candidate.reactionDecision !== 'accept'
      && candidate.reactionDecision !== 'decline') {
      throw new Error(`Invalid Nana payment reaction: ${id}.`);
    }
    for (const field of ['pendingAt', 'completedAt', 'reactionDueAt', 'reactionAttemptedAt']) {
      validateOptionalFiniteNumber(candidate, field);
    }
  }
}

export const isNanaStorageKey = (key: string) => key === NANA_ROOT_STORAGE_KEY || key.startsWith('nana_');

function parseStoredValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function validateStateField(key: string, value: unknown): void {
  if (!ALLOWED_STATE_FIELDS.has(key)) {
    throw new Error(`Unsupported Nana state field: ${key}`);
  }
  if (ARRAY_STATE_FIELDS.has(key) && !Array.isArray(value)) {
    throw new Error(`Invalid Nana state field: ${key} must be an array.`);
  }
  if (RECORD_STATE_FIELDS.has(key) && !isRecord(value)) {
    throw new Error(`Invalid Nana state field: ${key} must be an object.`);
  }
  if (STRING_STATE_FIELDS.has(key) && typeof value !== 'string') {
    throw new Error(`Invalid Nana state field: ${key} must be text.`);
  }
  if (BOOLEAN_STATE_FIELDS.has(key) && typeof value !== 'boolean') {
    throw new Error(`Invalid Nana state field: ${key} must be true or false.`);
  }
  if (NUMBER_STATE_FIELDS.has(key) && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error(`Invalid Nana state field: ${key} must be a number.`);
  }
  if (key === 'walletBalanceMinor' && (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 0
  )) {
    throw new Error('Invalid Nana state field: walletBalanceMinor must be a non-negative integer.');
  }
  if (key === 'paymentsById') validatePaymentsById(value);
}

function normalizeImportedRoot(value: unknown): JsonRecord {
  const sanitized = sanitizePersistedRootValue(value).value;
  if (!isRecord(sanitized.state)) {
    throw new Error('The nana-root entry is missing a valid state object.');
  }
  if (sanitized.version !== undefined && (
    typeof sanitized.version !== 'number'
    || !Number.isInteger(sanitized.version)
    || sanitized.version < 0
    || sanitized.version > NANA_PERSIST_VERSION
  )) {
    throw new Error('This Nana backup uses an unsupported storage version.');
  }

  for (const [key, fieldValue] of Object.entries(sanitized.state)) {
    validateStateField(key, fieldValue);
  }
  return sanitized;
}

export function createExportDocument(
  storedValues: Record<string, unknown>,
  exportedAt = new Date().toISOString(),
  avatarMedia?: NanaAvatarMediaManifest,
): NanaExportDocument {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(storedValues)) {
    if (!isNanaStorageKey(key)) continue;
    data[key] = redactSecrets(value);
  }
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt,
    data,
    ...(avatarMedia && avatarMedia.avatars.length > 0 ? { avatarMedia } : {}),
  };
}

const isManagedAvatarUri = (uri: string) => (
  isPersistedMediaUri(uri, 'avatars')
  || hasNanaManagedAvatarPath(uri)
  || isPortableAvatarDataUri(uri)
);

const validateInlineAvatarLimits = (
  uris: readonly string[],
  nativeEntryCount = 0,
  nativeBytes = 0,
) => {
  const inlineUris = [...new Set(uris.filter(isPortableAvatarDataUri))];
  if (nativeEntryCount + inlineUris.length > MAX_AVATAR_MANIFEST_ENTRIES) {
    throw new Error(`Avatar backup is limited to ${MAX_AVATAR_MANIFEST_ENTRIES} avatars.`);
  }
  let totalBytes = nativeBytes;
  for (const [index, uri] of inlineUris.entries()) {
    const byteLength = base64ByteLength(uri.slice(uri.indexOf(',') + 1));
    if (byteLength === null || byteLength <= 0 || byteLength > MAX_AVATAR_BYTES) {
      throw new Error(`Inline avatar ${index + 1} exceeds the 512 KiB limit or is invalid.`);
    }
    totalBytes += byteLength;
    if (totalBytes > MAX_AVATAR_MANIFEST_BYTES) {
      throw new Error('Avatar backup exceeds the 3 MiB total limit.');
    }
  }
  return totalBytes;
};

const collectAvatarReferences = (state: JsonRecord) => {
  const result = new Set<string>();
  const add = (value: unknown) => { if (typeof value === 'string' && value) result.add(value); };
  add(state.myAvatar);
  if (Array.isArray(state.savedAvatars)) state.savedAvatars.forEach(add);
  if (Array.isArray(state.characters)) state.characters.forEach(value => isRecord(value) && add(value.avatar));
  if (Array.isArray(state.momentsList)) state.momentsList.forEach(value => isRecord(value) && add(value.avatar));
  if (Array.isArray(state.callLogs)) state.callLogs.forEach(value => isRecord(value) && add(value.avatar));
  if (isRecord(state.chatHistory)) {
    for (const messages of Object.values(state.chatHistory)) {
      if (Array.isArray(messages)) messages.forEach(value => isRecord(value) && add(value.avatar));
    }
  }
  return result;
};

export async function createAvatarMediaManifest(
  storedValues: Record<string, unknown>,
): Promise<NanaAvatarMediaManifest | undefined> {
  let rootValue = storedValues[NANA_ROOT_STORAGE_KEY];
  if (typeof rootValue === 'string') rootValue = parseStoredValue(rootValue);
  if (!isRecord(rootValue) || !isRecord(rootValue.state)) return undefined;

  const avatarUris = [...collectAvatarReferences(rootValue.state)].filter(isManagedAvatarUri);
  const uniqueUris = [...new Set(avatarUris)];
  if (uniqueUris.length > MAX_AVATAR_MANIFEST_ENTRIES) {
    throw new Error(`Avatar backup is limited to ${MAX_AVATAR_MANIFEST_ENTRIES} Nana-managed avatars.`);
  }

  const nativeUris = uniqueUris.filter(hasNanaManagedAvatarPath);
  let totalBytes = validateInlineAvatarLimits(uniqueUris);
  const avatars: NanaAvatarMediaEntry[] = [];
  for (const [index, sourceUri] of nativeUris.entries()) {
    const exported = await readPersistedAvatarForExport(sourceUri);
    if (exported.byteLength <= 0 || exported.byteLength > MAX_AVATAR_BYTES) {
      throw new Error(`Avatar ${index + 1} exceeds the 512 KiB export limit.`);
    }
    totalBytes += exported.byteLength;
    if (totalBytes > MAX_AVATAR_MANIFEST_BYTES) {
      throw new Error('Avatar backup exceeds the 3 MiB total export limit.');
    }
    avatars.push({
      id: `avatar-${index + 1}`,
      sourceUri,
      mimeType: exported.mimeType,
      extension: exported.extension,
      byteLength: exported.byteLength,
      base64: exported.base64,
    });
  }
  return avatars.length > 0 ? { version: 1, avatars } : undefined;
}

export function parseImportBundle(jsonText: string): ParsedImportBundle {
  const trimmed = jsonText.trim();
  if (!trimmed) throw new Error('The import is empty.');
  if (trimmed.length > MAX_IMPORT_CHARACTERS) {
    throw new Error('The import is too large. The maximum supported size is 5 MB.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('The import is not valid JSON.');
  }
  if (!isRecord(parsed)) throw new Error('The import must contain a JSON object.');

  let data: JsonRecord;
  let avatarMedia: NanaAvatarMediaManifest | undefined;
  let isV2Envelope = false;
  if ('format' in parsed || 'data' in parsed) {
    if (
      parsed.format !== EXPORT_FORMAT
      || (parsed.version !== 1 && parsed.version !== EXPORT_VERSION)
      || !isRecord(parsed.data)
    ) {
      throw new Error('The Nana export envelope is invalid or unsupported.');
    }
    data = parsed.data;
    isV2Envelope = parsed.version === EXPORT_VERSION;
    if (parsed.version === 1 && parsed.avatarMedia !== undefined) {
      throw new Error('Avatar media is only supported by Nana v2 exports.');
    }
    avatarMedia = parsed.version === EXPORT_VERSION
      ? validateAvatarMedia(parsed.avatarMedia)
      : undefined;
  } else {
    data = parsed;
  }

  const nanaEntries = Object.entries(data).filter(([key]) => isNanaStorageKey(key));
  if (nanaEntries.length === 0) throw new Error('No Nana data was found in the import.');
  if (nanaEntries.length > MAX_IMPORT_KEYS) throw new Error('The import contains too many Nana storage entries.');
  if (!nanaEntries.some(([key]) => key === NANA_ROOT_STORAGE_KEY)) {
    throw new Error('The import is missing the nana-root entry.');
  }

  const entries = nanaEntries.map(([key, value]): ImportEntry => {
    let normalizedValue: unknown = value;
    if (typeof normalizedValue === 'string') {
      try {
        normalizedValue = JSON.parse(normalizedValue);
      } catch {
        if (key === NANA_ROOT_STORAGE_KEY) {
          throw new Error('The nana-root entry is not valid JSON.');
        }
      }
    }

    normalizedValue = key === NANA_ROOT_STORAGE_KEY
      ? normalizeImportedRoot(normalizedValue)
      : redactSecrets(normalizedValue);
    return [key, typeof normalizedValue === 'string' ? normalizedValue : JSON.stringify(normalizedValue)];
  });

  const normalizedRoot = JSON.parse(entries.find(([key]) => key === NANA_ROOT_STORAGE_KEY)![1]) as JsonRecord;
  const avatarReferences = isRecord(normalizedRoot.state)
    ? collectAvatarReferences(normalizedRoot.state)
    : new Set<string>();
  if (isV2Envelope) {
    validateInlineAvatarLimits(
      [...avatarReferences],
      avatarMedia?.avatars.length || 0,
      avatarMedia?.avatars.reduce((sum, avatar) => sum + avatar.byteLength, 0) || 0,
    );
    const manifestSourceUris = new Set(avatarMedia?.avatars.map(avatar => avatar.sourceUri) || []);
    const managedAvatarReferences = [...avatarReferences].filter(hasNanaManagedAvatarPath);
    for (const sourceUri of managedAvatarReferences) {
      if (!manifestSourceUris.has(sourceUri)) {
        throw new Error('The Nana v2 backup is missing media for a managed avatar reference.');
      }
    }
  }
  if (avatarMedia) {
    for (const avatar of avatarMedia.avatars) {
      if (!avatarReferences.has(avatar.sourceUri)) {
        throw new Error(`Avatar media ${avatar.id} is not referenced by the imported Nana state.`);
      }
    }
  }
  return { entries, avatarMedia };
}

export function parseImportDocument(jsonText: string): ImportEntry[] {
  return parseImportBundle(jsonText).entries;
}

const replaceExactStringReferences = (
  value: unknown,
  replacements: ReadonlyMap<string, string>,
): unknown => {
  if (typeof value === 'string') return replacements.get(value) || value;
  if (Array.isArray(value)) return value.map(item => replaceExactStringReferences(item, replacements));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, replaceExactStringReferences(item, replacements)]),
  );
};

export function rewriteAvatarMediaReferences(
  entries: ImportEntry[],
  replacements: ReadonlyMap<string, string>,
): ImportEntry[] {
  if (replacements.size === 0) return entries;
  return entries.map(([key, raw]): ImportEntry => {
    if (key !== NANA_ROOT_STORAGE_KEY) return [key, raw];
    const root = JSON.parse(raw) as JsonRecord;
    return [key, JSON.stringify(replaceExactStringReferences(root, replacements))];
  });
}

interface PreparedAvatarImport {
  entries: ImportEntry[];
  stagedUris: string[];
  finalUris: string[];
}

export function prepareAvatarMediaImport(bundle: ParsedImportBundle): PreparedAvatarImport {
  if (!bundle.avatarMedia || bundle.avatarMedia.avatars.length === 0) {
    return { entries: bundle.entries, stagedUris: [], finalUris: [] };
  }

  const stagedUris: string[] = [];
  const finalUris: string[] = [];
  const replacements = new Map<string, string>();
  try {
    for (const avatar of bundle.avatarMedia.avatars) {
      stagedUris.push(stageImportedAvatar(avatar.base64, avatar.extension));
    }
    for (const [index, avatar] of bundle.avatarMedia.avatars.entries()) {
      const finalUri = promoteStagedAvatar(stagedUris[index], avatar.extension);
      finalUris.push(finalUri);
      replacements.set(avatar.sourceUri, finalUri);
    }
    return {
      entries: rewriteAvatarMediaReferences(bundle.entries, replacements),
      stagedUris,
      finalUris,
    };
  } catch (error) {
    for (const uri of stagedUris) deleteStagedAvatar(uri);
    for (const uri of finalUris) deleteFinalAvatar(uri);
    throw error;
  }
}

async function restoreBackup(backup: readonly (readonly [string, string | null])[]): Promise<void> {
  const valuesToRestore = backup
    .filter(([, value]) => value !== null)
    .map(([key, value]) => [key, value as string] as [string, string]);
  const keysToRemove = backup.filter(([, value]) => value === null).map(([key]) => key);
  if (valuesToRestore.length > 0) await AsyncStorage.multiSet(valuesToRestore);
  if (keysToRemove.length > 0) await AsyncStorage.multiRemove(keysToRemove);
}

export async function applyImportWithRollback(bundle: ParsedImportBundle): Promise<void> {
  const prepared = prepareAvatarMediaImport(bundle);
  const durableChatBackup = await readDurableChatHistory();
  let succeeded = false;
  try {
    const keys = prepared.entries.map(([key]) => key);
    const backup = await AsyncStorage.multiGet(keys);
    try {
      await AsyncStorage.multiSet(prepared.entries);
      await useNanaStore.persist.rehydrate();
      if (!useNanaStore.persist.hasHydrated()) {
        throw new Error('The imported state could not be hydrated.');
      }
      await replaceDurableChatHistory(useNanaStore.getState().chatHistory);
      await flushDurableChatHistory();
    } catch (error) {
      try {
        await restoreBackup(backup);
        await useNanaStore.persist.rehydrate();
        await replaceDurableChatHistory(durableChatBackup);
        useNanaStore.setState({ chatHistory: durableChatBackup });
      } catch {
        throw new Error('Import failed and Nana could not restore the previous local backup. Restart the app before making more changes.');
      }
      throw new Error(`Import failed; the previous local data was restored. ${errorMessage(error, '')}`.trim());
    }
    succeeded = true;
  } finally {
    for (const uri of prepared.stagedUris) deleteStagedAvatar(uri);
    if (!succeeded) {
      for (const uri of prepared.finalUris) deleteFinalAvatar(uri);
    }
  }

  if (succeeded) {
    const currentState = useNanaStore.getState();
    pruneUnreferencedAvatarFiles(collectAvatarReferences(currentState as unknown as JsonRecord));
    void currentState.reconcilePayments();
  }
}

export async function exportData(): Promise<void> {
  try {
    const durableChatHistory = await readDurableChatHistory();
    const allKeys = await AsyncStorage.getAllKeys();
    const nanaKeys = Array.from(new Set([
      NANA_ROOT_STORAGE_KEY,
      ...allKeys.filter(isNanaStorageKey),
    ]));
    const storedPairs = await AsyncStorage.multiGet(nanaKeys);
    const storedValues: Record<string, unknown> = {};
    for (const [key, raw] of storedPairs) {
      if (raw !== null) storedValues[key] = parseStoredValue(raw);
    }

    if (!(NANA_ROOT_STORAGE_KEY in storedValues)) {
      storedValues[NANA_ROOT_STORAGE_KEY] = {
        state: selectNanaPersistedState(useNanaStore.getState()),
        version: NANA_PERSIST_VERSION,
      };
    }
    const rootValue = storedValues[NANA_ROOT_STORAGE_KEY];
    if (!isRecord(rootValue) || !isRecord(rootValue.state)) {
      throw new Error('Nana could not prepare the local state for export.');
    }
    storedValues[NANA_ROOT_STORAGE_KEY] = {
      ...rootValue,
      state: {
        ...rootValue.state,
        chatHistory: durableChatHistory,
      },
    };

    const avatarMedia = await createAvatarMediaManifest(storedValues);
    const document = createExportDocument(storedValues, new Date().toISOString(), avatarMedia);
    const json = JSON.stringify(document, null, 2);
    await Share.share({ message: json, title: 'Nana Export Data' });
  } catch (error) {
    Alert.alert('Export Error', errorMessage(error, 'Nana could not export the local data.'));
  }
}

export function importData(): void {
  useNanaStore.setState({
    promptModal: {
      isOpen: true,
      title: 'Import Data',
      value: '',
      inputMode: 'text',
      onSave: async (jsonText: string) => {
        try {
          const bundle = parseImportBundle(jsonText);
          await applyImportWithRollback(bundle);
          Alert.alert('Import Complete', `${bundle.entries.length} Nana storage entries were restored. API keys were not imported.`);
        } catch (error) {
          Alert.alert('Import Error', errorMessage(error, 'Nana could not import the data.'));
        }
      },
    },
  });
}

export async function clearAllData(): Promise<void> {
  await clearApiKey();
  const allKeys = await AsyncStorage.getAllKeys();
  const nanaKeys = allKeys.filter(isNanaStorageKey);
  if (nanaKeys.length > 0) await AsyncStorage.multiRemove(nanaKeys);
  await useNanaStore.persist.clearStorage();
  clearPersistedMedia();

  const initialState = useNanaStore.getInitialState();
  await replaceDurableChatHistory(initialState.chatHistory);
  useNanaStore.setState(initialState, true);
  await flushDurableChatHistory();
}
