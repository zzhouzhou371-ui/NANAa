import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const sourcePath = resolve(root, 'src/services/socialIdentityRuntime.ts');
const source = readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
  fileName: sourcePath,
});
const loaded = { exports: {} };
vm.runInContext(compiled.outputText, vm.createContext({
  exports: loaded.exports,
  module: loaded,
  require,
}), { filename: sourcePath });

const {
  DEFAULT_MOMENTS_COVER_VALUE,
  isUserSocialAuthor,
  momentsCoverUsesBundledDefault,
  normalizeMomentsCoverValue,
  normalizeUserIdentityDraft,
  resolveMomentSocialIdentity,
} = loaded.exports;
const errors = [];
const expect = (condition, message) => {
  if (!condition) errors.push(message);
};

expect(isUserSocialAuthor('me'), '"me" must be recognized as the global user');
expect(isUserSocialAuthor('USER'), 'legacy "user" IDs must be recognized case-insensitively');
expect(!isUserSocialAuthor('luna-id'), 'characters must not inherit the user identity');

const normalized = normalizeUserIdentityDraft(
  { name: '  ', avatar: '', description: '  ' },
  { name: 'User', avatar: 'U', description: 'Friendly' },
);
expect(
  normalized.name === 'User'
    && normalized.avatar === 'U'
    && normalized.description === 'Friendly',
  'blank identity fields must receive explicit fallbacks before confirmation',
);

const moment = {
  id: 'moment-old',
  authorId: 'user',
  authorName: 'Old name',
  avatar: 'O',
  text: 'hello',
  images: [],
  timestamp: 1,
  likes: [
    { authorId: 'me', authorName: 'Old name', avatar: 'O', timestamp: 2 },
    { authorId: 'luna-id', authorName: 'Luna', avatar: 'L', timestamp: 3 },
  ],
  comments: [
    {
      id: 'comment-me',
      authorId: 'me',
      authorName: 'Old name',
      avatar: 'O',
      text: 'mine',
      timestamp: 4,
    },
    {
      id: 'reply-to-me',
      authorId: 'luna-id',
      authorName: 'Luna',
      avatar: 'L',
      text: 'reply',
      timestamp: 5,
      replyToCommentId: 'comment-me',
      replyToAuthorName: 'Old name',
    },
  ],
};
const resolved = resolveMomentSocialIdentity(moment, {
  name: 'Current name',
  avatar: 'file:///current.jpg',
});
expect(
  resolved.authorName === 'Current name'
    && resolved.avatar === 'file:///current.jpg',
  'historical user-authored posts must render the current global identity',
);
expect(
  resolved.likes[0].authorName === 'Current name'
    && resolved.likes[1].authorName === 'Luna'
    && resolved.comments[0].avatar === 'file:///current.jpg'
    && resolved.comments[1].replyToAuthorName === 'Current name',
  'user likes/comments must follow the current identity without changing characters',
);
expect(
  momentsCoverUsesBundledDefault(DEFAULT_MOMENTS_COVER_VALUE)
    && normalizeMomentsCoverValue('  ') === DEFAULT_MOMENTS_COVER_VALUE,
  'blank cover state must resolve to the bundled default',
);

const userSource = readFileSync(resolve(root, 'src/components/UserView.tsx'), 'utf8');
expect(userSource.includes('Alert.alert('), 'saving the user persona must ask for confirmation');
expect(userSource.includes("style: 'cancel'"), 'the save confirmation must offer a safe cancel action');
expect(
  userSource.includes("status: 'success'"),
  'successful identity saving must provide visible feedback',
);

const meSource = readFileSync(resolve(root, 'src/components/MeTab.tsx'), 'utf8');
expect(meSource.includes('CharacterPortrait'), 'Me must render local and remote portraits through the shared image renderer');
expect(!meSource.includes("avatar.startsWith('http')"), 'Me must not reject file/content/data portrait URIs');

const momentsSource = readFileSync(resolve(root, 'src/components/MomentsView.tsx'), 'utf8');
expect(momentsSource.includes('resolveMomentSocialIdentity'), 'Moments must resolve current user identity at render time');
expect(momentsSource.includes('pickMomentsCoverFromLibrary'), 'Moments cover must open the recoverable system photo picker');
expect(momentsSource.includes('moments-change-cover'), 'Moments must expose an accessible cover change control');
expect(
  momentsSource.includes('onLongPress={bundledCover ? undefined : handleResetCover}'),
  'custom Moments covers must be resettable by long-pressing the cover',
);
expect(momentsSource.includes('cleanupReplacedWallpaper'), 'replaced cover files must not leak');
const imagePickerSource = readFileSync(resolve(root, 'src/services/nativeImagePickerRuntime.ts'), 'utf8');
expect(
  imagePickerSource.includes("{ kind: 'moments-cover' }")
    && imagePickerSource.includes('getPendingResultAsync'),
  'Android activity recovery must preserve an in-progress Moments cover selection',
);

if (errors.length > 0) {
  console.error('Social identity contract failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Social identity contract passed.');
}
