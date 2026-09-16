import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const read = relativePath => readFileSync(resolve(root, relativePath), 'utf8');
const sourcePath = resolve(root, 'src/services/remoteProactiveRuntime.ts');
const compiled = ts.transpileModule(read('src/services/remoteProactiveRuntime.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName: sourcePath,
});
const module = { exports: {} };
vm.runInContext(compiled.outputText, vm.createContext({
  exports: module.exports,
  module,
  Date,
  JSON,
  Math,
  Map,
  Set,
  Object,
  Array,
  RegExp,
  String,
  Number,
  Promise,
  URL,
}), { filename: sourcePath });

const {
  REMOTE_PROACTIVE_MAX_LIFETIME_MS,
  createInMemoryRemoteProactiveReceiptStore,
  deliverRemoteProactiveEnvelope,
  normalizeRemoteProactiveEndpoint,
  parseRemoteProactiveEnvelope,
} = module.exports;
const errors = [];
const expect = (condition, message) => { if (!condition) errors.push(message); };
const now = 1_900_000_000_000;
const envelope = {
  schemaVersion: 1,
  kind: 'nana-remote-proactive',
  eventId: 'evt_20260817_0001',
  characterId: 'luna-id',
  text: '  Are you still awake?  ',
  generatedAt: now - 1_000,
  expiresAt: now + 60_000,
};

const parsed = parseRemoteProactiveEnvelope(envelope, now);
expect(parsed.ok && parsed.envelope.text === 'Are you still awake?', 'a valid remote message must normalize into the strict visible envelope');
expect(
  parseRemoteProactiveEnvelope({ ...envelope, apiKey: 'must-never-travel' }, now).reason === 'unknown-field',
  'unknown fields such as model credentials must fail closed',
);
expect(
  parseRemoteProactiveEnvelope({ ...envelope, chatHistory: ['private'] }, now).reason === 'unknown-field',
  'full chat history must not be accepted in a notification payload',
);
expect(
  parseRemoteProactiveEnvelope({ ...envelope, expiresAt: now }, now).reason === 'expired',
  'expired remote messages must not reach the chat writer',
);
expect(
  parseRemoteProactiveEnvelope({
    ...envelope,
    expiresAt: envelope.generatedAt + REMOTE_PROACTIVE_MAX_LIFETIME_MS + 1,
  }, now).reason === 'invalid-lifetime',
  'the server cannot create an unbounded notification lifetime',
);
expect(
  normalizeRemoteProactiveEndpoint('https://push.nana.example/v1/devices')?.startsWith('https://push.nana.example/'),
  'production registration endpoints must accept HTTPS',
);
expect(
  normalizeRemoteProactiveEndpoint('http://push.nana.example/v1/devices') === null
    && normalizeRemoteProactiveEndpoint('http://127.0.0.1:8787/v1/devices')?.startsWith('http://127.0.0.1'),
  'plain HTTP must be rejected except for explicit loopback development',
);

const receipts = createInMemoryRemoteProactiveReceiptStore();
let deliveryCount = 0;
const firstDelivery = await deliverRemoteProactiveEnvelope({
  value: envelope,
  source: 'received',
  receiptStore: receipts,
  now,
  handler: async () => { deliveryCount += 1; },
});
const duplicateDelivery = await deliverRemoteProactiveEnvelope({
  value: envelope,
  source: 'response',
  receiptStore: receipts,
  now,
  handler: async () => { deliveryCount += 1; },
});
expect(firstDelivery.status === 'delivered' && duplicateDelivery.status === 'duplicate' && deliveryCount === 1, 'received and tapped copies of one event must create exactly one chat write');

const retryReceipts = createInMemoryRemoteProactiveReceiptStore();
const failed = await deliverRemoteProactiveEnvelope({
  value: { ...envelope, eventId: 'evt_retry_0001' },
  source: 'response',
  receiptStore: retryReceipts,
  now,
  handler: async () => { throw new Error('durable chat write failed'); },
});
const retried = await deliverRemoteProactiveEnvelope({
  value: { ...envelope, eventId: 'evt_retry_0001' },
  source: 'initial-response',
  receiptStore: retryReceipts,
  now,
  handler: async () => {},
});
expect(failed.status === 'handler-failed' && retried.status === 'delivered', 'a receipt must be committed only after the canonical chat write succeeds');

