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
  const loadedModule = { exports: {} };
  vm.runInNewContext(compiled.outputText, {
    module: loadedModule,
    exports: loadedModule.exports,
    require: requireStub,
    Date,
    JSON,
    Math,
    Number,
    RegExp,
    URL,
  }, { filename: sourcePath });
  return loadedModule.exports;
}

const modelModule = loadTypeScriptModule('src/features/memory/relationship-memory-archive-model.ts');

const {
  buildRelationshipMemoryArchive,
  toggleRelationshipMemoryRecall,
} = modelModule;
const { suppressMemoryEvidenceForTrace } = loadTypeScriptModule('src/utils/memory.ts');
const { buildAiContext } = loadTypeScriptModule('src/services/ai.ts', (request) => {
  if (request === './network') {
    return {
      fetchWithTimeout: async () => { throw new Error('network is unavailable in this contract'); },
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
  if (request === './conversationContinuityRuntime') {
    return {
      CONTINUITY_ENVELOPE_INSTRUCTION: '',
      formatConversationContinuityContext: () => '',
      parseConversationContinuityEnvelope: text => ({ text }),
    };
  }
  return {};
});
const errors = [];
const expect = (condition, message) => { if (!condition) errors.push(message); };

const base = {
  schemaVersion: 1,
  characterId: 'luna-id',
  source: 'chat',
  sourceEventId: 'message-1',
  origin: { app: 'wechat', mode: 'online' },
  title: 'First memory',
  summary: 'The first remembered exchange.',
  occurredAt: 100,
  createdAt: 100,
  participantIds: ['user', 'luna-id'],
  remember: true,
  recallWeight: 0.7,
  state: 'digested',
  revision: 2,
};

const traces = [
  { ...base, id: 'older', sourceEventId: 'older' },
  {
    ...base,
    id: 'ignored',
    source: 'offlineScene',
    sourceEventId: 'scene-1',
    origin: { app: 'offlineMeeting', mode: 'offline' },
    occurredAt: 300,
    createdAt: 300,
    remember: false,
    state: 'ignored',
  },
  {
    ...base,
    id: 'verified',
    sourceEventId: 'message-2',
    occurredAt: 200,
    createdAt: 200,
    userVerified: true,
  },
  {
    ...base,
    id: 'other-character',
    characterId: 'kai-id',
    sourceEventId: 'kai-message',
    occurredAt: 999,
  },
];

const archive = buildRelationshipMemoryArchive(traces, 'luna-id');
expect(archive.items.length === 3, 'archive must isolate memories to the selected character');
expect(archive.items.map(item => item.id).join(',') === 'ignored,verified,older', 'archive must sort memories newest first');
expect(archive.stats.total === 3, 'archive must report its complete visible/auditable count');
expect(archive.stats.remembered === 2, 'archive must count memories that can enter recall');
expect(archive.stats.ignored === 1, 'archive must count ignored memories');
expect(archive.stats.verified === 1, 'archive must expose the user-verified count');
expect(traces[0].id === 'older', 'archive sorting must not mutate persisted store order');

const ignored = toggleRelationshipMemoryRecall(traces[0]);
expect(ignored.id === traces[0].id && ignored.sourceEventId === traces[0].sourceEventId, 'ignoring must preserve canonical trace identity');
expect(ignored.remember === false && ignored.state === 'ignored', 'an active memory must become ignored');
expect(ignored.revision === traces[0].revision + 1, 'a recall preference change must increment the trace revision');

const restored = toggleRelationshipMemoryRecall({ ...traces[1], userVerified: true });
expect(restored.remember === true && restored.state === 'digested', 'an ignored memory must be recoverable');
expect(restored.userVerified === true, 'recall changes must not discard a trusted user correction');

const rawEvidence = [{
  id: 'memory-luna',
  keys: 'Luna, memory',
  content: 'LEAK: The ignored memory was copied into the old summary.',
  characterId: 'luna-id',
  group: 'memory',
  alwaysActive: true,
  records: [{
    id: traces[0].sourceEventId,
    sourceEventId: traces[0].sourceEventId,
    sender: 'user',
    text: 'LEAK: The ignored memory was copied as a raw record.',
    time: '10:00',
    summarized: false,
    remember: true,
    order: 1,
  }],
}];
const suppressedEvidence = suppressMemoryEvidenceForTrace(rawEvidence, traces[0]);
const ignoredContext = buildAiContext({
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
  worldBookEntries: suppressedEvidence,
  relationshipTraces: [ignored],
  memoryWindowSize: 12,
  activeChatId: 'luna-id',
  replaceMacros: text => text,
});
expect(!ignoredContext.systemInstruction.includes('LEAK:'), 'ignoring a trace must suppress matching summary and raw-record memory paths');

const componentSource = readFileSync(resolve(root, 'src/components/RelationshipMemoryArchive.tsx'), 'utf8');
const worldBookSource = readFileSync(resolve(root, 'src/components/WorldBookView.tsx'), 'utf8');
expect(componentSource.includes('trace.userVerified'), 'timeline must render user verification state');
expect(componentSource.includes("trace.origin.mode === 'offline'"), 'timeline must render online/offline origin');
expect(componentSource.includes('numberOfLines={expanded ? undefined : 3}'), 'timeline must offer an explicit full-memory view');
expect(componentSource.includes('onCorrect(trace.id, summary)'), 'timeline correction must call the canonical correction boundary');
expect(componentSource.includes('onToggleRemember(trace)'), 'timeline must keep recall preference separate from opening a memory');
expect(componentSource.includes('maxLength={4000}'), 'memory correction input must remain bounded');
expect(worldBookSource.includes('<RelationshipMemoryArchive'), 'World Book character detail must mount the archive');
expect(worldBookSource.includes('correctRelationshipMemory(traceId, summary)'), 'World Book must reuse the atomic correction action');
expect(worldBookSource.includes('suppressMemoryEvidenceForTrace(state.worldBookEntries, sourceTrace)'), 'ignoring must suppress legacy evidence for the same source event');
expect(!worldBookSource.includes('charTraces.slice(0, 8)'), 'World Book must not silently hide all but eight traces');

if (errors.length > 0) {
  console.error('Relationship memory archive contract failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Relationship memory archive contract passed.');
