import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const runtimePath = resolve(root, 'src/services/momentsRuntime.ts');
const source = readFileSync(runtimePath, 'utf8');
const compiled = ts.transpileModule(source, {
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
    throw new Error(`Unexpected moments runtime dependency: ${id}`);
  },
  Date,
  Math,
  Number,
  Object,
  Set,
});
vm.runInContext(compiled.outputText, sandbox, { filename: runtimePath });

const reactionRuntimePath = resolve(root, 'src/services/momentReactionRuntime.ts');
const reactionRuntimeSource = readFileSync(reactionRuntimePath, 'utf8');
const reactionRuntimeCompiled = ts.transpileModule(reactionRuntimeSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
  fileName: reactionRuntimePath,
});
const reactionModule = { exports: {} };
const reactionSandbox = vm.createContext({
  exports: reactionModule.exports,
  module: reactionModule,
  require: id => {
    throw new Error(`Unexpected moment reaction runtime dependency: ${id}`);
  },
  Array,
  Math,
  Object,
  Set,
  String,
});
vm.runInContext(reactionRuntimeCompiled.outputText, reactionSandbox, {
  filename: reactionRuntimePath,
});

const {
  PROACTIVE_MOMENT_GLOBAL_COOLDOWN_MS,
  PROACTIVE_MOMENT_NORMAL_MIN_MS,
  PROACTIVE_MOMENT_NORMAL_MAX_MS,
  PROACTIVE_MOMENT_OCCASIONAL_MIN_MS,
  PROACTIVE_MOMENT_OCCASIONAL_MAX_MS,
  createInitialMomentSchedule,
  createLocalMomentDraft,
  normalizeProactiveMomentSchedules,
  rescheduleAfterMomentPost,
  selectDueMomentCandidate,
  selectMomentFocusEvent,
} = module.exports;
const {
  createLocalMomentReactionComment,
  planCharacterMomentReactions,
} = reactionModule.exports;

const errors = [];
const expect = (condition, message) => {
  if (!condition) errors.push(message);
};
const now = new Date(2026, 6, 29, 20, 0, 0).getTime();

expect(createInitialMomentSchedule('off-id', 'off', now) === null, 'off mode must not create a schedule');
const normal = createInitialMomentSchedule('normal-id', 'normal', now);
expect(
  normal.nextDueAt >= now + PROACTIVE_MOMENT_NORMAL_MIN_MS
    && normal.nextDueAt < now + PROACTIVE_MOMENT_NORMAL_MAX_MS,
  'normal mode must schedule inside its bounded window',
);
const occasional = createInitialMomentSchedule('occasional-id', 'occasional', now);
expect(
  occasional.nextDueAt >= now + PROACTIVE_MOMENT_OCCASIONAL_MIN_MS
    && occasional.nextDueAt < now + PROACTIVE_MOMENT_OCCASIONAL_MAX_MS,
  'occasional mode must post less frequently than normal mode',
);

const posted = rescheduleAfterMomentPost(normal, 'normal-id', 'normal', now, 'trace:new');
expect(posted.lastPostedAt === now, 'posting must record the per-character cooldown origin');
expect(posted.lastFocusTraceId === 'trace:new', 'posting must remember its event focus');

const normalized = normalizeProactiveMomentSchedules({
  'normal-id': normal,
  broken: { characterId: 'broken', nextDueAt: 'soon' },
  mismatch: { characterId: 'other', nextDueAt: now },
});
expect(Object.keys(normalized).join('|') === 'normal-id', 'schedule migration must discard malformed records');

