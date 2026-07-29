export type CharacterMediaSource = 'bundled' | 'userImported';
export type CharacterMediaIntent =
  | 'dailyLife'
  | 'reaction'
  | 'comfort'
  | 'celebration'
  | 'memory'
  | 'location'
  | 'outfit'
  | 'other';

export interface CharacterMediaAsset {
  schemaVersion: 1;
  id: string;
  characterId: string;
  uri: string;
  source: CharacterMediaSource;
  userApproved: boolean;
  tags: string[];
  intents: CharacterMediaIntent[];
  createdAt: number;
  enabled: boolean;
}

export interface CharacterMediaSendRecord {
  assetId: string;
  characterId: string;
  sentAt: number;
}

export interface CharacterMediaPolicy {
  enabled: boolean;
  allowBundled: boolean;
  allowUserImported: boolean;
  minimumIntervalMs: number;
  dailyLimit: number;
}

export type CharacterMediaSelectionReason =
  | 'selected'
  | 'permissionDisabled'
  | 'cooldown'
  | 'dailyLimit'
  | 'noEligibleAsset';

export interface CharacterMediaSelection {
  asset: CharacterMediaAsset | null;
  reason: CharacterMediaSelectionReason;
  nextEligibleAt?: number;
}

const DAY_MS = 24 * 60 * 60 * 1_000;
export const DEFAULT_CHARACTER_MEDIA_POLICY: CharacterMediaPolicy = {
  enabled: false,
  allowBundled: true,
  allowUserImported: true,
  minimumIntervalMs: 6 * 60 * 60 * 1_000,
  dailyLimit: 2,
};

const cleanString = (value: unknown, maxLength = 160) => (
  typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : ''
);

const normalizedList = (value: unknown, maxItems: number, maxLength: number) => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map(item => cleanString(item, maxLength).toLowerCase())
      .filter(Boolean),
  )).slice(0, maxItems);
};

const normalizedIntentList = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map(item => cleanString(item, 32))
      .filter(isCharacterMediaIntent),
  )).slice(0, 8);
};

const isDurableLocalImageUri = (uri: string) => {
  const normalized = uri.replace(/\\/g, '/').toLowerCase();
  return normalized.startsWith('file://')
    && normalized.includes('/nana-media/images/')
    && !normalized.includes('/cache/');
};

const isCharacterMediaIntent = (value: string): value is CharacterMediaIntent => (
  value === 'dailyLife'
  || value === 'reaction'
  || value === 'comfort'
  || value === 'celebration'
  || value === 'memory'
  || value === 'location'
  || value === 'outfit'
  || value === 'other'
);

export function normalizeCharacterMediaAsset(
  value: unknown,
): CharacterMediaAsset | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<CharacterMediaAsset>;
  const id = cleanString(source.id);
  const characterId = cleanString(source.characterId);
  const uri = cleanString(source.uri, 2_048);
  if (!id || !characterId || !isDurableLocalImageUri(uri)) return null;
  const mediaSource: CharacterMediaSource = source.source === 'bundled'
    ? 'bundled'
    : source.source === 'userImported'
      ? 'userImported'
      : 'userImported';
  const intents = normalizedIntentList(source.intents);

  return {
    schemaVersion: 1,
    id,
    characterId,
    uri,
    source: mediaSource,
    userApproved: source.userApproved === true,
    tags: normalizedList(source.tags, 20, 48),
    intents: intents.length > 0 ? intents : ['other'],
    createdAt: Number.isFinite(source.createdAt) && Number(source.createdAt) > 0
      ? Number(source.createdAt)
      : Date.now(),
    enabled: source.enabled !== false,
  };
}

export function normalizeCharacterMediaAssets(values: unknown): CharacterMediaAsset[] {
  if (!Array.isArray(values)) return [];
  const byId = new Map<string, CharacterMediaAsset>();
  for (const value of values) {
    const asset = normalizeCharacterMediaAsset(value);
    if (!asset) continue;
    byId.set(`${asset.characterId}:${asset.id}`, asset);
  }
  return Array.from(byId.values());
}

