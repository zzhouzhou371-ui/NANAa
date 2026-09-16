import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

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
      throw new Error(`Unexpected module in meeting storage contract: ${id}`);
    },
    console,
    Date,
    JSON,
    Map,
    Set,
  });
  vm.runInContext(compiled.outputText, context, { filename: sourcePath });
  return module.exports;
}

const meetingTypes = loadTypeScriptModule('src/features/meeting/domain/meeting-types.ts');
const protocol = loadTypeScriptModule('src/features/meeting/data/meetingRepositoryProtocol.ts', {
  '../domain/meeting-types': meetingTypes,
});

const values = new Map();
let failNextWrite = false;
const asyncStorage = {
  getItem: async key => values.get(key) ?? null,
  setItem: async (key, value) => {
    if (failNextWrite) {
      failNextWrite = false;
      throw new Error('simulated meeting storage write failure');
    }
    values.set(key, value);
  },
  removeItem: async key => { values.delete(key); },
};

const repository = loadTypeScriptModule('src/repositories/meetingRepository.web.ts', {
  '@react-native-async-storage/async-storage': asyncStorage,
  '../features/meeting/domain/meeting-types': meetingTypes,
  '../features/meeting/data/meetingRepositoryProtocol': protocol,
});

const config = {
  schemaVersion: 1,
  statusFields: {
    scene: [{ key: 'location', label: '地点', initialValue: '咖啡馆' }],
    character: [{ key: 'emotion', label: '情绪', initialValue: '平静' }],
  },
  statusTemplate: { html: '<p>{{scene.location}}</p>', css: 'p{color:#333}', height: 96 },
  miniTheater: { mode: 'manual', prompt: 'aside', html: '<p>{{content}}</p>', css: '', height: 96 },
};
const statusBefore = {
  scene: { location: '咖啡馆' },
  characters: {
    luna: { characterId: 'luna', values: { emotion: '平静' } },
    kai: { characterId: 'kai', values: { emotion: '平静' } },
  },
};
const statusAfter = {
  scene: { location: '窗边' },
  characters: {
    luna: { characterId: 'luna', values: { emotion: '放松' } },
    kai: { characterId: 'kai', values: { emotion: '专注' } },
  },
};
const turn = {
  leadQuote: 'Rain keeps one quiet line beneath the eaves.',
  schemaVersion: 1,
  id: 'turn-1',
  sceneId: 'scene-1',
  index: 1,
  state: 'complete',
  input: '我推门进去。',
  chapterTitle: '雨停之前',
  blocks: [
    { schemaVersion: 1, id: 'block-1', kind: 'narration', text: '雨声停在门外。' },
    { schemaVersion: 1, id: 'block-2', kind: 'character', characterId: 'luna', text: '你来了。' },
  ],
  statusBefore,
  statusAfter,
  rollingRecap: '玩家抵达咖啡馆，Luna 向玩家打招呼。',
  generationSource: 'demo',
  attempt: 1,
  createdAt: 100,
  completedAt: 110,
};
const draft = {
  schemaVersion: 1,
  id: 'meeting-memory:scene-1:luna',
  sceneId: 'scene-1',
  characterId: 'luna',
  sourceTurnIds: ['turn-1'],
  participantIds: ['user', 'luna', 'kai'],
  title: '雨夜咖啡馆',
  summary: 'Luna 在雨夜咖啡馆见到了用户。',
  occurredAt: 110,
  createdAt: 120,
  state: 'draft',
  revision: 1,
};
const scene = {
  schemaVersion: 1,
  id: 'scene-1',
  presetId: 'offline-1',
  presetSnapshot: {
    schemaVersion: 1,
    sourcePresetId: 'offline-1',
    name: '线下',
    prompt: 'grounded scene',
    meetingConfig: config,
  },
  title: '雨夜咖啡馆',
  premise: '雨夜在咖啡馆见面。',
  playerSupplement: '用户刚下班。',
  sceneSupplement: '用户刚下班。',
  castIds: ['luna', 'kai'],
  origin: { type: 'chatHandoff', chatId: 'luna', sourceMessageIds: [501, 502], sourceTurnId: 'turn-chat', label: '来自与 Luna 的线上聊天' },
  state: 'active',
  status: statusAfter,
  rollingRecap: turn.rollingRecap,
  turns: [turn],
  memoryDrafts: [draft],
  revision: 1,
  createdAt: 90,
  updatedAt: 110,
};

