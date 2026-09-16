import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const cache = new Map();

function loadTypeScriptModule(relativePath) {
  const sourcePath = resolve(root, relativePath);
  if (cache.has(sourcePath)) return cache.get(sourcePath).exports;
  const source = readFileSync(sourcePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: sourcePath,
  });
  const module = { exports: {} };
  cache.set(sourcePath, module);
  const localRequire = specifier => {
    if (!specifier.startsWith('.')) throw new Error(`Unexpected meeting-domain dependency: ${specifier}`);
    return loadTypeScriptModule(`${resolve(dirname(sourcePath), specifier).slice(root.length + 1)}.ts`);
  };
  vm.runInContext(compiled.outputText, vm.createContext({
    exports: module.exports,
    module,
    require: localRequire,
    console,
    Date,
    Error,
    JSON,
    Math,
    Map,
    Set,
    Object,
    Array,
    RegExp,
    String,
    Number,
    Promise,
  }), { filename: sourcePath });
  return module.exports;
}

const types = loadTypeScriptModule('src/features/meeting/domain/meeting-types.ts');
const configDomain = loadTypeScriptModule('src/features/meeting/domain/meeting-config.ts');
const narrativeDomain = loadTypeScriptModule('src/features/meeting/domain/meeting-narrative.ts');
const parser = loadTypeScriptModule('src/features/meeting/domain/meeting-parser.ts');
const contextDomain = loadTypeScriptModule('src/features/meeting/domain/meeting-context.ts');
const generation = loadTypeScriptModule('src/features/meeting/domain/meeting-generation.ts');
const errors = [];
const expect = (condition, message) => { if (!condition) errors.push(message); };

const hostileConfig = configDomain.normalizeMeetingConfig({
  statusFields: {
    scene: [
      { key: 'location', label: '地点', initialValue: '庭院' },
      { key: 'location', label: '重复项', initialValue: '不应覆盖' },
      { key: 'not stable!', label: '无效键', initialValue: 'x' },
    ],
    character: [
      { key: 'emotion', label: '情绪', initialValue: '平静' },
      { key: 'position', label: '位置', initialValue: '场景中' },
    ],
  },
  statusTemplate: {
    height: 9_999,
    html: '<section onclick="steal()"><b>{{scene:location}}</b><script>BAD_SCRIPT()</script><iframe src="https://evil"></iframe><form><input></form><video></video></section>',
    css: '.x{background:url(https://evil)} @import "https://evil";',
  },
  miniTheater: {
    mode: 'everyTurn',
    prompt: 'brief aside',
    height: 10,
    html: '<article><h3>{{meta:title}}</h3><p>{{meta:content}}</p></article>',
    css: '.safe{color:#333}',
  },
});
expect(hostileConfig.schemaVersion === 1, 'meeting config must be schema-versioned');
expect(hostileConfig.statusFields.scene.length === 1, 'status field keys must be stable, valid, and unique');
expect(hostileConfig.statusTemplate.height === configDomain.MEETING_TEMPLATE_MAX_HEIGHT, 'template height must be fixed inside safe bounds');
expect(!hostileConfig.statusTemplate.html.includes('onclick') && !hostileConfig.statusTemplate.html.includes('<script'), 'status HTML normalization must remove event handlers and scripts');
expect(hostileConfig.statusTemplate.css === '', 'unsafe CSS containing url() or @import must fail closed');
expect(
  hostileConfig.narrative.enforcement === 'guide'
    && hostileConfig.narrative.layout === 'profileNovel'
    && hostileConfig.narrative.length.max === 4_000,
  'legacy Meeting V1 configs must receive safe, non-strict narrative defaults without a schema bump',
);
const normalizedNarrative = configDomain.normalizeMeetingConfig({
  narrative: {
    stylePrompt: '克制、具体，不替角色总结情绪。',
    length: { min: -20, target: 1_200.4, max: 900 },
    narrationPerson: 'second',
    userAddress: { mode: 'custom', customLabel: '小玫瑰' },
    characterAddress: { mode: 'name', customLabel: 'must be discarded' },
    dialogueRatio: 150,
    paragraphDensity: 'spacious',
    layout: 'pureNovel',
    showChapterTitle: false,
    showLeadQuote: false,
    bannedTerms: ['忽然', '忽然', '', '不容置疑地'],
    enforcement: 'strict',
  },
}).narrative;
expect(
  normalizedNarrative.length.min === 0
    && normalizedNarrative.length.target === 1_200
    && normalizedNarrative.length.max === 1_200,
  'narrative length normalization must clamp and preserve min <= target <= max',
);
expect(
  normalizedNarrative.dialogueRatio === 100
    && normalizedNarrative.bannedTerms.join(',') === '忽然,不容置疑地'
    && normalizedNarrative.characterAddress.customLabel === '',
  'narrative controls must clamp ratios, deduplicate banned terms, and retain custom labels only in custom mode',
);
const partialLengthNarrative = configDomain.normalizeMeetingConfig({
  narrative: {
    length: { min: 8_000 },
    userAddress: { mode: 'custom', customLabel: '   ' },
    characterAddress: { mode: 'custom' },
  },
}).narrative;
expect(
  partialLengthNarrative.length.min === 8_000
    && partialLengthNarrative.length.target === 8_000
    && partialLengthNarrative.length.max === 8_000,
  'partial legacy length settings must clamp fallback values too and preserve min <= target <= max',
);
expect(
  narrativeDomain.meetingNarrativeMaxOutputCharacters(partialLengthNarrative) === 12_000
    && narrativeDomain.MEETING_NARRATIVE_MAX_VISIBLE_CHARACTERS === 8_000,
  'the maximum visible story length must leave dedicated headroom inside the 12k structured-envelope output cap',
);
expect(
  partialLengthNarrative.userAddress.mode === 'preset'
    && partialLengthNarrative.characterAddress.mode === 'preset',
  'empty custom address labels must fall back to preset-driven addressing',
);
expect(
  narrativeDomain.compileMeetingNarrativeInstruction(hostileConfig.narrative)
    .includes('PRESET FREE-TEXT has highest priority whenever guidance conflicts'),
  'guide mode must state that the free preset prompt wins authorial conflicts',
);

