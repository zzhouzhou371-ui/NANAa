import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');

function loadTypeScriptModule(relativePath, mocks) {
  const sourcePath = resolve(root, relativePath);
  const source = readFileSync(sourcePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: sourcePath,
  });
  const module = { exports: {} };
  const context = vm.createContext({
    exports: module.exports,
    module,
    require: (id) => {
      if (id in mocks) return mocks[id];
      throw new Error(`Unexpected module in storage contract test: ${id}`);
    },
    console,
    Date,
  });
  vm.runInContext(compiled.outputText, context, { filename: sourcePath });
  return module.exports;
}

const asyncValues = new Map();
let failNextMultiSet = false;
const asyncStorageMock = {
  getItem: async key => asyncValues.get(key) ?? null,
  setItem: async (key, value) => { asyncValues.set(key, value); },
  getAllKeys: async () => [...asyncValues.keys()],
  multiGet: async keys => keys.map(key => [key, asyncValues.get(key) ?? null]),
  multiSet: async entries => {
    if (failNextMultiSet) {
      failNextMultiSet = false;
      throw new Error('simulated storage failure');
    }
    for (const [key, value] of entries) asyncValues.set(key, value);
  },
  multiRemove: async keys => { for (const key of keys) asyncValues.delete(key); },
};
const secretStore = loadTypeScriptModule('src/services/secretStore.ts', {
  '@react-native-async-storage/async-storage': { default: asyncStorageMock },
  'expo-secure-store': {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    setItemAsync: async () => undefined,
    getItemAsync: async () => null,
    deleteItemAsync: async () => undefined,
  },
  'react-native': { Platform: { OS: 'web' } },
});

const stagedAvatarUris = [];
const promotedAvatarUris = [];
const deletedStagedAvatarUris = [];
const deletedFinalAvatarUris = [];
let reconcileCount = 0;
let durableChatHistory = {};
const avatarBytes = Buffer.from('avatar-contract-bytes');
const avatarBase64 = avatarBytes.toString('base64');
const localMediaRepositoryMock = {
  clearPersistedMedia() {},
  isPersistedMediaUri: uri => uri.includes('/nana-media/avatars/'),
  readPersistedAvatarForExport: async () => ({
    base64: avatarBase64,
    byteLength: avatarBytes.length,
    mimeType: 'image/jpeg',
    extension: 'jpg',
  }),
  stageImportedAvatar: (_base64, extension) => {
    const uri = `file:///cache/nana-avatar-staging/stage-${stagedAvatarUris.length}.${extension}`;
    stagedAvatarUris.push(uri);
    return uri;
  },
  promoteStagedAvatar: (_uri, extension) => {
    const uri = `file:///doc/nana-media/avatars/import-${promotedAvatarUris.length}.${extension}`;
    promotedAvatarUris.push(uri);
    return uri;
  },
  deleteStagedAvatar: uri => { deletedStagedAvatarUris.push(uri); return true; },
  deleteFinalAvatar: uri => { deletedFinalAvatarUris.push(uri); return true; },
  pruneUnreferencedAvatarFiles: () => 0,
};