const concurrentReceipts = createInMemoryRemoteProactiveReceiptStore();
let concurrentCount = 0;
let releaseFirst;
const gate = new Promise(resolveGate => { releaseFirst = resolveGate; });
const firstConcurrent = deliverRemoteProactiveEnvelope({
  value: { ...envelope, eventId: 'evt_concurrent_0001' },
  source: 'received',
  receiptStore: concurrentReceipts,
  now,
  handler: async () => {
    concurrentCount += 1;
    await gate;
  },
});
await Promise.resolve();
const secondConcurrent = await deliverRemoteProactiveEnvelope({
  value: { ...envelope, eventId: 'evt_concurrent_0001' },
  source: 'response',
  receiptStore: concurrentReceipts,
  now,
  handler: async () => { concurrentCount += 1; },
});
releaseFirst();
const completedConcurrent = await firstConcurrent;
expect(completedConcurrent.status === 'delivered' && secondConcurrent.status === 'duplicate' && concurrentCount === 1, 'simultaneous native listeners must share an in-flight event lock');

const nativeRuntime = read('src/services/proactiveNotificationRuntime.native.ts');
const webRuntime = read('src/services/proactiveNotificationRuntime.web.ts');
const client = read('src/services/remoteProactiveClient.ts');
const receiptRepository = read('src/services/remoteProactiveReceiptRepository.ts');
const documentation = read('docs/remote-proactive-messages.md');
const store = read('src/stores/nanaStore.ts');
const layout = read('src/app/_layout.tsx');
expect(
  nativeRuntime.indexOf('configureProactiveNotificationRuntime()')
    < nativeRuntime.indexOf('Notifications.getExpoPushTokenAsync({ projectId })'),
  'the Android notification channel must exist before acquiring an Expo push token',
);
expect(
  nativeRuntime.includes('getExpoPushTokenAsync({ projectId })')
    && nativeRuntime.includes('addNotificationReceivedListener')
    && nativeRuntime.includes('addNotificationResponseReceivedListener'),
  'native runtime must cover token registration, foreground receipt, and tap/cold-start handoff',
);
expect(
  !nativeRuntime.includes('requestPermissionsAsync({\n    ios:')
    || nativeRuntime.indexOf('registerRemoteProactivePushDevice') > nativeRuntime.indexOf('requestPermissionsAsync({\n    ios:'),
  'remote registration must never introduce a new startup permission prompt',
);
expect(
  client.includes("Authorization: `Bearer ${backendAccessToken}`")
    && client.includes("method: 'POST'")
    && client.includes('fetchWithTimeout')
    && client.includes('signal,'),
  'registration must use authenticated HTTPS with timeout and caller cancellation',
);
expect(
  !client.includes('apiKey')
    && !client.includes('chatHistory')
    && !client.includes('character.desc'),
  'registration code must not read or upload model credentials, history, or character definitions',
);
expect(
  receiptRepository.includes('REMOTE_PROACTIVE_RECEIPT_LIMIT = 256')
    && receiptRepository.includes('AsyncStorage.setItem'),
  'event receipts must survive process restarts while remaining bounded',
);
expect(
  !webRuntime.includes('expo-notifications')
    && webRuntime.includes("({ status: 'disabled' })")
    && webRuntime.includes('observeRemoteProactiveNotifications'),
  'web must remain an explicit no-op without loading native notification code',
);
expect(
  documentation.includes('does not add `expo-task-manager`')
    && documentation.includes('rebuilt binary')
    && documentation.includes('Backend Work Still Required'),
  'release notes must not claim that an OTA creates a silent closed-process backend flow',
);
expect(
  store.includes('receiveRemoteProactiveMessage: (envelope)')
    && store.includes('remote-proactive:${envelope.eventId}')
    && store.includes('history.some(message => message.turnId === turnId)')
    && store.includes('current.blockedUsers.includes(envelope.characterId)')
    && store.includes("character.proactiveMessagingFrequency === 'off'"),
  'the canonical chat writer must be event-idempotent and enforce relationship privacy switches',
);
expect(
  layout.includes('observeRemoteProactiveNotifications(commitRemoteMessage)')
    && layout.includes('consumeLastRemoteProactiveNotification(commitRemoteMessage)')
    && layout.includes("if (result === 'committed') await flushDurableChatHistory()"),
  'app hydration must connect foreground and cold-start remote events to the canonical chat writer',
);

if (errors.length > 0) {
  console.error('Remote proactive message contract check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Remote proactive message contract check passed.');
}