const document = parser.buildMeetingInlineDocument({
  html: '<section onpointerdown="BAD"><h3>{{title}}</h3><p>{{scene.location}} · {{character1.name}} · {{character1.emotion}} · {{user.name}}</p><p>{{content}}</p><a href="https://evil">link</a><img src=x></section>',
  css: '.card{color:#312b36}',
  placeholders: {
    meta: { title: '檐下', content: '<script>PLACEHOLDER_ATTACK</script>' },
    scene: { location: '雨廊' },
    user: { name: 'Nana' },
    cast: [{ id: 'luna', name: 'Luna', values: { emotion: '关切' } }],
  },
});
expect(document.includes('Content-Security-Policy'), 'inline meeting documents must contain a restrictive CSP');
expect(document.includes('&lt;script&gt;PLACEHOLDER_ATTACK&lt;/script&gt;'), 'placeholder values must be HTML escaped');
expect(document.includes('雨廊 · Luna · 关切 · Nana'), 'public placeholders must resolve scene/user and cast-ordered character1..4 fields');
expect(!document.includes('onpointerdown') && !document.includes('href=') && !document.includes('<img'), 'links, media, and event attributes must not survive HTML sanitization');
expect(!document.includes('<script>'), 'inline meeting documents must not contain executable scripts');

const initialStatus = configDomain.createInitialMeetingStatus(hostileConfig, ['luna', 'kai']);
expect(initialStatus.scene.location === '庭院', 'initial scene status must come from declared config fields');
expect(initialStatus.characters.luna.values.emotion === '平静', 'each cast member must get independent initial character status');
const updatedStatus = configDomain.applyMeetingStatusUpdates(initialStatus, [
  { scope: 'scene', key: 'location', value: '雨廊' },
  { scope: 'scene', key: 'unknown', value: 'forbidden' },
  { scope: 'character', characterId: 'luna', key: 'emotion', value: '期待' },
], hostileConfig, ['luna', 'kai']);
expect(updatedStatus.scene.location === '雨廊' && !('unknown' in updatedStatus.scene), 'status application must accept declared scene fields only');
expect(updatedStatus.characters.luna.values.emotion === '期待' && initialStatus.characters.luna.values.emotion === '平静', 'status application must be pure and character-scoped');

