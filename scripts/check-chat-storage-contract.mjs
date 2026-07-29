import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const storeSource = read('src/stores/nanaStore.ts');
const partializeStart = storeSource.indexOf('export function selectNanaPersistedState');
const partializeEnd = storeSource.indexOf('export const useNanaStore', partializeStart);
const partializeSource = storeSource.slice(partializeStart, partializeEnd);
expect(partializeStart >= 0 && partializeEnd > partializeStart, 'persisted-state selector must exist');
expect(!partializeSource.includes('chatHistory: state.chatHistory'), 'chat history must not be duplicated in the Zustand JSON payload');
expect(storeSource.includes('NANA_PERSIST_VERSION = 13'), 'voice provider, online media, and moments migration require storage version 13');

const nativeRepository = read('src/repositories/chatMessageRepository.native.ts');
for (const required of [
  'PRAGMA journal_mode = WAL',
  'PRIMARY KEY (chat_id, message_id)',
  'withExclusiveTransactionAsync',
  'legacy-chat-history-migrated',
  'ON CONFLICT (chat_id, message_id) DO UPDATE',
]) {
  expect(nativeRepository.includes(required), `native chat repository must include ${required}`);
}

const webRepository = read('src/repositories/chatMessageRepository.web.ts');
expect(webRepository.includes('@nana/chat-history-v1'), 'web smoke tests need an isolated durable chat key');

const persistenceSource = read('src/services/chatHistoryPersistence.ts');
expect(persistenceSource.includes('useNanaStore.subscribe'), 'chat state changes must be observed for durable persistence');
expect(persistenceSource.includes('lastPersistenceError'), 'durable chat write failures must remain observable');

const layoutSource = read('src/app/_layout.tsx');
expect(layoutSource.includes('hydrateDurableChatHistory'), 'startup must migrate and hydrate durable chat history');
expect(layoutSource.includes('startDurableChatHistoryPersistence'), 'startup must begin durable chat observation');

const storageSource = read('src/services/storage.ts');
expect(storageSource.includes('readDurableChatHistory'), 'exports must read the complete durable chat history');
expect(storageSource.includes('chatHistory: durableChatHistory'), 'exports must inject chat history into the portable backup');
expect(storageSource.includes('replaceDurableChatHistory(durableChatBackup)'), 'failed imports must restore the durable chat backup');

const chatViewSource = read('src/components/ChatView.tsx');
expect(chatViewSource.includes('<FlashList'), 'chat rendering must use a recycling list');
expect(chatViewSource.includes('startRenderingFromBottom: true'), 'chat rendering must start from the newest messages');
expect(chatViewSource.includes('animateAutoScrollToBottom: false'), 'opening a chat must not animate down through old messages');
expect(!chatViewSource.includes('{messages.map('), 'chat rendering must not mount every message with Array.map');
expect(chatViewSource.includes('__NANA_SMOKE_SEED_LONG_CHAT__'), 'long-chat recycling must have a deterministic smoke path');

const packageJson = JSON.parse(read('package.json'));
expect(packageJson.dependencies?.['expo-sqlite'] === '~55.0.18', 'Expo SDK 55 SQLite version must stay aligned');
expect(packageJson.dependencies?.['@shopify/flash-list'] === '2.0.2', 'Expo SDK 55 FlashList version must stay aligned');

console.log('Long-term chat storage contract checks passed.');
