import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatHistory, Message } from '../types';

const WEB_CHAT_HISTORY_KEY = '@nana/chat-history-v1';

const isMessage = (value: unknown): value is Message => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Message>;
  return Number.isSafeInteger(candidate.id)
    && typeof candidate.sender === 'string'
    && typeof candidate.text === 'string'
    && typeof candidate.time === 'string';
};

const normalizeHistory = (value: unknown): ChatHistory => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const history: ChatHistory = {};
  for (const [chatId, messages] of Object.entries(value)) {
    if (!Array.isArray(messages)) continue;
    history[chatId] = messages.filter(isMessage);
  }
  return history;
};

export async function loadAllChatMessages(): Promise<ChatHistory> {
  const raw = await AsyncStorage.getItem(WEB_CHAT_HISTORY_KEY);
  if (!raw) return {};
  try {
    return normalizeHistory(JSON.parse(raw));
  } catch {
    return {};
  }
}

export async function replaceAllChatMessages(history: ChatHistory): Promise<void> {
  await AsyncStorage.setItem(WEB_CHAT_HISTORY_KEY, JSON.stringify(history));
}

export async function initializeChatMessageRepository(
  legacyHistory: ChatHistory,
): Promise<ChatHistory> {
  const raw = await AsyncStorage.getItem(WEB_CHAT_HISTORY_KEY);
  if (raw === null) {
    await replaceAllChatMessages(legacyHistory);
    return legacyHistory;
  }
  return loadAllChatMessages();
}

export async function applyChatHistoryChange(
  _previousHistory: ChatHistory,
  nextHistory: ChatHistory,
): Promise<void> {
  await replaceAllChatMessages(nextHistory);
}
