import type {
  MeetingCharacterAddressMode,
  MeetingNarrationPerson,
  MeetingNarrativeConfig,
  MeetingNarrativeEnforcement,
  MeetingNarrativeLayout,
  MeetingParagraphDensity,
  MeetingParsedResponse,
  MeetingUserAddressMode,
} from './meeting-types';

export const MEETING_NARRATIVE_MAX_VISIBLE_CHARACTERS = 8_000;
export const MEETING_NARRATIVE_ENVELOPE_HEADROOM = 4_000;
export const MEETING_NARRATIVE_MAX_OUTPUT_CHARACTERS = 12_000;

export const DEFAULT_MEETING_NARRATIVE_CONFIG: MeetingNarrativeConfig = {
  stylePrompt: '',
  length: { min: 0, target: 800, max: 4_000 },
  narrationPerson: 'preset',
  userAddress: { mode: 'preset', customLabel: '' },
  characterAddress: { mode: 'preset', customLabel: '' },
  dialogueRatio: 35,
  paragraphDensity: 'balanced',
  layout: 'profileNovel',
  showChapterTitle: true,
  showLeadQuote: true,
  bannedTerms: [],
  enforcement: 'guide',
};

const recordOf = (value: unknown): Record<string, unknown> | undefined => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
);

const compactText = (value: unknown, maxLength: number) => (
  typeof value === 'string'
    ? Array.from(value.replace(/\u0000/gu, '').trim()).slice(0, maxLength).join('')
    : ''
);

const boundedInteger = (value: unknown, fallback: number, min: number, max: number) => (
  Math.round(Math.max(
    min,
    Math.min(max, typeof value === 'number' && Number.isFinite(value) ? value : fallback),
  ))
);

const enumValue = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T => typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback;

export const normalizeMeetingNarrativeConfig = (value: unknown): MeetingNarrativeConfig => {
  const record = recordOf(value);
  const rawLength = recordOf(record?.length);
  const rawUserAddress = recordOf(record?.userAddress);
  const rawCharacterAddress = recordOf(record?.characterAddress);
  const min = boundedInteger(
    rawLength?.min,
    DEFAULT_MEETING_NARRATIVE_CONFIG.length.min,
    0,
    MEETING_NARRATIVE_MAX_VISIBLE_CHARACTERS,
  );
  const target = boundedInteger(
    rawLength?.target,
    DEFAULT_MEETING_NARRATIVE_CONFIG.length.target,
    Math.max(min, 1),
    MEETING_NARRATIVE_MAX_VISIBLE_CHARACTERS,
  );
  const max = boundedInteger(
    rawLength?.max,
    DEFAULT_MEETING_NARRATIVE_CONFIG.length.max,
    Math.max(target, 200),
    MEETING_NARRATIVE_MAX_VISIBLE_CHARACTERS,
  );
  const seenBannedTerms = new Set<string>();
  const bannedTerms = Array.isArray(record?.bannedTerms)
    ? record.bannedTerms.slice(0, 200).flatMap(term => {
      const normalized = compactText(term, 80);
      const identity = normalized.toLocaleLowerCase();
      if (!normalized || seenBannedTerms.has(identity)) return [];
      seenBannedTerms.add(identity);
      return [normalized];
    }).slice(0, 100)
    : [];
  const normalizedUserMode = enumValue<MeetingUserAddressMode>(
    rawUserAddress?.mode,
    ['preset', 'firstPerson', 'secondPerson', 'name', 'custom'],
    DEFAULT_MEETING_NARRATIVE_CONFIG.userAddress.mode,
  );
  const normalizedCharacterMode = enumValue<MeetingCharacterAddressMode>(
    rawCharacterAddress?.mode,
    ['preset', 'name', 'pronoun', 'custom'],
    DEFAULT_MEETING_NARRATIVE_CONFIG.characterAddress.mode,
  );
  const userCustomLabel = compactText(rawUserAddress?.customLabel, 40);
  const characterCustomLabel = compactText(rawCharacterAddress?.customLabel, 40);
  const userMode = normalizedUserMode === 'custom' && !userCustomLabel
    ? 'preset'
    : normalizedUserMode;
  const characterMode = normalizedCharacterMode === 'custom' && !characterCustomLabel
    ? 'preset'
    : normalizedCharacterMode;
  return {
    stylePrompt: compactText(record?.stylePrompt, 4_000),
    length: { min, target, max },
    narrationPerson: enumValue<MeetingNarrationPerson>(
      record?.narrationPerson,
      ['preset', 'first', 'second', 'third'],
      DEFAULT_MEETING_NARRATIVE_CONFIG.narrationPerson,
    ),
    userAddress: {
      mode: userMode,
      customLabel: userMode === 'custom' ? userCustomLabel : '',
    },
    characterAddress: {
      mode: characterMode,
      customLabel: characterMode === 'custom' ? characterCustomLabel : '',
    },
    dialogueRatio: boundedInteger(
      record?.dialogueRatio,
      DEFAULT_MEETING_NARRATIVE_CONFIG.dialogueRatio,
      0,
      100,
    ),
    paragraphDensity: enumValue<MeetingParagraphDensity>(
      record?.paragraphDensity,
      ['compact', 'balanced', 'spacious'],
      DEFAULT_MEETING_NARRATIVE_CONFIG.paragraphDensity,
    ),
    layout: enumValue<MeetingNarrativeLayout>(
      record?.layout,
      ['profileNovel', 'pureNovel', 'compact'],
      DEFAULT_MEETING_NARRATIVE_CONFIG.layout,
    ),
    showChapterTitle: typeof record?.showChapterTitle === 'boolean'
      ? record.showChapterTitle
      : DEFAULT_MEETING_NARRATIVE_CONFIG.showChapterTitle,
    showLeadQuote: typeof record?.showLeadQuote === 'boolean'
      ? record.showLeadQuote
      : DEFAULT_MEETING_NARRATIVE_CONFIG.showLeadQuote,
    bannedTerms,
    enforcement: enumValue<MeetingNarrativeEnforcement>(
      record?.enforcement,
      ['guide', 'strict'],
      DEFAULT_MEETING_NARRATIVE_CONFIG.enforcement,
    ),
  };
};

