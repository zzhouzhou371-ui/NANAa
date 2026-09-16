import {
  applyMeetingStatusUpdates,
  createInitialMeetingStatus,
  normalizeMeetingConfig,
} from './meeting-config';
import {
  buildMeetingContext,
  type BuildMeetingContextInput,
  type MeetingContextBuildResult,
} from './meeting-context';
import {
  MEETING_RESPONSE_ENVELOPE_INSTRUCTION,
  parseMeetingResponse,
} from './meeting-parser';
import {
  applyMeetingNarrativePresentation,
  compileMeetingNarrativeInstruction,
  formatMeetingNarrativeRevisionInstruction,
  meetingNarrativeMaxOutputCharacters,
  validateMeetingNarrativeResponse,
} from './meeting-narrative';
import {
  MEETING_SCHEMA_VERSION,
  type MeetingBlock,
  type MeetingGenerationSource,
  type MeetingMemoryDraft,
  type MeetingParsedResponse,
  type MeetingScene,
  type MeetingSceneSnapshot,
  type MeetingPresetSnapshot,
  type MeetingSceneOrigin,
  type MeetingTurn,
} from './meeting-types';

export interface MeetingCompletionRequest {
  purpose: 'offline-meeting-turn';
  systemPrompt: string;
  context: string;
  maxOutputCharacters: number;
}

export type MeetingCompletionFunction = (
  request: MeetingCompletionRequest,
) => Promise<string>;

type MeetingContextSeed = Omit<BuildMeetingContextInput,
  'config' | 'status' | 'rollingRecap' | 'recentTurns' | 'currentInput'>;

export interface GenerateMeetingTurnInput {
  scene: MeetingScene;
  currentInput: string;
  context: MeetingContextSeed;
  completion?: MeetingCompletionFunction;
  locale?: string;
  requestMiniTheater?: boolean;
  turnId?: string;
  attempt?: number;
  now?: number;
}

export interface GenerateMeetingTurnResult {
  scene: MeetingScene;
  turn: MeetingTurn;
  context: MeetingContextBuildResult;
  rawText: string;
  source: MeetingGenerationSource;
  usedDemoFallback: boolean;
  providerError?: string;
}

export interface CreateMeetingSceneInput {
  id: string;
  presetSnapshot: MeetingPresetSnapshot;
  title?: string;
  premise: string;
  playerSupplement?: string;
  castIds: string[];
  origin?: MeetingSceneOrigin;
  now?: number;
}

const cloneStatus = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const stableHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const compactInput = (value: string) => Array.from(value.replace(/\u0000/gu, '').trim())
  .slice(0, 4_000).join('');

export const createMeetingScene = ({
  id,
  presetSnapshot,
  title,
  premise,
  playerSupplement = '',
  castIds,
  origin,
  now = Date.now(),
}: CreateMeetingSceneInput): MeetingScene => {
  const uniqueCastIds = [...new Set(castIds.map(value => value.trim()).filter(Boolean))];
  if (!id.trim()) throw new Error('Meeting scene id is required.');
  if (uniqueCastIds.length === 0) throw new Error('A meeting scene requires at least one cast member.');
  if (uniqueCastIds.length > 4) throw new Error('A meeting scene supports at most four cast members.');
  const supplement = compactInput(playerSupplement);
  const meetingConfig = normalizeMeetingConfig(presetSnapshot.meetingConfig);
  const normalizedPresetSnapshot = {
    ...cloneStatus(presetSnapshot),
    meetingConfig,
  };
  return {
    schemaVersion: MEETING_SCHEMA_VERSION,
    id: id.trim(),
    presetId: normalizedPresetSnapshot.sourcePresetId,
    presetSnapshot: normalizedPresetSnapshot,
    title: compactInput(title || normalizedPresetSnapshot.name),
    premise: compactInput(premise),
    playerSupplement: supplement,
    sceneSupplement: supplement,
    castIds: uniqueCastIds,
    ...(origin ? { origin: cloneStatus(origin) } : {}),
    state: 'active',
    status: createInitialMeetingStatus(meetingConfig, uniqueCastIds),
    rollingRecap: '',
    turns: [],
    memoryDrafts: [],
    revision: 0,
    createdAt: now,
    updatedAt: now,
  };
};

