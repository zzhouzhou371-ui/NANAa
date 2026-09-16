import type { RelationshipTrace } from '../../types';

export interface RelationshipMemoryArchiveStats {
  total: number;
  remembered: number;
  ignored: number;
  verified: number;
}

export interface RelationshipMemoryArchiveModel {
  items: RelationshipTrace[];
  stats: RelationshipMemoryArchiveStats;
}

/**
 * Builds one character-scoped, newest-first memory archive without mutating
 * the persisted trace array. The UI deliberately includes ignored and failed
 * traces so users can audit and repair what the model is allowed to recall.
 */
export function buildRelationshipMemoryArchive(
  traces: RelationshipTrace[],
  characterId: string,
): RelationshipMemoryArchiveModel {
  const items = traces
    .filter(trace => trace.characterId === characterId)
    .slice()
    .sort((left, right) => (
      right.occurredAt - left.occurredAt
      || right.createdAt - left.createdAt
      || right.revision - left.revision
    ));

  return {
    items,
    stats: {
      total: items.length,
      remembered: items.filter(trace => trace.remember && trace.state !== 'ignored').length,
      ignored: items.filter(trace => !trace.remember || trace.state === 'ignored').length,
      verified: items.filter(trace => trace.userVerified === true).length,
    },
  };
}

/**
 * Remember/ignore is an explicit user revision of the same canonical trace.
 * It never fabricates a second trace or discards a user-verified correction.
 */
export function toggleRelationshipMemoryRecall(
  trace: RelationshipTrace,
): RelationshipTrace {
  const remember = !trace.remember || trace.state === 'ignored';
  return {
    ...trace,
    remember,
    state: remember ? 'digested' : 'ignored',
    revision: Math.max(1, Math.floor(trace.revision || 1)) + 1,
  };
}
