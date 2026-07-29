import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const sourcePath = resolve(root, 'src/services/proactiveChatRuntime.ts');
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
const sandbox = vm.createContext({
  exports: module.exports,
  module,
  require: id => {
    if (id === './chatRhythmRuntime') {
      return {
        CHAT_BUBBLE_SEPARATOR: '<NANA_MSG>',
        resolveChatPresence: characterId => characterId === 'resting-id' ? 'resting' : 'online',
      };
    }
    throw new Error(`Unexpected proactive runtime dependency: ${id}`);
  },
  Date,
  Math,
  Object,
  Set,
});
vm.runInContext(compiled.outputText, sandbox, { filename: sourcePath });

const {
  PROACTIVE_GLOBAL_COOLDOWN_MS,
  PROACTIVE_INTERACTION_DELAY_MIN_MS,
  PROACTIVE_INTERACTION_DELAY_MAX_MS,
  PROACTIVE_SENT_DELAY_MIN_MS,
  PROACTIVE_SENT_DELAY_MAX_MS,
  createInitialProactiveSchedule,
  createLocalProactiveMessage,
  normalizeProactiveChatSchedules,
  rescheduleAfterProactiveMessage,
  rescheduleProactiveAfterInteraction,
  selectDueProactiveCandidate,
  selectProactiveFocusEvent,
} = module.exports;

const errors = [];
const expect = (condition, message) => { if (!condition) errors.push(message); };
const now = new Date(2026, 6, 28, 20, 0, 0, 0).getTime();

const initial = createInitialProactiveSchedule('luna-id', now);
expect(initial.lastInteractionAt === now, 'initial scheduling must record the initialization time');
expect(
  initial.nextDueAt >= now + PROACTIVE_INTERACTION_DELAY_MIN_MS
    && initial.nextDueAt < now + PROACTIVE_INTERACTION_DELAY_MAX_MS,
  'initial scheduling must wait inside the interaction delay window',
);

const interacted = rescheduleProactiveAfterInteraction(
  { ...initial, lastSentAt: now - 100_000 },
  'luna-id',
  now + 5_000,
);
expect(interacted.lastInteractionAt === now + 5_000, 'a real interaction must move the relationship clock forward');
expect(interacted.lastSentAt === now - 100_000, 'interaction rescheduling must preserve proactive send history');

const sent = rescheduleAfterProactiveMessage(interacted, 'luna-id', now + 10_000);
expect(sent.lastSentAt === now + 10_000, 'a proactive delivery must record its send time');
expect(sent.lastReason === 'quietReconnect', 'a proactive delivery must retain its scheduling reason');
expect(
  sent.nextDueAt >= now + 10_000 + PROACTIVE_SENT_DELAY_MIN_MS
    && sent.nextDueAt < now + 10_000 + PROACTIVE_SENT_DELAY_MAX_MS,
  'a proactive delivery must enter the longer anti-spam window',
);
const eventSent = rescheduleAfterProactiveMessage(
  interacted,
  'luna-id',
  now + 20_000,
  'trace:event:2',
);
expect(
  eventSent.lastReason === 'eventFollowUp'
    && eventSent.lastContextTraceId === 'trace:event:2',
  'event-motivated outreach must remember which event it used',
);

const normalized = normalizeProactiveChatSchedules({
  'luna-id': initial,
  'wrong-key': { ...initial, characterId: 'another-id' },
  broken: { characterId: 'broken', lastInteractionAt: -1, nextDueAt: 'soon' },
});
expect(Object.keys(normalized).join('|') === 'luna-id', 'migration must discard malformed or mismatched schedules');