export const snapshotMeetingScene = (scene: MeetingScene): MeetingSceneSnapshot => ({
  sceneId: scene.id,
  revision: scene.revision,
  status: cloneStatus(scene.status),
  rollingRecap: scene.rollingRecap,
  turnCount: scene.turns.length,
});

export const meetingSceneMatchesSnapshot = (
  scene: MeetingScene,
  snapshot: MeetingSceneSnapshot,
) => scene.id === snapshot.sceneId
  && scene.revision === snapshot.revision
  && scene.turns.length === snapshot.turnCount;

const formatDirectorInstruction = (
  scene: MeetingScene,
  requestMiniTheater: boolean,
) => {
  const config = normalizeMeetingConfig(scene.presetSnapshot.meetingConfig);
  const sceneFields = config.statusFields.scene.map(field => `${field.key} (${field.label})`).join(', ') || 'none';
  const characterFields = config.statusFields.character.map(field => `${field.key} (${field.label})`).join(', ') || 'none';
  const theaterRequested = config.miniTheater.mode === 'everyTurn'
    || (config.miniTheater.mode === 'manual' && requestMiniTheater);
  return [
    'Direct one grounded shared scene. Treat supplied memories as evidence and never invent prior relationship events.',
    compileMeetingNarrativeInstruction(config.narrative),
    config.narrative.enforcement === 'strict'
      ? `PRESET FREE-TEXT (highest authorial priority outside the mechanically enforced strict fields):\n${scene.presetSnapshot.prompt || '(none)'}`
      : `PRESET FREE-TEXT (highest authorial priority):\n${scene.presetSnapshot.prompt || '(none)'}`,
    `Allowed scene status fields: ${sceneFields}.`,
    `Allowed character status fields: ${characterFields}.`,
    theaterRequested
      ? `Include miniTheater title/content. Theater direction: ${config.miniTheater.prompt}`
      : 'Omit miniTheater.',
    MEETING_RESPONSE_ENVELOPE_INSTRUCTION,
  ].filter(Boolean).join('\n\n');
};

