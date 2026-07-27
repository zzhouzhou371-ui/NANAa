import type {
  Payment,
  PaymentDirection,
  PaymentKind,
  PaymentReactionDecision,
  PaymentStatus,
} from '../types';

export const PAYMENT_SUBMIT_TIMEOUT_MS = 8_000;
export const PAYMENT_PENDING_EXPIRY_MS = 24 * 60 * 60 * 1_000;
export const PAYMENT_REACTION_MIN_MS = 1_800;
export const PAYMENT_REACTION_MAX_MS = 4_500;
export const PAYMENT_REACTION_MAX_AUTOMATIC_ATTEMPTS = 3;
export const PAYMENT_REACTION_RETRY_BASE_MS = 5_000;
export const RED_PACKET_MAX_MINOR = 20_000;

const allowedTransitions: Record<PaymentStatus, readonly PaymentStatus[]> = {
  sending: ['pending', 'failed'],
  pending: ['completed', 'declined', 'expired', 'failed'],
  completed: [],
  declined: ['refunded'],
  expired: ['refunded'],
  refunded: [],
  failed: ['sending'],
};

export interface CreatePaymentInput {
  id: string;
  chatId: string;
  kind: PaymentKind;
  direction?: PaymentDirection;
  senderId: string;
  recipientId: string;
  amountMinor: number;
  note?: string;
  now?: number;
}

export interface PaymentTransitionResult {
  payment: Payment;
  walletDeltaMinor: number;
  changed: boolean;
}

export interface PaymentCollectionReconcileResult {
  paymentsById: Record<string, Payment>;
  walletBalanceMinor: number;
  changedPaymentIds: string[];
}

export const paymentMustRemainVisibleDuringChatClear = (payment: Payment): boolean => (
  payment.status === 'sending'
  || payment.status === 'pending'
  || payment.status === 'failed'
);

export const paymentFundsStateIsValid = (payment: Payment): boolean => {
  if (payment.status === 'sending' || payment.status === 'pending') return payment.fundsState === 'held';
  if (payment.status === 'completed') return payment.fundsState === 'captured';
  return payment.fundsState === 'released';
};

const normalizeNote = (note: string | undefined) => {
  const value = note?.trim();
  return value ? Array.from(value).slice(0, 32).join('') : undefined;
};

export function parsePaymentAmountToMinor(input: string): number | null {
  const normalized = input.normalize('NFKC').trim().replace(/,/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [wholeText, fractionText = ''] = normalized.split('.');
  const whole = Number(wholeText);
  if (!Number.isSafeInteger(whole)) return null;
  const fraction = Number(fractionText.padEnd(2, '0'));
  const amountMinor = whole * 100 + fraction;
  return Number.isSafeInteger(amountMinor) && amountMinor > 0 ? amountMinor : null;
}

export function formatCnyMinor(amountMinor: number): string {
  const safeMinor = Number.isSafeInteger(amountMinor) ? Math.max(0, amountMinor) : 0;
  return (safeMinor / 100).toFixed(2);
}

export function reservePaymentFunds(walletBalanceMinor: number, amountMinor: number): number {
  if (!Number.isSafeInteger(walletBalanceMinor) || walletBalanceMinor < 0) {
    throw new Error('Wallet balance must be a non-negative integer number of cents.');
  }
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error('Payment amount must be a positive integer number of cents.');
  }
  if (walletBalanceMinor < amountMinor) throw new Error('Insufficient wallet balance.');
  return walletBalanceMinor - amountMinor;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function paymentReactionDelayMs(paymentId: string, characterId: string): number {
  const range = PAYMENT_REACTION_MAX_MS - PAYMENT_REACTION_MIN_MS + 1;
  return PAYMENT_REACTION_MIN_MS + (stableHash(`${paymentId}:${characterId}`) % range);
}

export function paymentReactionRetryDelayMs(attempts: number): number {
  const exponent = Math.max(0, Math.min(5, attempts - 1));
  return PAYMENT_REACTION_RETRY_BASE_MS * (2 ** exponent);
}

export function createPayment(input: CreatePaymentInput): Payment {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error('Payment amount must be a positive integer number of cents.');
  }
  if (input.kind === 'redPacket' && input.amountMinor > RED_PACKET_MAX_MINOR) {
    throw new Error('A red packet cannot exceed CNY 200.00.');
  }
  const now = input.now ?? Date.now();
  return {
    schemaVersion: 1,
    id: input.id,
    chatId: input.chatId,
    kind: input.kind,
    direction: input.direction ?? 'outgoing',
    senderId: input.senderId,
    recipientId: input.recipientId,
    amountMinor: input.amountMinor,
    currency: 'CNY',
    note: normalizeNote(input.note),
    status: 'sending',
    fundsState: 'held',
    createdAt: now,
    updatedAt: now,
    expiresAt: now + PAYMENT_PENDING_EXPIRY_MS,
    reactionState: 'idle',
    reactionAttempts: 0,
  };
}

