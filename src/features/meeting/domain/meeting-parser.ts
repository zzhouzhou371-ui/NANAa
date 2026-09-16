import {
  MEETING_SCHEMA_VERSION,
  type MeetingBlock,
  type MeetingBlockKind,
  type MeetingConfig,
  type MeetingMiniTheater,
  type MeetingParsedResponse,
  type MeetingStatusUpdate,
} from './meeting-types';

export const MEETING_RESPONSE_ENVELOPE_TAG = 'NANA_MEETING';
export const MEETING_STATUS_VALUE_MAX_LENGTH = 120;
export const MEETING_BLOCK_TEXT_MAX_LENGTH = 2_000;
export const MEETING_RECAP_MAX_LENGTH = 2_400;
export const MEETING_CHAPTER_TITLE_MAX_LENGTH = 40;
export const MEETING_LEAD_QUOTE_MAX_LENGTH = 80;

export interface MeetingPlaceholderValues {
  meta?: Readonly<Record<string, string | number | undefined>>;
  scene?: Readonly<Record<string, string | number | undefined>>;
  user?: Readonly<Record<string, string | number | undefined>>;
  cast?: readonly {
    id: string;
    name: string;
    values: Readonly<Record<string, string | number | undefined>>;
  }[];
  /** @deprecated Prefer ordered cast. Retained for id-addressed compatibility. */
  characters?: Readonly<Record<string, Readonly<Record<string, string | number | undefined>>>>;
  /** @deprecated Prefer ordered cast. */
  currentCharacterId?: string;
}

export interface ParseMeetingResponseOptions {
  config: MeetingConfig;
  castIds: readonly string[];
  turnId?: string;
  allowMiniTheater?: boolean;
}

const ALLOWED_HTML_TAGS = new Set([
  'article', 'aside', 'b', 'blockquote', 'br', 'code', 'dd', 'div', 'dl', 'dt',
  'em', 'footer', 'h1', 'h2', 'h3', 'h4', 'header', 'hr', 'i', 'li', 'main',
  'ol', 'p', 'pre', 'section', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'ul',
]);

const FORBIDDEN_HTML_TAGS = [
  'script', 'iframe', 'frame', 'frameset', 'form', 'input', 'button', 'textarea',
  'select', 'option', 'audio', 'video', 'source', 'track', 'img', 'picture', 'object',
  'embed', 'link', 'base', 'meta', 'svg', 'math', 'canvas', 'portal', 'template',
];

const compactText = (value: string, maxLength: number) => (
  Array.from(value.replace(/\u0000/gu, '').trim()).slice(0, maxLength).join('')
);

const stableHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const recordOf = (value: unknown): Record<string, unknown> | undefined => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
);

export const escapeMeetingHtml = (value: string | number) => String(value)
  .replace(/&/gu, '&amp;')
  .replace(/</gu, '&lt;')
  .replace(/>/gu, '&gt;')
  .replace(/"/gu, '&quot;')
  .replace(/'/gu, '&#39;');

/**
 * Meeting templates are intentionally tiny fragments, not arbitrary web
 * pages. Unknown elements are unwrapped and only inert presentation
 * attributes survive.
 */
export const sanitizeMeetingHtml = (input: string): string => {
  let html = input.replace(/<!--[\s\S]*?-->/gu, '');
  for (const tag of FORBIDDEN_HTML_TAGS) {
    html = html
      .replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'giu'), '')
      .replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, 'giu'), '');
  }
  return html.replace(/<\/?([a-z][\w-]*)([^>]*)>/giu, (source, rawName: string, rawAttributes: string) => {
    const name = rawName.toLowerCase();
    if (!ALLOWED_HTML_TAGS.has(name)) return '';
    if (source.startsWith('</')) return `</${name}>`;
    const attributes: string[] = [];
    const attributePattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
    let match: RegExpExecArray | null;
    while ((match = attributePattern.exec(rawAttributes)) !== null) {
      const attributeName = match[1].toLowerCase();
      const attributeValue = match[2] ?? match[3] ?? match[4];
      const allowed = attributeName === 'class'
        || attributeName === 'id'
        || attributeName === 'title'
        || attributeName === 'role'
        || attributeName === 'dir'
        || attributeName === 'lang'
        || attributeName.startsWith('aria-')
        || attributeName.startsWith('data-');
      if (!allowed || attributeName.startsWith('on') || attributeValue === undefined) continue;
      attributes.push(`${attributeName}="${escapeMeetingHtml(attributeValue)}"`);
    }
    const suffix = source.endsWith('/>') || name === 'br' || name === 'hr' ? ' /' : '';
    return `<${name}${attributes.length ? ` ${attributes.join(' ')}` : ''}${suffix}>`;
  });
};