export const createDemoMeetingDirectorResponse = ({
  scene,
  currentInput,
  locale = 'zh-CN',
  requestMiniTheater = false,
}: Pick<GenerateMeetingTurnInput, 'scene' | 'currentInput' | 'locale' | 'requestMiniTheater'>) => {
  const config = normalizeMeetingConfig(scene.presetSnapshot.meetingConfig);
  const participatingCastIds = scene.castIds.slice(0, 2);
  const chinese = locale.toLocaleLowerCase().startsWith('zh');
  const seed = stableHash(`${scene.id}:${scene.turns.length}:${currentInput}`);
  const zhNarration = ['风从两人之间轻轻穿过，眼前的片刻因此慢了下来。', '周围的声音退远了一点，这句话被认真地留在当下。', '光影在场景里缓缓移动，没有催促任何人。'];
  const enNarration = ['A soft breeze passes through the moment, slowing it down.', 'The surrounding noise recedes, leaving the words room to settle.', 'Light shifts quietly across the scene, asking nothing of either person.'];
  const blocks: Record<string, string>[] = [{
    kind: 'narration',
    text: (chinese ? zhNarration : enNarration)[seed % 3],
  }];
  const zhReplies = ['“我在听。我们可以慢慢来。”', '“嗯，我也在。那就从这里开始吧。”'];
  const enReplies = ['“I’m listening. We can take this slowly.”', '“I’m here too. Let’s begin from this moment.”'];
  participatingCastIds.forEach((characterId, index) => {
    blocks.push({
      kind: 'character',
      characterId,
      text: (chinese ? zhReplies : enReplies)[index],
    });
  });
  const sceneField = config.statusFields.scene[0];
  const characterField = config.statusFields.character[0];
  const statusUpdates: Record<string, unknown> = {
    scene: sceneField ? { [sceneField.key]: chinese ? '此刻' : 'the present moment' } : {},
    characters: characterField
      ? Object.fromEntries(participatingCastIds.map((characterId, index) => [
        characterId,
        { [characterField.key]: chinese ? (index === 0 ? '专注' : '在意') : (index === 0 ? 'attentive' : 'engaged') },
      ]))
      : {},
  };
  const theaterRequested = config.miniTheater.mode === 'everyTurn'
    || (config.miniTheater.mode === 'manual' && requestMiniTheater);
  const payload = {
    chapterTitle: chinese
      ? (scene.turns.length === 0 ? '赴约' : '靠近一点')
      : (scene.turns.length === 0 ? 'The Meeting' : 'A Little Closer'),
    leadQuote: chinese
      ? (seed % 2 === 0 ? '风把未说完的话，轻轻留在了此刻。' : '灯影慢下来，照见彼此靠近的心事。')
      : (seed % 2 === 0 ? 'The wind leaves unfinished words softly in this moment.' : 'Slower light reveals the quiet distance closing.'),
    blocks,
    statusUpdates,
    recap: chinese
      ? `玩家表达了“${compactInput(currentInput).slice(0, 80)}”，在场角色认真回应，场景仍在继续。`
      : `The player shared “${compactInput(currentInput).slice(0, 80)}”; the present characters responded attentively and the scene continues.`,
    ...(theaterRequested ? {
      miniTheater: {
        title: chinese ? '片刻' : 'A Small Moment',
        content: chinese ? '没有新的事件发生，只是这一秒被彼此认真看见。' : 'Nothing new is invented; this second is simply noticed together.',
      },
    } : {}),
  };
  return `<NANA_MEETING>${JSON.stringify(payload)}</NANA_MEETING>`;
};

export const commitParsedMeetingTurn = ({
  scene,
  parsed,
  currentInput,
  source,
  turnId,
  attempt = 1,
  now = Date.now(),
}: {
  scene: MeetingScene;
  parsed: MeetingParsedResponse;
  currentInput: string;
  source: MeetingGenerationSource;
  turnId: string;
  attempt?: number;
  now?: number;
}): { scene: MeetingScene; turn: MeetingTurn } => {
  const config = normalizeMeetingConfig(scene.presetSnapshot.meetingConfig);
  const statusBefore = cloneStatus(scene.status);
  const statusAfter = applyMeetingStatusUpdates(scene.status, parsed.statusUpdates, config, scene.castIds);
  const rollingRecap = parsed.rollingRecap || scene.rollingRecap;
  const turn: MeetingTurn = {
    schemaVersion: MEETING_SCHEMA_VERSION,
    id: turnId,
    sceneId: scene.id,
    index: scene.turns.length + 1,
    state: 'complete',
    input: compactInput(currentInput),
    ...(parsed.chapterTitle ? { chapterTitle: parsed.chapterTitle } : {}),
    ...(parsed.leadQuote ? { leadQuote: parsed.leadQuote } : {}),
    blocks: parsed.blocks,
    statusBefore,
    statusAfter: cloneStatus(statusAfter),
    rollingRecap,
    ...(parsed.miniTheater ? { miniTheater: parsed.miniTheater } : {}),
    generationSource: source,
    attempt: Math.max(1, Math.floor(attempt)),
    createdAt: now,
    completedAt: now,
  };
  return {
    turn,
    scene: {
      ...scene,
      status: statusAfter,
      rollingRecap,
      turns: [...scene.turns, turn],
      revision: scene.revision + 1,
      updatedAt: now,
    },
  };
};