export function normalizeCharacterMediaPolicy(
  value: Partial<CharacterMediaPolicy> | null | undefined,
): CharacterMediaPolicy {
  return {
    enabled: value?.enabled === true,
    allowBundled: value?.allowBundled !== false,
    allowUserImported: value?.allowUserImported !== false,
    minimumIntervalMs: Number.isFinite(value?.minimumIntervalMs)
      ? Math.min(DAY_MS, Math.max(15 * 60 * 1_000, Number(value?.minimumIntervalMs)))
      : DEFAULT_CHARACTER_MEDIA_POLICY.minimumIntervalMs,
    dailyLimit: Number.isFinite(value?.dailyLimit)
      ? Math.min(8, Math.max(1, Math.round(Number(value?.dailyLimit))))
      : DEFAULT_CHARACTER_MEDIA_POLICY.dailyLimit,
  };
}

const stableHash = (value: string) => {
  let hash = 2_166_136_261;
  for (const char of value) {
    hash ^= char.codePointAt(0) || 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
};

const sourceAllowed = (asset: CharacterMediaAsset, policy: CharacterMediaPolicy) => {
  if (!asset.userApproved) return false;
  if (asset.source === 'bundled') return policy.allowBundled;
  return policy.allowUserImported;
};

export function selectCharacterMediaAsset(input: {
  characterId: string;
  assets: CharacterMediaAsset[];
  sendHistory?: CharacterMediaSendRecord[];
  intent?: CharacterMediaIntent;
  tags?: string[];
  policy?: Partial<CharacterMediaPolicy>;
  now?: number;
}): CharacterMediaSelection {
  const characterId = cleanString(input.characterId);
  const now = Number.isFinite(input.now) ? Number(input.now) : Date.now();
  const policy = normalizeCharacterMediaPolicy(input.policy);
  if (!policy.enabled) return { asset: null, reason: 'permissionDisabled' };

  const history = (input.sendHistory || [])
    .filter(record => record.characterId === characterId && Number.isFinite(record.sentAt))
    .sort((a, b) => b.sentAt - a.sentAt);
  const mostRecent = history[0];
  if (mostRecent && mostRecent.sentAt + policy.minimumIntervalMs > now) {
    return {
      asset: null,
      reason: 'cooldown',
      nextEligibleAt: mostRecent.sentAt + policy.minimumIntervalMs,
    };
  }

  const sentToday = history.filter(record => record.sentAt > now - DAY_MS).length;
  if (sentToday >= policy.dailyLimit) {
    const oldestRelevant = history
      .filter(record => record.sentAt > now - DAY_MS)
      .sort((a, b) => a.sentAt - b.sentAt)[0];
    return {
      asset: null,
      reason: 'dailyLimit',
      nextEligibleAt: oldestRelevant ? oldestRelevant.sentAt + DAY_MS : now + DAY_MS,
    };
  }

  const requestedTags = new Set(normalizedList(input.tags, 12, 48));
  const recentIds = new Set(history.slice(0, 8).map(record => record.assetId));
  const eligible = input.assets
    .filter(asset => (
      asset.characterId === characterId
      && asset.enabled
      && sourceAllowed(asset, policy)
    ))
    .map(asset => {
      const intentScore = input.intent && asset.intents.includes(input.intent) ? 12 : 0;
      const tagScore = asset.tags.reduce(
        (score, tag) => score + (requestedTags.has(tag) ? 3 : 0),
        0,
      );
      const reusePenalty = recentIds.has(asset.id) ? 8 : 0;
      return {
        asset,
        score: intentScore + tagScore - reusePenalty,
      };
    })
    .sort((a, b) => (
      b.score - a.score
      || stableHash(`${characterId}:${now}:${a.asset.id}`)
        - stableHash(`${characterId}:${now}:${b.asset.id}`)
    ));

  return eligible[0]
    ? { asset: eligible[0].asset, reason: 'selected' }
    : { asset: null, reason: 'noEligibleAsset' };
}
