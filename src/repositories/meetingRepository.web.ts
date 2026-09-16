import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  MeetingMemoryDraft,
  MeetingScene,
  MeetingSceneSnapshot,
  MeetingTurn,
} from '../features/meeting/domain/meeting-types';
import {
  MEETING_REPOSITORY_SCHEMA_VERSION,
  assertMeetingScene,
  assertMeetingSceneSnapshot,
  assertMeetingTurns,
  cloneMeetingValue,
  createSceneSnapshot,
  isMeetingMemoryDraft,
  isMeetingScene,
  isMeetingSceneSnapshot,
  isMeetingTurn,
  normalizeMeetingRepositoryArchive,
  resolveSceneSnapshot,
  type MeetingRepositoryArchive,
  type MeetingSceneListOptions,
  type MeetingSceneRecord,
} from '../features/meeting/data/meetingRepositoryProtocol';

const WEB_MEETING_REPOSITORY_KEY = '@nana/meeting-repository-v1';

interface StoredSceneRecord {
  scene: MeetingScene;
  archivedAt: number | null;
}

interface StoredMeetingRepository {
  repositorySchemaVersion: typeof MEETING_REPOSITORY_SCHEMA_VERSION;
  scenes: Record<string, StoredSceneRecord>;
  turns: Record<string, MeetingTurn[]>;
  snapshots: Record<string, MeetingSceneSnapshot>;
  memoryDrafts: Record<string, MeetingMemoryDraft>;
}

let writeQueue: Promise<void> = Promise.resolve();

const emptyRepository = (): StoredMeetingRepository => ({
  repositorySchemaVersion: MEETING_REPOSITORY_SCHEMA_VERSION,
  scenes: {},
  turns: {},
  snapshots: {},
  memoryDrafts: {},
});

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const normalizeStoredRepository = (value: unknown): StoredMeetingRepository => {
  if (!isRecord(value)
    || value.repositorySchemaVersion !== MEETING_REPOSITORY_SCHEMA_VERSION
    || !isRecord(value.scenes)
    || !isRecord(value.turns)
    || !isRecord(value.snapshots)
    || !isRecord(value.memoryDrafts)) {
    return emptyRepository();
  }
  const repository = emptyRepository();
  for (const [sceneId, rawRecord] of Object.entries(value.scenes)) {
    if (!isRecord(rawRecord) || !isMeetingScene(rawRecord.scene) || rawRecord.scene.id !== sceneId) {
      continue;
    }
    if (rawRecord.archivedAt !== null
      && (typeof rawRecord.archivedAt !== 'number'
        || !Number.isFinite(rawRecord.archivedAt)
        || rawRecord.archivedAt < 0)) {
      continue;
    }
    repository.scenes[sceneId] = {
      scene: { ...cloneMeetingValue(rawRecord.scene), turns: [], memoryDrafts: [] },
      archivedAt: rawRecord.archivedAt as number | null,
    };
  }
  for (const [sceneId, rawTurns] of Object.entries(value.turns)) {
    if (!repository.scenes[sceneId] || !Array.isArray(rawTurns)) continue;
    const turns = rawTurns.filter(
      (turn): turn is MeetingTurn => isMeetingTurn(turn) && turn.sceneId === sceneId,
    );
    try {
      assertMeetingTurns(sceneId, turns);
      repository.turns[sceneId] = cloneMeetingValue(turns);
    } catch {
      repository.turns[sceneId] = [];
    }
  }
  for (const [sceneId, rawSnapshot] of Object.entries(value.snapshots)) {
    if (repository.scenes[sceneId]
      && isMeetingSceneSnapshot(rawSnapshot)
      && rawSnapshot.sceneId === sceneId) {
      repository.snapshots[sceneId] = cloneMeetingValue(rawSnapshot);
    }
  }
  for (const [draftId, rawDraft] of Object.entries(value.memoryDrafts)) {
    if (isMeetingMemoryDraft(rawDraft)
      && rawDraft.id === draftId
      && repository.scenes[rawDraft.sceneId]) {
      repository.memoryDrafts[draftId] = cloneMeetingValue(rawDraft);
    }
  }
  return repository;
};

const loadRepository = async (): Promise<StoredMeetingRepository> => {
  const raw = await AsyncStorage.getItem(WEB_MEETING_REPOSITORY_KEY);
  if (!raw) return emptyRepository();
  try {
    return normalizeStoredRepository(JSON.parse(raw) as unknown);
  } catch {
    return emptyRepository();
  }
};

