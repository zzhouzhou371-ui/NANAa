import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const sourcePath = resolve(root, 'src/repositories/relationshipTraceRepository.ts');
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
const context = vm.createContext({ exports: module.exports, module, require: () => ({}), Date, JSON, Math });
vm.runInContext(compiled.outputText, context, { filename: sourcePath });

const {
  createRelationshipTrace,
  normalizeRelationshipTrace,
  normalizeRelationshipTraces,
  correctRelationshipTrace,
  upsertRelationshipTrace,
  relationshipTracesForCharacter,
} = module.exports;
const errors = [];
const expect = (condition, message) => { if (!condition) errors.push(message); };
const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const legacy = normalizeRelationshipTrace({
  id: 'trace:chat:luna-id:legacy-message',
  characterId: 'luna-id',
  source: 'chat',
  sourceEventId: 'legacy-message',
  title: 'Legacy chat exchange',
  summary: 'A remembered exchange from before trace versioning.',
  occurredAt: 80,
  createdAt: 90,
  participantIds: ['user', 'luna-id'],
  recallWeight: 0.6,
}, 500);
expect(legacy?.schemaVersion === 1, 'legacy normalization should default schemaVersion to 1');
expect(legacy?.revision === 1, 'legacy normalization should default revision to 1');
expect(legacy?.remember === true, 'legacy normalization should default remember to true');
expect(legacy?.state === 'digested', 'legacy normalization should default a summarized trace to digested');
expect(
  sameJson(legacy?.origin, { app: 'wechat', mode: 'online' }),
  'legacy normalization should default origin to online WeChat context',
);

const ignoredLegacy = normalizeRelationshipTrace({
  ...legacy,
  id: 'trace:chat:luna-id:legacy-ignored',
  sourceEventId: 'legacy-ignored',
  state: 'ignored',
  remember: true,
}, 500);
expect(ignoredLegacy?.remember === false, 'ignored legacy traces must normalize to remember=false');

const duplicateIdentity = normalizeRelationshipTraces([
  {
    ...legacy,
    id: 'legacy-duplicate-id',
    summary: 'Older revision',
    revision: 2,
    createdAt: 400,
  },
  {
    ...legacy,
    id: 'newer-duplicate-id',
    summary: 'Newer revision',
    revision: 4,
    createdAt: 100,
  },
]);
expect(duplicateIdentity.length === 1, 'normalization should deduplicate traces with the same source identity');
expect(duplicateIdentity[0]?.revision === 4, 'identity deduplication should retain the higher revision');
expect(duplicateIdentity[0]?.summary === 'Newer revision', 'identity deduplication should retain content from the higher revision');

const verifiedDuplicateIdentity = normalizeRelationshipTraces([
  {
    ...legacy,
    id: 'verified-duplicate-id',
    summary: 'User-verified account of the exchange.',
    revision: 2,
    createdAt: 100,
    occurredAt: 100,
    userVerified: true,
  },
  {
    ...legacy,
    id: 'ordinary-higher-revision-id',
    summary: 'Later automatic account that contradicts the user.',
    revision: 99,
    createdAt: 999,
    occurredAt: 999,
    userVerified: false,
  },
]);
expect(verifiedDuplicateIdentity.length === 1, 'verified identity normalization should still emit exactly one trace');
expect(
  verifiedDuplicateIdentity[0]?.id === 'verified-duplicate-id',
  'identity deduplication must prefer a user-verified trace over a higher-revision ordinary trace',
);
expect(
  verifiedDuplicateIdentity[0]?.summary === 'User-verified account of the exchange.',
  'identity deduplication must retain verified content when ordinary content looks newer',
);
expect(
  verifiedDuplicateIdentity[0]?.userVerified === true,
  'identity deduplication must preserve the verified status',
);

const base = createRelationshipTrace({
  characterId: 'luna-id',
  source: 'chat',
  sourceEventId: 'message-1',
  title: 'Chat exchange',
  summary: 'You: good evening',
  occurredAt: 100,
  recallWeight: 0.4,
  state: 'pending',
});
const inserted = upsertRelationshipTrace([], base);
expect(inserted.length === 1, 'a new source event should insert one trace');

const idempotent = upsertRelationshipTrace(inserted, { ...base });
expect(idempotent === inserted, 'an identical source event should be idempotent');

