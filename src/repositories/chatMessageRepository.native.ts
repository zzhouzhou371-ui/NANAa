import * as SQLite from 'expo-sqlite';
import type { ChatHistory, Message } from '../types';
import { normalizeMessageDelivery } from '../services/messageDeliveryRuntime';

const DATABASE_NAME = 'nana-chat.db';
const DATABASE_VERSION = 1;
const LEGACY_MIGRATION_KEY = 'legacy-chat-history-migrated';

interface MessageRow {
  chat_id: string;
  message_id: number;
  sort_order: number;
  payload: string;
}

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
type ChatTransaction = Parameters<
  Parameters<SQLite.SQLiteDatabase['withExclusiveTransactionAsync']>[0]
>[0];

const isMessage = (value: unknown): value is Message => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Message>;
  return Number.isSafeInteger(candidate.id)
    && typeof candidate.sender === 'string'
    && typeof candidate.text === 'string'
    && typeof candidate.time === 'string';
};

const parseMessage = (payload: string): Message | null => {
  try {
    const value: unknown = JSON.parse(payload);
    return isMessage(value) ? normalizeMessageDelivery(value) : null;
  } catch {
    return null;
  }
};

const openChatDatabase = async () => {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async database => {
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS chat_messages (
          chat_id TEXT NOT NULL,
          message_id INTEGER NOT NULL,
          sort_order INTEGER NOT NULL,
          payload TEXT NOT NULL,
          PRIMARY KEY (chat_id, message_id)
        );
        CREATE INDEX IF NOT EXISTS chat_messages_order
          ON chat_messages (chat_id, sort_order);
        CREATE TABLE IF NOT EXISTS chat_metadata (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
        PRAGMA user_version = ${DATABASE_VERSION};
      `);
      return database;
    });
  }
  return databasePromise;
};

const writeHistory = async (
  transaction: ChatTransaction,
  history: ChatHistory,
) => {
  const statement = await transaction.prepareAsync(`
    INSERT INTO chat_messages (chat_id, message_id, sort_order, payload)
    VALUES ($chatId, $messageId, $sortOrder, $payload)
    ON CONFLICT (chat_id, message_id) DO UPDATE SET
      sort_order = excluded.sort_order,
      payload = excluded.payload
  `);
  try {
    for (const [chatId, messages] of Object.entries(history)) {
      for (const [sortOrder, message] of messages.entries()) {
        await statement.executeAsync({
          $chatId: chatId,
          $messageId: message.id,
          $sortOrder: sortOrder,
          $payload: JSON.stringify(message),
        });
      }
    }
  } finally {
    await statement.finalizeAsync();
  }
};

export async function loadAllChatMessages(): Promise<ChatHistory> {
  const database = await openChatDatabase();
  const rows = await database.getAllAsync<MessageRow>(`
    SELECT chat_id, message_id, sort_order, payload
    FROM chat_messages
    ORDER BY chat_id ASC, sort_order ASC
  `);
  const history: ChatHistory = {};
  for (const row of rows) {
    const message = parseMessage(row.payload);
    if (!message || message.id !== row.message_id) continue;
    (history[row.chat_id] ||= []).push(message);
  }
  return history;
}

export async function replaceAllChatMessages(history: ChatHistory): Promise<void> {
  const database = await openChatDatabase();
  await database.withExclusiveTransactionAsync(async transaction => {
    await transaction.runAsync('DELETE FROM chat_messages');
    await writeHistory(transaction, history);
    await transaction.runAsync(
      `INSERT INTO chat_metadata (key, value) VALUES (?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      LEGACY_MIGRATION_KEY,
      '1',
    );
  });
}

export async function initializeChatMessageRepository(
  legacyHistory: ChatHistory,
): Promise<ChatHistory> {
  const database = await openChatDatabase();
  const migration = await database.getFirstAsync<{ value: string }>(
    'SELECT value FROM chat_metadata WHERE key = ?',
    LEGACY_MIGRATION_KEY,
  );
  if (!migration) {
    await replaceAllChatMessages(legacyHistory);
  }
  return loadAllChatMessages();
}

export async function applyChatHistoryChange(
  previousHistory: ChatHistory,
  nextHistory: ChatHistory,
): Promise<void> {
  const changedChatIds = new Set([
    ...Object.keys(previousHistory),
    ...Object.keys(nextHistory),
  ]);
  for (const chatId of [...changedChatIds]) {
    if (previousHistory[chatId] === nextHistory[chatId]) changedChatIds.delete(chatId);
  }
  if (changedChatIds.size === 0) return;

  const database = await openChatDatabase();
  await database.withExclusiveTransactionAsync(async transaction => {
    const upsert = await transaction.prepareAsync(`
      INSERT INTO chat_messages (chat_id, message_id, sort_order, payload)
      VALUES ($chatId, $messageId, $sortOrder, $payload)
      ON CONFLICT (chat_id, message_id) DO UPDATE SET
        sort_order = excluded.sort_order,
        payload = excluded.payload
    `);
    const remove = await transaction.prepareAsync(
      'DELETE FROM chat_messages WHERE chat_id = $chatId AND message_id = $messageId',
    );
    try {
      for (const chatId of changedChatIds) {
        const previous = previousHistory[chatId] || [];
        const next = nextHistory[chatId] || [];
        const previousById = new Map(
          previous.map((message, sortOrder) => [message.id, { message, sortOrder }]),
        );
        const nextIds = new Set(next.map(message => message.id));

        for (const message of previous) {
          if (!nextIds.has(message.id)) {
            await remove.executeAsync({
              $chatId: chatId,
              $messageId: message.id,
            });
          }
        }

        for (const [sortOrder, message] of next.entries()) {
          const existing = previousById.get(message.id);
          const unchanged = existing
            && existing.sortOrder === sortOrder
            && (
              existing.message === message
              || JSON.stringify(existing.message) === JSON.stringify(message)
            );
          if (unchanged) continue;
          await upsert.executeAsync({
            $chatId: chatId,
            $messageId: message.id,
            $sortOrder: sortOrder,
            $payload: JSON.stringify(message),
          });
        }
      }
    } finally {
      await upsert.finalizeAsync();
      await remove.finalizeAsync();
    }
  });
}
