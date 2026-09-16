export const REMOTE_PROACTIVE_NOTIFICATION_KIND = 'nana-remote-proactive';
export const REMOTE_PROACTIVE_SCHEMA_VERSION = 1;
export const REMOTE_PROACTIVE_MAX_TEXT_LENGTH = 2_400;
export const REMOTE_PROACTIVE_MAX_LIFETIME_MS = 48 * 60 * 60 * 1_000;
export const REMOTE_PROACTIVE_MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;

const REMOTE_PROACTIVE_ALLOWED_KEYS = new Set([
  'schemaVersion',
  'kind',
  'eventId',
  'characterId',
  'text',
  'generatedAt',
  'expiresAt',
]);
const SAFE_OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export interface RemoteProactiveEnvelope {
  schemaVersion: 1;
  kind: typeof REMOTE_PROACTIVE_NOTIFICATION_KIND;
  eventId: string;
  characterId: string;
  text: string;
  generatedAt: number;
  expiresAt: number;
}

export type RemoteProactiveEnvelopeRejection =
  | 'not-remote-proactive'
  | 'malformed'
  | 'unknown-field'
  | 'expired'
  | 'future-generated'
  | 'invalid-lifetime';

export type RemoteProactiveEnvelopeParseResult =
  | { ok: true; envelope: RemoteProactiveEnvelope }
  | { ok: false; reason: RemoteProactiveEnvelopeRejection };

export type RemoteProactiveDeliverySource =
  | 'received'
  | 'response'
  | 'initial-response';

export interface RemoteProactiveReceiptStore {
  has(eventId: string, now?: number): Promise<boolean>;
  commit(eventId: string, expiresAt: number, now?: number): Promise<void>;
}

export type RemoteProactiveDeliveryResult =
  | { status: 'delivered'; envelope: RemoteProactiveEnvelope }
  | { status: 'duplicate'; envelope: RemoteProactiveEnvelope }
  | { status: 'rejected'; reason: RemoteProactiveEnvelopeRejection }
  | { status: 'handler-failed'; envelope: RemoteProactiveEnvelope; error: unknown };

export type RemoteProactiveMessageHandler = (
  envelope: RemoteProactiveEnvelope,
  source: RemoteProactiveDeliverySource,
) => Promise<void> | void;

const cleanText = (value: unknown) => (
  typeof value === 'string'
    ? value.replace(/\r\n?/gu, '\n').trim()
    : ''
);

const isFiniteTimestamp = (value: unknown): value is number => (
  typeof value === 'number'
  && Number.isFinite(value)
  && value >= 0
);

const isPlainRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

export const parseRemoteProactiveEnvelope = (
  value: unknown,
  now = Date.now(),
): RemoteProactiveEnvelopeParseResult => {
  if (!isPlainRecord(value)) return { ok: false, reason: 'not-remote-proactive' };
  if (value.kind !== REMOTE_PROACTIVE_NOTIFICATION_KIND) {
    return { ok: false, reason: 'not-remote-proactive' };
  }
  if (Object.keys(value).some(key => !REMOTE_PROACTIVE_ALLOWED_KEYS.has(key))) {
    return { ok: false, reason: 'unknown-field' };
  }

  const text = cleanText(value.text);
  if (
    value.schemaVersion !== REMOTE_PROACTIVE_SCHEMA_VERSION
    || typeof value.eventId !== 'string'
    || !SAFE_OPAQUE_ID.test(value.eventId)
    || typeof value.characterId !== 'string'
    || !SAFE_OPAQUE_ID.test(value.characterId)
    || !text
    || Array.from(text).length > REMOTE_PROACTIVE_MAX_TEXT_LENGTH
    || !isFiniteTimestamp(value.generatedAt)
    || !isFiniteTimestamp(value.expiresAt)
  ) {
    return { ok: false, reason: 'malformed' };
  }
  if (value.expiresAt <= now) return { ok: false, reason: 'expired' };
  if (value.generatedAt > now + REMOTE_PROACTIVE_MAX_CLOCK_SKEW_MS) {
    return { ok: false, reason: 'future-generated' };
  }
  if (
    value.expiresAt <= value.generatedAt
    || value.expiresAt - value.generatedAt > REMOTE_PROACTIVE_MAX_LIFETIME_MS
  ) {
    return { ok: false, reason: 'invalid-lifetime' };
  }

  return {
    ok: true,
    envelope: {
      schemaVersion: REMOTE_PROACTIVE_SCHEMA_VERSION,
      kind: REMOTE_PROACTIVE_NOTIFICATION_KIND,
      eventId: value.eventId,
      characterId: value.characterId,
      text,
      generatedAt: value.generatedAt,
      expiresAt: value.expiresAt,
    },
  };
};

const inFlightEventIds = new Set<string>();

export const deliverRemoteProactiveEnvelope = async ({
  value,
  source,
  receiptStore,
  handler,
  now = Date.now(),
}: {
  value: unknown;
  source: RemoteProactiveDeliverySource;
  receiptStore: RemoteProactiveReceiptStore;
  handler: RemoteProactiveMessageHandler;
  now?: number;
}): Promise<RemoteProactiveDeliveryResult> => {
  const parsed = parseRemoteProactiveEnvelope(value, now);
  if (!parsed.ok) return { status: 'rejected', reason: parsed.reason };

  const { envelope } = parsed;
  if (inFlightEventIds.has(envelope.eventId)) return { status: 'duplicate', envelope };
  inFlightEventIds.add(envelope.eventId);
  try {
    if (await receiptStore.has(envelope.eventId, now)) {
      return { status: 'duplicate', envelope };
    }
    await handler(envelope, source);
    await receiptStore.commit(envelope.eventId, envelope.expiresAt, now);
    return { status: 'delivered', envelope };
  } catch (error) {
    return { status: 'handler-failed', envelope, error };
  } finally {
    inFlightEventIds.delete(envelope.eventId);
  }
};

export const createInMemoryRemoteProactiveReceiptStore = (
): RemoteProactiveReceiptStore => {
  const receipts = new Map<string, number>();
  return {
    has: async (eventId, now = Date.now()) => {
      const expiresAt = receipts.get(eventId);
      if (!expiresAt) return false;
      if (expiresAt <= now) {
        receipts.delete(eventId);
        return false;
      }
      return true;
    },
    commit: async (eventId, expiresAt) => {
      receipts.set(eventId, expiresAt);
    },
  };
};

export const normalizeRemoteProactiveEndpoint = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase();
    const isLoopback = hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '[::1]';
    if (
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback))
      || url.username
      || url.password
      || url.hash
    ) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
};
