import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const sourcePath = resolve(root, 'src/services/ai.ts');
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
  require: (request) => {
    if (request === './network') {
      return {
        fetchWithTimeout: async () => { throw new Error('network is not available in this contract'); },
        isOfficialGeminiBaseUrl: () => false,
        readResponsePayload: async () => ({}),
        responseErrorMessage: () => 'network error',
      };
    }
    if (request === './runtimeCopy') {
      return {
        resolveRuntimeLanguage: () => 'en',
        runtimeLocalPaymentReply: () => '',
      };
    }
    return {};
  },
  Date,
  JSON,
  Math,
  Number,
  RegExp,
  URL,
});
vm.runInContext(compiled.outputText, context, { filename: sourcePath });

const { buildAiContext } = module.exports;
const errors = [];
const expect = (condition, message) => { if (!condition) errors.push(message); };
const replaceMacros = (text) => text;
const memoryRecords = Array.from({ length: 5 }, (_, index) => ({
  id: `record-${index + 1}`,
  sender: index % 2 === 0 ? 'user' : 'char',
  text: `raw-memory-${index + 1}`,
  time: `10:0${index}`,
  summarized: false,
  remember: true,
  order: index + 1,
}));
memoryRecords[4].text = 'incorrect-suppressed-raw-memory';
memoryRecords[4].suppressedByTraceId = 'trace:chat:luna-id:verified-event';

const relationshipTraces = Array.from({ length: 5 }, (_, index) => ({
  schemaVersion: 1,
  id: `trace:chat:luna-id:event-${index + 1}`,
  characterId: 'luna-id',
  source: 'chat',
  sourceEventId: `event-${index + 1}`,
  origin: { app: 'wechat', mode: 'online' },
  occurredAt: 100 + index,
  createdAt: 100 + index,
  participantIds: ['user', 'luna-id'],
  title: 'Chat exchange',
  summary: `relationship-memory-${index + 1}`,
  remember: true,
  recallWeight: (index + 1) / 10,
  state: 'digested',
  revision: 1,
}));
relationshipTraces.push({
  schemaVersion: 1,
  id: 'trace:chat:luna-id:verified-event',
  characterId: 'luna-id',
  source: 'chat',
  sourceEventId: 'verified-event',
  origin: { app: 'wechat', mode: 'online' },
  occurredAt: 50,
  createdAt: 50,
  participantIds: ['user', 'luna-id'],
  title: 'User correction',
  summary: 'verified-relationship-memory',
  remember: true,
  recallWeight: 0.01,
  state: 'digested',
  revision: 1,
  userVerified: true,
});

const result = buildAiContext({
  userText: 'hello',
  userName: 'User',
  userDesc: '',
  activeChar: { id: 'luna-id', name: 'Luna', avatar: 'L' },
  activePreset: {
    id: 'default_online',
    name: 'Default',
    sceneMode: 'online',
    main: ['Reply naturally.'],
    jailbreak: [],
    authorsNote: [],
    authorsNoteDepth: 0,
  },
  chatHistory: [],
  worldBookEntries: [{
    id: 'memory-luna',
    keys: 'Luna, memory',
    content: 'incorrect-stale-memory-summary',
    characterId: 'luna-id',
    group: 'memory',
    records: memoryRecords,
    summaryState: 'stale',
  }],
  relationshipTraces,
  memoryWindowSize: 2,
  activeChatId: 'luna-id',
  replaceMacros,
});

const rawSection = result.sections.find(section => section.title === 'Remembered Chat History')?.content ?? '';
expect(!rawSection.includes('raw-memory-2'), 'the raw-memory window should exclude older eligible records');
expect(rawSection.includes('raw-memory-3'), 'the raw-memory window should include the penultimate eligible record');
expect(rawSection.includes('raw-memory-4'), 'the raw-memory window should include the penultimate record');
expect(
  !rawSection.includes('incorrect-suppressed-raw-memory'),
  'raw records suppressed by a relationship trace must not enter AI context',
);
expect(
  !result.systemInstruction.includes('incorrect-stale-memory-summary'),
  'a stale memory summary must not enter AI context',
);
expect(
  !result.sections.some(section => section.title === 'Memory Summary'),
  'a stale memory summary must not create a Memory Summary section',
);

const traceSection = result.sections.find(section => section.title === 'Shared Memories')?.content ?? '';
expect(!traceSection.includes('relationship-memory-4'), 'a verified trace should consume one recall slot ahead of the second-highest ordinary trace');
expect(traceSection.includes('relationship-memory-5'), 'the trace window should include the highest weight');
expect(
  !traceSection.includes('verified-relationship-memory'),
  'verified traces must not be duplicated into the ordinary Shared Memories section',
);

const verifiedSection = result.sections.find(section => section.title === 'Verified Memory Corrections')?.content ?? '';
expect(
  verifiedSection.includes('verified-relationship-memory'),
  'a user-verified trace should be recalled in its own priority section',
);
expect(
  result.systemInstruction.split('verified-relationship-memory').length - 1 === 1,
  'a user-verified trace should appear exactly once in the assembled AI context',
);
expect(result.recalledTraces.length === 2, 'the returned recalled traces should honor memoryWindowSize');
expect(
  result.recalledTraces.filter(trace => trace.userVerified).length === 1,
  'memoryWindowSize=2 should reserve exactly one recalled slot for the verified trace',
);
expect(
  result.recalledTraces.filter(trace => !trace.userVerified).length === 1,
  'memoryWindowSize=2 should leave exactly one recalled slot for ordinary traces',
);
expect(
  result.recalledTraces.some(trace => trace.sourceEventId === 'verified-event'),
  'the recalled trace list should include the user-verified trace despite its lower weight and older time',
);
expect(
  result.recalledTraces.some(trace => trace.sourceEventId === 'event-5'),
  'the recalled trace list should include only the highest-priority ordinary trace',
);

if (errors.length > 0) {
  console.error('Memory context contract check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Memory context contract check passed.');
}