const serializeWrite = <T>(task: () => Promise<T>): Promise<T> => {
  const result = writeQueue.then(task, task);
  writeQueue = result.then(() => undefined, () => undefined);
  return result;
};

const mutateRepository = async <T>(
  mutation: (repository: StoredMeetingRepository) => T | Promise<T>,
): Promise<T> => serializeWrite(async () => {
  const previousRaw = await AsyncStorage.getItem(WEB_MEETING_REPOSITORY_KEY);
  const previous = previousRaw
    ? (() => {
        try {
          return normalizeStoredRepository(JSON.parse(previousRaw) as unknown);
        } catch {
          return emptyRepository();
        }
      })()
    : emptyRepository();
  const next = cloneMeetingValue(previous);
  try {
    const result = await mutation(next);
    await AsyncStorage.setItem(WEB_MEETING_REPOSITORY_KEY, JSON.stringify(next));
    return result;
  } catch (error) {
    try {
      if (previousRaw === null) {
        await AsyncStorage.removeItem(WEB_MEETING_REPOSITORY_KEY);
      } else {
        await AsyncStorage.setItem(WEB_MEETING_REPOSITORY_KEY, previousRaw);
      }
    } catch {
      // Preserve the original failure; the prior single-key snapshot remains
      // the best available rollback point if the storage backend is unhealthy.
    }
    throw error;
  }
});

const memoryDraftsForScene = (
  repository: StoredMeetingRepository,
  sceneId: string,
): MeetingMemoryDraft[] => Object.values(repository.memoryDrafts)
  .filter(draft => draft.sceneId === sceneId)
  .sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id));

const hydrateScene = (
  repository: StoredMeetingRepository,
  sceneId: string,
): MeetingScene | null => {
  const record = repository.scenes[sceneId];
  if (!record) return null;
  return resolveSceneSnapshot(
    record.scene,
    repository.snapshots[sceneId] ?? null,
    repository.turns[sceneId] ?? [],
    memoryDraftsForScene(repository, sceneId),
  );
};

const upsertSceneInRepository = (
  repository: StoredMeetingRepository,
  scene: MeetingScene,
  archivedAt?: number | null,
): void => {
  assertMeetingScene(scene);
  const previousArchive = repository.scenes[scene.id]?.archivedAt ?? null;
  repository.scenes[scene.id] = {
    scene: { ...cloneMeetingValue(scene), turns: [], memoryDrafts: [] },
    archivedAt: archivedAt === undefined ? previousArchive : archivedAt,
  };
  repository.turns[scene.id] = cloneMeetingValue(scene.turns);
  repository.snapshots[scene.id] = createSceneSnapshot(scene);
  for (const draft of Object.values(repository.memoryDrafts)) {
    if (draft.sceneId === scene.id) delete repository.memoryDrafts[draft.id];
  }
  for (const draft of scene.memoryDrafts) repository.memoryDrafts[draft.id] = cloneMeetingValue(draft);
};

const replaceTurnsInRepository = (
  repository: StoredMeetingRepository,
  sceneId: string,
  turns: MeetingTurn[],
  snapshot?: MeetingSceneSnapshot,
): void => {
  assertMeetingTurns(sceneId, turns);
  if (snapshot) assertMeetingSceneSnapshot(sceneId, snapshot, turns.length);
  const record = repository.scenes[sceneId];
  if (!record) throw new Error(`Meeting scene ${sceneId} does not exist`);
  const oldTurns = repository.turns[sceneId] ?? [];
  repository.turns[sceneId] = cloneMeetingValue(turns);
  const lastTurn = [...turns].sort((left, right) => left.index - right.index).at(-1);
  const firstOldTurn = [...oldTurns].sort((left, right) => left.index - right.index)[0];
  const currentSnapshot = repository.snapshots[sceneId];
  repository.snapshots[sceneId] = cloneMeetingValue(snapshot ?? {
    sceneId,
    revision: Math.max(record.scene.revision, currentSnapshot?.revision ?? 0),
    status: cloneMeetingValue(lastTurn?.statusAfter ?? firstOldTurn?.statusBefore ?? record.scene.status),
    rollingRecap: lastTurn?.rollingRecap ?? (turns.length === 0 ? '' : record.scene.rollingRecap),
    turnCount: turns.length,
  });
};

