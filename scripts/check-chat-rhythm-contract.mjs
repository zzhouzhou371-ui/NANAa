import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const sourcePath = resolve(root, 'src/services/chatRhythmRuntime.ts');
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
  Promise,
  setTimeout,
});
vm.runInContext(compiled.outputText, sandbox, { filename: sourcePath });

const {
  appendUserMessageToBurst,
  beginUserMessageBurst,
  cancelUserMessageBurst,
  characterFollowUpDelayMs,
  collectUserMessageBurst,
  generateLocalSandboxReply,
  isCollectingUserMessageBurst,
  planChatReply,
  resolveChatPresence,
  splitCharacterReplyIntoMessages,
} = module.exports;
const errors = [];
const expect = (condition, message) => { if (!condition) errors.push(message); };

const atLocalHour = hour => new Date(2026, 6, 28, hour, 0, 0, 0).getTime();
const findCharacterForPresence = (presence, now) => {
  for (let index = 0; index < 5_000; index += 1) {
    const characterId = `character-${index}`;
    if (resolveChatPresence(characterId, now) === presence) return characterId;
  }
  throw new Error(`Could not find deterministic ${presence} fixture`);
};

for (const presence of ['online', 'away', 'resting']) {
  const now = presence === 'online' ? atLocalHour(22) : presence === 'away' ? atLocalHour(12) : atLocalHour(3);
  const characterId = findCharacterForPresence(presence, now);
  const plan = planChatReply({ characterId, userText: 'Tell me more', now });
  expect(plan.presence === presence, `${presence} plan must preserve presence`);
  expect(plan.delayMs > 0, `${presence} plan must not deliver instantly`);
  expect(plan.deliverNotBefore === now + plan.delayMs, `${presence} plan must expose an absolute delivery window`);
}

const fastPlan = planChatReply({
  characterId: 'luna-id',
  userText: 'Smoke test',
  now: atLocalHour(20),
  fast: true,
});
expect(fastPlan.delayMs === 0 && fastPlan.deliverNotBefore === fastPlan.requestedAt, 'fast test mode must remain deterministic');

const firstPlan = planChatReply({ characterId: 'luna-id', userText: 'Same input', now: atLocalHour(20) });
const secondPlan = planChatReply({ characterId: 'luna-id', userText: 'Same input', now: atLocalHour(20) });
expect(JSON.stringify(firstPlan) === JSON.stringify(secondPlan), 'reply planning must be deterministic for a retry in the same minute');

const zhGreeting = generateLocalSandboxReply({ characterName: 'Luna', userText: '你好', language: 'zh-CN' });
const enQuestion = generateLocalSandboxReply({ characterName: 'Luna', userText: 'Are you there?', language: 'en' });
expect(zhGreeting.includes('我在'), 'Chinese sandbox greeting must be localized');
expect(!zhGreeting.includes('API'), 'sandbox replies must not expose implementation copy');
expect(/[A-Za-z]/.test(enQuestion) && !enQuestion.includes('API'), 'English sandbox question must be natural and localized');
expect(splitCharacterReplyIntoMessages(zhGreeting).length === 2, 'sandbox greetings should exercise consecutive character bubbles');

const explicitBubbles = splitCharacterReplyIntoMessages('First.<NANA_MSG>Second.<NANA_MSG>Third.');
expect(explicitBubbles.length === 3 && explicitBubbles[1] === 'Second.', 'explicit bubble separators must preserve ordered messages');
const overflowBubbles = splitCharacterReplyIntoMessages('1|||2|||3|||4|||5');
expect(overflowBubbles.length === 3 && overflowBubbles[2] === '3 4 5', 'bubble overflow must merge safely into the final message');
const paragraphBubbles = splitCharacterReplyIntoMessages('One thought.\n\nAnother thought.');
expect(paragraphBubbles.length === 2, 'blank-line model output should become separate messages');
const shortReply = splitCharacterReplyIntoMessages('One short reply.');
expect(shortReply.length === 1, 'short replies should remain one bubble');

