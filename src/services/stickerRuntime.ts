import type { StickerAsset, StickerScope } from '../types';

const MAX_STICKER_NAME_LENGTH = 48;
const MAX_STICKER_TAGS = 12;
const MAX_STICKER_TAG_LENGTH = 28;
const MAX_STICKER_URI_LENGTH = 4096;

export interface StickerSemanticChoice {
  sticker: StickerAsset;
  score: number;
  matchedTerms: string[];
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength)
    : '';
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .trim();
}

function semanticTerms(value: string) {
  const normalized = normalizeSearchText(value);
  const splitTerms = normalized
    .split(/[\s,，。.!！?？:：;；/\\|()[\]{}<>《》“”"'`~@#$%^&*+=_-]+/u)
    .filter(Boolean);

  return Array.from(new Set(splitTerms));
}

function normalizeTagList(value: unknown) {
  if (!Array.isArray(value)) return [];

  const tags: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    const tag = cleanText(candidate, MAX_STICKER_TAG_LENGTH);
    const key = normalizeSearchText(tag);
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= MAX_STICKER_TAGS) break;
  }
  return tags;
}

function inferMimeType(uri: string) {
  const extension = uri
    .split(/[?#]/u, 1)[0]
    .split('.')
    .pop()
    ?.toLowerCase();

  if (extension === 'gif') return 'image/gif';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'apng') return 'image/apng';
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'avif') return 'image/avif';
  return 'image/*';
}

function canonicalUri(uri: string) {
  return uri
    .trim()
    .replace(/\\/gu, '/')
    .replace(/#.*$/u, '');
}

export function normalizeStickerAsset(value: unknown): StickerAsset | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<StickerAsset>;
  const id = cleanText(input.id, 160);
  const uri = cleanText(input.uri, MAX_STICKER_URI_LENGTH);
  const scope: StickerScope | null =
    input.scope === 'global' || input.scope === 'relationship'
      ? input.scope
      : null;
  const characterId = cleanText(input.characterId, 160);
  const createdAt =
    typeof input.createdAt === 'number'
      && Number.isFinite(input.createdAt)
      && input.createdAt > 0
      ? Math.trunc(input.createdAt)
      : 0;

  if (
    input.schemaVersion !== 1
    || !id
    || !uri
    || !scope
    || !createdAt
    || (scope === 'relationship' && !characterId)
  ) {
    return null;
  }

  const inferredMimeType = inferMimeType(uri);
  const mimeTypeCandidate = cleanText(input.mimeType, 80).toLowerCase();
  const mimeType = mimeTypeCandidate.startsWith('image/')
    ? mimeTypeCandidate
    : inferredMimeType;
  const inferredAnimated =
    mimeType === 'image/gif'
    || mimeType === 'image/apng'
    || /\.gif(?:[?#]|$)/iu.test(uri)
    || /\.apng(?:[?#]|$)/iu.test(uri);

  return {
    schemaVersion: 1,
    id,
    uri,
    name: cleanText(input.name, MAX_STICKER_NAME_LENGTH) || 'Sticker',
    tags: normalizeTagList(input.tags),
    mimeType,
    animated: typeof input.animated === 'boolean' ? input.animated : inferredAnimated,
    scope,
    ...(scope === 'relationship' ? { characterId } : {}),
    createdAt,
  };
}

/**
 * Returns the first valid occurrence in source order. Duplicate identifiers are
 * rejected globally, while duplicate media URIs are rejected only inside the
 * same visibility scope so a user may deliberately promote a relationship
 * sticker into the global pack.
 */
export function normalizeStickerAssets(value: unknown): StickerAsset[] {
  if (!Array.isArray(value)) return [];

  const stickers: StickerAsset[] = [];
  const seenIds = new Set<string>();
  const seenMedia = new Set<string>();

  for (const candidate of value) {
    const sticker = normalizeStickerAsset(candidate);
    if (!sticker) continue;

    const idKey = normalizeSearchText(sticker.id);
    const ownershipKey =
      sticker.scope === 'relationship'
        ? `${sticker.scope}:${normalizeSearchText(sticker.characterId ?? '')}`
        : sticker.scope;
    const mediaKey = `${ownershipKey}:${normalizeSearchText(canonicalUri(sticker.uri))}`;
    if (seenIds.has(idKey) || seenMedia.has(mediaKey)) continue;

    seenIds.add(idKey);
    seenMedia.add(mediaKey);
    stickers.push(sticker);
  }

  return stickers;
}

export const dedupeStickerAssets = normalizeStickerAssets;

export function filterStickersForChat(
  stickers: readonly StickerAsset[],
  characterId: string,
) {
  const normalizedCharacterId = normalizeSearchText(characterId);
  if (!normalizedCharacterId) return [];

  return normalizeStickerAssets(stickers).filter(sticker =>
    sticker.scope === 'global'
      || (
        sticker.scope === 'relationship'
        && normalizeSearchText(sticker.characterId ?? '') === normalizedCharacterId
      ),
  );
}

function scoreSticker(sticker: StickerAsset, queryTerms: readonly string[]) {
  const name = normalizeSearchText(sticker.name);
  const nameTerms = semanticTerms(sticker.name);
  const tags = sticker.tags.map(normalizeSearchText);
  const matchedTerms: string[] = [];
  let score = 0;

  for (const queryTerm of queryTerms) {
    let termScore = 0;
    if (name === queryTerm) termScore = Math.max(termScore, 8);
    if (nameTerms.includes(queryTerm)) termScore = Math.max(termScore, 6);
    if (tags.includes(queryTerm)) termScore = Math.max(termScore, 7);
    if (
      name.includes(queryTerm)
      || tags.some(tag => tag.includes(queryTerm) || queryTerm.includes(tag))
    ) {
      termScore = Math.max(termScore, 3);
    }

    if (termScore > 0) {
      score += termScore;
      matchedTerms.push(queryTerm);
    }
  }

  return { score, matchedTerms };
}

export function rankStickersForSemantic(
  stickers: readonly StickerAsset[],
  query: string,
  characterId?: string,
): StickerSemanticChoice[] {
  const queryTerms = semanticTerms(query);
  if (queryTerms.length === 0) return [];

  const candidates = characterId
    ? filterStickersForChat(stickers, characterId)
    : normalizeStickerAssets(stickers);

  return candidates
    .map(sticker => {
      const match = scoreSticker(sticker, queryTerms);
      const relationshipTieBreaker =
        characterId && sticker.scope === 'relationship' ? 0.25 : 0;
      return {
        sticker,
        score: match.score + relationshipTieBreaker,
        matchedTerms: match.matchedTerms,
      };
    })
    .filter(choice => choice.matchedTerms.length > 0)
    .sort((left, right) =>
      right.score - left.score
      || right.sticker.createdAt - left.sticker.createdAt
      || left.sticker.id.localeCompare(right.sticker.id),
    );
}

export function chooseStickerForSemantic(
  stickers: readonly StickerAsset[],
  query: string,
  characterId?: string,
) {
  return rankStickersForSemantic(stickers, query, characterId)[0]?.sticker ?? null;
}