const longValue = 'x'.repeat(parser.MEETING_STATUS_VALUE_MAX_LENGTH + 1);
const parsed = parser.parseMeetingResponse(
  `<NANA_MEETING>${JSON.stringify({
    chapterTitle: '檐下等雨',
    blocks: [
      { kind: 'narration', text: '雨声近了一些。' },
      { kind: 'dialogue', characterId: 'luna', text: '“往里面站一点。”' },
      { kind: 'character', characterId: 'stranger', text: 'unknown' },
    ],
    statusUpdates: {
      scene: { location: '雨廊', unknown: 'reject', atmosphere: longValue },
      characters: { luna: { emotion: '关切', position: longValue, unknown: 'reject' }, stranger: { emotion: 'bad' } },
    },
    recap: '两人在雨廊停下，Luna 提醒玩家避雨。',
    miniTheater: { title: '檐下', content: '雨线把远处切成柔和的层次。', html: '<script>provider markup forbidden</script>' },
  })}</NANA_MEETING>`,
  { config: hostileConfig, castIds: ['luna', 'kai'], turnId: 'turn-1' },
);
expect(parsed.blocks.length === 2 && parsed.blocks[1].kind === 'character', 'parser must normalize provider dialogue/action into character blocks and reject unknown cast');
expect(parsed.chapterTitle === '檐下等雨', 'director envelopes may provide a bounded chapter title');
expect(parsed.statusUpdates.length === 2, 'parser must retain only declared, bounded status updates');
expect(parsed.rejected.some(value => value.includes('unknown-character')) && parsed.rejected.some(value => value.includes('unknown-field')), 'parser must report rejected characters and fields');
expect(parsed.rejected.some(value => value.includes('invalid-value')), 'parser must reject overlong status values');
expect(parsed.miniTheater?.title === '檐下' && !parsed.miniTheater.html.includes('provider markup forbidden'), 'optional theater must keep title/content but derive markup from normalized preset config');
const malformed = parser.parseMeetingResponse('原始旁白<NANA_MEETING>{"blocks":', {
  config: hostileConfig,
  castIds: ['luna'],
});
expect(malformed.usedRawNarrationFallback && malformed.blocks[0]?.kind === 'narration', 'malformed JSON must fall back to raw narration without applying metadata');

const presetSnapshot = configDomain.createMeetingPresetSnapshot({
  sourcePresetId: 'preset-1',
  name: '雨天见面',
  prompt: 'Keep the meeting intimate and grounded.',
  meetingConfig: hostileConfig,
});
const now = 1_900_000_000_000;
const oldTurns = Array.from({ length: 10 }, (_, index) => ({
  schemaVersion: types.MEETING_SCHEMA_VERSION,
  id: `turn-${index}`,
  sceneId: 'scene-1',
  index: index + 1,
  state: 'complete',
  input: `input ${index}`,
  blocks: [{ schemaVersion: 1, id: `block-${index}`, kind: 'narration', text: `visible ${index}` }],
  statusBefore: initialStatus,
  statusAfter: initialStatus,
  rollingRecap: `recap ${index}`,
  miniTheater: { schemaVersion: 1, title: 'THEATER_TITLE_SENTINEL', content: 'THEATER_CONTENT_SENTINEL', html: '<p>THEATER_HTML_SENTINEL</p>', css: '.THEATER_CSS_SENTINEL{}', height: 100 },
  generationSource: 'demo',
  attempt: 1,
  createdAt: now + index,
  completedAt: now + index,
}));
const contextInput = {
  presetPrompt: 'director prompt',
  userPersona: 'patient user',
  premise: 'A rainy reunion',
  playerSupplement: 'The player brought an umbrella.',
  cast: [{ id: 'luna', name: 'Luna', definition: 'quiet and observant' }, { id: 'kai', name: 'Kai', definition: 'warm' }],
  worldBookEntries: [
    { id: 'rain', title: 'Rain customs', content: 'Relevant rainy-day lore', keywords: ['rainy'] },
    { id: 'space', title: 'Spaceship', content: 'Irrelevant lore', keywords: ['spaceship'] },
  ],
  memories: [
    ...Array.from({ length: 5 }, (_, index) => ({ id: `luna-memory-${index}`, characterId: 'luna', summary: `Luna memory ${index}`, occurredAt: now + index })),
    ...Array.from({ length: 4 }, (_, index) => ({ id: `kai-memory-${index}`, characterId: 'kai', summary: `Kai memory ${index}`, occurredAt: now + index })),
  ],
  config: hostileConfig,
  status: updatedStatus,
  rollingRecap: 'The scene began beneath the eaves.',
  recentTurns: oldTurns,
  currentInput: 'Can we wait here until the rain stops?',
  maxChars: 5_000,
};
const builtContext = contextDomain.buildMeetingContext(contextInput);
expect(Array.from(builtContext.text).length <= 5_000, 'meeting context must stay under its configured budget');
expect(builtContext.includedTurnIds.length === 8 && builtContext.includedTurnIds[0] === 'turn-2', 'meeting context must include at most the latest eight turns');
expect(builtContext.includedMemoryIdsByCharacter.luna.length === 3 && builtContext.includedMemoryIdsByCharacter.kai.length === 3, 'meeting context must include at most three memories per cast member');
expect(builtContext.includedWorldBookIds.join(',') === 'rain', 'meeting context must select relevant world-book entries only');
expect(!/THEATER_(?:TITLE|CONTENT|HTML|CSS)_SENTINEL/.test(builtContext.text), 'meeting context must strictly exclude every mini-theater field');
expect(!builtContext.text.includes(hostileConfig.statusTemplate.html) && !builtContext.text.includes(hostileConfig.miniTheater.prompt), 'meeting context must exclude template HTML/CSS and theater prompts');
expect(builtContext.text.includes('Structured Status') && builtContext.text.includes('Current Player Input'), 'meeting context must include structured status and current input');