export const sanitizeMeetingCss = (input: string): string => {
  const css = input.replace(/\/\*[\s\S]*?\*\//gu, '').trim();
  if (!css) return '';
  const forbidden = /url\s*\(|@import\b|@font-face\b|expression\s*\(|(?:java|vb)script\s*:|data\s*:|https?\s*:|\/\/|behavior\s*:|-moz-binding\s*:|<\/?style\b/iu;
  return forbidden.test(css) ? '' : css;
};

export const renderMeetingPlaceholders = (
  template: string,
  values: MeetingPlaceholderValues,
) => template
  .replace(/\{\{\s*(title|content)\s*\}\}/gu, (_match, key: string) => (
    escapeMeetingHtml(values.meta?.[key] ?? '')
  ))
  .replace(/\{\{\s*(scene|user|character[1-4])\.([a-zA-Z0-9_-]+)\s*\}\}/gu,
    (_match, scope: string, key: string) => {
      if (scope === 'scene') return escapeMeetingHtml(values.scene?.[key] ?? '');
      if (scope === 'user') return escapeMeetingHtml(values.user?.[key] ?? '');
      const castIndex = Number(scope.slice('character'.length)) - 1;
      const character = values.cast?.[castIndex];
      if (!character) return '';
      return escapeMeetingHtml(key === 'name' ? character.name : character.values[key] ?? '');
    })
  .replace(/\{\{\s*(meta|scene|character):([a-zA-Z0-9_-]+)(?::([a-zA-Z0-9_-]+))?\s*\}\}/gu,
    (_match, scope: string, first: string, second?: string) => {
    if (scope === 'meta') return escapeMeetingHtml(values.meta?.[first] ?? '');
    if (scope === 'scene') return escapeMeetingHtml(values.scene?.[first] ?? '');
    const characterId = first === 'current' ? values.currentCharacterId : first;
    if (!characterId || !second) return '';
    return escapeMeetingHtml(values.characters?.[characterId]?.[second] ?? '');
    });

const MEETING_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'none'",
  "media-src 'none'",
  "font-src 'none'",
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "worker-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

export const buildMeetingInlineDocument = ({
  html,
  css,
  placeholders = {},
}: {
  html: string;
  css: string;
  placeholders?: MeetingPlaceholderValues;
}) => {
  const fragment = sanitizeMeetingHtml(renderMeetingPlaceholders(html, placeholders));
  const safeCss = sanitizeMeetingCss(css);
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${MEETING_CSP}">`,
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">',
    '<style>html,body{margin:0;padding:0;background:transparent;color:#251f2b;font-family:system-ui,sans-serif;overflow:hidden}*{box-sizing:border-box}',
    safeCss,
    '</style></head><body>',
    fragment,
    '</body></html>',
  ].join('');
};

const fallbackNarration = (rawText: string, turnId: string): MeetingParsedResponse => {
  const beforeEnvelope = rawText.split(/<NANA_MEETING>/iu)[0].trim();
  const text = compactText((beforeEnvelope || rawText)
    .replace(/```(?:json)?/giu, '')
    .replace(/<\/?NANA_MEETING>/giu, ''), MEETING_BLOCK_TEXT_MAX_LENGTH);
  return {
    blocks: text ? [{
      schemaVersion: MEETING_SCHEMA_VERSION,
      id: `block:${stableHash(`${turnId}:fallback:${text}`)}`,
      kind: 'narration',
      text,
    }] : [],
    statusUpdates: [],
    usedRawNarrationFallback: true,
    rejected: ['malformed-envelope'],
  };
};

const parseBlocks = (
  value: unknown,
  castIds: ReadonlySet<string>,
  turnId: string,
  rejected: string[],
) => {
  if (!Array.isArray(value)) return [];
  const blocks: MeetingBlock[] = [];
  value.slice(0, 16).forEach((entry, index) => {
    const record = recordOf(entry);
    const kind = record?.kind ?? record?.type;
    const text = record?.text;
    const characterId = record?.characterId;
    if (!record || !['narration', 'character', 'dialogue', 'action'].includes(String(kind))) {
      rejected.push(`block:${index}:unknown-kind`);
      return;
    }
    if (typeof text !== 'string' || !text.trim() || Array.from(text.trim()).length > MEETING_BLOCK_TEXT_MAX_LENGTH) {
      rejected.push(`block:${index}:invalid-text`);
      return;
    }
    if (characterId !== undefined && (typeof characterId !== 'string' || !castIds.has(characterId))) {
      rejected.push(`block:${index}:unknown-character`);
      return;
    }
    const normalizedKind: MeetingBlockKind = kind === 'narration' ? 'narration' : 'character';
    if (normalizedKind === 'character' && typeof characterId !== 'string') {
      rejected.push(`block:${index}:character-required`);
      return;
    }
    const normalizedText = text.trim();
    blocks.push({
      schemaVersion: MEETING_SCHEMA_VERSION,
      id: `block:${stableHash(`${turnId}:${index}:${normalizedKind}:${characterId || ''}:${normalizedText}`)}`,
      kind: normalizedKind,
      text: normalizedText,
      ...(typeof characterId === 'string' ? { characterId } : {}),
    });
  });
  return blocks;
};

const parseStatusUpdates = (
  value: unknown,
  config: MeetingConfig,
  castIds: ReadonlySet<string>,
  rejected: string[],
) => {
  const updates: MeetingStatusUpdate[] = [];
  const allowedSceneKeys = new Set(config.statusFields.scene.map(field => field.key));
  const allowedCharacterKeys = new Set(config.statusFields.character.map(field => field.key));
  const accept = (scope: 'scene' | 'character', key: unknown, rawValue: unknown, characterId?: unknown) => {
    if (typeof key !== 'string' || !(scope === 'scene' ? allowedSceneKeys : allowedCharacterKeys).has(key)) {
      rejected.push(`status:${scope}:unknown-field:${String(key)}`);
      return;
    }
    if (scope === 'character' && (typeof characterId !== 'string' || !castIds.has(characterId))) {
      rejected.push(`status:character:unknown-character:${String(characterId)}`);
      return;
    }
    if (typeof rawValue !== 'string' || !rawValue.trim() || Array.from(rawValue.trim()).length > MEETING_STATUS_VALUE_MAX_LENGTH) {
      rejected.push(`status:${scope}:invalid-value:${key}`);
      return;
    }
    updates.push({ scope, key, value: rawValue.trim(), ...(scope === 'character' ? { characterId: characterId as string } : {}) });
  };

  if (Array.isArray(value)) {
    value.forEach(entry => {
      const record = recordOf(entry);
      if (!record || (record.scope !== 'scene' && record.scope !== 'character')) {
        rejected.push('status:invalid-update');
        return;
      }
      accept(record.scope, record.key, record.value, record.characterId);
    });
    return updates;
  }

  const root = recordOf(value);
  const scene = recordOf(root?.scene);
  for (const [key, rawValue] of Object.entries(scene || {})) accept('scene', key, rawValue);
  const characters = recordOf(root?.characters);
  for (const [characterId, rawFields] of Object.entries(characters || {})) {
    const fields = recordOf(rawFields);
    if (!castIds.has(characterId)) {
      rejected.push(`status:character:unknown-character:${characterId}`);
      continue;
    }
    if (!fields) {
      rejected.push(`status:character:invalid-fields:${characterId}`);
      continue;
    }
    for (const [key, rawValue] of Object.entries(fields)) accept('character', key, rawValue, characterId);
  }
  return updates;
};

export const parseMeetingResponse = (
  rawText: string,
  {
    config,
    castIds,
    turnId = 'meeting-turn',
    allowMiniTheater = config.miniTheater.mode === 'everyTurn',
  }: ParseMeetingResponseOptions,
): MeetingParsedResponse => {
  const envelopePattern = /<NANA_MEETING>\s*([\s\S]*?)\s*<\/NANA_MEETING>/iu;
  const match = rawText.match(envelopePattern);
  if (!match?.[1]) return fallbackNarration(rawText, turnId);
  let payload: unknown;
  try {
    payload = JSON.parse(match[1].trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, ''));
  } catch {
    return fallbackNarration(rawText, turnId);
  }
  const root = recordOf(payload);
  if (!root) return fallbackNarration(rawText, turnId);
  const rejected: string[] = [];
  const castSet = new Set(castIds);
  const blocks = parseBlocks(root.blocks, castSet, turnId, rejected);
  const statusUpdates = parseStatusUpdates(root.statusUpdates, config, castSet, rejected);
  const recap = typeof root.recap === 'string' && root.recap.trim()
    && Array.from(root.recap.trim()).length <= MEETING_RECAP_MAX_LENGTH
    ? root.recap.trim()
    : undefined;
  if (root.recap !== undefined && !recap) rejected.push('recap:invalid');
  const chapterTitle = typeof root.chapterTitle === 'string' && root.chapterTitle.trim()
    && Array.from(root.chapterTitle.trim()).length <= MEETING_CHAPTER_TITLE_MAX_LENGTH
    ? root.chapterTitle.trim()
    : undefined;
  if (root.chapterTitle !== undefined && !chapterTitle) rejected.push('chapter-title:invalid');
  const leadQuote = typeof root.leadQuote === 'string' && root.leadQuote.trim()
    && Array.from(root.leadQuote.trim()).length <= MEETING_LEAD_QUOTE_MAX_LENGTH
    ? root.leadQuote.trim()
    : undefined;
  if (root.leadQuote !== undefined && !leadQuote) rejected.push('lead-quote:invalid');

  let miniTheater: MeetingMiniTheater | undefined;
  const theaterRecord = recordOf(root.miniTheater);
  if (theaterRecord && config.miniTheater.mode !== 'off' && allowMiniTheater) {
    if (typeof theaterRecord.title === 'string' && typeof theaterRecord.content === 'string'
      && theaterRecord.title.trim() && theaterRecord.content.trim()) {
      miniTheater = {
        schemaVersion: MEETING_SCHEMA_VERSION,
        title: compactText(theaterRecord.title, 80),
        content: compactText(theaterRecord.content, 1_200),
        html: sanitizeMeetingHtml(config.miniTheater.html),
        css: sanitizeMeetingCss(config.miniTheater.css),
        height: config.miniTheater.height,
      };
    } else {
      rejected.push('mini-theater:invalid');
    }
  } else if (theaterRecord) {
    rejected.push('mini-theater:disabled');
  }

  return {
    blocks,
    statusUpdates,
    ...(chapterTitle ? { chapterTitle } : {}),
    ...(leadQuote ? { leadQuote } : {}),
    ...(recap ? { rollingRecap: recap } : {}),
    ...(miniTheater ? { miniTheater } : {}),
    usedRawNarrationFallback: false,
    rejected,
  };
};

export const MEETING_RESPONSE_ENVELOPE_INSTRUCTION = [
  'Return exactly one private structured envelope after no other text:',
  '<NANA_MEETING>{"chapterTitle":"optional short chapter title","leadQuote":"optional 1-2 line poetic epigraph related to this turn","blocks":[{"kind":"narration|character","characterId":"required for character","text":"visible prose"}],"statusUpdates":{"scene":{"declaredFieldKey":"value"},"characters":{"cast-id":{"declaredFieldKey":"value"}}},"recap":"rolling factual recap","miniTheater":{"title":"optional short title","content":"optional short vignette"}}</NANA_MEETING>',
  'chapterTitle is optional and must be at most 40 characters.',
  'leadQuote is optional, must be at most 80 characters, and must not duplicate or replace a story block.',
  'Use only supplied cast ids and declared status field keys. Keep status values under 120 characters.',
  'Never put scripts, event handlers, forms, frames, links, media, URLs, url(), or @import in theater markup.',
].join('\n');
