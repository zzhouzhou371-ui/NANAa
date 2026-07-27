import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');

function loadTypeScriptModule(relativePath, requireStub = () => ({})) {
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
    require: requireStub,
    Date,
    JSON,
    Math,
    Number,
    RegExp,
    URL,
  });
  vm.runInContext(compiled.outputText, context, { filename: sourcePath });
  return module.exports;
}

const traceRepository = loadTypeScriptModule('src/repositories/relationshipTraceRepository.ts');
const memoryUtils = loadTypeScriptModule('src/utils/memory.ts');
const aiService = loadTypeScriptModule('src/services/ai.ts', (request) => {
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
});

const {
  correctRelationshipTrace,
  createRelationshipTrace,
} = traceRepository;
const { suppressMemoryEvidenceForTrace } = memoryUtils;
const { buildAiContext } = aiService;
const errors = [];
const expect = (condition, message) => { if (!condition) errors.push(message); };

const wrongTrace = createRelationshipTrace({
  characterId: 'luna-id',
  source: 'chat',
  sourceEventId: 'message-1',
  title: 'Chat exchange',
  summary: 'WRONG: User loves coffee.',
  occurredAt: 100,
  state: 'digested',
});
const kaiEntry = {
  id: 'memory-kai',
  keys: 'Kai, memory',
  content: 'WRONG-KAI remains isolated.',
  characterId: 'kai-id',
  group: 'memory',
  records: [{
    id: 'message-1',
    sourceEventId: 'message-1',
    sender: 'user',
    text: 'WRONG-KAI',
    time: '10:00',
    summarized: false,
    remember: true,
    order: 1,
  }],
};
const entries = [{
  id: 'memory-luna',
  keys: 'Luna, memory',
  content: 'WRONG: User loves coffee.',
  characterId: 'luna-id',
  group: 'memory',
  records: [{
    id: 'message-1',
    sourceEventId: 'message-1',
    sender: 'user',
    text: 'WRONG: User loves coffee.',
    time: '10:00',
    summarized: false,
    remember: true,
    order: 1,
  }],
}, kaiEntry];

const correctedTraces = correctRelationshipTrace(
  [wrongTrace],
  { traceId: wrongTrace.id, summary: 'RIGHT: User does not drink coffee.' },
);
const correctedTrace = correctedTraces[0];
const correctedEntries = suppressMemoryEvidenceForTrace(entries, wrongTrace);
const lunaEntry = correctedEntries.find(entry => entry.characterId === 'luna-id');
const isolatedKaiEntry = correctedEntries.find(entry => entry.characterId === 'kai-id');

expect(correctedTrace.userVerified === true, 'the corrected trace must be user verified');
expect(correctedTrace.summary === 'RIGHT: User does not drink coffee.', 'the corrected trace must contain the trusted fact');
expect(lunaEntry?.summaryState === 'stale', 'the conflicting Luna summary must be marked stale');
expect(lunaEntry?.content.includes('WRONG'), 'stale summary evidence must be preserved for audit');
expect(lunaEntry?.records?.[0]?.suppressedByTraceId === wrongTrace.id, 'the matching raw record must be suppressed');
expect(isolatedKaiEntry === kaiEntry, 'correcting Luna must preserve Kai by reference');
expect(
  suppressMemoryEvidenceForTrace(correctedEntries, wrongTrace) === correctedEntries,
  'replaying evidence suppression must be idempotent',
);

const context = buildAiContext({
  userText: 'What do you remember?',
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
  worldBookEntries: correctedEntries,
  relationshipTraces: correctedTraces,
  memoryWindowSize: 2,
  activeChatId: 'luna-id',
  replaceMacros: (text) => text,
});

expect(!context.systemInstruction.includes('WRONG'), 'conflicting evidence must not enter the AI context');
expect(
  context.systemInstruction.split('RIGHT: User does not drink coffee.').length - 1 === 1,
  'the trusted correction must enter the AI context exactly once',
);
expect(
  context.sections.some(section => section.title === 'Verified Memory Corrections'),
  'trusted corrections must use an explicit authoritative context section',
);

if (errors.length > 0) {
  console.error('Memory correction contract check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Memory correction contract check passed.');
}
