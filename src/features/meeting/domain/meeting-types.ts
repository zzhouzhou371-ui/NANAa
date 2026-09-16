export const MEETING_SCHEMA_VERSION = 1 as const;

export type MeetingSchemaVersion = typeof MEETING_SCHEMA_VERSION;
export type MeetingSceneState = 'active' | 'completed' | 'abandoned';
export type MeetingTurnState = 'complete' | 'failed';
export type MeetingGenerationSource = 'remote' | 'demo';
export type MeetingBlockKind = 'narration' | 'character';
export type MeetingMemoryDraftState = 'draft' | 'committed' | 'discarded';
export type MeetingMiniTheaterMode = 'off' | 'manual' | 'everyTurn';
export type MeetingNarrationPerson = 'preset' | 'first' | 'second' | 'third';
export type MeetingUserAddressMode = 'preset' | 'firstPerson' | 'secondPerson' | 'name' | 'custom';
export type MeetingCharacterAddressMode = 'preset' | 'name' | 'pronoun' | 'custom';
export type MeetingParagraphDensity = 'compact' | 'balanced' | 'spacious';
export type MeetingNarrativeLayout = 'profileNovel' | 'pureNovel' | 'compact';
export type MeetingNarrativeEnforcement = 'guide' | 'strict';

export type MeetingSceneOrigin =
  | { type: 'manual' }
  | {
      type: 'chatHandoff';
      chatId: string;
      sourceMessageIds: number[];
      sourceTurnId?: string;
      label: string;
    };

export interface MeetingStatusFieldConfig {
  key: string;
  label: string;
  initialValue: string;
}

export interface MeetingHtmlTemplateConfig {
  html: string;
  css: string;
  height: number;
}

export interface MeetingMiniTheaterConfig extends MeetingHtmlTemplateConfig {
  mode: MeetingMiniTheaterMode;
  prompt: string;
}

export interface MeetingNarrativeLengthConfig {
  /** Visible Unicode characters, excluding the structured response envelope. */
  min: number;
  target: number;
  max: number;
}

export interface MeetingNarrativeAddressConfig<TMode extends string> {
  mode: TMode;
  customLabel: string;
}

/**
 * Structured authoring aids compiled into the offline preset prompt. The
 * preset's free-text prompt remains authoritative when the two conflict.
 */
export interface MeetingNarrativeConfig {
  stylePrompt: string;
  length: MeetingNarrativeLengthConfig;
  narrationPerson: MeetingNarrationPerson;
  userAddress: MeetingNarrativeAddressConfig<MeetingUserAddressMode>;
  characterAddress: MeetingNarrativeAddressConfig<MeetingCharacterAddressMode>;
  dialogueRatio: number;
  paragraphDensity: MeetingParagraphDensity;
  layout: MeetingNarrativeLayout;
  showChapterTitle: boolean;
  showLeadQuote: boolean;
  bannedTerms: string[];
  enforcement: MeetingNarrativeEnforcement;
}

export interface MeetingConfig {
  schemaVersion: MeetingSchemaVersion;
  statusFields: {
    scene: MeetingStatusFieldConfig[];
    character: MeetingStatusFieldConfig[];
  };
  statusTemplate: MeetingHtmlTemplateConfig;
  miniTheater: MeetingMiniTheaterConfig;
  narrative: MeetingNarrativeConfig;
}

export interface MeetingPresetSnapshot {
  schemaVersion: MeetingSchemaVersion;
  sourcePresetId: string;
  name: string;
  prompt: string;
  meetingConfig: MeetingConfig;
}

export interface MeetingCharacterStatusSnapshot {
  characterId: string;
  values: Record<string, string>;
}

export interface MeetingStatusSnapshot {
  scene: Record<string, string>;
  characters: Record<string, MeetingCharacterStatusSnapshot>;
}

export interface MeetingBlock {
  schemaVersion: MeetingSchemaVersion;
  id: string;
  kind: MeetingBlockKind;
  text: string;
  characterId?: string;
}

export interface MeetingMiniTheater {
  schemaVersion: MeetingSchemaVersion;
  title: string;
  content: string;
  html: string;
  css: string;
  height: number;
}

export interface MeetingTurn {
  schemaVersion: MeetingSchemaVersion;
  id: string;
  sceneId: string;
  index: number;
  state: MeetingTurnState;
  input: string;
  chapterTitle?: string;
  /** A separate 1-2 line poetic epigraph. It is presentation-only, never main-story memory. */
  leadQuote?: string;
  blocks: MeetingBlock[];
  statusBefore: MeetingStatusSnapshot;
  statusAfter: MeetingStatusSnapshot;
  rollingRecap: string;
  miniTheater?: MeetingMiniTheater;
  generationSource: MeetingGenerationSource;
  attempt: number;
  errorCode?: string;
  createdAt: number;
  completedAt: number;
}

export interface MeetingScene {
  schemaVersion: MeetingSchemaVersion;
  id: string;
  presetId: string;
  presetSnapshot: MeetingPresetSnapshot;
  title: string;
  premise: string;
  playerSupplement: string;
  /** @deprecated Use playerSupplement. Kept for V1 save compatibility. */
  sceneSupplement: string;
  castIds: string[];
  origin?: MeetingSceneOrigin;
  state: MeetingSceneState;
  status: MeetingStatusSnapshot;
  rollingRecap: string;
  turns: MeetingTurn[];
  memoryDrafts: MeetingMemoryDraft[];
  revision: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

/**
 * A reviewable relationship outcome. It is deliberately not a
 * RelationshipTrace: persistence can keep the scene save and the user can
 * approve this draft before the existing trace repository receives it.
 */
export interface MeetingMemoryDraft {
  schemaVersion: MeetingSchemaVersion;
  id: string;
  sceneId: string;
  /** One draft maps to one character-scoped RelationshipTrace. */
  characterId: string;
  sourceTurnIds: string[];
  participantIds: string[];
  title: string;
  summary: string;
  tone?: string;
  occurredAt: number;
  createdAt: number;
  state: MeetingMemoryDraftState;
  revision: number;
}

export interface MeetingStatusUpdate {
  scope: 'scene' | 'character';
  key: string;
  value: string;
  characterId?: string;
}

export interface MeetingParsedResponse {
  blocks: MeetingBlock[];
  chapterTitle?: string;
  leadQuote?: string;
  statusUpdates: MeetingStatusUpdate[];
  rollingRecap?: string;
  miniTheater?: MeetingMiniTheater;
  usedRawNarrationFallback: boolean;
  rejected: string[];
}

export interface MeetingSceneSnapshot {
  sceneId: string;
  revision: number;
  status: MeetingStatusSnapshot;
  rollingRecap: string;
  turnCount: number;
}
