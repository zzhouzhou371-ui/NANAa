import * as SQLite from 'expo-sqlite';
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

const DATABASE_NAME = 'nana-meeting.db';
const DATABASE_VERSION = 1;

interface SceneRow {
  scene_id: string;
  archived_at: number | null;
  payload: string;
}

interface TurnRow {
  scene_id: string;
  turn_id: string;
  turn_index: number;
  payload: string;
}

interface SnapshotRow {
  scene_id: string;
  payload: string;
}

interface MemoryDraftRow {
  draft_id: string;
  scene_id: string;
  payload: string;
}

type MeetingTransaction = Parameters<
  Parameters<SQLite.SQLiteDatabase['withExclusiveTransactionAsync']>[0]
>[0];
type DatabaseExecutor = SQLite.SQLiteDatabase | MeetingTransaction;

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

const serializeWrite = <T>(task: () => Promise<T>): Promise<T> => {
  const result = writeQueue.then(task, task);
  writeQueue = result.then(() => undefined, () => undefined);
  return result;
};

const parseJson = (payload: string): unknown => {
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
};

const parseSceneRow = (row: SceneRow): MeetingScene | null => {
  const value = parseJson(row.payload);
  if (!isMeetingScene(value) || value.id !== row.scene_id) return null;
  return value;
};

const parseTurnRow = (row: TurnRow): MeetingTurn | null => {
  const value = parseJson(row.payload);
  if (!isMeetingTurn(value)
    || value.sceneId !== row.scene_id
    || value.id !== row.turn_id
    || value.index !== row.turn_index) {
    return null;
  }
  return value;
};

const parseSnapshotRow = (row: SnapshotRow | null): MeetingSceneSnapshot | null => {
  if (!row) return null;
  const value = parseJson(row.payload);
  return isMeetingSceneSnapshot(value) && value.sceneId === row.scene_id ? value : null;
};

const openMeetingDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async database => {
      await database.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      const versionRow = await database.getFirstAsync<{ user_version: number }>(
        'PRAGMA user_version',
      );
      const currentVersion = versionRow?.user_version ?? 0;
      if (currentVersion > DATABASE_VERSION) {
        throw new Error(`Meeting database version ${currentVersion} is newer than supported`);
      }
      if (currentVersion < 1) {
        await database.execAsync(`
          CREATE TABLE IF NOT EXISTS meeting_scenes (
            scene_id TEXT PRIMARY KEY NOT NULL,
            schema_version INTEGER NOT NULL,
            preset_id TEXT NOT NULL,
            state TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            completed_at INTEGER,
            archived_at INTEGER,
            payload TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS meeting_scenes_recency
            ON meeting_scenes (archived_at, updated_at DESC);

          CREATE TABLE IF NOT EXISTS meeting_turns (
            scene_id TEXT NOT NULL,
            turn_id TEXT NOT NULL,
            turn_index INTEGER NOT NULL,
            schema_version INTEGER NOT NULL,
            state TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            completed_at INTEGER NOT NULL,
            payload TEXT NOT NULL,
            PRIMARY KEY (scene_id, turn_id),
            UNIQUE (scene_id, turn_index),
            FOREIGN KEY (scene_id) REFERENCES meeting_scenes (scene_id) ON DELETE CASCADE
          );
          CREATE INDEX IF NOT EXISTS meeting_turns_order
            ON meeting_turns (scene_id, turn_index);

          CREATE TABLE IF NOT EXISTS meeting_scene_snapshots (
            scene_id TEXT PRIMARY KEY NOT NULL,
            revision INTEGER NOT NULL,
            turn_count INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            payload TEXT NOT NULL,
            FOREIGN KEY (scene_id) REFERENCES meeting_scenes (scene_id) ON DELETE CASCADE
          );

          CREATE TABLE IF NOT EXISTS meeting_memory_drafts (
            draft_id TEXT PRIMARY KEY NOT NULL,
            scene_id TEXT NOT NULL,
            character_id TEXT NOT NULL,
            schema_version INTEGER NOT NULL,
            state TEXT NOT NULL,
            occurred_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            revision INTEGER NOT NULL,
            payload TEXT NOT NULL,
            FOREIGN KEY (scene_id) REFERENCES meeting_scenes (scene_id) ON DELETE CASCADE
          );
          CREATE INDEX IF NOT EXISTS meeting_memory_drafts_scene
            ON meeting_memory_drafts (scene_id, created_at DESC);
        `);
      }
      await database.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
      return database;
    }).catch(error => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
};