const characters = [
  { id: 'normal-id', name: 'Normal', avatar: '', desc: '', proactiveMomentsMode: 'normal' },
  { id: 'occasional-id', name: 'Occasional', avatar: '', desc: '', proactiveMomentsMode: 'occasional' },
  { id: 'off-id', name: 'Off', avatar: '', desc: '', proactiveMomentsMode: 'off' },
  { id: 'blocked-id', name: 'Blocked', avatar: '', desc: '', proactiveMomentsMode: 'normal' },
];
const dueSchedules = {
  'normal-id': { characterId: 'normal-id', nextDueAt: now - 2_000 },
  'occasional-id': { characterId: 'occasional-id', nextDueAt: now - 1_000 },
  'off-id': { characterId: 'off-id', nextDueAt: now - 10_000 },
  'blocked-id': { characterId: 'blocked-id', nextDueAt: now - 20_000 },
};
expect(selectDueMomentCandidate({
  characters,
  friends: characters.map(character => character.id),
  blockedUsers: ['blocked-id'],
  schedules: dueSchedules,
  appState: 'active',
  now,
})?.id === 'normal-id', 'the earliest eligible friend must be selected');
expect(selectDueMomentCandidate({
  characters,
  friends: characters.map(character => character.id),
  blockedUsers: [],
  schedules: dueSchedules,
  appState: 'background',
  now,
}) === null, 'background state must never call or select autonomous generation');
expect(selectDueMomentCandidate({
  characters,
  friends: ['off-id'],
  blockedUsers: [],
  schedules: dueSchedules,
  appState: 'active',
  now,
}) === null, 'off mode must remain excluded even with a legacy due schedule');

const globalCooldownSchedules = {
  ...dueSchedules,
  recent: {
    characterId: 'recent',
    nextDueAt: now + 1,
    lastPostedAt: now - PROACTIVE_MOMENT_GLOBAL_COOLDOWN_MS + 1,
  },
};
expect(selectDueMomentCandidate({
  characters,
  friends: characters.map(character => character.id),
  blockedUsers: [],
  schedules: globalCooldownSchedules,
  appState: 'active',
  now,
}) === null, 'global cooldown must prevent a character-post burst');

const traces = [
  {
    id: 'trace:old',
    characterId: 'normal-id',
    remember: true,
    state: 'digested',
    summary: 'An older shared event',
    occurredAt: now - 2_000,
    createdAt: now - 2_000,
  },
  {
    id: 'trace:new',
    characterId: 'normal-id',
    remember: true,
    state: 'digested',
    summary: 'A newer shared event',
    occurredAt: now - 1_000,
    createdAt: now - 1_000,
  },
];
expect(
  selectMomentFocusEvent(traces, 'normal-id', normal, now)?.id === 'trace:new',
  'the newest real relationship event may focus a post',
);
expect(
  selectMomentFocusEvent(
    traces,
    'normal-id',
    { ...normal, lastFocusTraceId: 'trace:new' },
    now,
  ) === null,
  'focus deduplication must not rotate backward through old events',
);

const fallback = createLocalMomentDraft({
  characterId: 'normal-id',
  characterName: 'Luna',
  personaDescription: 'gentle and caring',
  language: 'zh-CN',
  now,
});
expect(
  fallback.generationSource === 'characterLocal'
    && /[\u3400-\u9fff]/u.test(fallback.text)
    && fallback.images.length === 0,
  'no-key fallback must be local, persona-aware text without fabricated media',
);
const eventFallback = createLocalMomentDraft({
  characterId: 'normal-id',
  personaDescription: 'quiet',
  recentEventSummary: '一起听了雨夜歌单',
  focusTraceId: 'trace:new',
  language: 'zh-CN',
  now,
});
expect(
  eventFallback.focusTraceId === 'trace:new'
    && eventFallback.text.includes('雨夜歌单'),
  'a real event fallback must retain its deduplication identity',
);