const archiveFromRepository = (repository: StoredMeetingRepository): MeetingRepositoryArchive => {
  const scenes = Object.entries(repository.scenes)
    .map(([sceneId, record]) => {
      const scene = hydrateScene(repository, sceneId);
      return scene ? { scene, archivedAt: record.archivedAt } : null;
    })
    .filter((record): record is MeetingSceneRecord => record !== null)
    .sort((left, right) => right.scene.updatedAt - left.scene.updatedAt);
  return {
    repositorySchemaVersion: MEETING_REPOSITORY_SCHEMA_VERSION,
    exportedAt: Date.now(),
    scenes,
    snapshots: Object.values(repository.snapshots).map(cloneMeetingValue),
    memoryDrafts: Object.values(repository.memoryDrafts).map(cloneMeetingValue),
  };
};

export async function initializeMeetingRepository(): Promise<void> {
  await writeQueue;
  await loadRepository();
}

export async function listMeetingSceneRecords(
  options: MeetingSceneListOptions = {},
): Promise<MeetingSceneRecord[]> {
  await writeQueue;
  const repository = await loadRepository();
  const archiveMode = options.archived ?? 'exclude';
  const records = Object.entries(repository.scenes)
    .filter(([, record]) => archiveMode === 'include'
      || (archiveMode === 'only' ? record.archivedAt !== null : record.archivedAt === null))
    .map(([sceneId, record]) => {
      const scene = hydrateScene(repository, sceneId);
      return scene ? { scene, archivedAt: record.archivedAt } : null;
    })
    .filter((record): record is MeetingSceneRecord => record !== null)
    .sort((left, right) => right.scene.updatedAt - left.scene.updatedAt);
  const limit = Number.isSafeInteger(options.limit) && (options.limit as number) > 0
    ? Math.min(options.limit as number, 1000)
    : records.length;
  return records.slice(0, limit);
}

export async function listMeetingScenes(
  options: MeetingSceneListOptions = {},
): Promise<MeetingScene[]> {
  return (await listMeetingSceneRecords(options)).map(record => record.scene);
}

export async function getMeetingSceneRecord(sceneId: string): Promise<MeetingSceneRecord | null> {
  await writeQueue;
  const repository = await loadRepository();
  const record = repository.scenes[sceneId];
  if (!record) return null;
  const scene = hydrateScene(repository, sceneId);
  return scene ? { scene, archivedAt: record.archivedAt } : null;
}

export async function getMeetingScene(sceneId: string): Promise<MeetingScene | null> {
  return (await getMeetingSceneRecord(sceneId))?.scene ?? null;
}

export async function upsertMeetingScene(scene: MeetingScene): Promise<void> {
  await mutateRepository(repository => upsertSceneInRepository(repository, scene));
}

export async function deleteMeetingScene(sceneId: string): Promise<void> {
  await mutateRepository(repository => {
    delete repository.scenes[sceneId];
    delete repository.turns[sceneId];
    delete repository.snapshots[sceneId];
    for (const draft of Object.values(repository.memoryDrafts)) {
      if (draft.sceneId === sceneId) delete repository.memoryDrafts[draft.id];
    }
  });
}

export async function archiveMeetingScene(sceneId: string, archivedAt = Date.now()): Promise<void> {
  if (!Number.isFinite(archivedAt) || archivedAt < 0) throw new Error('Invalid archive timestamp');
  await mutateRepository(repository => {
    const record = repository.scenes[sceneId];
    if (record) record.archivedAt = archivedAt;
  });
}

export async function unarchiveMeetingScene(sceneId: string): Promise<void> {
  await mutateRepository(repository => {
    const record = repository.scenes[sceneId];
    if (record) record.archivedAt = null;
  });
}

export async function listMeetingTurns(sceneId: string): Promise<MeetingTurn[]> {
  await writeQueue;
  return cloneMeetingValue((await loadRepository()).turns[sceneId] ?? []);
}

export async function replaceMeetingTurns(
  sceneId: string,
  turns: MeetingTurn[],
  snapshot?: MeetingSceneSnapshot,
): Promise<void> {
  await mutateRepository(repository => replaceTurnsInRepository(repository, sceneId, turns, snapshot));
}