export const createFailedMeetingTurn = ({
  scene,
  currentInput,
  turnId,
  attempt = 1,
  errorCode = 'generation-failed',
  now = Date.now(),
}: Pick<GenerateMeetingTurnInput, 'scene' | 'currentInput' | 'turnId' | 'attempt' | 'now'> & { errorCode?: string }): MeetingTurn => ({
  schemaVersion: MEETING_SCHEMA_VERSION,
  id: turnId || `meeting-turn:${scene.id}:${scene.turns.length + 1}`,
  sceneId: scene.id,
  index: scene.turns.length + 1,
  state: 'failed',
  input: compactInput(currentInput),
  blocks: [],
  statusBefore: cloneStatus(scene.status),
  statusAfter: cloneStatus(scene.status),
  rollingRecap: scene.rollingRecap,
  generationSource: 'remote',
  attempt: Math.max(1, Math.floor(attempt || 1)),
  errorCode,
  createdAt: now || Date.now(),
  completedAt: now || Date.now(),
});

export const prepareMeetingTurnRetry = (turn: MeetingTurn) => {
  if (turn.state !== 'failed') return undefined;
  return {
    currentInput: turn.input,
    turnId: turn.id,
    attempt: turn.attempt + 1,
  };
};

export const replaceFailedMeetingTurn = (
  scene: MeetingScene,
  failedTurnId: string,
  completedTurn: MeetingTurn,
) => {
  const index = scene.turns.findIndex(turn => turn.id === failedTurnId && turn.state === 'failed');
  if (index < 0) return scene;
  const turns = [...scene.turns];
  turns[index] = { ...completedTurn, id: failedTurnId, index: turns[index].index };
  return {
    ...scene,
    turns,
    status: cloneStatus(completedTurn.statusAfter),
    rollingRecap: completedTurn.rollingRecap,
    revision: scene.revision + 1,
    updatedAt: completedTurn.completedAt,
  };
};

