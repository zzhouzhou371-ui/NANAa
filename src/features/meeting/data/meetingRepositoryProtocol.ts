import {
  MEETING_SCHEMA_VERSION,
  type MeetingMemoryDraft,
  type MeetingScene,
  type MeetingSceneSnapshot,
  type MeetingStatusSnapshot,
  type MeetingTurn,
} from '../domain/meeting-types';

export const MEETING_REPOSITORY_SCHEMA_VERSION = 1 as const;

export interface MeetingSceneListOptions {
  archived?: 'exclude' | 'include' | 'only';
  limit?: number;
}

export interface MeetingSceneRecord {
  scene: MeetingScene;
  archivedAt: number | null;
}

export interface MeetingRepositoryArchive {
  repositorySchemaVersion: typeof MEETING_REPOSITORY_SCHEMA_VERSION;
  exportedAt: number;
  scenes: MeetingSceneRecord[];
  snapshots: MeetingSceneSnapshot[];
  memoryDrafts: MeetingMemoryDraft[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isFiniteTimestamp = (value: unknown) => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0
);

const isStringRecord = (value: unknown): value is Record<string, string> => (
  isRecord(value) && Object.values(value).every(item => typeof item === 'string')
);

const isMeetingMemoryDraftArray = (value: unknown): value is MeetingMemoryDraft[] => (
  Array.isArray(value) && value.every(isMeetingMemoryDraft)
);

const isStatusFieldConfig = (value: unknown): boolean => (
  isRecord(value)
  && typeof value.key === 'string'
  && value.key.length > 0
  && typeof value.label === 'string'
  && typeof value.initialValue === 'string'
);

const isHtmlTemplateConfig = (value: unknown): boolean => (
  isRecord(value)
  && typeof value.html === 'string'
  && typeof value.css === 'string'
  && typeof value.height === 'number'
  && Number.isFinite(value.height)
  && value.height > 0
);

const isMeetingPresetSnapshot = (value: unknown): boolean => {
  if (!isRecord(value) || value.schemaVersion !== MEETING_SCHEMA_VERSION) return false;
  if (typeof value.sourcePresetId !== 'string'
    || typeof value.name !== 'string'
    || typeof value.prompt !== 'string'
    || !isRecord(value.meetingConfig)) {
    return false;
  }
  const config = value.meetingConfig;
  return config.schemaVersion === MEETING_SCHEMA_VERSION
    && isRecord(config.statusFields)
    && Array.isArray(config.statusFields.scene)
    && config.statusFields.scene.every(isStatusFieldConfig)
    && Array.isArray(config.statusFields.character)
    && config.statusFields.character.every(isStatusFieldConfig)
    && isHtmlTemplateConfig(config.statusTemplate)
    && isHtmlTemplateConfig(config.miniTheater)
    && isRecord(config.miniTheater)
    && (config.miniTheater.mode === 'off'
      || config.miniTheater.mode === 'manual'
      || config.miniTheater.mode === 'everyTurn')
    && typeof config.miniTheater.prompt === 'string';
};

const isMeetingBlock = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  return value.schemaVersion === MEETING_SCHEMA_VERSION
    && typeof value.id === 'string'
    && value.id.length > 0
    && (value.kind === 'narration' || value.kind === 'character')
    && typeof value.text === 'string'
    && (value.characterId === undefined || typeof value.characterId === 'string')
    && (value.kind !== 'character' || (typeof value.characterId === 'string' && value.characterId.length > 0));
};

const isMeetingMiniTheater = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  return value.schemaVersion === MEETING_SCHEMA_VERSION
    && typeof value.title === 'string'
    && typeof value.content === 'string'
    && typeof value.html === 'string'
    && typeof value.css === 'string'
    && typeof value.height === 'number'
    && Number.isFinite(value.height)
    && value.height > 0;
};

const isMeetingSceneOrigin = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  if (value.type === 'manual') return true;
  return value.type === 'chatHandoff'
    && typeof value.chatId === 'string'
    && value.chatId.length > 0
    && Array.isArray(value.sourceMessageIds)
    && value.sourceMessageIds.every(id => Number.isSafeInteger(id) && (id as number) >= 0)
    && (value.sourceTurnId === undefined || typeof value.sourceTurnId === 'string')
    && typeof value.label === 'string';
};

export const isMeetingStatusSnapshot = (value: unknown): value is MeetingStatusSnapshot => {
  if (!isRecord(value) || !isStringRecord(value.scene) || !isRecord(value.characters)) {
    return false;
  }
  return Object.entries(value.characters).every(([characterId, character]) => (
    isRecord(character)
    && character.characterId === characterId
    && isStringRecord(character.values)
  ));
};

