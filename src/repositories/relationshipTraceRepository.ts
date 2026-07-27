import type {
  RelationshipTrace,
  RelationshipTraceOrigin,
  RelationshipTraceSource,
  RelationshipTraceState,
} from '../types';

const DEFAULT_ORIGIN: RelationshipTraceOrigin = {
  app: 'wechat',
  mode: 'online',
};

const RELATIONSHIP_TRACE_SOURCES: readonly RelationshipTraceSource[] = [
  'chat',
  'voiceMessage',
  'photo',
  'payment',
  'voiceCall',
  'videoCall',
  'moment',
  'offlineScene',
];

const RELATIONSHIP_TRACE_STATES: readonly RelationshipTraceState[] = [
  'pending',
  'digested',
  'ignored',
  'failed',
];

export interface CreateRelationshipTraceInput {
  characterId: string;
  source: RelationshipTraceSource;
  sourceEventId: string;
  origin?: RelationshipTraceOrigin;
  title: string;
  summary: string;
  occurredAt?: number;
  participantIds?: string[];
  tone?: string;
  mediaUris?: string[];
  remember?: boolean;
  recallWeight?: number;
  state?: RelationshipTraceState;
  userVerified?: boolean;
}

export interface CorrectRelationshipTraceInput {
  traceId: string;
  summary: string;
  title?: string;
  tone?: string;
  recallWeight?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
);

const normalizeRequiredString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
};

const normalizeOptionalString = (value: unknown): string | undefined => (
  normalizeRequiredString(value)
);

const normalizeStringArray = (
  value: unknown,
  fallback: string[] = [],
): string[] => {
  if (!Array.isArray(value)) return fallback;
  const normalized = Array.from(new Set(value
    .map(normalizeRequiredString)
    .filter((entry): entry is string => Boolean(entry))));
  return normalized.length > 0 ? normalized : fallback;
};

const normalizeTimestamp = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback
);

const normalizeNow = (now?: number): number => (
  typeof now === 'number' && Number.isFinite(now) && now >= 0
    ? now
    : Date.now()
);

const normalizeRevision = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.floor(value))
    : 1
);

const clampRecallWeight = (value: unknown, fallback = 0.55): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
};

const isRelationshipTraceSource = (
  value: unknown,
): value is RelationshipTraceSource => (
  typeof value === 'string'
  && RELATIONSHIP_TRACE_SOURCES.includes(value as RelationshipTraceSource)
);

const isRelationshipTraceState = (
  value: unknown,
): value is RelationshipTraceState => (
  typeof value === 'string'
  && RELATIONSHIP_TRACE_STATES.includes(value as RelationshipTraceState)
);

const normalizeOrigin = (value: unknown): RelationshipTraceOrigin => {
  if (!isRecord(value)) return { ...DEFAULT_ORIGIN };

  const app = value.app === 'wechat' || value.app === 'offlineMeeting'
    ? value.app
    : DEFAULT_ORIGIN.app;
  const mode = value.mode === 'online' || value.mode === 'offline'
    ? value.mode
    : DEFAULT_ORIGIN.mode;
  const sessionId = normalizeOptionalString(value.sessionId);
  const presetId = normalizeOptionalString(value.presetId);

  return {
    app,
    mode,
    ...(sessionId ? { sessionId } : {}),
    ...(presetId ? { presetId } : {}),
  };
};

export const createRelationshipTrace = (
  input: CreateRelationshipTraceInput,
): RelationshipTrace => {
  const createdAt = Date.now();
  const occurredAt = normalizeTimestamp(input.occurredAt, createdAt);
  const state = input.state ?? 'pending';
  return {
    schemaVersion: 1,
    id: `trace:${input.source}:${input.characterId}:${input.sourceEventId}`,
    characterId: input.characterId,
    source: input.source,
    sourceEventId: input.sourceEventId,
    origin: normalizeOrigin(input.origin),
    occurredAt,
    createdAt,
    participantIds: input.participantIds ?? ['user', input.characterId],
    title: input.title.trim(),
    summary: input.summary.trim(),
    tone: input.tone?.trim() || undefined,
    mediaUris: input.mediaUris?.filter(Boolean),
    remember: state === 'ignored' ? false : (input.remember ?? true),
    recallWeight: clampRecallWeight(input.recallWeight ?? 0.55),
    state,
    revision: 1,
    ...(typeof input.userVerified === 'boolean'
      ? { userVerified: input.userVerified }
      : {}),
  };
};

export const normalizeRelationshipTrace = (
  value: unknown,
  now?: number,
): RelationshipTrace | undefined => {
  if (!isRecord(value)) return undefined;

  const id = normalizeRequiredString(value.id);
  const characterId = normalizeRequiredString(value.characterId);
  const sourceEventId = normalizeRequiredString(value.sourceEventId);
  if (!id || !characterId || !sourceEventId || !isRelationshipTraceSource(value.source)) {
    return undefined;
  }

  const normalizedNow = normalizeNow(now);
  const createdAt = normalizeTimestamp(value.createdAt, normalizedNow);
  const occurredAt = normalizeTimestamp(value.occurredAt, createdAt);
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  const summary = typeof value.summary === 'string' ? value.summary.trim() : '';
  const state = isRelationshipTraceState(value.state)
    ? value.state
    : summary
      ? 'digested'
      : 'pending';
  const remember = state === 'ignored'
    ? false
    : typeof value.remember === 'boolean'
      ? value.remember
      : true;
  const tone = normalizeOptionalString(value.tone);
  const digestId = normalizeOptionalString(value.digestId);
  const mediaUris = normalizeStringArray(value.mediaUris);
  const participantIds = normalizeStringArray(
    value.participantIds,
    ['user', characterId],
  );

  return {
    schemaVersion: 1,
    id,
    characterId,
    source: value.source,
    sourceEventId,
    origin: normalizeOrigin(value.origin),
    occurredAt,
    createdAt,
    participantIds,
    title,
    summary,
    ...(tone ? { tone } : {}),
    ...(mediaUris.length > 0 ? { mediaUris } : {}),
    remember,
    recallWeight: clampRecallWeight(value.recallWeight),
    state,
    ...(digestId ? { digestId } : {}),
    revision: normalizeRevision(value.revision),
    ...(typeof value.userVerified === 'boolean'
      ? { userVerified: value.userVerified }
      : {}),
  };
};