const scene = {
  schemaVersion: 1,
  id: 'scene-1',
  presetId: 'preset-1',
  presetSnapshot,
  title: '雨天见面',
  premise: 'A rainy reunion',
  playerSupplement: 'The player brought an umbrella.',
  sceneSupplement: 'The player brought an umbrella.',
  castIds: ['luna'],
  origin: { type: 'chatHandoff', chatId: 'luna', sourceMessageIds: [77, 78], sourceTurnId: 'RAW_CHAT_TURN_SENTINEL', label: 'RAW_CHAT_LABEL_SENTINEL' },
  state: 'active',
  status: configDomain.createInitialMeetingStatus(presetSnapshot.meetingConfig, ['luna']),
  rollingRecap: '',
  turns: [],
  memoryDrafts: [],
  revision: 0,
  createdAt: now,
  updatedAt: now,
};
const createdSoloScene = generation.createMeetingScene({
  id: 'solo-scene',
  presetSnapshot,
  premise: 'Solo meeting premise',
  castIds: ['luna'],
  origin: { type: 'manual' },
  now,
});
expect(createdSoloScene.castIds.length === 1 && createdSoloScene.origin?.type === 'manual', 'a manual Meeting V1 scene must support exactly one character without a schema bump');
const legacySnapshot = JSON.parse(JSON.stringify(presetSnapshot));
delete legacySnapshot.meetingConfig.narrative;
const legacyScene = generation.createMeetingScene({
  id: 'legacy-scene',
  presetSnapshot: legacySnapshot,
  premise: 'Legacy snapshot compatibility',
  castIds: ['luna'],
  now,
});
legacySnapshot.meetingConfig.statusFields.scene[0].label = 'MUTATED_AFTER_CREATE';
expect(
  legacyScene.presetSnapshot.meetingConfig.narrative.enforcement === 'guide'
    && legacyScene.presetSnapshot.meetingConfig.statusFields.scene[0].label !== 'MUTATED_AFTER_CREATE',
  'scene creation must normalize legacy snapshots and deep-clone them so later preset edits cannot alter an active scene',
);
let rejectedFiveCast = false;
try {
  generation.createMeetingScene({ id: 'too-many', presetSnapshot, premise: 'x', castIds: ['a', 'b', 'c', 'd', 'e'], now });
} catch {
  rejectedFiveCast = true;
}
expect(rejectedFiveCast, 'meeting creation must reject more than four characters');
let completionRequest;
const generated = await generation.generateMeetingTurn({
  scene,
  currentInput: '我们在这里等雨停吧。',
  context: {
    presetPrompt: presetSnapshot.prompt,
    userPersona: 'patient user',
    premise: scene.premise,
    playerSupplement: scene.playerSupplement,
    cast: contextInput.cast.slice(0, 1),
    worldBookEntries: contextInput.worldBookEntries,
    memories: contextInput.memories,
  },
  completion: async request => {
    completionRequest = request;
    return `<NANA_MEETING>${JSON.stringify({ chapterTitle: '雨停之前', blocks: [{ kind: 'character', characterId: 'luna', text: '“好。”' }], statusUpdates: { characters: { luna: { emotion: '安心' } } }, recap: '两人决定一起等雨停。' })}</NANA_MEETING>`;
  },
  now,
});
expect(completionRequest?.purpose === 'offline-meeting-turn', 'generation must use an injected provider-neutral completion boundary');
expect(generated.source === 'remote' && generated.scene.turns.length === 1, 'valid injected completion must commit one remote turn');
expect(generated.scene.status.characters.luna.values.emotion === '安心', 'turn commit must atomically apply declared status updates');
expect(generated.turn.chapterTitle === '雨停之前', 'validated chapter titles must persist on the canonical turn');
expect(!completionRequest.context.includes('RAW_CHAT_TURN_SENTINEL') && !completionRequest.context.includes('RAW_CHAT_LABEL_SENTINEL') && !completionRequest.context.includes('77'), 'chat handoff metadata and raw message ids must never enter meeting generation context');
expect(scene.turns.length === 0 && scene.revision === 0, 'turn generation helpers must not mutate the input scene');