export async function truncateMeetingTurns(
  sceneId: string,
  turnCount: number,
  snapshot?: MeetingSceneSnapshot,
): Promise<void> {
  if (!Number.isSafeInteger(turnCount) || turnCount < 0) {
    throw new Error('Meeting turn count must be a non-negative integer');
  }
  await mutateRepository(repository => {
    const turns = (repository.turns[sceneId] ?? [])
      .sort((left, right) => left.index - right.index)
      .slice(0, turnCount);
    replaceTurnsInRepository(repository, sceneId, turns, snapshot);
  });
}

export async function getMeetingSceneSnapshot(
  sceneId: string,
): Promise<MeetingSceneSnapshot | null> {
  await writeQueue;
  return cloneMeetingValue((await loadRepository()).snapshots[sceneId] ?? null);
}

export async function upsertMeetingSceneSnapshot(snapshot: MeetingSceneSnapshot): Promise<void> {
  assertMeetingSceneSnapshot(snapshot.sceneId, snapshot);
  await mutateRepository(repository => {
    if (!repository.scenes[snapshot.sceneId]) {
      throw new Error(`Meeting scene ${snapshot.sceneId} does not exist`);
    }
    assertMeetingSceneSnapshot(
      snapshot.sceneId,
      snapshot,
      repository.turns[snapshot.sceneId]?.length ?? 0,
    );
    repository.snapshots[snapshot.sceneId] = cloneMeetingValue(snapshot);
  });
}

export async function listMeetingMemoryDrafts(sceneId?: string): Promise<MeetingMemoryDraft[]> {
  await writeQueue;
  const drafts = Object.values((await loadRepository()).memoryDrafts)
    .filter(draft => sceneId === undefined || draft.sceneId === sceneId)
    .sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id));
  return cloneMeetingValue(drafts);
}

export async function getMeetingMemoryDraft(draftId: string): Promise<MeetingMemoryDraft | null> {
  await writeQueue;
  return cloneMeetingValue((await loadRepository()).memoryDrafts[draftId] ?? null);
}

export async function upsertMeetingMemoryDraft(draft: MeetingMemoryDraft): Promise<void> {
  if (!isMeetingMemoryDraft(draft)) throw new Error('Invalid meeting memory draft');
  await mutateRepository(repository => {
    if (!repository.scenes[draft.sceneId]) {
      throw new Error(`Meeting scene ${draft.sceneId} does not exist`);
    }
    repository.memoryDrafts[draft.id] = cloneMeetingValue(draft);
  });
}

export async function deleteMeetingMemoryDraft(draftId: string): Promise<void> {
  await mutateRepository(repository => {
    delete repository.memoryDrafts[draftId];
  });
}

export async function exportMeetingRepositoryArchive(): Promise<MeetingRepositoryArchive> {
  return serializeWrite(async () => archiveFromRepository(await loadRepository()));
}

export async function importMeetingRepositoryArchive(value: unknown): Promise<void> {
  const archive = normalizeMeetingRepositoryArchive(value);
  await mutateRepository(repository => {
    const replacement = emptyRepository();
    for (const record of archive.scenes) {
      upsertSceneInRepository(
        replacement,
        { ...record.scene, memoryDrafts: [] },
        record.archivedAt,
      );
    }
    for (const snapshot of archive.snapshots) {
      replacement.snapshots[snapshot.sceneId] = cloneMeetingValue(snapshot);
    }
    for (const draft of archive.memoryDrafts) {
      replacement.memoryDrafts[draft.id] = cloneMeetingValue(draft);
    }
    repository.repositorySchemaVersion = replacement.repositorySchemaVersion;
    repository.scenes = replacement.scenes;
    repository.turns = replacement.turns;
    repository.snapshots = replacement.snapshots;
    repository.memoryDrafts = replacement.memoryDrafts;
  });
}

export async function clearMeetingRepository(): Promise<void> {
  await mutateRepository(repository => {
    repository.scenes = {};
    repository.turns = {};
    repository.snapshots = {};
    repository.memoryDrafts = {};
  });
}

export const exportMeetingArchive = exportMeetingRepositoryArchive;
export const importMeetingArchive = importMeetingRepositoryArchive;
export const clearMeetingArchive = clearMeetingRepository;
export const createMeetingRepositorySnapshot = exportMeetingRepositoryArchive;
export const restoreMeetingRepositorySnapshot = importMeetingRepositoryArchive;

export type {
  MeetingRepositoryArchive,
  MeetingSceneListOptions,
  MeetingSceneRecord,
} from '../features/meeting/data/meetingRepositoryProtocol';