export function canTransitionPayment(current: PaymentStatus, next: PaymentStatus): boolean {
  return current === next || allowedTransitions[current].includes(next);
}

export function transitionPaymentEntity(
  payment: Payment,
  nextStatus: PaymentStatus,
  now = Date.now(),
): PaymentTransitionResult {
  if (payment.status === nextStatus) {
    return { payment, walletDeltaMinor: 0, changed: false };
  }
  if (!canTransitionPayment(payment.status, nextStatus)) {
    throw new Error(`Invalid payment transition: ${payment.status} -> ${nextStatus}`);
  }

  let fundsState = payment.fundsState;
  let walletDeltaMinor = 0;
  if (nextStatus === 'sending' && fundsState === 'released') {
    fundsState = 'held';
    walletDeltaMinor = -payment.amountMinor;
  } else if (nextStatus === 'completed' && fundsState === 'held') {
    fundsState = 'captured';
  } else if (
    (nextStatus === 'failed' || nextStatus === 'declined' || nextStatus === 'expired')
    && fundsState === 'held'
  ) {
    fundsState = 'released';
    walletDeltaMinor = payment.amountMinor;
  }

  const next: Payment = {
    ...payment,
    status: nextStatus,
    fundsState,
    updatedAt: now,
    ...(nextStatus === 'pending' ? { pendingAt: payment.pendingAt ?? now } : {}),
    ...(nextStatus === 'completed' || nextStatus === 'refunded' ? { completedAt: now } : {}),
  };
  return { payment: next, walletDeltaMinor, changed: true };
}

export function schedulePaymentReaction(payment: Payment, now = Date.now()): Payment {
  if (payment.status !== 'pending') return payment;
  return {
    ...payment,
    reactionState: 'scheduled',
    reactionDueAt: now + paymentReactionDelayMs(payment.id, payment.recipientId),
    reactionError: undefined,
    updatedAt: now,
  };
}

/**
 * A payment and its chat card are committed in one store update before the
 * lightweight `sending -> pending` transition. If the process dies between
 * those two steps, resume the existing hold instead of reserving funds again.
 *
 * Non-held `sending` records are inconsistent legacy/corrupt snapshots. They
 * are made retryable and any captured amount is released exactly once rather
 * than leaving an invisible permanent debit.
 */
export function reconcileInterruptedSendingPaymentEntity(
  payment: Payment,
  now = Date.now(),
): PaymentTransitionResult {
  if (payment.status !== 'sending') {
    return { payment, walletDeltaMinor: 0, changed: false };
  }

  if (payment.fundsState === 'held') {
    const pending = transitionPaymentEntity(payment, 'pending', now);
    return {
      payment: schedulePaymentReaction(pending.payment, now),
      walletDeltaMinor: pending.walletDeltaMinor,
      changed: true,
    };
  }

  const walletDeltaMinor = payment.fundsState === 'captured' ? payment.amountMinor : 0;
  return {
    payment: {
      ...payment,
      status: 'failed',
      fundsState: 'released',
      reactionState: 'failed',
      reactionDueAt: undefined,
      reactionError: 'Payment submission was interrupted. You can retry it.',
      failureCode: 'interrupted',
      failureMessage: 'Payment submission was interrupted. Please retry.',
      updatedAt: now,
    },
    walletDeltaMinor,
    changed: true,
  };
}

export function reconcilePaymentIntegrityEntity(
  payment: Payment,
  now = Date.now(),
): PaymentTransitionResult {
  if (payment.status === 'sending') return reconcileInterruptedSendingPaymentEntity(payment, now);
  if (paymentFundsStateIsValid(payment)) {
    return { payment, walletDeltaMinor: 0, changed: false };
  }

  if (payment.status === 'completed' && payment.fundsState === 'held') {
    return {
      payment: { ...payment, fundsState: 'captured', updatedAt: now },
      walletDeltaMinor: 0,
      changed: true,
    };
  }

  const shouldReleaseDebit = payment.fundsState === 'held' || payment.fundsState === 'captured';
  const nextStatus = payment.status === 'pending' || payment.status === 'completed'
    ? 'failed'
    : payment.status;
  return {
    payment: {
      ...payment,
      status: nextStatus,
      fundsState: 'released',
      reactionState: nextStatus === 'failed' ? 'failed' : payment.reactionState,
      reactionDueAt: nextStatus === 'failed' ? undefined : payment.reactionDueAt,
      reactionError: nextStatus === 'failed'
        ? 'Payment state was inconsistent and has been made safe to retry.'
        : payment.reactionError,
      failureCode: nextStatus === 'failed' ? 'invalid' : payment.failureCode,
      failureMessage: nextStatus === 'failed'
        ? 'Payment state was repaired. Please retry.'
        : payment.failureMessage,
      updatedAt: now,
    },
    walletDeltaMinor: shouldReleaseDebit ? payment.amountMinor : 0,
    changed: true,
  };
}