const strictConfig = configDomain.normalizeMeetingConfig({
  ...hostileConfig,
  statusTemplate: {
    ...hostileConfig.statusTemplate,
    html: '<section>STATUS_HTML_SHOULD_NOT_ENTER_PROMPT</section>',
    css: '.status::before{content:"STATUS_CSS_SHOULD_NOT_ENTER_PROMPT"}',
  },
  miniTheater: {
    ...hostileConfig.miniTheater,
    mode: 'off',
    prompt: 'THEATER_DIRECTION_SHOULD_NOT_ENTER_MAIN_PROMPT',
    html: '<article>THEATER_HTML_SHOULD_NOT_ENTER_PROMPT</article>',
    css: '.theater::before{content:"THEATER_CSS_SHOULD_NOT_ENTER_PROMPT"}',
  },
  narrative: {
    stylePrompt: 'Use restrained sensory prose.',
    length: { min: 1, target: 120, max: 500 },
    narrationPerson: 'third',
    userAddress: { mode: 'secondPerson' },
    characterAddress: { mode: 'name' },
    dialogueRatio: 35,
    paragraphDensity: 'balanced',
    layout: 'profileNovel',
    showChapterTitle: true,
    showLeadQuote: true,
    bannedTerms: ['八股词'],
    enforcement: 'strict',
  },
});
const longLeadViolations = narrativeDomain.validateMeetingNarrativeResponse({
  leadQuote: 'x'.repeat(81),
  chapterTitle: '过长引文',
  blocks: [
    { kind: 'narration', text: '长'.repeat(121) },
    { kind: 'narration', text: '后面这条很短，但不能替代第一条成为引文。' },
    { kind: 'character', characterId: 'luna', text: '“好。”' },
  ],
}, strictConfig.narrative);
expect(
  longLeadViolations.some(violation => violation.code === 'missing-lead-narration'),
  'strict lead-quote validation must reject a separate poetic epigraph longer than 80 characters',
);
const characterFirstLeadViolations = narrativeDomain.validateMeetingNarrativeResponse({
  leadQuote: 'Rain holds one quiet line between them.',
  chapterTitle: '顺序测试',
  blocks: [
    { kind: 'character', characterId: 'luna', text: '“先说话。”' },
    { kind: 'narration', text: '后面才出现的旁白不能被提升成开篇引文。' },
  ],
}, strictConfig.narrative);
expect(
  !characterFirstLeadViolations.some(violation => violation.code === 'missing-lead-narration'),
  'a valid separate leadQuote must not force the first visible story block to become narration',
);
const strictSnapshot = configDomain.createMeetingPresetSnapshot({
  sourcePresetId: 'strict-preset',
  name: '严格叙事',
  prompt: 'FREE_PROMPT_SENTINEL: characters may remain silent when silence is truer.',
  meetingConfig: strictConfig,
});
const strictScene = generation.createMeetingScene({
  id: 'strict-scene',
  presetSnapshot: strictSnapshot,
  premise: '雨夜短暂见面',
  castIds: ['luna'],
  now,
});
const strictContext = {
  presetPrompt: strictSnapshot.prompt,
  userPersona: '',
  premise: strictScene.premise,
  playerSupplement: '',
  cast: contextInput.cast.slice(0, 1),
  worldBookEntries: [],
  memories: [],
};
const strictBadEnvelope = `<NANA_MEETING>${JSON.stringify({
  chapterTitle: '雨声',
  blocks: [
    { kind: 'narration', text: '雨落下来，出现了八股词。' },
    { kind: 'character', characterId: 'luna', text: '“我知道。”' },
  ],
  recap: '两人在雨中交谈。',
})}</NANA_MEETING>`;
const strictGoodEnvelope = `<NANA_MEETING>${JSON.stringify({
  leadQuote: 'Rain folds the quiet between them into two short lines.',
  chapterTitle: '雨声',
  blocks: [
    { kind: 'narration', text: '雨落下来，檐角泛起一层薄雾。' },
    { kind: 'character', characterId: 'luna', text: '“我知道。”' },
  ],
  recap: '两人在雨中交谈。',
})}</NANA_MEETING>`;
const strictRequests = [];
const strictRevised = await generation.generateMeetingTurn({
  scene: strictScene,
  currentInput: '再等一会儿。',
  context: strictContext,
  completion: async request => {
    strictRequests.push(request);
    return strictRequests.length === 1 ? strictBadEnvelope : strictGoodEnvelope;
  },
  now,
});
expect(strictRequests.length === 2, 'strict narrative mode must request at most one replacement when the first remote response violates deterministic rules');
expect(strictRevised.source === 'remote' && !strictRevised.providerError && !strictRevised.rawText.includes('八股词'), 'a valid one-time strict revision must replace the violating remote response');
expect(
  strictRequests[0].systemPrompt.includes('Use restrained sensory prose.')
    && strictRequests[0].systemPrompt.includes('FREE_PROMPT_SENTINEL')
    && strictRequests[0].systemPrompt.indexOf('PRESET FREE-TEXT') > strictRequests[0].systemPrompt.indexOf('Structured narrative guidance'),
  'generation must compile structured narrative rules while placing the free preset prompt at highest authorial priority',
);
expect(
  !strictRequests[0].systemPrompt.includes('STATUS_HTML_SHOULD_NOT_ENTER_PROMPT')
    && !strictRequests[0].systemPrompt.includes('STATUS_CSS_SHOULD_NOT_ENTER_PROMPT')
    && !strictRequests[0].systemPrompt.includes('THEATER_HTML_SHOULD_NOT_ENTER_PROMPT')
    && !strictRequests[0].systemPrompt.includes('THEATER_CSS_SHOULD_NOT_ENTER_PROMPT')
    && !strictRequests[0].systemPrompt.includes('THEATER_DIRECTION_SHOULD_NOT_ENTER_MAIN_PROMPT'),
  'status/theater HTML and CSS, plus disabled theater direction, must never leak into the main director prompt',
);
expect(strictRequests[0].maxOutputCharacters === 4_500, 'narrative maximum length must bound the provider output budget while retaining envelope headroom');