export const isMeetingTurn = (value: unknown): value is MeetingTurn => {
  if (!isRecord(value)) return false;
  return value.schemaVersion === MEETING_SCHEMA_VERSION
    && typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.sceneId === 'string'
    && value.sceneId.length > 0
    && Number.isSafeInteger(value.index)
    && (value.index as number) >= 0
    && (value.state === 'complete' || value.state === 'failed')
    && typeof value.input === 'string'
    && (value.chapterTitle === undefined || typeof value.chapterTitle === 'string')
    && (value.leadQuote === undefined || typeof value.leadQuote === 'string')
    && Array.isArray(value.blocks)
    && value.blocks.every(isMeetingBlock)
    && isMeetingStatusSnapshot(value.statusBefore)
    && isMeetingStatusSnapshot(value.statusAfter)
    && typeof value.rollingRecap === 'string'
    && (value.generationSource === 'remote' || value.generationSource === 'demo')
    && Number.isSafeInteger(value.attempt)
    && (value.attempt as number) >= 0
    && (value.miniTheater === undefined || isMeetingMiniTheater(value.miniTheater))
    && (value.errorCode === undefined || typeof value.errorCode === 'string')
    && isFiniteTimestamp(value.createdAt)
    && isFiniteTimestamp(value.completedAt);
};

export const isMeetingScene = (value: unknown): value is MeetingScene => {
  if (!isRecord(value)) return false;
  return value.schemaVersion === MEETING_SCHEMA_VERSION
    && typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.presetId === 'string'
    && isMeetingPresetSnapshot(value.presetSnapshot)
    && isRecord(value.presetSnapshot)
    && value.presetSnapshot.sourcePresetId === value.presetId
    && typeof value.title === 'string'
    && typeof value.premise === 'string'
    && typeof value.playerSupplement === 'string'
    && typeof value.sceneSupplement === 'string'
    && Array.isArray(value.castIds)
    && value.castIds.every(id => typeof id === 'string' && id.length > 0)
    && value.castIds.length >= 1
    && value.castIds.length <= 4
    && (value.origin === undefined || isMeetingSceneOrigin(value.origin))
    && (value.state === 'active' || value.state === 'completed' || value.state === 'abandoned')
    && isMeetingStatusSnapshot(value.status)
    && typeof value.rollingRecap === 'string'
    && Array.isArray(value.turns)
    && value.turns.every(turn => isMeetingTurn(turn) && turn.sceneId === value.id)
    && isMeetingMemoryDraftArray(value.memoryDrafts)
    && value.memoryDrafts.every(draft => draft.sceneId === value.id)
    && Number.isSafeInteger(value.revision)
    && (value.revision as number) >= 0
    && isFiniteTimestamp(value.createdAt)
    && isFiniteTimestamp(value.updatedAt)
    && (value.completedAt === undefined || isFiniteTimestamp(value.completedAt));
};

export const isMeetingSceneSnapshot = (value: unknown): value is MeetingSceneSnapshot => {
  if (!isRecord(value)) return false;
  return typeof value.sceneId === 'string'
    && value.sceneId.length > 0
    && Number.isSafeInteger(value.revision)
    && (value.revision as number) >= 0
    && isMeetingStatusSnapshot(value.status)
    && typeof value.rollingRecap === 'string'
    && Number.isSafeInteger(value.turnCount)
    && (value.turnCount as number) >= 0;
};

export function isMeetingMemoryDraft(value: unknown): value is MeetingMemoryDraft {
  if (!isRecord(value)) return false;
  return value.schemaVersion === MEETING_SCHEMA_VERSION
    && typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.sceneId === 'string'
    && value.sceneId.length > 0
    && typeof value.characterId === 'string'
    && value.characterId.length > 0
    && Array.isArray(value.sourceTurnIds)
    && value.sourceTurnIds.every(id => typeof id === 'string' && id.length > 0)
    && Array.isArray(value.participantIds)
    && value.participantIds.every(id => typeof id === 'string' && id.length > 0)
    && typeof value.title === 'string'
    && typeof value.summary === 'string'
    && (value.tone === undefined || typeof value.tone === 'string')
    && isFiniteTimestamp(value.occurredAt)
    && isFiniteTimestamp(value.createdAt)
    && (value.state === 'draft' || value.state === 'committed' || value.state === 'discarded')
    && Number.isSafeInteger(value.revision)
    && (value.revision as number) >= 0;
}

export const cloneMeetingValue = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const assertMeetingScene = (scene: MeetingScene): void => {
  if (!isMeetingScene(scene)) throw new Error('Invalid meeting scene');
  const turnIds = new Set<string>();
  const turnIndexes = new Set<number>();
  for (const turn of scene.turns) {
    if (turnIds.has(turn.id) || turnIndexes.has(turn.index)) {
      throw new Error(`Meeting scene ${scene.id} contains duplicate turns`);
    }
    turnIds.add(turn.id);
    turnIndexes.add(turn.index);
  }
};