const loadTurns = async (
  executor: DatabaseExecutor,
  sceneId: string,
): Promise<MeetingTurn[]> => {
  const rows = await executor.getAllAsync<TurnRow>(`
    SELECT scene_id, turn_id, turn_index, payload
    FROM meeting_turns
    WHERE scene_id = ?
    ORDER BY turn_index ASC
  `, sceneId);
  return rows.map(parseTurnRow).filter((turn): turn is MeetingTurn => turn !== null);
};

const loadSnapshot = async (
  executor: DatabaseExecutor,
  sceneId: string,
): Promise<MeetingSceneSnapshot | null> => {
  const row = await executor.getFirstAsync<SnapshotRow>(`
    SELECT scene_id, payload
    FROM meeting_scene_snapshots
    WHERE scene_id = ?
  `, sceneId);
  return parseSnapshotRow(row);
};

const loadMemoryDrafts = async (
  executor: DatabaseExecutor,
  sceneId?: string,
): Promise<MeetingMemoryDraft[]> => {
  const rows = sceneId
    ? await executor.getAllAsync<MemoryDraftRow>(`
        SELECT draft_id, scene_id, payload FROM meeting_memory_drafts
        WHERE scene_id = ? ORDER BY created_at DESC, draft_id ASC
      `, sceneId)
    : await executor.getAllAsync<MemoryDraftRow>(`
        SELECT draft_id, scene_id, payload FROM meeting_memory_drafts
        ORDER BY created_at DESC, draft_id ASC
      `);
  return rows.map(row => {
    const value = parseJson(row.payload);
    return isMeetingMemoryDraft(value)
      && value.id === row.draft_id
      && value.sceneId === row.scene_id
      ? value
      : null;
  }).filter((draft): draft is MeetingMemoryDraft => draft !== null);
};

const hydrateSceneRow = async (
  executor: DatabaseExecutor,
  row: SceneRow,
): Promise<MeetingScene | null> => {
  const scene = parseSceneRow(row);
  if (!scene) return null;
  const [turns, snapshot, memoryDrafts] = await Promise.all([
    loadTurns(executor, row.scene_id),
    loadSnapshot(executor, row.scene_id),
    loadMemoryDrafts(executor, row.scene_id),
  ]);
  return resolveSceneSnapshot(scene, snapshot, turns, memoryDrafts);
};

const writeTurns = async (
  transaction: MeetingTransaction,
  sceneId: string,
  turns: MeetingTurn[],
): Promise<void> => {
  assertMeetingTurns(sceneId, turns);
  const statement = await transaction.prepareAsync(`
    INSERT INTO meeting_turns (
      scene_id, turn_id, turn_index, schema_version, state,
      created_at, completed_at, payload
    ) VALUES (
      $sceneId, $turnId, $turnIndex, $schemaVersion, $state,
      $createdAt, $completedAt, $payload
    )
  `);
  try {
    for (const turn of [...turns].sort((left, right) => left.index - right.index)) {
      await statement.executeAsync({
        $sceneId: sceneId,
        $turnId: turn.id,
        $turnIndex: turn.index,
        $schemaVersion: turn.schemaVersion,
        $state: turn.state,
        $createdAt: turn.createdAt,
        $completedAt: turn.completedAt,
        $payload: JSON.stringify(turn),
      });
    }
  } finally {
    await statement.finalizeAsync();
  }
};

const writeSnapshot = async (
  transaction: MeetingTransaction,
  snapshot: MeetingSceneSnapshot,
): Promise<void> => {
  assertMeetingSceneSnapshot(snapshot.sceneId, snapshot);
  await transaction.runAsync(`
    INSERT INTO meeting_scene_snapshots (
      scene_id, revision, turn_count, updated_at, payload
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (scene_id) DO UPDATE SET
      revision = excluded.revision,
      turn_count = excluded.turn_count,
      updated_at = excluded.updated_at,
      payload = excluded.payload
  `, snapshot.sceneId, snapshot.revision, snapshot.turnCount, Date.now(), JSON.stringify(snapshot));
};

const writeMemoryDraft = async (
  transaction: MeetingTransaction,
  draft: MeetingMemoryDraft,
): Promise<void> => {
  if (!isMeetingMemoryDraft(draft)) throw new Error('Invalid meeting memory draft');
  await transaction.runAsync(`
    INSERT INTO meeting_memory_drafts (
      draft_id, scene_id, character_id, schema_version, state, occurred_at,
      created_at, revision, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (draft_id) DO UPDATE SET
      scene_id = excluded.scene_id,
      character_id = excluded.character_id,
      schema_version = excluded.schema_version,
      state = excluded.state,
      occurred_at = excluded.occurred_at,
      created_at = excluded.created_at,
      revision = excluded.revision,
      payload = excluded.payload
  `,
  draft.id,
  draft.sceneId,
  draft.characterId,
  draft.schemaVersion,
  draft.state,
  draft.occurredAt,
  draft.createdAt,
  draft.revision,
  JSON.stringify(draft));
};