const digested = createRelationshipTrace({
  characterId: 'luna-id',
  source: 'chat',
  sourceEventId: 'message-1',
  title: 'Chat exchange',
  summary: 'You: good evening / Luna: I missed you.',
  occurredAt: 100,
  recallWeight: 0.7,
  state: 'digested',
});
const revised = upsertRelationshipTrace(idempotent, digested);
expect(revised.length === 1, 'revising a source event must not duplicate it');
expect(revised[0].revision === 2, 'revising a source event should increment revision');
expect(revised[0].state === 'digested', 'the revised trace should preserve its final state');

const ignored = { ...revised[0], id: 'trace:photo:luna-id:photo-1', source: 'photo', sourceEventId: 'photo-1', remember: false };
const withIgnored = upsertRelationshipTrace(revised, ignored);
const recalled = relationshipTracesForCharacter(withIgnored, 'luna-id');
expect(recalled.length === 1, 'ignored traces should not be recalled');
expect(recalled[0].sourceEventId === 'message-1', 'the remembered trace should remain recallable');

const pendingPayment = createRelationshipTrace({
  characterId: 'luna-id',
  source: 'payment',
  sourceEventId: 'payment:contract',
  title: 'Transfer',
  summary: 'You sent Luna a transfer of CNY 18.88.',
  occurredAt: 200,
  recallWeight: 0.7,
  state: 'pending',
});
const withPayment = upsertRelationshipTrace(withIgnored, pendingPayment);
const acceptedPayment = createRelationshipTrace({
  characterId: 'luna-id',
  source: 'payment',
  sourceEventId: 'payment:contract',
  title: 'Transfer',
  summary: 'Luna accepted the transfer of CNY 18.88.',
  occurredAt: 200,
  recallWeight: 0.8,
  state: 'digested',
});
const settledPayment = upsertRelationshipTrace(withPayment, acceptedPayment);
expect(settledPayment.filter(trace => trace.sourceEventId === 'payment:contract').length === 1, 'payment settlement must update the same trace instead of duplicating it');
expect(settledPayment.find(trace => trace.sourceEventId === 'payment:contract')?.state === 'digested', 'accepted payment trace must become digested');
expect(upsertRelationshipTrace(settledPayment, acceptedPayment) === settledPayment, 'replaying the same payment settlement must be idempotent');

const correctable = normalizeRelationshipTrace({
  id: 'trace:chat:luna-id:correction-message',
  characterId: 'luna-id',
  source: 'chat',
  sourceEventId: 'correction-message',
  origin: {
    app: 'wechat',
    mode: 'online',
    sessionId: 'chat-session-1',
    presetId: 'online-preset-1',
  },
  title: 'Misread exchange',
  summary: 'Luna sounded angry.',
  occurredAt: 700,
  createdAt: 750,
  participantIds: ['user', 'luna-id'],
  remember: false,
  recallWeight: 0.3,
  state: 'ignored',
  revision: 3,
});
const correction = {
  traceId: correctable.id,
  summary: 'Luna was worried, not angry.',
  title: 'Clarified exchange',
  tone: 'worried',
  recallWeight: 0.9,
};
const corrected = correctRelationshipTrace([correctable], correction);
expect(corrected.length === 1, 'correcting a trace should keep exactly one array entry');
expect(corrected[0]?.id === correctable.id, 'correction should preserve the trace id');
expect(corrected[0]?.characterId === correctable.characterId, 'correction should preserve character source identity');
expect(corrected[0]?.source === correctable.source, 'correction should preserve the source type');
expect(corrected[0]?.sourceEventId === correctable.sourceEventId, 'correction should preserve the source event id');
expect(corrected[0]?.createdAt === correctable.createdAt, 'correction should preserve createdAt');
expect(corrected[0]?.occurredAt === correctable.occurredAt, 'correction should preserve occurredAt');
expect(sameJson(corrected[0]?.origin, correctable.origin), 'correction should preserve origin context');
expect(corrected[0]?.revision === correctable.revision + 1, 'correction should increment revision exactly once');
expect(corrected[0]?.summary === correction.summary, 'correction should apply the user-provided summary');
expect(corrected[0]?.remember === true, 'a user correction should make the trace rememberable');
expect(corrected[0]?.state === 'digested', 'a user correction should leave the trace digested');
expect(corrected[0]?.userVerified === true, 'a user correction should mark the trace as user verified');