const storage = loadTypeScriptModule('src/services/storage.ts', {
  '@react-native-async-storage/async-storage': asyncStorageMock,
  'react-native': { Alert: { alert() {} }, Share: { share: async () => undefined } },
  '../stores/nanaStore': {
    NANA_PERSIST_VERSION: 9,
    selectNanaPersistedState: state => state,
    useNanaStore: {
      setState() {},
      getState() {
        return {
          myAvatar: 'U', savedAvatars: [], characters: [], momentsList: [], callLogs: [], chatHistory: {},
          reconcilePayments() { reconcileCount += 1; },
        };
      },
      getInitialState() { return {}; },
      persist: {
        rehydrate: async () => undefined,
        hasHydrated: () => true,
        clearStorage: async () => undefined,
      },
    },
  },
  './secretStore': secretStore,
  './localMediaRepository': localMediaRepositoryMock,
  './avatarValueRuntime': {
    hasNanaManagedAvatarPath: value => {
      const normalized = value.replace(/\\/g, '/');
      return (/^file:/i.test(normalized) || normalized.startsWith('/') || /^[a-z]:\//i.test(normalized))
        && normalized.includes('/nana-media/avatars/');
    },
    isPortableAvatarDataUri: value => /^data:image\/(?:jpeg|jpg|png|webp);base64,[a-z0-9+/]+={0,2}$/i.test(value),
  },
  './chatHistoryPersistence': {
    flushDurableChatHistory: async () => undefined,
    readDurableChatHistory: async () => durableChatHistory,
    replaceDurableChatHistory: async history => { durableChatHistory = history; },
  },
});

const errors = [];
const expect = (condition, message) => {
  if (!condition) errors.push(message);
};
const expectThrows = (fn, expectedText, message) => {
  try {
    fn();
    errors.push(message);
  } catch (error) {
    if (!String(error?.message || error).includes(expectedText)) {
      errors.push(`${message} (unexpected error: ${String(error?.message || error)})`);
    }
  }
};
const expectRejects = async (promise, expectedText, message) => {
  try {
    await promise;
    errors.push(message);
  } catch (error) {
    if (!String(error?.message || error).includes(expectedText)) {
      errors.push(`${message} (unexpected error: ${String(error?.message || error)})`);
    }
  }
};

const original = {
  state: {
    myName: 'User',
    myAvatar: 'file:///doc/nana-media/avatars/user.jpg',
    apiKey: 'legacy-secret',
    nested: [{ tempApiKey: 'nested-secret', safe: true }],
  },
  version: 0,
};
const redacted = secretStore.redactSecrets(original);
expect(original.state.apiKey === 'legacy-secret', 'redaction must not mutate the input object');
expect(!('apiKey' in redacted.state), 'redaction must remove apiKey recursively');
expect(!('tempApiKey' in redacted.state.nested[0]), 'redaction must remove tempApiKey recursively');
expect(redacted.state.nested[0].safe === true, 'redaction must preserve non-secret values');

const sanitized = secretStore.sanitizePersistedRootJson(JSON.stringify(original));
expect(sanitized.legacyApiKey === 'legacy-secret', 'legacy migration must extract the old API key');
expect(sanitized.changed === true, 'legacy migration must report that persistent data changed');
expect(!sanitized.raw.includes('legacy-secret'), 'sanitized persistent JSON must not contain the legacy key');
expect(!sanitized.raw.includes('nested-secret'), 'sanitized persistent JSON must not contain nested temporary keys');

const webStorageWrites = [];
const webSecretStore = loadTypeScriptModule('src/services/secretStore.ts', {
  '@react-native-async-storage/async-storage': {
    getItem: async () => JSON.stringify(original),
    setItem: async (key, value) => { webStorageWrites.push([key, value]); },
  },
  'expo-secure-store': {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    setItemAsync: async () => { throw new Error('SecureStore must not be called on web'); },
    getItemAsync: async () => { throw new Error('SecureStore must not be called on web'); },
    deleteItemAsync: async () => { throw new Error('SecureStore must not be called on web'); },
  },
  'react-native': { Platform: { OS: 'web' } },
});
const webHydration = await webSecretStore.prepareApiKeyForHydration();
expect(webHydration.apiKey === 'legacy-secret', 'web migration must keep a legacy key for the current session');
expect(webHydration.storage === 'session-memory', 'web keys must be session-memory only');
expect(webStorageWrites.length === 1, 'web migration must rewrite the persisted root once');
expect(!webStorageWrites[0][1].includes('legacy-secret'), 'web migration must remove the key from persistent browser storage');

let nativeSecureStoreWrites = 0;
let nativeSanitizedRoot = '';
const nativeSecretStore = loadTypeScriptModule('src/services/secretStore.ts', {
  '@react-native-async-storage/async-storage': {
    getItem: async () => JSON.stringify(original),
    setItem: async (_key, value) => { nativeSanitizedRoot = value; },
  },
  'expo-secure-store': {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    setItemAsync: async () => { nativeSecureStoreWrites += 1; },
    getItemAsync: async () => 'newer-secure-key',
    deleteItemAsync: async () => undefined,
  },
  'react-native': { Platform: { OS: 'ios' } },
});
const nativeHydration = await nativeSecretStore.prepareApiKeyForHydration();
expect(nativeHydration.apiKey === 'newer-secure-key', 'an existing SecureStore key must take precedence over a stale legacy key');
expect(nativeSecureStoreWrites === 0, 'legacy migration must not overwrite an existing SecureStore key');
expect(!nativeSanitizedRoot.includes('legacy-secret'), 'native migration must still remove the stale plaintext key');

expect(storage.isNanaStorageKey('nana-root') === true, 'nana-root must be treated as Nana storage');
expect(storage.isNanaStorageKey('nana_preferences') === true, 'nana_ keys must be treated as Nana storage');
expect(storage.isNanaStorageKey('other-app') === false, 'unrelated keys must be excluded');

const rootValue = {
  state: {
    myName: 'User',
    myAvatar: 'file:///doc/nana-media/avatars/user.jpg',
    apiUrl: 'https://example.com/v1',
    apiKey: 'do-not-export',
    unreadCounts: { 'luna-id': 2 },
    blockedUsers: ['kai-id'],
    relationshipTraces: [{ id: 'trace:chat:luna-id:1', characterId: 'luna-id' }],
    walletBalanceMinor: 888800,
    paymentsById: {
      'payment:contract': {
        schemaVersion: 1,
        id: 'payment:contract',
        chatId: 'luna-id',
        kind: 'transfer',
        direction: 'outgoing',
        senderId: 'user',
        recipientId: 'luna-id',
        amountMinor: 1888,
        currency: 'CNY',
        status: 'pending',
        fundsState: 'held',
        createdAt: 100,
        updatedAt: 110,
        expiresAt: 86400100,
        reactionState: 'scheduled',
        reactionDueAt: 200,
        reactionAttempts: 0,
      },
    },
  },
  version: 2,
};
const exported = storage.createExportDocument({
  'nana-root': rootValue,
  nana_preferences: { tempApiKey: 'do-not-export-either', language: 'zh' },
  unrelated: { apiKey: 'unrelated' },
}, '2026-07-12T00:00:00.000Z');
const exportedText = JSON.stringify(exported);
expect('nana-root' in exported.data, 'exports must include nana-root');
expect('nana_preferences' in exported.data, 'exports must include Nana auxiliary keys');
expect(!('unrelated' in exported.data), 'exports must exclude unrelated storage keys');
expect(!exportedText.includes('do-not-export'), 'exports must recursively redact API keys');
expect(exported.version === 2, 'new exports must use the v2 envelope');

const generatedAvatarMedia = await storage.createAvatarMediaManifest({ 'nana-root': rootValue });
expect(generatedAvatarMedia.avatars.length === 1, 'v2 export must embed referenced Nana-managed avatars');
expect(generatedAvatarMedia.avatars[0].byteLength === avatarBytes.length, 'avatar manifest must preserve decoded byte length');
const exportedWithAvatar = storage.createExportDocument(
  { 'nana-root': rootValue },
  '2026-07-12T00:00:00.000Z',
  generatedAvatarMedia,
);
expect(exportedWithAvatar.avatarMedia.avatars[0].base64 === avatarBase64, 'v2 export envelope must include avatar base64 data');
const webDataAvatar = `data:image/jpeg;base64,${avatarBase64}`;
const generatedWebAvatarMedia = await storage.createAvatarMediaManifest({
  'nana-root': { state: { myAvatar: webDataAvatar }, version: 2 },
});
expect(generatedWebAvatarMedia === undefined, 'portable web data-image avatars must stay inline instead of being duplicated in the media manifest');
const maximumInlineAvatars = [1, 2, 3].map(fill => (
  `data:image/jpeg;base64,${Buffer.alloc(512 * 1024, fill).toString('base64')}`
));
const inlineOnlyRoot = { state: { myAvatar: maximumInlineAvatars[0], savedAvatars: maximumInlineAvatars }, version: 2 };
const inlineOnlyManifest = await storage.createAvatarMediaManifest({ 'nana-root': inlineOnlyRoot });
const inlineOnlyExport = storage.createExportDocument(
  { 'nana-root': inlineOnlyRoot },
  '2026-07-12T00:00:00.000Z',
  inlineOnlyManifest,
);
const inlineOnlyExportText = JSON.stringify(inlineOnlyExport);
expect(!('avatarMedia' in inlineOnlyExport), 'inline-only web backups must not contain duplicated avatar media');
expect(inlineOnlyExportText.length < 5 * 1024 * 1024, 'three legal 512 KiB inline avatars must remain below the import envelope limit');
expect(storage.parseImportBundle(inlineOnlyExportText).entries.length === 1, 'Nana must accept its own maximum-size inline avatar export');

const avatarBundle = storage.parseImportBundle(JSON.stringify(exportedWithAvatar));
const preparedAvatarImport = storage.prepareAvatarMediaImport(avatarBundle);
const preparedRoot = JSON.parse(preparedAvatarImport.entries.find(([key]) => key === 'nana-root')[1]);
expect(preparedRoot.state.myAvatar.includes('/nana-media/avatars/import-'), 'avatar import must replace source-device URI with promoted local URI');
expect(stagedAvatarUris.length >= 1 && promotedAvatarUris.length >= 1, 'avatar import must stage before promotion');

asyncValues.set('nana-root', JSON.stringify({ state: { myName: 'Before import' }, version: 2 }));
const deletedBeforeRollback = deletedFinalAvatarUris.length;
failNextMultiSet = true;
await expectRejects(
  storage.applyImportWithRollback(avatarBundle),
  'previous local data was restored',
  'failed avatar imports must restore AsyncStorage',
);
expect(deletedFinalAvatarUris.length > deletedBeforeRollback, 'failed avatar imports must delete promoted final files');
expect(JSON.parse(asyncValues.get('nana-root')).state.myName === 'Before import', 'failed avatar imports must retain the previous root state');

await storage.applyImportWithRollback(avatarBundle);
expect(reconcileCount === 1, 'successful data restore must reconcile persisted payments once');
expect(JSON.parse(asyncValues.get('nana-root')).state.myAvatar.includes('/nana-media/avatars/import-'), 'successful avatar import must persist rewritten local references');

const importedEntries = storage.parseImportDocument(JSON.stringify(exportedWithAvatar));
const importedRoot = JSON.parse(importedEntries.find(([key]) => key === 'nana-root')[1]);
expect(importedRoot.state.myName === 'User', 'imports must preserve valid Nana state');
expect(importedRoot.state.unreadCounts['luna-id'] === 2, 'imports must preserve persisted unread counts');
expect(importedRoot.state.blockedUsers[0] === 'kai-id', 'imports must preserve persisted blocked users');
expect(importedRoot.state.relationshipTraces[0].characterId === 'luna-id', 'imports must preserve relationship traces');
expect(importedRoot.state.walletBalanceMinor === 888800, 'v2 imports must preserve canonical minor-unit wallet balance');
expect(importedRoot.state.paymentsById['payment:contract'].amountMinor === 1888, 'v2 imports must preserve payment entities');
expect(!('apiKey' in importedRoot.state), 'imports must never restore API keys');

const legacyV1Entries = storage.parseImportDocument(JSON.stringify({
  format: 'nana-export',
  version: 1,
  exportedAt: '2026-07-12T00:00:00.000Z',
  data: { 'nana-root': { state: { walletBalance: '88.00', myName: 'Legacy' }, version: 1 } },
}));
expect(legacyV1Entries.length === 1, 'v1 export envelopes must remain importable');
const legacyV1ManagedAvatarEntries = storage.parseImportDocument(JSON.stringify({
  format: 'nana-export',
  version: 1,
  data: { 'nana-root': { state: { myAvatar: 'file:///old-device/nana-media/avatars/user.jpg' }, version: 1 } },
}));
expect(legacyV1ManagedAvatarEntries.length === 1, 'v1 backups must remain importable even though they predate avatar manifests');

expectThrows(
  () => storage.parseImportDocument(JSON.stringify({ format: 'nana-export', version: 1, data: { nana_preferences: {} } })),
  'missing the nana-root',
  'imports without nana-root must be rejected',
);
expectThrows(
  () => storage.parseImportDocument(JSON.stringify({
    format: 'nana-export',
    version: 1,
    data: { 'nana-root': { state: { chatHistory: [] }, version: 1 } },
  })),
  'chatHistory must be an object',
  'imports with invalid field types must be rejected',
);
expectThrows(
  () => storage.parseImportDocument(JSON.stringify({
    format: 'nana-export',
    version: 1,
    data: { 'nana-root': { state: { myName: 'Future' }, version: 99 } },
  })),
  'unsupported storage version',
  'future persisted versions must be rejected',
);
expectThrows(
  () => storage.parseImportDocument(JSON.stringify({
    format: 'nana-export',
    version: 1,
    data: { 'nana-root': { state: { sendChatMessage: 'malicious override' }, version: 1 } },
  })),
  'Unsupported Nana state field',
  'imports must reject fields outside the persistence allowlist',
);
expectThrows(
  () => storage.parseImportDocument(JSON.stringify({
    format: 'nana-export',
    version: 2,
    data: {
      'nana-root': {
        state: {
          walletBalanceMinor: 100,
          paymentsById: {
            broken: { ...rootValue.state.paymentsById['payment:contract'], id: 'broken', amountMinor: -1 },
          },
        },
        version: 2,
      },
    },
  })),
  'Invalid Nana payment',
  'imports must reject invalid payment entities',
);
expectThrows(
  () => storage.parseImportDocument(JSON.stringify({
    format: 'nana-export',
    version: 2,
    data: {
      'nana-root': {
        state: {
          paymentsById: {
            inconsistent: {
              ...rootValue.state.paymentsById['payment:contract'],
              id: 'inconsistent',
              status: 'pending',
              fundsState: 'released',
            },
          },
        },
        version: 2,
      },
    },
  })),
  'Invalid Nana payment',
  'imports must reject status/fundsState combinations that could settle without a valid hold',
);

const manifestDocument = avatarMedia => ({
  format: 'nana-export',
  version: 2,
  exportedAt: '2026-07-12T00:00:00.000Z',
  data: { 'nana-root': { state: { myAvatar: 'file:///doc/nana-media/avatars/avatar-0.jpg' }, version: 2 } },
  avatarMedia,
});
const manifestEntry = (index, base64, byteLength) => ({
  id: `avatar-${index}`,
  sourceUri: `file:///doc/nana-media/avatars/avatar-${index}.jpg`,
  mimeType: 'image/jpeg',
  extension: 'jpg',
  byteLength,
  base64,
});
expectThrows(
  () => storage.parseImportBundle(JSON.stringify(manifestDocument(undefined))),
  'missing media for a managed avatar reference',
  'v2 imports must reject a managed avatar reference without a media manifest',
);
const inlineWebBundle = storage.parseImportBundle(JSON.stringify({
  format: 'nana-export',
  version: 2,
  data: { 'nana-root': { state: { myAvatar: webDataAvatar }, version: 2 } },
}));
expect(inlineWebBundle.avatarMedia === undefined, 'v2 inline web avatars must import without a native media manifest');
expectThrows(
  () => storage.parseImportBundle(JSON.stringify({
    format: 'nana-export',
    version: 2,
    data: {
      'nana-root': {
        state: {
          myAvatar: 'file:///doc/nana-media/avatars/avatar-0.jpg',
          savedAvatars: ['file:///doc/nana-media/avatars/avatar-1.jpg'],
        },
        version: 2,
      },
    },
    avatarMedia: { version: 1, avatars: [manifestEntry(0, 'YQ==', 1)] },
  })),
  'missing media for a managed avatar reference',
  'v2 imports must reject a partial avatar manifest',
);
expectThrows(
  () => storage.parseImportBundle(JSON.stringify(manifestDocument({
    version: 1,
    avatars: Array.from({ length: 65 }, (_, index) => manifestEntry(index, 'YQ==', 1)),
  }))),
  'exceeds 64 avatars',
  'avatar manifests must enforce the 64-entry limit',
);
const oversizedAvatarBytes = Buffer.alloc(512 * 1024 + 1, 1);
expectThrows(
  () => storage.parseImportBundle(JSON.stringify(manifestDocument({
    version: 1,
    avatars: [manifestEntry(0, oversizedAvatarBytes.toString('base64'), oversizedAvatarBytes.length)],
  }))),
  'exceeds 512 KiB',
  'avatar manifests must enforce the per-avatar byte limit',
);
const totalLimitChunk = Buffer.alloc(450 * 1024, 2);
expectThrows(
  () => storage.parseImportBundle(JSON.stringify(manifestDocument({
    version: 1,
    avatars: Array.from({ length: 7 }, (_, index) => manifestEntry(index, totalLimitChunk.toString('base64'), totalLimitChunk.length)),
  }))),
  'exceeds 3 MiB',
  'avatar manifests must enforce the total byte limit',
);

if (errors.length > 0) {
  console.error('Storage contract check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Storage contract check passed.');
}