const writeScene = async (
  transaction: MeetingTransaction,
  scene: MeetingScene,
  archivedAt: number | null | undefined,
): Promise<void> => {
  assertMeetingScene(scene);
  const storedScene = { ...cloneMeetingValue(scene), turns: [], memoryDrafts: [] };
  await transaction.runAsync(`
    INSERT INTO meeting_scenes (
      scene_id, schema_version, preset_id, state, created_at,
      updated_at, completed_at, archived_at, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (scene_id) DO UPDATE SET
      schema_version = excluded.schema_version,
      preset_id = excluded.preset_id,
      state = excluded.state,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      completed_at = excluded.completed_at,
      payload = excluded.payload
  `,
  scene.id,
  scene.schemaVersion,
  scene.presetId,
  scene.state,
  scene.createdAt,
  scene.updatedAt,
  scene.completedAt ?? null,
  archivedAt ?? null,
  JSON.stringify(storedScene));
  if (archivedAt !== undefined) {
    await transaction.runAsync(
      'UPDATE meeting_scenes SET archived_at = ? WHERE scene_id = ?',
      archivedAt,
      scene.id,
    );
  }
  await transaction.runAsync('DELETE FROM meeting_turns WHERE scene_id = ?', scene.id);
  await writeTurns(transaction, scene.id, scene.turns);
  await transaction.runAsync('DELETE FROM meeting_memory_drafts WHERE scene_id = ?', scene.id);
  for (const draft of scene.memoryDrafts) await writeMemoryDraft(transaction, draft);
  await writeSnapshot(transaction, createSceneSnapshot(scene));
};

const replaceTurnsInTransaction = async (
  transaction: MeetingTransaction,
  sceneId: string,
  turns: MeetingTurn[],
  snapshot?: MeetingSceneSnapshot,
): Promise<void> => {
  assertMeetingTurns(sceneId, turns);
  if (snapshot) assertMeetingSceneSnapshot(sceneId, snapshot, turns.length);
  const sceneRow = await transaction.getFirstAsync<SceneRow>(`
    SELECT scene_id, archived_at, payload FROM meeting_scenes WHERE scene_id = ?
  `, sceneId);
  const scene = sceneRow ? parseSceneRow(sceneRow) : null;
  if (!scene) throw new Error(`Meeting scene ${sceneId} does not exist`);
  const oldTurns = await loadTurns(transaction, sceneId);
  const currentSnapshot = await loadSnapshot(transaction, sceneId);
  await transaction.runAsync('DELETE FROM meeting_turns WHERE scene_id = ?', sceneId);
  await writeTurns(transaction, sceneId, turns);
  const lastTurn = [...turns].sort((left, right) => left.index - right.index).at(-1);
  const firstOldTurn = oldTurns[0];
  const nextSnapshot = snapshot ?? {
    sceneId,
    revision: Math.max(scene.revision, currentSnapshot?.revision ?? 0),
    status: cloneMeetingValue(lastTurn?.statusAfter ?? firstOldTurn?.statusBefore ?? scene.status),
    rollingRecap: lastTurn?.rollingRecap ?? (turns.length === 0 ? '' : scene.rollingRecap),
    turnCount: turns.length,
  };
  await writeSnapshot(transaction, nextSnapshot);
};

const listSceneRows = async (
  executor: DatabaseExecutor,
  options: MeetingSceneListOptions = {},
): Promise<SceneRow[]> => {
  const archived = options.archived ?? 'exclude';
  const where = archived === 'only'
    ? 'WHERE archived_at IS NOT NULL'
    : archived === 'include'
      ? ''
      : 'WHERE archived_at IS NULL';
  const limit = Number.isSafeInteger(options.limit) && (options.limit as number) > 0
    ? `LIMIT ${Math.min(options.limit as number, 1000)}`
    : '';
  return executor.getAllAsync<SceneRow>(`
    SELECT scene_id, archived_at, payload
    FROM meeting_scenes
    ${where}
    ORDER BY updated_at DESC, scene_id ASC
    ${limit}
  `);
};

