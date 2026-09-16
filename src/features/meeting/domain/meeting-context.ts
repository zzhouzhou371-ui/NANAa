import { normalizeMeetingStatusSnapshot } from './meeting-config';
import type { MeetingConfig, MeetingStatusSnapshot, MeetingTurn } from './meeting-types';

export const MEETING_CONTEXT_DEFAULT_MAX_CHARS = 24_000;
export const MEETING_CONTEXT_MAX_RECENT_TURNS = 8;
export const MEETING_CONTEXT_MAX_MEMORIES_PER_CHARACTER = 3;

export interface MeetingContextCharacter {
  id: string;
  name: string;
  definition: string;
}

export interface MeetingContextWorldBookEntry {
  id: string;
  title: string;
  content: string;
  keywords?: string[];
  characterIds?: string[];
  enabled?: boolean;
  alwaysInclude?: boolean;
}

export interface MeetingContextMemory {
  id: string;
  characterId: string;
  summary: string;
  occurredAt: number;
  recallWeight?: number;
  remember?: boolean;
  userVerified?: boolean;
}

export interface BuildMeetingContextInput {
  presetPrompt: string;
  userPersona: string;
  premise: string;
  playerSupplement: string;
  cast: MeetingContextCharacter[];
  worldBookEntries: MeetingContextWorldBookEntry[];
  memories: MeetingContextMemory[];
  config: MeetingConfig;
  status: MeetingStatusSnapshot;
  rollingRecap: string;
  recentTurns: MeetingTurn[];
  currentInput: string;
  maxChars?: number;
}

export interface MeetingContextBuildResult {
  text: string;
  estimatedTokens: number;
  includedWorldBookIds: string[];
  includedMemoryIdsByCharacter: Record<string, string[]>;
  includedTurnIds: string[];
  truncated: boolean;
}

const plainContextText = (value: string, maxLength = 12_000) => Array.from(value
  .replace(/<script\b[\s\S]*?<\/script>/giu, ' ')
  .replace(/<style\b[\s\S]*?<\/style>/giu, ' ')
  .replace(/<[^>]+>/gu, ' ')
  .replace(/\s+/gu, ' ')
  .trim()).slice(0, maxLength).join('');

export const truncateMeetingText = (value: string, maxLength: number) => {
  if (maxLength <= 0) return '';
  const characters = Array.from(value);
  if (characters.length <= maxLength) return value;
  if (maxLength === 1) return '…';
  return `${characters.slice(0, maxLength - 1).join('').trimEnd()}…`;
};

const searchTerms = (value: string) => {
  const normalized = value.toLocaleLowerCase().normalize('NFKC');
  const terms = normalized.match(/[\p{L}\p{N}]{2,}/gu) || [];
  return new Set(terms);
};

const selectRelevantWorldBook = (
  entries: readonly MeetingContextWorldBookEntry[],
  castIds: ReadonlySet<string>,
  query: string,
) => {
  const terms = searchTerms(query);
  return entries.flatMap((entry, index) => {
    if (entry.enabled === false || !entry.content.trim()) return [];
    if (entry.characterIds?.length && !entry.characterIds.some(id => castIds.has(id))) return [];
    const candidates = [...(entry.keywords || []), entry.title]
      .flatMap(value => [...searchTerms(value)]);
    const score = entry.alwaysInclude
      ? 10_000
      : candidates.reduce((total, term) => total + (terms.has(term) ? 4 : query.toLocaleLowerCase().includes(term) ? 2 : 0), 0);
    if (score <= 0) return [];
    return [{ entry, score, index }];
  }).sort((left, right) => right.score - left.score || left.index - right.index).slice(0, 8);
};

const selectMemories = (
  memories: readonly MeetingContextMemory[],
  cast: readonly MeetingContextCharacter[],
) => Object.fromEntries(cast.map(character => {
  const selected = memories
    .filter(memory => memory.characterId === character.id && memory.remember !== false && memory.summary.trim())
    .sort((left, right) => Number(Boolean(right.userVerified)) - Number(Boolean(left.userVerified))
      || (right.recallWeight || 0) - (left.recallWeight || 0)
      || right.occurredAt - left.occurredAt)
    .slice(0, MEETING_CONTEXT_MAX_MEMORIES_PER_CHARACTER);
  return [character.id, selected];
}));

const formatStatus = (
  status: MeetingStatusSnapshot,
  config: MeetingConfig,
  cast: readonly MeetingContextCharacter[],
) => {
  const normalized = normalizeMeetingStatusSnapshot(status, config, cast.map(character => character.id));
  return JSON.stringify({
    scene: Object.fromEntries(config.statusFields.scene.map(field => [field.key, normalized.scene[field.key]])),
    characters: Object.fromEntries(cast.map(character => [character.id, Object.fromEntries(
      config.statusFields.character.map(field => [field.key, normalized.characters[character.id]?.values[field.key] || field.initialValue]),
    )])),
  }, null, 2);
};

