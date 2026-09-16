import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const sourcePath = resolve(root, 'src/services/conversationContinuityRuntime.ts');
const source = readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
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
}), { filename: sourcePath });

const {
  formatConversationContinuityContext,
  isMutuallyAgreedOfflineMeeting,
  normalizeConversationContinuityMap,
  normalizeConversationContinuityState,
  parseConversationContinuityEnvelope,
  selectConversationContinuityFollowUp,
  transitionConversationMeetingHandoff,
  updateConversationContinuity,
} = module.exports;
const errors = [];
const expect = (condition, message) => { if (!condition) errors.push(message); };
const now = 1_900_000_000_000;

const parsed = parseConversationContinuityEnvelope(
  'I am here.<NANA_MSG>Tell me more.'
  + '<NANA_CONTINUITY>{"emotion":"concerned","emotionReason":"a hard day","topics":["work"],"openLoops":[{"kind":"question","owner":"character","summary":"What happened at work?"}]}</NANA_CONTINUITY>',
);
expect(parsed.text === 'I am here.<NANA_MSG>Tell me more.', 'private continuity metadata must never enter a visible bubble');
expect(parsed.patch?.emotion === 'concerned', 'valid model emotion metadata must be retained');
expect(parsed.patch?.topics?.[0] === 'work', 'valid model topics must be retained');
expect(parsed.patch?.openLoops?.[0]?.owner === 'character', 'valid model open loops must retain ownership');

const agreedPatch = parseConversationContinuityEnvelope(
  'See you tomorrow.<NANA_CONTINUITY>{"meetingHandoff":{"state":"agreed","title":"Tomorrow at the cafe","premise":"They agreed to meet at the cafe tomorrow afternoon."},"topics":[],"openLoops":[]}</NANA_CONTINUITY>',
).patch;
expect(agreedPatch?.meetingHandoff?.state === 'agreed', 'a structurally valid agreed handoff may be parsed as private metadata');
expect(isMutuallyAgreedOfflineMeeting("Okay, I'll be there at the cafe tomorrow. See you then.", 'Yes, see you there. I will come.'), 'explicit mutual in-person agreement must pass the application-side semantic guard');
expect(!isMutuallyAgreedOfflineMeeting('Maybe we could meet sometime?', 'That could be nice.'), 'vague or unresolved invitations must fail the semantic guard');

const malformed = parseConversationContinuityEnvelope(
  'Visible reply<NANA_CONTINUITY>{"emotion":',
);
expect(malformed.text === 'Visible reply' && !malformed.patch, 'malformed private metadata must be hidden and ignored');
const hostile = parseConversationContinuityEnvelope(
  'Visible</NANA_CONTINUITY><NANA_CONTINUITY>{"emotion":"teleported"}</NANA_CONTINUITY>',
);
expect(hostile.text === 'Visible' && !hostile.patch, 'unknown metadata values and stray tags must fail closed');

const first = updateConversationContinuity(undefined, {
  characterId: 'luna-id',
  turnId: 'turn-1',
  userText: 'I had a hard day at work and I feel tired.',
  characterText: 'I am worried about you. Do you want to tell me what happened?',
  modelPatch: parsed.patch,
  now,
});
expect(first.characterId === 'luna-id' && first.schemaVersion === 1, 'continuity state must be scoped and versioned per character');
expect(first.emotion === 'concerned', 'the current emotional tone must be captured');
expect(first.topics.length >= 1 && first.topics.length <= 3, 'active topics must be present and bounded');
expect(first.openLoops.some(loop => loop.kind === 'question'), 'an unanswered character question must remain open');
const firstQuestionId = first.openLoops.find(loop => loop.kind === 'question')?.id;

const second = updateConversationContinuity(first, {
  characterId: 'luna-id',
  turnId: 'turn-2',
  userText: 'My manager changed the plan. We should talk about it again tomorrow.',
  characterText: 'All right. Let us continue tomorrow.',
  now: now + 1_000,
});
expect(!second.openLoops.some(loop => loop.id === firstQuestionId), 'a user answer must resolve the previous character question');
expect(second.openLoops.some(loop => loop.kind === 'plan' && loop.owner === 'shared'), 'a shared future plan must remain open');
expect(second.lastTurnId === 'turn-2', 'the latest committed turn must own the current state revision');

