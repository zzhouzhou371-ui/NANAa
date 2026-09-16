import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RemoteProactiveReceiptStore } from './remoteProactiveRuntime';

const REMOTE_PROACTIVE_RECEIPTS_KEY = '@nana/remote-proactive-receipts-v1';
const REMOTE_PROACTIVE_RECEIPT_LIMIT = 256;

interface StoredRemoteProactiveReceipt {
  eventId: string;
  expiresAt: number;
}

const normalizeReceipts = (
  value: unknown,
  now: number,
): StoredRemoteProactiveReceipt[] => {
  if (!Array.isArray(value)) return [];
  const byEventId = new Map<string, StoredRemoteProactiveReceipt>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const receipt = candidate as Record<string, unknown>;
    if (
      typeof receipt.eventId !== 'string'
      || !receipt.eventId
      || typeof receipt.expiresAt !== 'number'
      || !Number.isFinite(receipt.expiresAt)
      || receipt.expiresAt <= now
    ) continue;
    byEventId.set(receipt.eventId, {
      eventId: receipt.eventId,
      expiresAt: receipt.expiresAt,
    });
  }
  return [...byEventId.values()]
    .sort((left, right) => right.expiresAt - left.expiresAt)
    .slice(0, REMOTE_PROACTIVE_RECEIPT_LIMIT);
};

const readReceipts = async (now: number) => {
  const raw = await AsyncStorage.getItem(REMOTE_PROACTIVE_RECEIPTS_KEY);
  if (!raw) return [];
  try {
    return normalizeReceipts(JSON.parse(raw), now);
  } catch {
    return [];
  }
};

let receiptQueue = Promise.resolve();

const serializeReceiptWork = async <T>(work: () => Promise<T>) => {
  const previous = receiptQueue;
  let release = () => {};
  receiptQueue = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try {
    return await work();
  } finally {
    release();
  }
};

export const remoteProactiveReceiptStore: RemoteProactiveReceiptStore = {
  has: (eventId, now = Date.now()) => serializeReceiptWork(async () => {
    const receipts = await readReceipts(now);
    return receipts.some(receipt => receipt.eventId === eventId);
  }),
  commit: (eventId, expiresAt, now = Date.now()) => serializeReceiptWork(async () => {
    const receipts = await readReceipts(now);
    const next = normalizeReceipts([
      { eventId, expiresAt },
      ...receipts.filter(receipt => receipt.eventId !== eventId),
    ], now);
    await AsyncStorage.setItem(REMOTE_PROACTIVE_RECEIPTS_KEY, JSON.stringify(next));
  }),
};