const narrationDescriptions: Record<MeetingNarrationPerson, string> = {
  preset: 'Follow the free-text preset for narrative person.',
  first: 'Use first-person narration consistently.',
  second: 'Use second-person narration consistently.',
  third: 'Use third-person narration consistently.',
};

const addressDescription = (
  subject: 'player' | 'characters',
  config: MeetingNarrativeConfig['userAddress'] | MeetingNarrativeConfig['characterAddress'],
) => {
  if (config.mode === 'preset') return `Follow the free-text preset when referring to ${subject}.`;
  if (config.mode === 'custom') return `Refer to ${subject} as ${JSON.stringify(config.customLabel || subject)}.`;
  const labels: Record<string, string> = {
    firstPerson: 'first person',
    secondPerson: 'second person',
    name: 'their names',
    pronoun: 'pronouns',
  };
  return `Refer to ${subject} using ${labels[config.mode] || config.mode}.`;
};

const densityDescriptions: Record<MeetingParagraphDensity, string> = {
  compact: 'Use compact, information-dense paragraphs.',
  balanced: 'Use medium-length paragraphs with natural breathing room.',
  spacious: 'Use shorter paragraphs and generous breaks for a spacious reading rhythm.',
};

const layoutDescriptions: Record<MeetingNarrativeLayout, string> = {
  profileNovel: 'Write for the profile-novel layout: continuous prose split into narration and character blocks.',
  pureNovel: 'Write as continuous novel prose while still returning validated narration and character blocks.',
  compact: 'Write for a compact mobile layout with concise paragraphs and minimal ornament.',
};

export const compileMeetingNarrativeInstruction = (value: unknown) => {
  const config = normalizeMeetingNarrativeConfig(value);
  return [
    config.enforcement === 'strict'
      ? 'Structured narrative rules: deterministic strict fields (length, required presentation fields, banned terms) are mechanically enforced; for all other authorial or style conflicts, PRESET FREE-TEXT has highest priority.'
      : 'Structured narrative guidance: PRESET FREE-TEXT has highest priority whenever guidance conflicts.',
    config.stylePrompt ? `- Style direction: ${config.stylePrompt}` : '- Style direction: follow the free-text preset.',
    `- Visible main-story length: ${config.length.min}–${config.length.max} Unicode characters; aim for about ${config.length.target}.`,
    `- ${narrationDescriptions[config.narrationPerson]}`,
    `- ${addressDescription('player', config.userAddress)}`,
    `- ${addressDescription('characters', config.characterAddress)}`,
    `- Aim for roughly ${config.dialogueRatio}% character dialogue/action text and ${100 - config.dialogueRatio}% narration.`,
    `- ${densityDescriptions[config.paragraphDensity]}`,
    `- ${layoutDescriptions[config.layout]}`,
    config.showChapterTitle
      ? '- Include a short chapterTitle.'
      : '- Omit chapterTitle; the reading UI will show only the act number.',
    config.showLeadQuote
      ? '- Include leadQuote as one or two short poetic lines closely related to this turn. It is a separate epigraph: do not copy it from, remove it from, or count it as a story block.'
      : '- Omit leadQuote.',
    config.bannedTerms.length > 0
      ? `- Do not use any banned term or stock phrase in this JSON list: ${JSON.stringify(config.bannedTerms)}.`
      : '- No additional banned-term list is configured.',
    config.enforcement === 'strict'
      ? '- Strict mode: length, required structure, and banned terms are validated after generation; violations require one replacement response.'
      : '- Guide mode: treat these settings as authoring guidance without automatic rewriting.',
  ].join('\n');
};