const characters = [
  { id: 'later-id', name: 'Later', avatar: 'L', desc: '' },
  { id: 'luna-id', name: 'Luna', avatar: 'U', desc: '' },
  { id: 'blocked-id', name: 'Blocked', avatar: 'B', desc: '' },
  { id: 'pending-id', name: 'Pending', avatar: 'P', desc: '' },
  { id: 'resting-id', name: 'Resting', avatar: 'R', desc: '' },
  { id: 'disabled-id', name: 'Disabled', avatar: 'D', desc: '', proactiveMessagingEnabled: false },
  { id: 'stranger-id', name: 'Stranger', avatar: 'S', desc: '' },
];
const dueSchedules = Object.fromEntries(characters.map((character, index) => [
  character.id,
  {
    characterId: character.id,
    lastInteractionAt: now - 20_000,
    nextDueAt: now - (characters.length - index) * 1_000,
  },
]));
const candidate = selectDueProactiveCandidate({
  characters,
  friends: ['later-id', 'luna-id', 'blocked-id', 'pending-id', 'resting-id', 'disabled-id'],
  schedules: dueSchedules,
  pendingChatRequests: { 'pending-id': 'request-1' },
  blockedUsers: ['blocked-id'],
  now,
});
expect(candidate?.id === 'later-id', 'candidate selection must choose the earliest eligible due friend');

const restingOnly = selectDueProactiveCandidate({
  characters,
  friends: ['resting-id'],
  schedules: dueSchedules,
  pendingChatRequests: {},
  blockedUsers: [],
  now,
});
expect(restingOnly === null, 'resting characters must not initiate a conversation');
const disabledOnly = selectDueProactiveCandidate({
  characters,
  friends: ['disabled-id'],
  schedules: dueSchedules,
  pendingChatRequests: {},
  blockedUsers: [],
  now,
});
expect(disabledOnly === null, 'a character-level user opt-out must remove the character from proactive candidates');

const cooldownCandidate = selectDueProactiveCandidate({
  characters,
  friends: ['luna-id'],
  schedules: {
    ...dueSchedules,
    'recent-id': {
      characterId: 'recent-id',
      lastInteractionAt: now,
      nextDueAt: now + 1,
      lastSentAt: now - PROACTIVE_GLOBAL_COOLDOWN_MS + 1,
    },
  },
  pendingChatRequests: {},
  blockedUsers: [],
  now,
});
expect(cooldownCandidate === null, 'global cooldown must prevent several characters from messaging in a burst');

const zhDraft = createLocalProactiveMessage({
  characterId: 'luna-id',
  characterName: 'Luna',
  personaDescription: 'A gentle and caring friend with a soft voice.',
  language: 'zh-CN',
  now,
});
const enDraft = createLocalProactiveMessage({
  characterId: 'luna-id',
  characterName: 'Luna',
  language: 'en',
  now,
});
expect(/[\u3400-\u9fff]/u.test(zhDraft) && !zhDraft.includes('API'), 'Chinese proactive copy must be natural and implementation-free');
expect(/[A-Za-z]/u.test(enDraft) && !enDraft.includes('API'), 'English proactive copy must be localized and implementation-free');
const eventDraft = createLocalProactiveMessage({
  characterId: 'luna-id',
  characterName: 'Luna',
  personaDescription: 'Gentle and caring.',
  recentEventSummary: 'User and Luna chose a song for a rainy evening.',
  language: 'en',
  now,
});
expect(
  eventDraft.includes('chose a song') && eventDraft.includes('<NANA_MSG>'),
  'local fallback must be able to follow up a real shared event',
);

const traceOne = {
  id: 'trace:event:1',
  characterId: 'luna-id',
  remember: true,
  state: 'digested',
  summary: 'Earlier event',
  occurredAt: now - 20_000,
};
const traceTwo = {
  id: 'trace:event:2',
  characterId: 'luna-id',
  remember: true,
  state: 'digested',
  summary: 'Latest event',
  occurredAt: now - 10_000,
};
expect(
  selectProactiveFocusEvent([traceOne, traceTwo], 'luna-id', initial, now)?.id === 'trace:event:2',
  'the latest real relationship event must motivate the next eligible outreach',
);
expect(
  selectProactiveFocusEvent(
    [traceOne, traceTwo],
    'luna-id',
    { ...initial, lastContextTraceId: 'trace:event:2' },
    now,
  ) === null,
  'the scheduler must not rotate backward and reuse an older event after following up the latest one',
);

