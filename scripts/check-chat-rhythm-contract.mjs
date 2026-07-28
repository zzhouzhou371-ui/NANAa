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
  generateLocalSandboxReply,
  planChatReply,
  resolveChatPresence,
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

const storeSource = readFileSync(resolve(root, 'src/stores/nanaStore.ts'), 'utf8');
const sendChatStart = storeSource.indexOf('sendChatMessage: async');
const sendChatEnd = storeSource.indexOf('retryChatMessage: async', sendChatStart);
const sendChatSource = storeSource.slice(sendChatStart, sendChatEnd);
expect(sendChatSource.includes('planChatReply({'), 'chat sends must create a delivery plan');
expect(sendChatSource.includes('await waitForChatReplyPlan(replyPlan)'), 'chat sends must respect the planned delivery window');
expect(sendChatSource.includes("hasRemoteApiKey ? 'remote' : 'localSandbox'"), 'chat messages must record their generation source');
expect(sendChatSource.includes('generateLocalSandboxReply({'), 'no-key simulator chat must use the local adapter');
expect(!sendChatSource.includes('if (!state.apiKey)'), 'no-key simulator chat must not short-circuit into an error message');

if (errors.length > 0) {
  console.error('Chat rhythm contract check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Chat rhythm contract check passed.');
}
