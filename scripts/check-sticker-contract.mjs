import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const runtimePath = resolve(root, 'src/services/stickerRuntime.ts');
const runtimeSource = readFileSync(runtimePath, 'utf8');
const compiled = ts.transpileModule(runtimeSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
  fileName: runtimePath,
});
const module = { exports: {} };
const sandbox = vm.createContext({
  exports: module.exports,
  module,
  require: id => {
    throw new Error(`Unexpected sticker runtime dependency: ${id}`);
  },
  Array,
  Date,
  JSON,
  Math,
  Number,
  Object,
  RegExp,
  Set,
  String,
});
vm.runInContext(compiled.outputText, sandbox, { filename: runtimePath });

const {
  chooseStickerForSemantic,
  filterStickersForChat,
  normalizeStickerAsset,
  normalizeStickerAssets,
  rankStickersForSemantic,
} = module.exports;
const errors = [];
const expect = (condition, message) => {
  if (!condition) errors.push(message);
};

const globalHappy = {
  schemaVersion: 1,
  id: 'global-happy',
  uri: 'file:///stickers/happy.gif',
  name: '开心',
  tags: ['开心', '笑', '庆祝'],
  mimeType: 'image/gif',
  animated: true,
  scope: 'global',
  createdAt: 100,
};
const lunaComfort = {
  schemaVersion: 1,
  id: 'luna-comfort',
  uri: 'file:///stickers/comfort.webp',
  name: '抱抱安慰',
  tags: ['安慰', '抱抱', '难过'],
  mimeType: 'image/webp',
  animated: true,
  scope: 'relationship',
  characterId: 'luna-id',
  createdAt: 200,
};
const kaiComfort = {
  ...lunaComfort,
  id: 'kai-comfort',
  uri: 'file:///stickers/kai-comfort.png',
  characterId: 'kai-id',
  createdAt: 300,
};

expect(normalizeStickerAsset(globalHappy)?.animated === true, 'GIF animation metadata must survive normalization');
expect(
  normalizeStickerAsset({ ...lunaComfort, characterId: '' }) === null,
  'relationship stickers must require an owning character',
);
expect(
  normalizeStickerAsset({ ...globalHappy, characterId: 'luna-id' })?.characterId === undefined,
  'global stickers must not retain a relationship owner',
);

const deduped = normalizeStickerAssets([
  globalHappy,
  { ...globalHappy, name: 'duplicate id' },
  lunaComfort,
  { ...lunaComfort, id: 'duplicate-uri' },
  kaiComfort,
]);
expect(deduped.length === 3, 'duplicate ids and same-scope media must collapse without crossing relationships');

const lunaVisible = filterStickersForChat([globalHappy, lunaComfort, kaiComfort], 'luna-id');
expect(
  lunaVisible.map(sticker => sticker.id).join('|') === 'global-happy|luna-comfort',
  'a chat must receive global stickers plus only its own relationship pack',
);

const semanticChoice = chooseStickerForSemantic(
  [globalHappy, lunaComfort, kaiComfort],
  '她有点难过，想要安慰和抱抱',
  'luna-id',
);
expect(semanticChoice?.id === 'luna-comfort', 'semantic selection must choose the strongest accessible tag match');
const ranked = rankStickersForSemantic(
  [globalHappy, lunaComfort, kaiComfort],
  '开心庆祝',
  'luna-id',
);
expect(ranked[0]?.sticker.id === 'global-happy', 'semantic ranking must remain deterministic for global matches');
expect(
  chooseStickerForSemantic([globalHappy], '完全没有对应语义', 'luna-id') === null,
  'semantic selection must fail closed when there is no tag or name match',
);

const panelSource = readFileSync(resolve(root, 'src/components/StickerPanel.tsx'), 'utf8');
const managerSource = readFileSync(resolve(root, 'src/components/StickerManagerView.tsx'), 'utf8');
const editorSource = readFileSync(resolve(root, 'src/components/StickerPackEditorOverlay.tsx'), 'utf8');
expect(panelSource.includes("from 'expo-image'"), 'chat sticker panel must use Expo Image for animated formats');
expect(panelSource.includes('onSelect(sticker)'), 'chat sticker panel must expose sticker selection');
expect(managerSource.includes("['global', copy.global]"), 'manager must expose a global pack tab');
expect(managerSource.includes("['relationship', copy.relationship]"), 'manager must expose relationship pack tabs');
expect(
  managerSource.includes('onRequestAdd(activeScope, addCharacterId)'),
  'manager must delegate album import through a capability callback without leaking an owner into global scope',
);
expect(managerSource.includes('onDelete(sticker.id)'), 'manager must expose per-sticker deletion');
const rootSource = readFileSync(resolve(root, 'src/components/WeChatRootView.tsx'), 'utf8');
const inputSource = readFileSync(resolve(root, 'src/components/ChatInputBar.tsx'), 'utf8');
const profileSource = readFileSync(resolve(root, 'src/components/ProfileView.tsx'), 'utf8');
const meSource = readFileSync(resolve(root, 'src/components/MeTab.tsx'), 'utf8');
const storeSource = readFileSync(resolve(root, 'src/stores/nanaStore.ts'), 'utf8');
expect(rootSource.includes("weChatPage === 'stickers'"), 'WeChat must render the sticker manager page');
expect(rootSource.includes('pickStickersFromLibrary'), 'sticker manager must import durable multi-select assets');
expect(inputSource.includes('onSelectSticker'), 'chat emoji surface must expose sticker selection');
expect(inputSource.includes('void sendSticker(sticker.id)'), 'chat sticker selection must send a real sticker message');
expect(profileSource.includes('stickerManagerCharacterId: char.id'), 'character profile must open its relationship sticker pack');
expect(meSource.includes("weChatPage: 'stickers'"), 'Me tab must open the global sticker manager');
expect(storeSource.includes("type === 'sticker'"), 'chat store must persist and generate replies for sticker messages');
expect(editorSource.includes('tags: parsedTags(tagText)'), 'editor must save semantic tags');
expect(editorSource.includes('onRequestReplace'), 'editor must delegate media replacement through a callback');

if (errors.length > 0) {
  console.error('Sticker contract check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Sticker contract check passed.');
}
