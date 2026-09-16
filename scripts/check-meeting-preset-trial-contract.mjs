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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  });
  const module = { exports: {} };
  cache.set(sourcePath, module);
  const localRequire = specifier => {
    if (!specifier.startsWith('.')) throw new Error(`Unexpected preset-trial dependency: ${specifier}`);
    const relative = resolve(dirname(sourcePath), specifier).slice(root.length + 1);
    return loadTypeScriptModule(relative.endsWith('.ts') ? relative : `${relative}.ts`);
  };
  vm.runInContext(compiled.outputText, vm.createContext({
    exports: module.exports,
    module,
    require: localRequire,
    console,
    Error,
    JSON,
    Math,
    Object,
    Array,
    RegExp,
    Set,
    Map,
    Promise,
    String,
    Number,
  }), { filename: sourcePath });
  return module.exports;
}

const configDomain = loadTypeScriptModule('src/features/meeting/domain/meeting-config.ts');
const trialDomain = loadTypeScriptModule('src/features/meeting/domain/meeting-preset-trial.ts');
const errors = [];
const expect = (condition, message) => { if (!condition) errors.push(message); };

const config = configDomain.normalizeMeetingConfig({
  narrative: {
    stylePrompt: '克制、细腻，以动作和潜台词推进。',
    length: { min: 500, target: 900, max: 1_400 },
    narrationPerson: 'second',
    userAddress: { mode: 'custom', customLabel: '小玫瑰' },
    characterAddress: { mode: 'name' },
    dialogueRatio: 35,
    paragraphDensity: 'spacious',
    layout: 'profileNovel',
    showChapterTitle: true,
    showLeadQuote: true,
    bannedTerms: ['嘴角勾起'],
    enforcement: 'strict',
  },
  miniTheater: { mode: 'everyTurn' },
});

const rules = trialDomain.buildMeetingPresetRuleSummary(config, {
  mainPrompt: '主提示词',
  isZh: true,
});
expect(rules.length === 8, 'effective summary must expose all final rule groups');
expect(rules.find(rule => rule.id === 'style')?.value.includes('克制'), 'effective summary must expose structured style direction');
expect(rules.find(rule => rule.id === 'viewpoint')?.value.includes('小玫瑰'), 'effective summary must expose custom user address');
expect(rules.find(rule => rule.id === 'theater')?.value === '每回合生成', 'effective summary must expose mini-theater mode');
expect(rules.find(rule => rule.id === 'restrictions')?.value.includes('严格检查并重写'), 'effective summary must expose strict enforcement');

const sample = trialDomain.createLocalMeetingPresetTrial({ config, isZh: true, variant: 1 });
expect(sample.source === 'localSample', 'preset trial must be explicitly marked as a local sample');
expect(Boolean(sample.chapterTitle) && Boolean(sample.leadQuote), 'trial must reflect enabled chapter title and poetic lead quote');
expect(sample.miniTheater?.mode === 'everyTurn', 'trial must reflect configured mini-theater mode');
expect(sample.note.includes('不会创建场景') && sample.note.includes('写入记忆'), 'trial must disclose that it never creates a scene or writes memory');
expect(!JSON.stringify(sample).includes('嘴角勾起'), 'trial must remove configured banned phrases from visible sample content');

const minimal = trialDomain.createLocalMeetingPresetTrial({
  config: configDomain.normalizeMeetingConfig({
    narrative: { showChapterTitle: false, showLeadQuote: false },
    miniTheater: { mode: 'off' },
  }),
  isZh: false,
});
expect(!minimal.chapterTitle && !minimal.leadQuote && !minimal.miniTheater, 'trial must omit disabled presentation fields');
expect(minimal.note.includes('writes no memory'), 'English trial disclosure must be localized');

const editorSource = readFileSync(resolve(root, 'src/components/meeting-preset-config-editor.tsx'), 'utf8');
const panelSource = readFileSync(resolve(root, 'src/features/meeting/ui/meeting-preset-trial-panel.tsx'), 'utf8');
const presetEditorSource = readFileSync(resolve(root, 'src/components/PresetEditor.tsx'), 'utf8');
expect(editorSource.includes("(['simple', 'advanced'] as const)") && editorSource.includes('meeting-preset-mode-${mode}'), 'preset editor must offer simple and advanced modes');
expect(editorSource.includes('meeting-preset-simple-theater'), 'simple mode must expose the core mini-theater setting');
expect(panelSource.includes("status: 'loading'") && panelSource.includes("status: 'error'"), 'trial UI must expose loading and retryable error states');
expect(panelSource.includes('meeting-preset-effective-rules-toggle'), 'trial UI must expose effective rule inspection');
expect(!panelSource.includes('meetingRepository') && !panelSource.includes('relationshipTraceRepository') && !panelSource.includes('useNanaStore'), 'trial UI must not access scene, memory, or root-store persistence');
expect(presetEditorSource.includes('mainPrompt={main}'), 'effective rule summary must know whether the current free-text prompt is configured');

if (errors.length) {
  console.error('Meeting preset trial contract check failed:');
  errors.forEach(error => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log('Meeting preset trial contract check passed.');
}
