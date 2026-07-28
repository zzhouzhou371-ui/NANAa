import type { ChatHistory } from '../types';
import {
  applyChatHistoryChange,
  initializeChatMessageRepository,
  loadAllChatMessages,
  replaceAllChatMessages,
} from '../repositories/chatMessageRepository';
import { useNanaStore } from '../stores/nanaStore';

let unsubscribe: (() => void) | null = null;
let persistenceQueue: Promise<void> = Promise.resolve();
let lastPersistenceError: unknown = null;

const enqueue = (operation: () => Promise<void>) => {
  persistenceQueue = persistenceQueue
    .catch(() => undefined)
    .then(operation)
    .then(() => {
      lastPersistenceError = null;
    })
    .catch(error => {
      lastPersistenceError = error;
      console.error('Nana could not persist chat history.', error);
    });
  return persistenceQueue;
};

export async function hydrateDurableChatHistory(
  legacyHistory: ChatHistory,
): Promise<ChatHistory> {
  await persistenceQueue;
  return initializeChatMessageRepository(legacyHistory);
}

export function startDurableChatHistoryPersistence(): void {
  unsubscribe?.();
  unsubscribe = useNanaStore.subscribe((state, previousState) => {
    if (state.chatHistory === previousState.chatHistory) return;
    const previousHistory = previousState.chatHistory;
    const nextHistory = state.chatHistory;
    void enqueue(() => applyChatHistoryChange(previousHistory, nextHistory));
  });
}

export async function flushDurableChatHistory(): Promise<void> {
  await persistenceQueue;
  if (lastPersistenceError) {
    throw lastPersistenceError;
  }
}

export async function readDurableChatHistory(): Promise<ChatHistory> {
  await flushDurableChatHistory();
  return loadAllChatMessages();
}

export async function replaceDurableChatHistory(history: ChatHistory): Promise<void> {
  await flushDurableChatHistory();
  await replaceAllChatMessages(history);
}