const readArchive = async (executor: DatabaseExecutor): Promise<MeetingRepositoryArchive> => {
  const sceneRows = await listSceneRows(executor, { archived: 'include' });
  const scenes: MeetingSceneRecord[] = [];
  const snapshots: MeetingSceneSnapshot[] = [];
  for (const row of sceneRows) {
    const scene = await hydrateSceneRow(executor, row);
    if (!scene) continue;
    scenes.push({ scene, archivedAt: row.archived_at });
    snapshots.push((await loadSnapshot(executor, scene.id)) ?? createSceneSnapshot(scene));
  }
  const memoryDrafts = await loadMemoryDrafts(executor);
  return {
    repositorySchemaVersion: MEETING_REPOSITORY_SCHEMA_VERSION,
    exportedAt: Date.now(),
    scenes,
    snapshots,
    memoryDrafts,
  };
};

export async function initializeMeetingRepository(): Promise<void> {
  await openMeetingDatabase();
}

export async function listMeetingSceneRecords(
  options: MeetingSceneListOptions = {},
): Promise<MeetingSceneRecord[]> {
  const database = await openMeetingDatabase();
  const rows = await listSceneRows(database, options);
  const records: MeetingSceneRecord[] = [];
  for (const row of rows) {
    const scene = await hydrateSceneRow(database, row);
    if (scene) records.push({ scene, archivedAt: row.archived_at });
  }
  return records;
}

export async function listMeetingScenes(
  options: MeetingSceneListOptions = {},
): Promise<MeetingScene[]> {
  return (await listMeetingSceneRecords(options)).map(record => record.scene);
}

export async function getMeetingSceneRecord(sceneId: string): Promise<MeetingSceneRecord | null> {
  const database = await openMeetingDatabase();
  const row = await database.getFirstAsync<SceneRow>(`
    SELECT scene_id, archived_at, payload FROM meeting_scenes WHERE scene_id = ?
  `, sceneId);
  if (!row) return null;
  const scene = await hydrateSceneRow(database, row);
  return scene ? { scene, archivedAt: row.archived_at } : null;
}

export async function getMeetingScene(sceneId: string): Promise<MeetingScene | null> {
  return (await getMeetingSceneRecord(sceneId))?.scene ?? null;
}

export async function upsertMeetingScene(scene: MeetingScene): Promise<void> {
  await serializeWrite(async () => {
    const database = await openMeetingDatabase();
    await database.withExclusiveTransactionAsync(transaction => writeScene(transaction, scene, undefined));
  });
}

export async function deleteMeetingScene(sceneId: string): Promise<void> {
  await serializeWrite(async () => {
    const database = await openMeetingDatabase();
    await database.withExclusiveTransactionAsync(async transaction => {
      await transaction.runAsync('DELETE FROM meeting_scenes WHERE scene_id = ?', sceneId);
    });
  });
}

export async function archiveMeetingScene(
  sceneId: string,
  archivedAt = Date.now(),
): Promise<void> {
  if (!Number.isFinite(archivedAt) || archivedAt < 0) throw new Error('Invalid archive timestamp');
  await serializeWrite(async () => {
    const database = await openMeetingDatabase();
    await database.withExclusiveTransactionAsync(async transaction => {
      await transaction.runAsync(
        'UPDATE meeting_scenes SET archived_at = ? WHERE scene_id = ?',
        archivedAt,
        sceneId,
      );
    });
  });
}

export async function unarchiveMeetingScene(sceneId: string): Promise<void> {
  await serializeWrite(async () => {
    const database = await openMeetingDatabase();
    await database.withExclusiveTransactionAsync(async transaction => {
      await transaction.runAsync(
        'UPDATE meeting_scenes SET archived_at = NULL WHERE scene_id = ?',
        sceneId,
      );
    });
  });
}

export async function listMeetingTurns(sceneId: string): Promise<MeetingTurn[]> {
  return loadTurns(await openMeetingDatabase(), sceneId);
}

export async function replaceMeetingTurns(
  sceneId: string,
  turns: MeetingTurn[],
  snapshot?: MeetingSceneSnapshot,
): Promise<void> {
  assertMeetingTurns(sceneId, turns);
  if (snapshot) assertMeetingSceneSnapshot(sceneId, snapshot, turns.length);
  await serializeWrite(async () => {
    const database = await openMeetingDatabase();
    await database.withExclusiveTransactionAsync(
      transaction => replaceTurnsInTransaction(transaction, sceneId, turns, snapshot),
    );
  });
}