const userMoment = {
  id: 'moment:user:test',
  authorId: 'me',
  authorName: 'User',
  avatar: 'U',
  text: 'I finished something important today.',
  images: [],
  timestamp: now,
  likes: [],
  comments: [],
  generationSource: 'user',
};
const reactionPlans = planCharacterMomentReactions({
  moment: userMoment,
  characters,
  friends: ['normal-id', 'occasional-id', 'blocked-id'],
  blockedUsers: ['blocked-id'],
});
expect(
  reactionPlans.length === 2
    && reactionPlans[0].shouldComment
    && reactionPlans.every(plan => plan.shouldLike)
    && reactionPlans.every(plan => plan.character.id !== 'blocked-id'),
  'a user moment must select at most two eligible friend reactions with one bounded comment',
);
expect(
  planCharacterMomentReactions({
    moment: { ...userMoment, authorId: 'normal-id' },
    characters,
    friends: characters.map(character => character.id),
    blockedUsers: [],
  }).length === 0,
  'character-authored moments must not trigger the user-post reaction loop',
);
expect(
  createLocalMomentReactionComment({
    character: characters[0],
    momentText: userMoment.text,
    language: 'en-US',
  }).trim().length > 0,
  'character moment reactions need a local persona-safe fallback',
);

const momentsViewSource = readFileSync(resolve(root, 'src/components/MomentsView.tsx'), 'utf8');
expect(
  !momentsViewSource.includes('<Plus ')
    && !momentsViewSource.includes('<Plus\n')
    && !momentsViewSource.includes('{ Plus }'),
  'Moments must not render a second absolute plus button',
);
expect(momentsViewSource.includes("from 'expo-image'"), 'Moments images must use the Expo image boundary');
expect(momentsViewSource.includes('NeumorphicSurface'), 'Moments cards must use the current neumorphic material');
expect(momentsViewSource.includes('replyToCommentId'), 'Moments must expose reply-aware comment UI');
expect(!momentsViewSource.includes('/^https?'), 'Moments must not reject local, content, or data image URIs');

const composerSource = readFileSync(resolve(root, 'src/components/ComposeMomentOverlay.tsx'), 'utf8');
expect(composerSource.includes('onPublish'), 'composer must accept an integration-owned publish action');
expect(composerSource.includes('pickMomentPhotoFromLibrary({ text: momentText })'), 'composer must persist its text alongside the Android picker intent');
expect(composerSource.includes('discardPickedPhoto'), 'composer cancellation and photo removal must clean promoted draft media');
expect(!composerSource.includes('createRelationshipTrace'), 'publishing must not write a trace to every friend');
expect(!composerSource.includes('upsertRelationshipTrace'), 'composer must not own relationship memory fan-out');
expect(composerSource.includes('NeumorphicSurface'), 'composer must use the current neumorphic material');

const storeSource = readFileSync(resolve(root, 'src/stores/nanaStore.ts'), 'utf8');
const layoutSource = readFileSync(resolve(root, 'src/app/_layout.tsx'), 'utf8');
const profileSource = readFileSync(resolve(root, 'src/components/ProfileView.tsx'), 'utf8');
expect(storeSource.includes('runProactiveMomentsHeartbeat'), 'store must expose the autonomous moments heartbeat');
expect(storeSource.includes('generateMomentPost'), 'due character moments must use the isolated model service when configured');
expect(storeSource.includes('toggleMomentLike'), 'moment likes must be an atomic store action');
expect(storeSource.includes('addMomentComment'), 'moment comments and character replies must be store actions');
expect(
  storeSource.includes('runCharacterMomentReactions')
    && storeSource.includes('planCharacterMomentReactions'),
  'publishing a user moment must enter the character reaction loop',
);
expect(layoutSource.includes('runProactiveMomentsHeartbeat'), 'foreground lifecycle must trigger autonomous moments');
expect(layoutSource.includes("intent.kind === 'moment-photo'"), 'startup recovery must reopen a pending moment photo draft');
expect(profileSource.includes('setCharacterProactiveMomentsMode'), 'character profile must expose autonomous moments policy');

if (errors.length > 0) {
  console.error('Moments runtime contract check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Moments runtime contract check passed.');
}