export function resolvePaymentReactionEntity(
  payment: Payment,
  decision: PaymentReactionDecision,
  replyText: string,
  reactionMessageId: number,
  now = Date.now(),
): PaymentTransitionResult {
  if (payment.status !== 'pending') {
    throw new Error(`Cannot resolve a reaction for a ${payment.status} payment.`);
  }
  const normalizedReply = Array.from(replyText.trim()).slice(0, 280).join('');
  if (!normalizedReply) throw new Error('Payment reaction reply text is required.');
  const reacted: Payment = {
    ...payment,
    reactionState: 'resolved',
    reactionDecision: decision,
    reactionReply: normalizedReply,
    reactionMessageId,
    reactionError: undefined,
    updatedAt: now,
  };
  if (decision === 'accept') return transitionPaymentEntity(reacted, 'completed', now);

  const declined = transitionPaymentEntity(reacted, 'declined', now);
  const refunded = transitionPaymentEntity(declined.payment, 'refunded', now);
  return {
    payment: refunded.payment,
    walletDeltaMinor: declined.walletDeltaMinor + refunded.walletDeltaMinor,
    changed: true,
  };
}

export function failPaymentReactionEntity(
  payment: Payment,
  errorMessage: string,
  now = Date.now(),
): Payment {
  if (payment.status !== 'pending') return payment;
  const canRetry = payment.reactionAttempts < PAYMENT_REACTION_MAX_AUTOMATIC_ATTEMPTS;
  return {
    ...payment,
    reactionState: 'failed',
    reactionDueAt: canRetry
      ? now + paymentReactionRetryDelayMs(payment.reactionAttempts)
      : undefined,
    reactionError: errorMessage.trim() || 'Character response failed.',
    updatedAt: now,
  };
}

export function reconcileExpiredPaymentEntity(
  payment: Payment,
  now = Date.now(),
): PaymentTransitionResult {
  if (!paymentNeedsExpiry(payment, now)) {
    return { payment, walletDeltaMinor: 0, changed: false };
  }
  const expired = transitionPaymentEntity(payment, 'expired', now);
  const refunded = transitionPaymentEntity({
    ...expired.payment,
    reactionState: 'resolved',
    failureCode: 'timeout',
    failureMessage: 'Payment expired before it was accepted.',
  }, 'refunded', now);
  return {
    payment: refunded.payment,
    walletDeltaMinor: expired.walletDeltaMinor + refunded.walletDeltaMinor,
    changed: true,
  };
}

export function reconcileExpiredPayments(
  paymentsById: Readonly<Record<string, Payment>>,
  walletBalanceMinor: number,
  now = Date.now(),
): PaymentCollectionReconcileResult {
  let nextPayments: Record<string, Payment> | undefined;
  let nextBalance = walletBalanceMinor;
  const changedPaymentIds: string[] = [];
  for (const [id, payment] of Object.entries(paymentsById)) {
    const result = reconcileExpiredPaymentEntity(payment, now);
    if (!result.changed) continue;
    nextPayments ||= { ...paymentsById };
    nextPayments[id] = result.payment;
    nextBalance += result.walletDeltaMinor;
    changedPaymentIds.push(id);
  }
  return {
    paymentsById: nextPayments || (paymentsById as Record<string, Payment>),
    walletBalanceMinor: nextBalance,
    changedPaymentIds,
  };
}

export function paymentNeedsExpiry(payment: Payment, now = Date.now()): boolean {
  return payment.status === 'pending' && payment.expiresAt <= now;
}

export function paymentReactionIsDue(payment: Payment, now = Date.now()): boolean {
  return payment.status === 'pending'
    && (payment.reactionState === 'scheduled' || payment.reactionState === 'failed')
    && typeof payment.reactionDueAt === 'number'
    && payment.reactionDueAt <= now;
}

export function legacyWalletBalanceToMinor(value: unknown, fallbackMinor = 0): number {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value !== 'string') return fallbackMinor;
  return parsePaymentAmountToMinor(value) ?? (value.trim() === '0' || value.trim() === '0.00' ? 0 : fallbackMinor);
}