const storeSource = readFileSync(resolve(root, 'src/stores/nanaStore.ts'), 'utf8');
const heartbeatStart = storeSource.indexOf('runProactiveChatHeartbeat: async');
const heartbeatEnd = storeSource.indexOf('retryChatMessage: async', heartbeatStart);
const heartbeatSource = storeSource.slice(heartbeatStart, heartbeatEnd);
expect(heartbeatStart >= 0, 'the store must expose a proactive heartbeat');
expect(heartbeatSource.includes('createInitialProactiveSchedule'), 'first launch must initialize durable schedules');
expect(heartbeatSource.includes('selectDueProactiveCandidate'), 'the heartbeat must apply eligibility and cooldown rules');
expect(heartbeatSource.includes('selectProactiveFocusEvent'), 'the heartbeat must select a real relationship event when one is new');
expect(heartbeatSource.includes('generateProactiveReply({'), 'configured devices must generate outreach from character and relationship context');
expect(heartbeatSource.includes('personaDescription: character.desc'), 'the emulator fallback must still reflect character persona');
expect(heartbeatSource.includes("generationSource: 'proactive'"), 'proactive messages must retain their diagnostic source');
expect(heartbeatSource.includes('unreadAfterRemoteEvent'), 'proactive messages must enter the normal unread path');
expect(
  !heartbeatSource.includes('relationshipTraces: upsertRelationshipTrace'),
  'unanswered proactive outreach must not become relationship memory',
);
expect(storeSource.includes('normalizeProactiveChatSchedules(state.proactiveChatSchedules)'), 'persisted schedules must pass through migration validation');
expect(storeSource.includes('rescheduleProactiveAfterInteraction('), 'real chat activity must postpone proactive outreach');
expect(
  storeSource.includes('setCharacterProactiveMessagingFrequency: (characterId, frequency)'),
  'the store must expose an atomic character-level frequency action',
);
expect(
  storeSource.includes("value.proactiveMessagingEnabled === false")
    && storeSource.includes("? 'off'")
    && storeSource.includes(": 'normal'"),
  'legacy characters must migrate from the boolean setting to off or normal cadence',
);

const layoutSource = readFileSync(resolve(root, 'src/app/_layout.tsx'), 'utf8');
expect(layoutSource.includes('runProactiveChatHeartbeat()'), 'app startup must check due proactive events');
expect(
  layoutSource.includes("previousState !== 'active' && nextState === 'active'"),
  'returning to the foreground must check due proactive events',
);
expect(layoutSource.includes('setInterval(() =>'), 'a long foreground session must continue checking due events');

const storageSource = readFileSync(resolve(root, 'src/services/storage.ts'), 'utf8');
expect(storageSource.includes("'proactiveChatSchedules'"), 'portable storage must allow validated proactive schedules');

const profileSource = readFileSync(resolve(root, 'src/components/ProfileView.tsx'), 'utf8');
expect(
  profileSource.includes("['off',")
    && profileSource.includes("['occasional',")
    && profileSource.includes("['normal',")
    && profileSource.includes("['frequent',")
    && profileSource.includes('setCharacterProactiveMessagingFrequency(char.id, frequency)'),
  'the online character profile must expose all four proactive-message cadence choices',
);
const aiSource = readFileSync(resolve(root, 'src/services/ai.ts'), 'utf8');
expect(aiSource.includes('export async function generateProactiveReply'), 'AI service must own proactive generation');
expect(
  aiSource.includes('Do not invent a real-world event'),
  'proactive model prompts must forbid fabricated events and memories',
);

if (errors.length > 0) {
  console.error('Proactive chat contract check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Proactive chat contract check passed.');
}