const handoffState = updateConversationContinuity(second, {
  characterId: 'luna-id',
  turnId: 'turn-meeting',
  userText: "Okay, I'll be there at the cafe tomorrow. See you then.",
  characterText: 'Yes, see you there. I will come.',
  modelPatch: agreedPatch,
  sourceMessageIds: [101, 102],
  now: now + 1_500,
});
expect(handoffState.meetingHandoff?.state === 'available', 'a mutually agreed offline meeting must create one available handoff');
expect(handoffState.meetingHandoff?.sourceMessageIds.join(',') === '101,102', 'the app must attach source message ids instead of trusting model metadata');
const dismissedHandoff = transitionConversationMeetingHandoff(handoffState, 'dismissed', { now: now + 1_600 });
const repeatedHandoff = updateConversationContinuity(dismissedHandoff, {
  characterId: 'luna-id',
  turnId: 'turn-meeting',
  userText: "Okay, I'll be there at the cafe tomorrow. See you then.",
  characterText: 'Yes, see you there. I will come.',
  modelPatch: agreedPatch,
  sourceMessageIds: [101, 102],
  now: now + 1_700,
});
expect(repeatedHandoff.meetingHandoff?.state === 'dismissed', 'replaying the same turn must not resurrect a dismissed handoff');
const vagueHandoff = updateConversationContinuity(second, {
  characterId: 'luna-id',
  turnId: 'turn-vague',
  userText: 'Maybe we could meet sometime?',
  characterText: 'That could be nice.',
  modelPatch: agreedPatch,
  now: now + 1_800,
});
expect(!vagueHandoff.meetingHandoff, 'application validation must discard an agreed model patch when the visible turn is ambiguous');
expect(normalizeConversationContinuityState(handoffState, 'luna-id', handoffState.meetingHandoff.expiresAt + 1)?.meetingHandoff === undefined, 'handoffs must expire after their bounded lifetime');

let bounded = second;
for (let index = 0; index < 8; index += 1) {
  bounded = updateConversationContinuity(bounded, {
    characterId: 'luna-id',
    turnId: `turn-${index + 3}`,
    userText: `A distinct current topic number ${index}`,
    characterText: `Tell me more about topic ${index}?`,
    now: now + 2_000 + index,
  });
}
expect(bounded.topics.length === 3, 'topic history must stay bounded');
expect(bounded.openLoops.length <= 4, 'open threads must stay bounded');
expect(new Set(bounded.topics.map(topic => topic.id)).size === bounded.topics.length, 'topic identities must remain unique');

const context = formatConversationContinuityContext(first, now + 2_000);
expect(context.includes('ephemeral conversation state'), 'prompt context must explicitly distinguish continuity from long-term memory');
expect(context.includes('Active topics:'), 'active topics must be available to reply generation');
expect(context.includes('Open threads:'), 'open threads must be available to proactive generation');
expect(selectConversationContinuityFollowUp(first, now + 2_000), 'local proactive chat must have a bounded follow-up summary');
expect(normalizeConversationContinuityState(first, 'other-id', now) === null, 'state must never cross character identity');
expect(normalizeConversationContinuityState(first, 'luna-id', first.expiresAt + 1) === null, 'expired continuity must not be injected');
expect(Object.keys(normalizeConversationContinuityMap({
  'luna-id': first,
  'wrong-id': { ...first, characterId: 'luna-id' },
}, now)).join(',') === 'luna-id', 'persisted continuity maps must discard mismatched character records');

const aiSource = readFileSync(resolve(root, 'src/services/ai.ts'), 'utf8');
expect(aiSource.includes("'Current Conversation Continuity'"), 'AI context must include current short-term continuity');
expect(aiSource.includes("'Private Continuity Update'"), 'normal generation must request a private state patch in the same model call');
expect(aiSource.includes('parseConversationContinuityEnvelope(rawText)'), 'remote replies must strip and parse private metadata before display');
const storeSource = readFileSync(resolve(root, 'src/stores/nanaStore.ts'), 'utf8');
expect(storeSource.includes('NANA_PERSIST_VERSION = 15'), 'meeting configuration migration requires store version 15');
expect(storeSource.includes('normalizeConversationContinuityMap('), 'persisted continuity must be normalized during migration');
expect(storeSource.includes('conversationContinuityByCharacter: state.conversationContinuityByCharacter'), 'continuity must be included in portable persisted state');
expect(storeSource.match(/conversationContinuity: state\.conversationContinuityByCharacter/g)?.length >= 3, 'chat, proactive chat, and calls must receive continuity context');
expect(storeSource.match(/updateConversationContinuity\(/g)?.length >= 3, 'chat, proactive chat, and calls must update continuity only after commit');
expect(storeSource.includes('delete conversationContinuityByCharacter[chatId]'), 'clearing chat must clear its invisible short-term continuity');
const proactiveSource = readFileSync(resolve(root, 'src/services/proactiveChatRuntime.ts'), 'utf8');
expect(proactiveSource.includes('continuitySummary'), 'local proactive fallback must be able to continue an unfinished thread');
const storageSource = readFileSync(resolve(root, 'src/services/storage.ts'), 'utf8');
expect(storageSource.includes("'conversationContinuityByCharacter'"), 'portable backups must allow the validated continuity map');

if (errors.length > 0) {
  console.error('Conversation continuity contract check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Conversation continuity contract check passed.');
}