const followUpDelay = characterFollowUpDelayMs({
  characterId: 'luna-id',
  messageText: 'One more thing.',
  messageIndex: 1,
});
expect(followUpDelay >= 350 && followUpDelay <= 1_800, 'follow-up bubbles need a bounded conversational pause');
expect(characterFollowUpDelayMs({
  characterId: 'luna-id',
  messageText: 'One more thing.',
  messageIndex: 1,
  fast: true,
}) === 0, 'fast test mode must skip follow-up pauses');

beginUserMessageBurst('luna-id', 'burst-1', { sourceMessageId: 101, text: 'First' }, 1_000);
expect(isCollectingUserMessageBurst('luna-id', 'burst-1'), 'a new user burst must accept consecutive text messages');
expect(appendUserMessageToBurst('luna-id', 'burst-1', { sourceMessageId: 102, text: 'Second' }, 1_200), 'a matching burst must accept the second message');
expect(!appendUserMessageToBurst('luna-id', 'stale-burst', { sourceMessageId: 103, text: 'Wrong turn' }, 1_300), 'a stale request must not join the burst');
const collectedBurst = await collectUserMessageBurst({ chatId: 'luna-id', requestId: 'burst-1', fast: true });
expect(collectedBurst?.map(item => item.text).join('|') === 'First|Second', 'burst collection must preserve user message order');
expect(!isCollectingUserMessageBurst('luna-id', 'burst-1'), 'a collected burst must close before generation starts');
cancelUserMessageBurst('luna-id', 'burst-1');

const storeSource = readFileSync(resolve(root, 'src/stores/nanaStore.ts'), 'utf8');
const sendChatStart = storeSource.indexOf('sendChatMessage: async');
const sendChatEnd = storeSource.indexOf('retryChatMessage: async', sendChatStart);
const sendChatSource = storeSource.slice(sendChatStart, sendChatEnd);
expect(sendChatSource.includes('planChatReply({'), 'chat sends must create a delivery plan');
expect(sendChatSource.includes('await waitForChatReplyPlan(replyPlan)'), 'chat sends must respect the planned delivery window');
expect(sendChatSource.includes("hasRemoteApiKey ? 'remote' : 'localSandbox'"), 'chat messages must record their generation source');
expect(sendChatSource.includes('generateLocalSandboxReply({'), 'no-key simulator chat must use the local adapter');
expect(sendChatSource.includes('isCollectingUserMessageBurst(chatId, pendingRequestId)'), 'a pending collecting turn must accept consecutive user text');
expect(sendChatSource.includes('appendUserMessageToBurst(chatId, pendingRequestId'), 'joined user messages must enter the active burst');
expect(sendChatSource.includes('await collectUserMessageBurst({'), 'generation must wait for the user burst quiet window');
expect(sendChatSource.includes("burstItems.map(item => item.text).join('\\n')"), 'the model must receive the full ordered user burst');
expect(sendChatSource.includes('splitCharacterReplyIntoMessages(rawReplyText)'), 'generated text must become one to three message bubbles');
expect(sendChatSource.includes('for (const [messageIndex, messageText] of deliveryMessages.entries())'), 'character bubbles must be committed in delivery order');
expect(sendChatSource.includes('await waitForCharacterFollowUp({'), 'consecutive character bubbles must have a conversational pause');
expect(sendChatSource.includes('isCurrentChatRequest(s.pendingChatRequests, chatId, requestId)'), 'every bubble commit must remain guarded by the request token');
expect(!sendChatSource.includes('if (!state.apiKey)'), 'no-key simulator chat must not short-circuit into an error message');
const clearChatStart = storeSource.indexOf('clearChat: (chatId) =>');
const clearChatEnd = storeSource.indexOf('correctRelationshipMemory:', clearChatStart);
expect(storeSource.slice(clearChatStart, clearChatEnd).includes('cancelUserMessageBurst(chatId)'), 'clearing chat must cancel its active burst window');
const aiSource = readFileSync(resolve(root, 'src/services/ai.ts'), 'utf8');
expect(aiSource.includes("'Online Message Format'"), 'AI context must declare the multi-bubble response contract');
expect(aiSource.includes('Separate multiple bubbles with the exact token <NANA_MSG>'), 'remote providers must receive the exact bubble separator');

if (errors.length > 0) {
  console.error('Chat rhythm contract check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Chat rhythm contract check passed.');
}