await repository.initializeMeetingRepository();
await repository.upsertMeetingScene(scene);
expect((await repository.listMeetingScenes()).length === 1, 'web repository must list an inserted scene');
expect((await repository.getMeetingScene('scene-1')).turns.length === 1, 'scene hydration must restore ordered turns');
expect((await repository.getMeetingScene('scene-1')).origin.type === 'chatHandoff', 'scene hydration must preserve optional chat handoff origin metadata');
expect((await repository.getMeetingScene('scene-1')).turns[0].chapterTitle === '雨停之前', 'scene hydration must preserve optional chapter titles');
expect((await repository.getMeetingScene('scene-1')).turns[0].leadQuote === turn.leadQuote, 'scene hydration must preserve optional poetic lead quotes');
expect((await repository.listMeetingMemoryDrafts('scene-1'))[0].characterId === 'luna', 'memory drafts must stay character-scoped');

await repository.archiveMeetingScene('scene-1', 200);
expect((await repository.listMeetingScenes()).length === 0, 'archived scenes must be excluded by default');
expect((await repository.listMeetingScenes({ archived: 'only' })).length === 1, 'archived scenes must remain queryable');
await repository.unarchiveMeetingScene('scene-1');

await repository.truncateMeetingTurns('scene-1', 0, {
  sceneId: 'scene-1',
  revision: 2,
  status: statusBefore,
  rollingRecap: '',
  turnCount: 0,
});
const truncated = await repository.getMeetingScene('scene-1');
expect(truncated.turns.length === 0, 'turn truncation must remove the canonical suffix');
expect(truncated.status.scene.location === '咖啡馆', 'turn truncation must restore the supplied status snapshot');

await repository.upsertMeetingScene(scene);
const archive = await repository.exportMeetingRepositoryArchive();
expect(archive.scenes.length === 1 && archive.memoryDrafts.length === 1, 'repository archive must contain scenes and review drafts');
await repository.clearMeetingRepository();
expect((await repository.listMeetingScenes({ archived: 'include' })).length === 0, 'clear must remove all meeting scenes');
await repository.importMeetingRepositoryArchive(archive);
expect((await repository.getMeetingScene('scene-1')).turns[0].id === 'turn-1', 'archive import must restore canonical turns');

const narrativeConfig = {
  ...config,
  narrative: {
    stylePrompt: '克制、感官化，避免总结式旁白。',
    length: { min: 600, target: 1_000, max: 1_600 },
    narrationPerson: 'third',
    userAddress: { mode: 'secondPerson', customLabel: '' },
    characterAddress: { mode: 'name', customLabel: '' },
    dialogueRatio: 50,
    paragraphDensity: 'spacious',
    layout: 'pureNovel',
    showChapterTitle: false,
    showLeadQuote: false,
    bannedTerms: ['眸色一沉'],
    enforcement: 'strict',
  },
};
await repository.upsertMeetingScene({
  ...scene,
  presetSnapshot: { ...scene.presetSnapshot, meetingConfig: narrativeConfig },
});
const narrativeArchive = await repository.exportMeetingRepositoryArchive();
expect(
  narrativeArchive.scenes[0].scene.presetSnapshot.meetingConfig.narrative.layout === 'pureNovel'
    && narrativeArchive.scenes[0].scene.presetSnapshot.meetingConfig.narrative.bannedTerms[0] === '眸色一沉',
  'repository export must preserve the complete narrative preset snapshot',
);
await repository.clearMeetingRepository();
await repository.importMeetingRepositoryArchive(narrativeArchive);
expect(
  (await repository.getMeetingScene('scene-1')).presetSnapshot.meetingConfig.narrative.enforcement === 'strict',
  'repository import must restore complete narrative controls without changing Meeting schema V1',
);

const beforeFailure = await repository.exportMeetingRepositoryArchive();
failNextWrite = true;
let failed = false;
try {
  await repository.deleteMeetingScene('scene-1');
} catch (error) {
  failed = String(error).includes('simulated meeting storage write failure');
}
expect(failed, 'write failures must surface to the caller');
expect((await repository.getMeetingScene('scene-1'))?.id === 'scene-1', 'web repository must roll back a failed mutation');
expect(protocol.normalizeMeetingRepositoryArchive(beforeFailure).scenes.length === 1, 'V3 meeting archive validation must accept a complete repository snapshot');

const nativeSource = readFileSync(resolve(root, 'src/repositories/meetingRepository.native.ts'), 'utf8');
expect(/journal_mode\s*=\s*WAL/iu.test(nativeSource), 'native meeting SQLite must enable WAL mode');
expect(nativeSource.includes('meeting_scenes') && nativeSource.includes('meeting_turns'), 'native meeting SQLite must use dedicated scene and turn tables');
expect(nativeSource.includes('withExclusiveTransactionAsync'), 'native meeting mutations must use exclusive SQLite transactions');

console.log('Meeting storage contract check passed.');