const repeatedCorrection = correctRelationshipTrace(corrected, correction);
expect(repeatedCorrection === corrected, 'repeating the same correction should be referentially idempotent');
expect(repeatedCorrection.length === 1, 'repeating the same correction should not duplicate the trace');
expect(repeatedCorrection[0]?.revision === corrected[0]?.revision, 'repeating the same correction should not increment revision again');

const automaticContradiction = {
  ...corrected[0],
  id: 'automatic-replacement-id',
  title: 'Automatic reinterpretation',
  summary: 'A later automatic process says Luna was angry after all.',
  occurredAt: corrected[0].occurredAt + 10_000,
  createdAt: corrected[0].createdAt + 10_000,
  revision: corrected[0].revision + 50,
  userVerified: false,
};
const blockedAutomaticUpsert = upsertRelationshipTrace(corrected, automaticContradiction);
expect(
  blockedAutomaticUpsert === corrected,
  'a non-verified automatic upsert must leave a verified source identity untouched',
);
expect(blockedAutomaticUpsert.length === 1, 'a blocked automatic upsert must not duplicate the verified trace');
expect(
  blockedAutomaticUpsert[0]?.summary === correction.summary,
  'a blocked automatic upsert must not replace the verified summary',
);
expect(
  blockedAutomaticUpsert[0]?.occurredAt === correctable.occurredAt,
  'a blocked automatic upsert must not replace the verified occurrence time',
);
expect(
  blockedAutomaticUpsert[0]?.revision === corrected[0]?.revision,
  'a blocked automatic upsert must not advance the verified revision',
);
expect(
  blockedAutomaticUpsert[0]?.userVerified === true,
  'a blocked automatic upsert must not clear user verification',
);

const secondCorrection = {
  traceId: corrected[0].id,
  summary: 'Luna was worried and trying to protect the user.',
  title: 'User clarification',
  tone: 'protective',
  recallWeight: 1,
};
const correctedAgain = correctRelationshipTrace(blockedAutomaticUpsert, secondCorrection);
expect(correctedAgain.length === 1, 'correcting a protected trace should keep one source identity');
expect(
  correctedAgain[0]?.summary === secondCorrection.summary,
  'a new user correction must still update a protected verified trace',
);
expect(
  correctedAgain[0]?.revision === corrected[0]?.revision + 1,
  'a new user correction after a blocked automatic upsert must increment revision exactly once',
);
expect(correctedAgain[0]?.userVerified === true, 'a subsequent user correction must remain verified');

const comparisonBase = normalizeRelationshipTrace({
  id: 'trace:moment:luna-id:moment-content-boundary',
  characterId: 'luna-id',
  source: 'moment',
  sourceEventId: 'moment-content-boundary',
  origin: {
    app: 'wechat',
    mode: 'online',
    sessionId: 'moment-session-1',
    presetId: 'online-preset-1',
  },
  title: 'Shared moment',
  summary: 'Luna posted a rainy window.',
  occurredAt: 900,
  createdAt: 950,
  participantIds: ['user', 'luna-id'],
  remember: true,
  recallWeight: 0.7,
  state: 'digested',
  digestId: 'digest-1',
  revision: 1,
});
const expectMeaningfulUpdate = (candidate, field, message) => {
  const original = [comparisonBase];
  const updated = upsertRelationshipTrace(original, candidate);
  expect(updated !== original, message);
  expect(updated.length === 1, `${field} changes should update without duplicating the trace`);
  expect(updated[0]?.revision === comparisonBase.revision + 1, `${field} changes should increment revision`);
};

expectMeaningfulUpdate(
  { ...comparisonBase, participantIds: ['luna-id', 'friend-id'] },
  'participantIds',
  'participantIds changes must not be treated as identical content',
);
expectMeaningfulUpdate(
  { ...comparisonBase, digestId: 'digest-2' },
  'digestId',
  'digestId changes must not be treated as identical content',
);
expectMeaningfulUpdate(
  {
    ...comparisonBase,
    origin: {
      app: 'offlineMeeting',
      mode: 'offline',
      sessionId: 'offline-session-1',
      presetId: 'offline-preset-1',
    },
  },
  'origin',
  'origin context changes must not be treated as identical content',
);

if (errors.length > 0) {
  console.error('Relationship trace contract check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Relationship trace contract check passed.');
}