export const generateMeetingTurn = async (
  input: GenerateMeetingTurnInput,
): Promise<GenerateMeetingTurnResult> => {
  const currentInput = compactInput(input.currentInput);
  if (!currentInput) throw new Error('Meeting turn input is required.');
  if (input.scene.state !== 'active') throw new Error('Only an active meeting scene can generate a turn.');
  const config = normalizeMeetingConfig(input.scene.presetSnapshot.meetingConfig);
  const context = buildMeetingContext({
    ...input.context,
    config,
    status: input.scene.status,
    rollingRecap: input.scene.rollingRecap,
    recentTurns: input.scene.turns.filter(turn => turn.state === 'complete'),
    currentInput,
  });
  const turnId = input.turnId
    || `meeting-turn:${input.scene.id}:${input.scene.turns.length + 1}:${stableHash(currentInput).toString(36)}`;
  const allowMiniTheater = config.miniTheater.mode === 'everyTurn'
    || (config.miniTheater.mode === 'manual' && Boolean(input.requestMiniTheater));
  const parseResponse = (text: string) => parseMeetingResponse(text, {
    config,
    castIds: input.scene.castIds,
    turnId,
    allowMiniTheater,
  });
  const systemPrompt = formatDirectorInstruction(input.scene, Boolean(input.requestMiniTheater));
  const maxOutputCharacters = meetingNarrativeMaxOutputCharacters(config.narrative);
  let rawText = '';
  let source: MeetingGenerationSource = 'remote';
  let providerError: string | undefined;
  if (input.completion) {
    try {
      rawText = await input.completion({
        purpose: 'offline-meeting-turn',
        systemPrompt,
        context: context.text,
        maxOutputCharacters,
      });
      if (!rawText.trim()) throw new Error('Meeting completion returned empty text.');
    } catch (error) {
      providerError = error instanceof Error ? error.message : 'Meeting provider failed.';
    }
  }
  if (!rawText.trim()) {
    source = 'demo';
    rawText = createDemoMeetingDirectorResponse(input);
  }
  let parsed = parseResponse(rawText);
  if (
    source === 'remote'
    && input.completion
    && config.narrative.enforcement === 'strict'
  ) {
    const firstViolations = validateMeetingNarrativeResponse(parsed, config.narrative);
    if (firstViolations.length > 0) {
      try {
        const revisedText = await input.completion({
          purpose: 'offline-meeting-turn',
          systemPrompt: [
            systemPrompt,
            formatMeetingNarrativeRevisionInstruction(firstViolations, config.narrative),
          ].join('\n\n'),
          context: context.text,
          maxOutputCharacters,
        });
        if (!revisedText.trim()) throw new Error('Meeting strict revision returned empty text.');
        rawText = revisedText;
        parsed = parseResponse(rawText);
        const remainingViolations = validateMeetingNarrativeResponse(parsed, config.narrative);
        if (remainingViolations.length > 0) {
          providerError = `Strict narrative validation failed after one revision: ${remainingViolations
            .map(violation => violation.code).join(', ')}.`;
        }
      } catch (error) {
        providerError = error instanceof Error
          ? `Strict narrative revision failed: ${error.message}`
          : 'Strict narrative revision failed.';
      }
      if (providerError) {
        source = 'demo';
        rawText = createDemoMeetingDirectorResponse(input);
        parsed = parseResponse(rawText);
      }
    }
  }
  if (parsed.blocks.length === 0) {
    providerError ||= 'Meeting completion did not contain a valid visible block.';
    source = 'demo';
    rawText = createDemoMeetingDirectorResponse(input);
    parsed = parseResponse(rawText);
  }
  parsed = applyMeetingNarrativePresentation(parsed, config.narrative);
  const committed = commitParsedMeetingTurn({
    scene: input.scene,
    parsed,
    currentInput,
    source,
    turnId,
    attempt: input.attempt,
    now: input.now,
  });
  return {
    ...committed,
    context,
    rawText,
    source,
    usedDemoFallback: source === 'demo',
    ...(providerError ? { providerError } : {}),
  };
};

export const meetingTurnVisibleText = (blocks: readonly MeetingBlock[]) => blocks
  .map(block => block.text.trim()).filter(Boolean).join('\n');

export const createMeetingMemoryDrafts = (
  scene: MeetingScene,
  { userId, now = Date.now() }: { userId?: string; now?: number } = {},
): MeetingMemoryDraft[] => {
  const completedTurns = scene.turns.filter(turn => turn.state === 'complete');
  const summary = scene.rollingRecap.trim()
    || completedTurns.slice(-3).flatMap(turn => turn.blocks.map(block => block.text.trim()))
      .filter(Boolean).join(' ').slice(0, 1_200);
  if (!summary) return [];
  const participants = [...new Set([...(userId ? [userId] : []), ...scene.castIds])];
  return scene.castIds.map(characterId => ({
    schemaVersion: MEETING_SCHEMA_VERSION,
    id: `meeting-memory:${scene.id}:${characterId}`,
    sceneId: scene.id,
    characterId,
    sourceTurnIds: completedTurns.map(turn => turn.id),
    participantIds: participants,
    title: scene.title,
    summary,
    occurredAt: scene.updatedAt,
    createdAt: now,
    state: 'draft',
    revision: 1,
  }));
};

export const completeMeetingScene = (
  scene: MeetingScene,
  options: { userId?: string; now?: number } = {},
): MeetingScene => {
  if (scene.state !== 'active') return scene;
  const now = options.now || Date.now();
  return {
    ...scene,
    state: 'completed',
    memoryDrafts: createMeetingMemoryDrafts(scene, { ...options, now }),
    revision: scene.revision + 1,
    updatedAt: now,
    completedAt: now,
  };
};