let strictFailureCalls = 0;
const strictFailure = await generation.generateMeetingTurn({
  scene: strictScene,
  currentInput: '别走。',
  context: strictContext,
  completion: async () => {
    strictFailureCalls += 1;
    return strictBadEnvelope;
  },
  now,
});
expect(
  strictFailureCalls === 2
    && strictFailure.usedDemoFallback
    && strictFailure.providerError?.includes('Strict narrative validation failed after one revision'),
  'strict narrative mode must stop after one revision and surface an explicit failure instead of committing violating remote prose',
);
const strictDemo = await generation.generateMeetingTurn({
  scene: strictScene,
  currentInput: '没有配置 API。',
  context: strictContext,
  locale: 'zh-CN',
  now,
});
expect(strictDemo.usedDemoFallback && !strictDemo.providerError, 'the deterministic no-key demo director must remain available and exempt from strict remote validation');

const noChapterConfig = configDomain.normalizeMeetingConfig({
  ...strictConfig,
  narrative: { ...strictConfig.narrative, enforcement: 'guide', showChapterTitle: false },
});
const noChapterScene = generation.createMeetingScene({
  id: 'no-chapter-scene',
  presetSnapshot: configDomain.createMeetingPresetSnapshot({
    sourcePresetId: 'no-chapter',
    name: '无标题',
    prompt: '',
    meetingConfig: noChapterConfig,
  }),
  premise: '无章节标题测试',
  castIds: ['luna'],
  now,
});
let guideCalls = 0;
const guidedTurn = await generation.generateMeetingTurn({
  scene: noChapterScene,
  currentInput: '继续。',
  context: { ...strictContext, presetPrompt: '', premise: noChapterScene.premise },
  completion: async () => {
    guideCalls += 1;
    return strictBadEnvelope;
  },
  now,
});
expect(guideCalls === 1 && guidedTurn.source === 'remote', 'guide mode must not spend an extra model request on automatic revision');
expect(!guidedTurn.turn.chapterTitle, 'a preset that disables chapter titles must strip provider chapterTitle metadata before persistence');

