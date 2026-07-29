import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const sourcePath = resolve(root, 'src/services/characterMediaRuntime.ts');
const source = readFileSync(sourcePath, 'utf8');
const storeSource = readFileSync(resolve(root, 'src/stores/nanaStore.ts'), 'utf8');
const profileSource = readFileSync(resolve(root, 'src/components/ProfileView.tsx'), 'utf8');
const storageSource = readFileSync(resolve(root, 'src/services/storage.ts'), 'utf8');
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
  require,
  console,
  Date,
  Math,
  Set,
  Map,
});
vm.runInContext(compiled.outputText, context, { filename: sourcePath });

const runtime = module.exports;
const errors = [];
const expect = (condition, message) => {
  if (!condition) errors.push(message);
};
const now = 1_900_000_000_000;
const lunaImage = {
  schemaVersion: 1,
  id: 'luna-rain',
  characterId: 'luna',
  uri: 'file:///documents/nana-media/images/luna-rain.jpg',
  source: 'userImported',
  userApproved: true,
  tags: ['Rain', 'Window'],
  intents: ['comfort', 'dailyLife'],
  createdAt: now - 1_000,
  enabled: true,
};
const otherImage = {
  ...lunaImage,
  id: 'other-rain',
  characterId: 'other',
};

const normalized = runtime.normalizeCharacterMediaAsset(lunaImage);
expect(normalized?.tags.join('|') === 'rain|window', 'media tags must normalize for matching');
expect(normalized?.intents.includes('dailyLife'), 'camel-case media intents must survive normalization');
expect(
  runtime.normalizeCharacterMediaAsset({ ...lunaImage, uri: 'https://example.com/a.jpg' }) === null,
  'remote URLs must not enter the durable character library',
);

const permissionOff = runtime.selectCharacterMediaAsset({
  characterId: 'luna',
  assets: [lunaImage],
  policy: { enabled: false },
  now,
});
expect(permissionOff.reason === 'permissionDisabled', 'autonomous image sending must default to opt-in');

const selected = runtime.selectCharacterMediaAsset({
  characterId: 'luna',
  assets: [otherImage, lunaImage],
  policy: { enabled: true },
  intent: 'comfort',
  tags: ['rain'],
  now,
});
expect(selected.asset?.id === 'luna-rain', 'selection must isolate assets by character and match intent');

const unapproved = runtime.selectCharacterMediaAsset({
  characterId: 'luna',
  assets: [{ ...lunaImage, userApproved: false }],
  policy: { enabled: true },
  now,
});
expect(unapproved.reason === 'noEligibleAsset', 'unapproved sources must never be sent');

const cooldown = runtime.selectCharacterMediaAsset({
  characterId: 'luna',
  assets: [lunaImage],
  sendHistory: [{ assetId: lunaImage.id, characterId: 'luna', sentAt: now - 1_000 }],
  policy: { enabled: true, minimumIntervalMs: 60 * 60 * 1_000 },
  now,
});
expect(cooldown.reason === 'cooldown', 'recent image sends must enforce the per-character cooldown');
expect(cooldown.nextEligibleAt > now, 'cooldown must expose the next eligible time');

const dailyLimit = runtime.selectCharacterMediaAsset({
  characterId: 'luna',
  assets: [lunaImage],
  sendHistory: [
    { assetId: 'one', characterId: 'luna', sentAt: now - 10 * 60 * 60 * 1_000 },
    { assetId: 'two', characterId: 'luna', sentAt: now - 20 * 60 * 60 * 1_000 },
  ],
  policy: { enabled: true, minimumIntervalMs: 15 * 60 * 1_000, dailyLimit: 2 },
  now,
});
expect(dailyLimit.reason === 'dailyLimit', 'daily cap must prevent image-message spam');
expect(
  storeSource.includes('selectCharacterMediaAsset({'),
  'the chat store must run the character media selection policy before sending an image',
);
expect(
  storeSource.includes('autonomousImageSharingEnabled'),
  'character image sending must remain explicitly opt-in',
);
expect(
  profileSource.includes('pickPhotoFromLibrary'),
  'the character profile must expose a user-approved local gallery import',
);
expect(
  profileSource.includes('setCharacterAutonomousImageSharingEnabled'),
  'the character profile must expose the autonomous image permission switch',
);
expect(
  storageSource.includes("'characterMediaAssets'"),
  'character media assets must be included in durable storage/export allowlists',
);
expect(
  storageSource.includes("'characterMediaSendHistory'"),
  'character media send history must persist so cooldowns survive restarts',
);

if (errors.length > 0) {
  console.error('Character media contract check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Character media contract check passed.');
}