export type MeetingNarrativeViolationCode =
  | 'below-min-length'
  | 'above-max-length'
  | 'banned-term'
  | 'missing-chapter-title'
  | 'missing-lead-narration'
  | 'dialogue-ratio';

export interface MeetingNarrativeViolation {
  code: MeetingNarrativeViolationCode;
  detail: string;
}

export const validateMeetingNarrativeResponse = (
  parsed: MeetingParsedResponse,
  value: unknown,
): MeetingNarrativeViolation[] => {
  const config = normalizeMeetingNarrativeConfig(value);
  const visible = parsed.blocks.map(block => block.text.trim()).filter(Boolean).join('\n');
  const visibleLength = Array.from(visible).length;
  const violations: MeetingNarrativeViolation[] = [];
  if (config.length.min > 0 && visibleLength < config.length.min) {
    violations.push({
      code: 'below-min-length',
      detail: `Visible story length ${visibleLength} is below minimum ${config.length.min}.`,
    });
  }
  if (visibleLength > config.length.max) {
    violations.push({
      code: 'above-max-length',
      detail: `Visible story length ${visibleLength} exceeds maximum ${config.length.max}.`,
    });
  }
  const lowerVisible = visible.toLocaleLowerCase();
  for (const term of config.bannedTerms) {
    if (term && lowerVisible.includes(term.toLocaleLowerCase())) {
      violations.push({ code: 'banned-term', detail: `Visible story contains banned term ${JSON.stringify(term)}.` });
    }
  }
  if (config.showChapterTitle && !parsed.chapterTitle?.trim()) {
    violations.push({ code: 'missing-chapter-title', detail: 'A short chapterTitle is required.' });
  }
  const leadQuoteLength = Array.from(parsed.leadQuote?.trim() || '').length;
  if (config.showLeadQuote && (leadQuoteLength === 0 || leadQuoteLength > 80)) {
    violations.push({
      code: 'missing-lead-narration',
      detail: 'A separate leadQuote of one or two short poetic lines (at most 80 characters) is required.',
    });
  }
  if (visibleLength > 0) {
    const characterLength = parsed.blocks
      .filter(block => block.kind === 'character')
      .reduce((total, block) => total + Array.from(block.text.trim()).length, 0);
    const actualDialogueRatio = Math.round((characterLength / visibleLength) * 100);
    if (Math.abs(actualDialogueRatio - config.dialogueRatio) > 30) {
      violations.push({
        code: 'dialogue-ratio',
        detail: `Character text is about ${actualDialogueRatio}%; keep it nearer ${config.dialogueRatio}%.`,
      });
    }
  }
  return violations;
};

export const formatMeetingNarrativeRevisionInstruction = (
  violations: readonly MeetingNarrativeViolation[],
  value: unknown,
) => [
  'STRICT REVISION: Replace the previous response once. Return one complete <NANA_MEETING> envelope only.',
  'Preserve the scene facts, character identities, current player input, and the preset free-text direction.',
  'Correct every deterministic violation:',
  ...violations.map(violation => `- ${violation.detail}`),
  compileMeetingNarrativeInstruction(value),
].join('\n');

export const applyMeetingNarrativePresentation = (
  parsed: MeetingParsedResponse,
  value: unknown,
): MeetingParsedResponse => {
  const config = normalizeMeetingNarrativeConfig(value);
  return {
    ...parsed,
    ...(config.showChapterTitle ? {} : { chapterTitle: undefined }),
    ...(config.showLeadQuote ? {} : { leadQuote: undefined }),
  };
};

export const meetingNarrativeMaxOutputCharacters = (value: unknown) => {
  const config = normalizeMeetingNarrativeConfig(value);
  return Math.min(
    MEETING_NARRATIVE_MAX_OUTPUT_CHARACTERS,
    Math.max(4_000, config.length.max + MEETING_NARRATIVE_ENVELOPE_HEADROOM),
  );
};