export const assertMeetingTurns = (sceneId: string, turns: MeetingTurn[]): void => {
  if (!sceneId) throw new Error('Meeting scene id is required');
  const ids = new Set<string>();
  const indexes = new Set<number>();
  for (const turn of turns) {
    if (!isMeetingTurn(turn) || turn.sceneId !== sceneId) {
      throw new Error(`Invalid turn for meeting scene ${sceneId}`);
    }
    if (ids.has(turn.id) || indexes.has(turn.index)) {
      throw new Error(`Duplicate turn in meeting scene ${sceneId}`);
    }
    ids.add(turn.id);
    indexes.add(turn.index);
  }
};

export const assertMeetingSceneSnapshot = (
  sceneId: string,
  snapshot: MeetingSceneSnapshot,
  expectedTurnCount?: number,
): void => {
  if (!isMeetingSceneSnapshot(snapshot) || snapshot.sceneId !== sceneId) {
    throw new Error(`Invalid status snapshot for meeting scene ${sceneId}`);
  }
  if (expectedTurnCount !== undefined && snapshot.turnCount !== expectedTurnCount) {
    throw new Error(`Status snapshot turn count does not match meeting scene ${sceneId}`);
  }
};

export const normalizeMeetingRepositoryArchive = (
  value: unknown,
): MeetingRepositoryArchive => {
  if (!isRecord(value)
    || value.repositorySchemaVersion !== MEETING_REPOSITORY_SCHEMA_VERSION
    || !isFiniteTimestamp(value.exportedAt)
    || !Array.isArray(value.scenes)
    || !Array.isArray(value.snapshots)
    || !Array.isArray(value.memoryDrafts)) {
    throw new Error('Invalid meeting repository archive');
  }

  const sceneIds = new Set<string>();
  const scenes = value.scenes.map(record => {
    if (!isRecord(record) || !isMeetingScene(record.scene)) {
      throw new Error('Invalid scene in meeting repository archive');
    }
    if (record.archivedAt !== null && !isFiniteTimestamp(record.archivedAt)) {
      throw new Error(`Invalid archive timestamp for meeting scene ${record.scene.id}`);
    }
    assertMeetingScene(record.scene);
    if (sceneIds.has(record.scene.id)) throw new Error(`Duplicate meeting scene ${record.scene.id}`);
    sceneIds.add(record.scene.id);
    return { scene: cloneMeetingValue(record.scene), archivedAt: record.archivedAt as number | null };
  });

  const snapshotIds = new Set<string>();
  const snapshots = value.snapshots.map(snapshot => {
    if (!isMeetingSceneSnapshot(snapshot) || !sceneIds.has(snapshot.sceneId)) {
      throw new Error('Invalid status snapshot in meeting repository archive');
    }
    if (snapshotIds.has(snapshot.sceneId)) {
      throw new Error(`Duplicate status snapshot for meeting scene ${snapshot.sceneId}`);
    }
    snapshotIds.add(snapshot.sceneId);
    return cloneMeetingValue(snapshot);
  });

  const draftIds = new Set<string>();
  const memoryDrafts = value.memoryDrafts.map(draft => {
    if (!isMeetingMemoryDraft(draft) || !sceneIds.has(draft.sceneId)) {
      throw new Error('Invalid memory draft in meeting repository archive');
    }
    if (draftIds.has(draft.id)) throw new Error(`Duplicate meeting memory draft ${draft.id}`);
    draftIds.add(draft.id);
    return cloneMeetingValue(draft);
  });

  return {
    repositorySchemaVersion: MEETING_REPOSITORY_SCHEMA_VERSION,
    exportedAt: value.exportedAt as number,
    scenes,
    snapshots,
    memoryDrafts,
  };
};

export const resolveSceneSnapshot = (
  scene: MeetingScene,
  snapshot: MeetingSceneSnapshot | null,
  turns: MeetingTurn[],
  memoryDrafts: MeetingMemoryDraft[] = scene.memoryDrafts,
): MeetingScene => {
  const usableSnapshot = snapshot
    && snapshot.sceneId === scene.id
    && snapshot.turnCount === turns.length
    && snapshot.revision >= scene.revision
    ? snapshot
    : null;
  return {
    ...scene,
    status: usableSnapshot ? cloneMeetingValue(usableSnapshot.status) : scene.status,
    rollingRecap: usableSnapshot ? usableSnapshot.rollingRecap : scene.rollingRecap,
    revision: usableSnapshot ? usableSnapshot.revision : scene.revision,
    turns: cloneMeetingValue(turns),
    memoryDrafts: cloneMeetingValue(memoryDrafts),
  };
};

export const createSceneSnapshot = (
  scene: MeetingScene,
  turns: MeetingTurn[] = scene.turns,
): MeetingSceneSnapshot => ({
  sceneId: scene.id,
  revision: scene.revision,
  status: cloneMeetingValue(scene.status),
  rollingRecap: scene.rollingRecap,
  turnCount: turns.length,
});