export async function truncateMeetingTurns(
  sceneId: string,
  turnCount: number,
  snapshot?: MeetingSceneSnapshot,
): Promise<void> {
  if (!Number.isSafeInteger(turnCount) || turnCount < 0) {
    throw new Error('Meeting turn count must be a non-negative integer');
  }
  await serializeWrite(async () => {
    const database = await openMeetingDatabase();
    await database.withExclusiveTransactionAsync(async transaction => {
      const turns = (await loadTurns(transaction, sceneId)).slice(0, turnCount);
      await replaceTurnsInTransaction(transaction, sceneId, turns, snapshot);
    });
  });
}

export async function getMeetingSceneSnapshot(
  sceneId: string,
): Promise<MeetingSceneSnapshot | null> {
  return loadSnapshot(await openMeetingDatabase(), sceneId);
}

export async function upsertMeetingSceneSnapshot(
  snapshot: MeetingSceneSnapshot,
): Promise<void> {
  assertMeetingSceneSnapshot(snapshot.sceneId, snapshot);
  await serializeWrite(async () => {
    const database = await openMeetingDatabase();
    await database.withExclusiveTransactionAsync(async transaction => {
      const scene = await transaction.getFirstAsync<{ scene_id: string; turn_count: number }>(`
        SELECT meeting_scenes.scene_id AS scene_id, COUNT(meeting_turns.turn_id) AS turn_count
        FROM meeting_scenes
        LEFT JOIN meeting_turns ON meeting_turns.scene_id = meeting_scenes.scene_id
        WHERE meeting_scenes.scene_id = ?
        GROUP BY meeting_scenes.scene_id
      `,
        snapshot.sceneId,
      );
      if (!scene) throw new Error(`Meeting scene ${snapshot.sceneId} does not exist`);
      assertMeetingSceneSnapshot(snapshot.sceneId, snapshot, scene.turn_count);
      await writeSnapshot(transaction, snapshot);
    });
  });
}

export async function listMeetingMemoryDrafts(sceneId?: string): Promise<MeetingMemoryDraft[]> {
  return loadMemoryDrafts(await openMeetingDatabase(), sceneId);
}

export async function getMeetingMemoryDraft(draftId: string): Promise<MeetingMemoryDraft | null> {
  const database = await openMeetingDatabase();
  const row = await database.getFirstAsync<MemoryDraftRow>(`
    SELECT draft_id, scene_id, payload FROM meeting_memory_drafts WHERE draft_id = ?
  `, draftId);
  if (!row) return null;
  const value = parseJson(row.payload);
  return isMeetingMemoryDraft(value)
    && value.id === row.draft_id
    && value.sceneId === row.scene_id
    ? value
    : null;
}

export async function upsertMeetingMemoryDraft(draft: MeetingMemoryDraft): Promise<void> {
  if (!isMeetingMemoryDraft(draft)) throw new Error('Invalid meeting memory draft');
  await serializeWrite(async () => {
    const database = await openMeetingDatabase();
    await database.withExclusiveTransactionAsync(async transaction => {
      await writeMemoryDraft(transaction, draft);
    });
  });
}

export async function deleteMeetingMemoryDraft(draftId: string): Promise<void> {
  await serializeWrite(async () => {
    const database = await openMeetingDatabase();
    await database.withExclusiveTransactionAsync(async transaction => {
      await transaction.runAsync('DELETE FROM meeting_memory_drafts WHERE draft_id = ?', draftId);
    });
  });
}

export async function exportMeetingRepositoryArchive(): Promise<MeetingRepositoryArchive> {
  return serializeWrite(async () => readArchive(await openMeetingDatabase()));
}

export async function importMeetingRepositoryArchive(value: unknown): Promise<void> {
  const archive = normalizeMeetingRepositoryArchive(value);
  await serializeWrite(async () => {
    const database = await openMeetingDatabase();
    await database.withExclusiveTransactionAsync(async transaction => {
      await transaction.runAsync('DELETE FROM meeting_scenes');
      for (const record of archive.scenes) {
        await writeScene(
          transaction,
          { ...record.scene, memoryDrafts: [] },
          record.archivedAt,
        );
      }
      for (const snapshot of archive.snapshots) {
        await writeSnapshot(transaction, snapshot);
      }
      for (const draft of archive.memoryDrafts) {
        await writeMemoryDraft(transaction, draft);
      }
    });
  });
}

export async function clearMeetingRepository(): Promise<void> {
  await serializeWrite(async () => {
    const database = await openMeetingDatabase();
    await database.withExclusiveTransactionAsync(async transaction => {
      await transaction.runAsync('DELETE FROM meeting_scenes');
    });
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