const traceIdentityKey = (trace: RelationshipTrace): string => JSON.stringify([
  trace.characterId,
  trace.source,
  trace.sourceEventId,
]);

const shouldPreferTrace = (
  candidate: RelationshipTrace,
  current: RelationshipTrace,
): boolean => {
  if (candidate.userVerified === true !== (current.userVerified === true)) {
    return candidate.userVerified === true;
  }
  if (candidate.revision !== current.revision) {
    return candidate.revision > current.revision;
  }
  if (candidate.createdAt !== current.createdAt) {
    return candidate.createdAt > current.createdAt;
  }
  return candidate.occurredAt > current.occurredAt;
};

export const normalizeRelationshipTraces = (
  value: unknown,
  maxEntries = 1000,
  now?: number,
): RelationshipTrace[] => {
  if (!Array.isArray(value)) return [];

  const normalizedNow = normalizeNow(now);
  const normalizedMaxEntries = typeof maxEntries === 'number' && Number.isFinite(maxEntries)
    ? Math.max(0, Math.floor(maxEntries))
    : 1000;
  const deduplicated = new Map<string, RelationshipTrace>();

  for (const entry of value) {
    const trace = normalizeRelationshipTrace(entry, normalizedNow);
    if (!trace) continue;
    const identityKey = traceIdentityKey(trace);
    const current = deduplicated.get(identityKey);
    if (!current || shouldPreferTrace(trace, current)) {
      deduplicated.set(identityKey, trace);
    }
  }

  return Array.from(deduplicated.values()).slice(0, normalizedMaxEntries);
};

const sameStringArray = (
  left: string[] | undefined,
  right: string[] | undefined,
): boolean => (
  JSON.stringify(left ?? []) === JSON.stringify(right ?? [])
);

const sameOrigin = (
  left: RelationshipTraceOrigin | undefined,
  right: RelationshipTraceOrigin | undefined,
): boolean => (
  left?.app === right?.app
  && left?.mode === right?.mode
  && left?.sessionId === right?.sessionId
  && left?.presetId === right?.presetId
);

export const sameTraceContent = (left: RelationshipTrace, right: RelationshipTrace) => (
  left.title === right.title
  && left.summary === right.summary
  && left.tone === right.tone
  && left.occurredAt === right.occurredAt
  && sameStringArray(left.participantIds, right.participantIds)
  && sameStringArray(left.mediaUris, right.mediaUris)
  && left.remember === right.remember
  && left.recallWeight === right.recallWeight
  && left.state === right.state
  && left.digestId === right.digestId
  && sameOrigin(left.origin, right.origin)
  && left.userVerified === right.userVerified
);

export const upsertRelationshipTrace = (
  traces: RelationshipTrace[],
  next: RelationshipTrace,
  maxEntries = 1000,
): RelationshipTrace[] => {
  const existingIndex = traces.findIndex(trace => (
    trace.id === next.id
    || (
      trace.characterId === next.characterId
      && trace.source === next.source
      && trace.sourceEventId === next.sourceEventId
    )
  ));

  if (existingIndex < 0) return [next, ...traces].slice(0, maxEntries);
  const existing = traces[existingIndex];
  if (existing.userVerified === true && next.userVerified !== true) return traces;
  if (sameTraceContent(existing, next)) return traces;

  const updated = {
    ...existing,
    ...next,
    id: existing.id,
    createdAt: existing.createdAt,
    revision: normalizeRevision(existing.revision) + 1,
  };
  return [updated, ...traces.filter((_, index) => index !== existingIndex)].slice(0, maxEntries);
};

export const correctRelationshipTrace = (
  traces: RelationshipTrace[],
  correction: CorrectRelationshipTraceInput,
): RelationshipTrace[] => {
  const existingIndex = traces.findIndex(trace => trace.id === correction.traceId);
  if (existingIndex < 0) return traces;

  const existing = traces[existingIndex];
  const corrected: RelationshipTrace = {
    ...existing,
    title: correction.title === undefined
      ? existing.title
      : correction.title.trim(),
    summary: correction.summary.trim(),
    tone: correction.tone === undefined
      ? existing.tone
      : correction.tone.trim() || undefined,
    recallWeight: correction.recallWeight === undefined
      ? Math.max(existing.recallWeight, 0.95)
      : clampRecallWeight(correction.recallWeight, existing.recallWeight),
    state: 'digested',
    remember: true,
    userVerified: true,
  };

  if (sameTraceContent(existing, corrected)) return traces;

  corrected.revision = normalizeRevision(existing.revision) + 1;
  return traces.map((trace, index) => (
    index === existingIndex ? corrected : trace
  ));
};

export const relationshipTracesForCharacter = (
  traces: RelationshipTrace[],
  characterId: string,
) => traces
  .filter(trace => trace.characterId === characterId && trace.remember)
  .sort((left, right) => right.occurredAt - left.occurredAt);
