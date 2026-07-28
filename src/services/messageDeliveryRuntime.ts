import type { Message, MessageDeliveryStatus } from '../types';
import { resolveChatPresence } from './chatRhythmRuntime';

export interface MessageDeliveryPlan {
  attemptedAt: number;
  sentAt: number;
  deliveredAt: number;
  readNotBefore: number;
}

interface PlanMessageDeliveryInput {
  characterId: string;
  messageId: number;
  messageText: string;
  attemptedAt?: number;
  fast?: boolean;
}

const stableHash = (value: string) => {
  let hash = 2_166_136_261;
  for (const char of value) {
    hash ^= char.codePointAt(0) || 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
};

export const planMessageDelivery = ({
  characterId,
  messageId,
  messageText,
  attemptedAt = Date.now(),
  fast = false,
}: PlanMessageDeliveryInput): MessageDeliveryPlan => {
  if (fast) {
    return {
      attemptedAt,
      sentAt: attemptedAt,
      deliveredAt: attemptedAt,
      readNotBefore: attemptedAt,
    };
  }

  const presence = resolveChatPresence(characterId, attemptedAt);
  const seed = `${characterId}:${messageId}:${messageText}:${Math.floor(attemptedAt / 60_000)}`;
  const sentDelay = 90 + (stableHash(`${seed}:sent`) % 180);
  const deliveryBase = presence === 'online' ? 260 : presence === 'away' ? 650 : 1_200;
  const deliveryJitter = presence === 'online' ? 440 : presence === 'away' ? 850 : 1_300;
  const readBase = presence === 'online' ? 650 : presence === 'away' ? 1_800 : 3_600;
  const readJitter = presence === 'online' ? 1_000 : presence === 'away' ? 2_400 : 4_000;
  const sentAt = attemptedAt + sentDelay;
  const deliveredAt = sentAt + deliveryBase + (stableHash(`${seed}:delivered`) % deliveryJitter);
  const textReadingTime = Math.min(1_500, Array.from(messageText.trim()).length * 22);
  const readNotBefore = deliveredAt
    + readBase
    + textReadingTime
    + (stableHash(`${seed}:read`) % readJitter);

  return { attemptedAt, sentAt, deliveredAt, readNotBefore };
};

const deliveryRank: Record<Exclude<MessageDeliveryStatus, 'failed'>, number> = {
  sending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

export const transitionMessageDelivery = (
  message: Message,
  status: MessageDeliveryStatus,
  now = Date.now(),
  failureMessage?: string,
): Message => {
  if (message.sender !== 'user') return message;
  const current = message.deliveryStatus;
  if (current === 'failed' || current === 'read') return message;
  if (
    status !== 'failed'
    && current
    && deliveryRank[status] <= deliveryRank[current]
  ) return message;

  if (status === 'failed') {
    return {
      ...message,
      deliveryStatus: 'failed',
      deliveryUpdatedAt: now,
      failedAt: now,
      failureMessage: failureMessage?.trim() || undefined,
    };
  }

  return {
    ...message,
    deliveryStatus: status,
    deliveryUpdatedAt: now,
    ...(status === 'sent' ? { sentAt: now } : {}),
    ...(status === 'delivered' ? { deliveredAt: now } : {}),
    ...(status === 'read' ? { readAt: now } : {}),
  };
};

export const resetFailedMessageDelivery = (
  message: Message,
  now = Date.now(),
): Message => {
  if (message.sender !== 'user' || message.deliveryStatus !== 'failed') return message;
  const {
    sentAt: _sentAt,
    deliveredAt: _deliveredAt,
    readAt: _readAt,
    failedAt: _failedAt,
    failureMessage: _failureMessage,
    ...rest
  } = message;
  return {
    ...rest,
    deliveryStatus: 'sending',
    deliveryUpdatedAt: now,
    deliveryAttemptedAt: now,
    deliveryAttemptCount: Math.max(1, message.deliveryAttemptCount || 1) + 1,
  };
};

const validStatuses = new Set<MessageDeliveryStatus>([
  'sending',
  'sent',
  'delivered',
  'read',
  'failed',
]);

const validTimestamp = (value: unknown) => (
  value === undefined
  || (typeof value === 'number' && Number.isFinite(value) && value >= 0)
);

export const normalizeMessageDelivery = (message: Message): Message => {
  if (message.sender !== 'user' || message.deliveryStatus === undefined) return message;
  if (
    !validStatuses.has(message.deliveryStatus)
    || !validTimestamp(message.createdAt)
    || !validTimestamp(message.deliveryAttemptedAt)
    || !validTimestamp(message.deliveryUpdatedAt)
    || !validTimestamp(message.sentAt)
    || !validTimestamp(message.deliveredAt)
    || !validTimestamp(message.readAt)
    || !validTimestamp(message.failedAt)
    || (
      message.deliveryAttemptCount !== undefined
      && (
        !Number.isSafeInteger(message.deliveryAttemptCount)
        || message.deliveryAttemptCount < 1
      )
    )
    || (message.turnId !== undefined && typeof message.turnId !== 'string')
    || (message.failureMessage !== undefined && typeof message.failureMessage !== 'string')
  ) {
    const {
      deliveryStatus: _deliveryStatus,
      deliveryAttemptedAt: _deliveryAttemptedAt,
      deliveryUpdatedAt: _deliveryUpdatedAt,
      deliveryAttemptCount: _deliveryAttemptCount,
      sentAt: _sentAt,
      deliveredAt: _deliveredAt,
      readAt: _readAt,
      failedAt: _failedAt,
      failureMessage: _failureMessage,
      turnId: _turnId,
      ...legacyMessage
    } = message;
    return legacyMessage;
  }
  return message;
};
