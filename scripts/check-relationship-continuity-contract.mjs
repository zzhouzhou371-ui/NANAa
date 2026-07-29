import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const sourcePath = resolve(root, relativePath);
  const source = readFileSync(sourcePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: sourcePath,
  });
  const module = { exports: {} };
  const context = vm.createContext({
    exports: module.exports,
    module,
    require: id => {
      if (id in mocks) return mocks[id];
      throw new Error(`Unexpected relationship-continuity dependency: ${id}`);
    },
    AbortController,
    Array,
    Date,
    Intl,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    RegExp,
    Set,
    String,
    console,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(compiled.outputText, context, { filename: sourcePath });
  return module.exports;
}

const proactive = loadTypeScriptModule('src/services/proactiveChatRuntime.ts', {
  './chatRhythmRuntime': {
    CHAT_BUBBLE_SEPARATOR: '<NANA_MSG>',
    resolveChatPresence: () => 'online',
  },
});
const continuityMock = {
  CONTINUITY_ENVELOPE_INSTRUCTION: 'private continuity contract',
  formatConversationContinuityContext: () => '',
  parseConversationContinuityEnvelope: text => ({ text }),
};
const ai = loadTypeScriptModule('src/services/ai.ts', {
  './network': {
    fetchWithTimeout: async () => ({ ok: true }),
    isOfficialGeminiBaseUrl: () => false,
    readResponsePayload: async () => ({ data: {} }),
    responseErrorMessage: () => 'network error',
  },
  './runtimeCopy': {
    resolveRuntimeLanguage: () => 'en',
    runtimeLocalPaymentReply: () => '',
  },
  './conversationContinuityRuntime': continuityMock,
});

const errors = [];
const expect = (condition, message) => {
  if (!condition) errors.push(message);
};
const HOUR_MS = 60 * 60 * 1_000;
const now = Date.UTC(2026, 6, 29, 0, 30, 0);

const frequentInitial = proactive.createInitialProactiveSchedule('luna-id', now, 'frequent');
expect(
  frequentInitial.nextDueAt >= now + 3 * HOUR_MS
    && frequentInitial.nextDueAt < now + 6 * HOUR_MS,
  'frequent mode must initialize inside its shorter cadence',
);
const occasionalInitial = proactive.createInitialProactiveSchedule('kai-id', now, 'occasional');
expect(
  occasionalInitial.nextDueAt >= now + 10 * HOUR_MS
    && occasionalInitial.nextDueAt < now + 16 * HOUR_MS,
  'occasional mode must initialize inside its restrained cadence',
);

const alreadySoon = {
  characterId: 'luna-id',
  lastInteractionAt: now - HOUR_MS,
  nextDueAt: now + 2 * HOUR_MS,
};
const fairReschedule = proactive.rescheduleProactiveAfterInteraction(
  alreadySoon,
  'luna-id',
  now,
  'frequent',
);
expect(
  fairReschedule.nextDueAt === alreadySoon.nextDueAt,
  'an interaction must preserve an earlier due turn instead of resetting the full cadence',
);
const overdueReschedule = proactive.rescheduleProactiveAfterInteraction(
  { ...alreadySoon, nextDueAt: now - HOUR_MS },
  'luna-id',
  now,
  'frequent',
);
expect(
  overdueReschedule.nextDueAt === now + 45 * 60 * 1_000,
  'an overdue frequent relationship must wait only for the anti-interruption quiet window',
);
const stillChatting = proactive.rescheduleProactiveAfterInteraction(
  overdueReschedule,
  'luna-id',
  now + 20 * 60 * 1_000,
  'frequent',
);
expect(
  stillChatting.nextDueAt === now + 65 * 60 * 1_000,
  'continuing conversation must move the quiet boundary without postponing several hours',
);

const frequentSent = proactive.rescheduleAfterProactiveMessage(
  alreadySoon,
  'luna-id',
  now,
  undefined,
  'frequent',
);
expect(
  frequentSent.nextDueAt >= now + 8 * HOUR_MS
    && frequentSent.nextDueAt < now + 14 * HOUR_MS,
  'frequent mode must still have an eight-hour minimum after an outbound message',
);
const occasionalSent = proactive.rescheduleAfterProactiveMessage(
  alreadySoon,
  'luna-id',
  now,
  undefined,
  'occasional',
);
expect(
  occasionalSent.nextDueAt >= now + 36 * HOUR_MS
    && occasionalSent.nextDueAt < now + 60 * HOUR_MS,
  'occasional mode must retain a long anti-spam interval',
);

const dueSchedules = {
  'luna-id': { ...alreadySoon, nextDueAt: now - 1 },
  'kai-id': { ...alreadySoon, characterId: 'kai-id', nextDueAt: now - 2 },
};
const offCandidate = proactive.selectDueProactiveCandidate({
  characters: [{
    id: 'luna-id',
    name: 'Luna',
    avatar: 'L',
    desc: '',
    proactiveMessagingFrequency: 'off',
  }],
  friends: ['luna-id'],
  schedules: dueSchedules,
  pendingChatRequests: {},
  blockedUsers: [],
  now,
});
expect(offCandidate === null, 'off mode must never enter proactive candidate selection');
const cooldownCandidate = proactive.selectDueProactiveCandidate({
  characters: [{
    id: 'luna-id',
    name: 'Luna',
    avatar: 'L',
    desc: '',
    proactiveMessagingFrequency: 'frequent',
  }],
  friends: ['luna-id'],
  schedules: {
    ...dueSchedules,
    'recent-id': {
      characterId: 'recent-id',
      lastInteractionAt: now,
      nextDueAt: now + 1,
      lastSentAt: now - proactive.PROACTIVE_GLOBAL_COOLDOWN_MS + 1,
    },
  },
  pendingChatRequests: {},
  blockedUsers: [],
  now,
});
expect(cooldownCandidate === null, 'frequency must not bypass the global anti-burst cooldown');

expect(
  proactive.resolveLocalHour(now, 'Asia/Shanghai') === 8,
  'local fallback copy must resolve the character hour in an IANA time zone',
);
expect(
  proactive.resolveLocalHour(now, 'America/New_York') === 20,
  'character-local time must cross the device date boundary correctly',
);

const activePreset = {
  id: 'online',
  name: 'Online',
  sceneMode: 'online',
  main: [],
  jailbreak: [],
  authorsNote: [],
  authorsNoteDepth: 0,
};
const timeContext = ai.buildAiContext({
  userText: 'hello',
  userName: 'User',
  userDesc: '',
  activeChar: {
    id: 'luna-id',
    name: 'Luna',
    avatar: 'L',
    desc: '',
    timeZone: 'America/New_York',
  },
  activePreset,
  chatHistory: [],
  worldBookEntries: [],
  activeChatId: 'luna-id',
  replaceMacros: text => text,
  now,
  deviceTimeZone: 'Asia/Shanghai',
});
const clockSection = timeContext.sections.find(section => section.title === 'Current Local Date And Time');
expect(clockSection?.content.includes('Device local date: 2026-07-29'), 'model context must state the device-local date');
expect(clockSection?.content.includes('Device weekday: Wednesday'), 'model context must state the device-local weekday');
expect(clockSection?.content.includes('Device local time: 08:30:00'), 'model context must state the device-local clock');
expect(clockSection?.content.includes('Device time zone: Asia/Shanghai'), 'model context must identify the device time zone');
expect(clockSection?.content.includes('Character local date: 2026-07-28'), 'a character override must receive its own local date');
expect(clockSection?.content.includes('Character weekday: Tuesday'), 'a character override must receive its own weekday');
expect(clockSection?.content.includes('Character local time: 20:30:00'), 'a character override must receive its own clock');
expect(
  clockSection?.content.includes('Do not invent an event'),
  'clock context must explicitly forbid treating time as relationship evidence',
);

const homeSource = readFileSync(resolve(root, 'src/screens/home/index.tsx'), 'utf8');
expect(
  !homeSource.includes('{!activeApp ? (')
    && !homeSource.includes('opacity: activeApp ? 0 : 1'),
  'home icons must remain fully mounted behind the active app instead of fading in on exit',
);
expect(
  homeSource.includes('duration: reduceMotionEnabled ? 100 : 220'),
  'the foreground app layer must use a bounded 220ms state transition',
);
const characterSource = readFileSync(resolve(root, 'src/components/CharacterView.tsx'), 'utf8');
expect(
  characterSource.includes("style={{ flexDirection: 'row', gap: 12, minHeight: 52 }}"),
  'expanded media settings must leave explicit layout height for the save/cancel row',
);
expect(
  characterSource.includes('ellipsizeMode="clip"')
    && characterSource.includes('minWidth: 82'),
  'the shimmer voice choice must remain on one line',
);
expect(
  characterSource.includes("voiceProvider.tts.provider === 'officialMossland'")
    && characterSource.includes('Mossland voice_id')
    && characterSource.includes('usesMosslandVoice ? normalizedDraftVoiceProfileId'),
  'Mossland character voice settings must hide OpenAI defaults and require a provider voice_id',
);
const profileSource = readFileSync(resolve(root, 'src/components/ProfileView.tsx'), 'utf8');
expect(
  profileSource.includes('setCharacterProactiveMessagingFrequency(char.id, frequency)'),
  'profile must persist all four proactive frequency choices through the store action',
);
expect(
  profileSource.includes('setCharacterTimeZone(char.id, candidate)'),
  'profile must expose an optional character time-zone override',
);

if (errors.length > 0) {
  console.error('Relationship continuity contract check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Relationship continuity contract check passed.');
}
