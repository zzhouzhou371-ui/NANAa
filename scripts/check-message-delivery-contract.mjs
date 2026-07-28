import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const sourcePath = resolve(root, 'src/services/messageDeliveryRuntime.ts');
const source = readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName: sourcePath,
});
const module = { exports: {} };
const sandbox = vm.createContext({
  exports: module.exports,
  module,
  Date,
  Math,
  Set,
  require: specifier => {
    if (specifier === './chatRhythmRuntime') {
      return {
        resolveChatPresence: characterId => (
          characterId === 'online-character'
            ? 'online'
            : characterId === 'away-character' ? 'away' : 'resting'
        ),
      };
    }
    throw new Error(`Unexpected dependency: ${specifier}`);
  },
});
vm.runInContext(compiled.outputText, sandbox, { filename: sourcePath });

const {
  normalizeMessageDelivery,
  planMessageDelivery,
  resetFailedMessageDelivery,
  transitionMessageDelivery,
} = module.exports;
const errors = [];
const expect = (condition, message) => { if (!condition) errors.push(message); };
const attemptedAt = 1_900_000_000_000;

for (const characterId of ['online-character', 'away-character', 'resting-character']) {
  const first = planMessageDelivery({
    characterId,
    messageId: 101,
    messageText: 'A message worth reading',
    attemptedAt,
  });
  const second = planMessageDelivery({
    characterId,
    messageId: 101,
    messageText: 'A message worth reading',
    attemptedAt,
  });
  expect(
    first.attemptedAt < first.sentAt
      && first.sentAt < first.deliveredAt
      && first.deliveredAt < first.readNotBefore,
    `${characterId} delivery timestamps must be monotonic`,
  );
  expect(JSON.stringify(first) === JSON.stringify(second), `${characterId} planning must be deterministic`);
}

const fast = planMessageDelivery({
  characterId: 'online-character',
  messageId: 102,
  messageText: 'Fast path',
  attemptedAt,
  fast: true,
});
expect(
  fast.sentAt === attemptedAt
    && fast.deliveredAt === attemptedAt
    && fast.readNotBefore === attemptedAt,
  'fast mode must skip transport and reading waits',
);

const outgoing = {
  id: 201,
  sender: 'user',
  text: 'hello',
  time: '12:00',
  deliveryStatus: 'sending',
  deliveryAttemptCount: 1,
};
const sent = transitionMessageDelivery(outgoing, 'sent', attemptedAt + 1);
const delivered = transitionMessageDelivery(sent, 'delivered', attemptedAt + 2);
const noDowngrade = transitionMessageDelivery(delivered, 'sent', attemptedAt + 3);
const read = transitionMessageDelivery(delivered, 'read', attemptedAt + 4);
expect(sent.deliveryStatus === 'sent' && sent.sentAt === attemptedAt + 1, 'sending must transition to sent');
expect(delivered.deliveryStatus === 'delivered' && delivered.deliveredAt === attemptedAt + 2, 'sent must transition to delivered');
expect(noDowngrade === delivered, 'delivery state must never move backward');
expect(read.deliveryStatus === 'read' && read.readAt === attemptedAt + 4, 'delivered must transition to read');
expect(transitionMessageDelivery(read, 'failed', attemptedAt + 5) === read, 'read delivery must remain terminal');

const failed = transitionMessageDelivery(delivered, 'failed', attemptedAt + 6, 'offline');
const reset = resetFailedMessageDelivery(failed, attemptedAt + 7);
expect(failed.deliveryStatus === 'failed' && failed.failureMessage === 'offline', 'transport failure must retain useful retry detail');
expect(reset.id === failed.id && reset.deliveryStatus === 'sending', 'retry must reuse the original message ID');
expect(reset.deliveryAttemptCount === 2, 'retry must increment its attempt counter');
expect(!('failedAt' in reset) && !('failureMessage' in reset), 'retry must clear the previous failure metadata');

const legacy = { id: 301, sender: 'user', text: 'legacy', time: '11:00' };
expect(normalizeMessageDelivery(legacy) === legacy, 'legacy messages without delivery state must remain untouched');
const malformed = normalizeMessageDelivery({
  ...legacy,
  deliveryStatus: 'teleported',
  turnId: 42,
});
expect(!('deliveryStatus' in malformed) && !('turnId' in malformed), 'malformed delivery metadata must be removed safely');

const storeSource = readFileSync(resolve(root, 'src/stores/nanaStore.ts'), 'utf8');
const retryStart = storeSource.indexOf('retryChatMessage: async');
const retryEnd = storeSource.indexOf('startOutgoingCall:', retryStart);
const retrySource = storeSource.slice(retryStart, retryEnd);
expect(storeSource.includes("deliveryStatus: 'sending'"), 'new outgoing messages must begin in sending state');
expect(storeSource.includes('scheduleOutgoingMessageDelivery('), 'outgoing messages must schedule durable transport transitions');
expect(storeSource.includes('await waitForOutgoingTurnReadWindow('), 'reply generation must respect the character reading window');
expect(
  storeSource.indexOf('await waitForOutgoingTurnReadWindow(chatId, chatId, requestId, fastChat)')
    < storeSource.indexOf('desc: copy.typing'),
  'typing feedback must begin after the character reading window',
);
expect(storeSource.includes("transitionOutgoingTurn(chatId, requestId, 'read')"), 'successful generation must mark the whole user turn read');
expect(storeSource.includes("transitionOutgoingTurn(chatId, requestId, 'failed', failureMessage)"), 'generation failures must mark the original turn failed');
expect(storeSource.includes('cancelMessageDeliveryTimers(chatId);'), 'clearing a chat must cancel its pending delivery timers');
expect(retrySource.includes('resetFailedMessageDelivery(message, retryAt)'), 'retry must reset failed messages in place');
expect(retrySource.includes('retryMessageIds'), 'retry must replay the original message IDs');
expect(retrySource.includes('turnIdOverride: turnId'), 'multi-message retry must preserve its turn identity');

const layoutSource = readFileSync(resolve(root, 'src/app/_layout.tsx'), 'utf8');
expect(
  layoutSource.match(/reconcileChatDeliveryStates\(\)/g)?.length === 2,
  'delivery state must reconcile after hydration and foreground return',
);
const bubbleSource = readFileSync(resolve(root, 'src/components/ChatMessageBubble.tsx'), 'utf8');
expect(bubbleSource.includes('message-delivery-${msg.id}'), 'outgoing bubbles must expose a stable delivery-state test target');
expect(bubbleSource.includes('messageRetryHint'), 'failed bubbles must expose duplicate-safe retry guidance');
const nativeRepository = readFileSync(resolve(root, 'src/repositories/chatMessageRepository.native.ts'), 'utf8');
const webRepository = readFileSync(resolve(root, 'src/repositories/chatMessageRepository.web.ts'), 'utf8');
expect(nativeRepository.includes('normalizeMessageDelivery(value)'), 'native history loads must normalize delivery metadata');
expect(webRepository.includes('.map(normalizeMessageDelivery)'), 'web history loads must normalize delivery metadata');

if (errors.length > 0) {
  console.error('Message delivery contract check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Message delivery contract check passed.');
}