const completedScene = generation.completeMeetingScene(generated.scene, { userId: 'user', now: now + 1 });
expect(completedScene.memoryDrafts.length === 1 && completedScene.memoryDrafts[0].characterId === 'luna', 'scene completion must create exactly one character-scoped memory draft per cast member');
expect(completedScene.memoryDrafts[0].participantIds.includes('user'), 'meeting memory drafts must retain the shared participant list for trace review');
const fallbackA = generation.createDemoMeetingDirectorResponse({ scene, currentInput: 'hello', locale: 'zh-CN', requestMiniTheater: false });
const fallbackB = generation.createDemoMeetingDirectorResponse({ scene, currentInput: 'hello', locale: 'zh-CN', requestMiniTheater: false });
expect(fallbackA === fallbackB && fallbackA.includes('<NANA_MEETING>'), 'localized demo director fallback must be deterministic and use the normal envelope');
const twoCastScene = {
  ...scene,
  castIds: ['luna', 'kai'],
  status: configDomain.createInitialMeetingStatus(presetSnapshot.meetingConfig, ['luna', 'kai']),
};
const twoCastFallback = parser.parseMeetingResponse(
  generation.createDemoMeetingDirectorResponse({ scene: twoCastScene, currentInput: 'hello', locale: 'zh-CN', requestMiniTheater: false }),
  { config: presetSnapshot.meetingConfig, castIds: twoCastScene.castIds },
);
expect(twoCastFallback.blocks.filter(block => block.kind === 'character').length === 2, 'the local demo director must visibly exercise a two-character meeting');
const providerFallback = await generation.generateMeetingTurn({
  scene,
  currentInput: 'hello',
  context: {
    presetPrompt: presetSnapshot.prompt,
    userPersona: '',
    premise: scene.premise,
    playerSupplement: scene.playerSupplement,
    cast: contextInput.cast.slice(0, 1),
    worldBookEntries: [],
    memories: [],
  },
  completion: async () => { throw new Error('offline'); },
  locale: 'en-US',
  now,
});
expect(providerFallback.usedDemoFallback && providerFallback.providerError === 'offline', 'provider failures must fall back to the deterministic local director and retain diagnostics');
const failedTurn = generation.createFailedMeetingTurn({ scene, currentInput: 'retry me', turnId: 'retry-turn', attempt: 1, now });
const retry = generation.prepareMeetingTurnRetry(failedTurn);
expect(retry?.turnId === 'retry-turn' && retry.attempt === 2 && retry.currentInput === 'retry me', 'retry must preserve turn identity and user input while incrementing the attempt');
const snapshot = generation.snapshotMeetingScene(scene);
expect(generation.meetingSceneMatchesSnapshot(scene, snapshot), 'scene snapshots must guard async generation commits by revision and turn count');
expect(!generation.meetingSceneMatchesSnapshot({ ...scene, revision: 1 }, snapshot), 'stale scene snapshots must be rejected after a revision change');

if (errors.length > 0) {
  console.error('Meeting domain contract check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Meeting domain contract check passed.');
}