const formatTurns = (turns: readonly MeetingTurn[]) => turns.map(turn => {
  const visibleBlocks = turn.blocks.map(block => {
    const text = plainContextText(block.text, 2_000);
    return block.kind === 'character'
      ? `${block.characterId || 'character'}: ${text}`
      : `narrator: ${text}`;
  }).filter(Boolean);
  return [`Turn ${turn.index} user: ${plainContextText(turn.input, 2_000)}`, ...visibleBlocks].join('\n');
}).join('\n\n');

interface ContextSection {
  heading: string;
  body: string;
  minimum: number;
  current?: boolean;
}

const renderSections = (sections: readonly ContextSection[]) => sections
  .filter(section => section.body)
  .map(section => `## ${section.heading}\n${section.body}`)
  .join('\n\n');

const fitSections = (sections: ContextSection[], maxChars: number) => {
  const original = renderSections(sections);
  if (Array.from(original).length <= maxChars) return { text: original, truncated: false };
  let guard = 0;
  while (Array.from(renderSections(sections)).length > maxChars && guard < 256) {
    guard += 1;
    const candidate = sections
      .filter(section => !section.current && Array.from(section.body).length > section.minimum)
      .sort((left, right) => Array.from(right.body).length - Array.from(left.body).length)[0]
      || sections.filter(section => Array.from(section.body).length > section.minimum)
        .sort((left, right) => Array.from(right.body).length - Array.from(left.body).length)[0];
    if (!candidate) break;
    const length = Array.from(candidate.body).length;
    candidate.body = truncateMeetingText(candidate.body, Math.max(candidate.minimum, Math.floor(length * 0.86)));
  }
  const rendered = renderSections(sections);
  if (Array.from(rendered).length <= maxChars) return { text: rendered, truncated: true };
  const current = sections.find(section => section.current && section.body);
  if (!current) return { text: truncateMeetingText(rendered, maxChars), truncated: true };
  const currentSection = `## ${current.heading}\n${truncateMeetingText(current.body, Math.max(80, Math.floor(maxChars * 0.3)))}`;
  const currentLength = Array.from(currentSection).length;
  const earlier = renderSections(sections.filter(section => section !== current));
  const earlierBudget = Math.max(0, maxChars - currentLength - 2);
  return {
    text: `${truncateMeetingText(earlier, earlierBudget)}\n\n${currentSection}`,
    truncated: true,
  };
};

export const buildMeetingContext = (input: BuildMeetingContextInput): MeetingContextBuildResult => {
  const maxChars = Math.max(1_200, Math.min(48_000, Math.floor(input.maxChars || MEETING_CONTEXT_DEFAULT_MAX_CHARS)));
  const castIds = new Set(input.cast.map(character => character.id));
  const worldBook = selectRelevantWorldBook(
    input.worldBookEntries,
    castIds,
    `${input.currentInput}\n${input.premise}\n${input.playerSupplement}`,
  );
  const memoriesByCharacter = selectMemories(input.memories, input.cast);
  const recentTurns = input.recentTurns.slice(-MEETING_CONTEXT_MAX_RECENT_TURNS);
  const sections: ContextSection[] = [
    { heading: 'Director Prompt', body: plainContextText(input.presetPrompt), minimum: 120 },
    { heading: 'User Persona', body: plainContextText(input.userPersona), minimum: 80 },
    {
      heading: 'Scene Premise And Player Supplement',
      body: [plainContextText(input.premise), plainContextText(input.playerSupplement)].filter(Boolean).join('\n'),
      minimum: 100,
    },
    {
      heading: 'Cast Definitions',
      body: input.cast.map(character => `${character.name} [${character.id}]: ${plainContextText(character.definition, 4_000)}`).join('\n'),
      minimum: 120,
    },
    {
      heading: 'Relevant World Book',
      body: worldBook.map(({ entry }) => `${entry.title}: ${plainContextText(entry.content, 4_000)}`).join('\n'),
      minimum: 80,
    },
    {
      heading: 'Relationship Memories (max 3 per character)',
      body: input.cast.flatMap(character => (memoriesByCharacter[character.id] || []).map(memory => (
        `${character.name}: ${plainContextText(memory.summary, 1_200)}`
      ))).join('\n'),
      minimum: 100,
    },
    { heading: 'Structured Status', body: formatStatus(input.status, input.config, input.cast), minimum: 120 },
    { heading: 'Rolling Recap', body: plainContextText(input.rollingRecap, 4_000), minimum: 100 },
    { heading: 'Recent Turns (max 8)', body: formatTurns(recentTurns), minimum: 160 },
    { heading: 'Current Player Input', body: plainContextText(input.currentInput, 4_000), minimum: 160, current: true },
  ];
  const fitted = fitSections(sections, maxChars);
  return {
    text: fitted.text,
    estimatedTokens: Math.ceil(Array.from(fitted.text).length / 4),
    includedWorldBookIds: worldBook.map(({ entry }) => entry.id),
    includedMemoryIdsByCharacter: Object.fromEntries(input.cast.map(character => [
      character.id,
      (memoriesByCharacter[character.id] || []).map(memory => memory.id),
    ])),
    includedTurnIds: recentTurns.map(turn => turn.id),
    truncated: fitted.truncated,
  };
};

export const buildMeetingContextText = (input: BuildMeetingContextInput) => buildMeetingContext(input).text;
