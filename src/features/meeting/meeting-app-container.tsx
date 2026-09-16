import { useCallback, useEffect, useMemo, useState } from 'react';
import { createMeetingPresetSnapshot } from './domain/meeting-config';
import {
  completeMeetingScene,
  createFailedMeetingTurn,
  createMeetingScene,
  createMeetingMemoryDrafts,
  generateMeetingTurn,
  meetingTurnVisibleText,
} from './domain/meeting-generation';
import { MEETING_SCHEMA_VERSION, type MeetingMiniTheater, type MeetingScene } from './domain/meeting-types';
import { MeetingView, type MeetingCreateInput, type MeetingMemoryReviewInput, type MeetingModelAdapter, type MeetingPage } from './ui';
import {
  deleteMeetingScene,
  getMeetingScene,
  initializeMeetingRepository,
  listMeetingScenes,
  upsertMeetingScene,
} from '../../repositories/meetingRepository';
import { createRelationshipTrace, upsertRelationshipTrace } from '../../repositories/relationshipTraceRepository';
import { generateStructuredText } from '../../services/ai';
import { transitionConversationMeetingHandoff } from '../../services/conversationContinuityRuntime';
import { useNanaStore } from '../../stores/nanaStore';
import type { Preset, WorldBookEntry } from '../../types';
import { getMeetingCopy } from './meeting-copy';

const OPENING_INPUT = '__NANA_MEETING_OPENING__';

type MeetingSmokeScope = typeof globalThis & {
  __NANA_SMOKE_SEED_LONG_MEETING__?: (count?: number) => Promise<boolean>;
};

const presetPrompt = (preset: Preset) => [
  preset.sceneDescription,
  ...preset.main,
  ...preset.jailbreak,
  ...preset.authorsNote,
].map(value => value?.trim()).filter(Boolean).join('\n\n');

const sceneTitleFromPremise = (premise: string, fallback: string) => {
  const firstLine = premise.trim().split(/\r?\n/u)[0] || fallback;
  return Array.from(firstLine).slice(0, 22).join('');
};

const extractJsonObject = (
  rawText: string,
  missingMessage: string,
  invalidMessage: string,
): Record<string, unknown> => {
  const cleaned = rawText.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(missingMessage);
  const value = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(invalidMessage);
  return value as Record<string, unknown>;
};

const worldBookForMeeting = (entries: WorldBookEntry[]) => entries.map(entry => ({
  id: entry.id,
  title: entry.keys || 'World Book',
  content: entry.content,
  keywords: entry.keys.split(/[,，|]/u).map(value => value.trim()).filter(Boolean),
  ...(entry.characterId ? { characterIds: [entry.characterId] } : {}),
  enabled: true,
  alwaysInclude: entry.alwaysActive === true,
}));

export function MeetingAppContainer() {
  const storePage = useNanaStore(state => state.meetingPage);
  const storeSceneId = useNanaStore(state => state.activeMeetingSceneId);
  const handoffDraft = useNanaStore(state => state.pendingMeetingHandoffDraft);
  const characters = useNanaStore(state => state.characters);
  const offlinePresets = useNanaStore(state => state.offlinePresets);
  const activeOfflinePresetId = useNanaStore(state => state.activeOfflinePresetId);
  const myName = useNanaStore(state => state.myName);
  const myDesc = useNanaStore(state => state.myDesc);
  const worldBookEntries = useNanaStore(state => state.worldBookEntries);
  const relationshipTraces = useNanaStore(state => state.relationshipTraces);
  const apiUrl = useNanaStore(state => state.apiUrl);
  const apiKey = useNanaStore(state => state.apiKey);
  const selectedModel = useNanaStore(state => state.selectedModel);
  const language = useNanaStore(state => state.themeConfig.language);
  const copy = getMeetingCopy(language);
  const [scenes, setScenes] = useState<MeetingScene[]>([]);
  const [activeScene, setActiveScene] = useState<MeetingScene | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const page: MeetingPage = storePage === 'summary' ? 'review' : storePage;

  const refresh = useCallback(async (preferredSceneId?: string | null) => {
    await initializeMeetingRepository();
    const nextScenes = await listMeetingScenes({ archived: 'include' });
    setScenes(nextScenes);
    const targetId = preferredSceneId ?? useNanaStore.getState().activeMeetingSceneId;
    setActiveScene(targetId ? nextScenes.find(scene => scene.id === targetId) || null : null);
    return nextScenes;
  }, []);

  useEffect(() => {
    void refresh(storeSceneId).catch(reason => {
      setError(reason instanceof Error ? reason.message : copy.sceneReadFailed);
    });
  }, [copy.sceneReadFailed, refresh, storeSceneId]);

  const saveScene = useCallback(async (scene: MeetingScene) => {
    await upsertMeetingScene(scene);
    setScenes(current => [scene, ...current.filter(candidate => candidate.id !== scene.id)]
      .sort((left, right) => right.updatedAt - left.updatedAt));
    setActiveScene(scene);
    useNanaStore.setState({ activeMeetingSceneId: scene.id });
  }, []);

  useEffect(() => {
    if (process.env.EXPO_PUBLIC_NANA_SMOKE !== '1' || process.env.EXPO_OS !== 'web') return undefined;
    const scope = globalThis as MeetingSmokeScope;
    scope.__NANA_SMOKE_SEED_LONG_MEETING__ = async (requestedCount = 16) => {
      const scene = activeScene;
      const baseTurn = scene?.turns.at(-1);
      if (!scene || !baseTurn) return false;
      const total = Math.max(scene.turns.length, Math.min(40, Math.floor(requestedCount)));
      const additions = Array.from({ length: total - scene.turns.length }, (_, offset) => {
        const index = scene.turns.length + offset + 1;
        return {
          ...baseTurn,
          id: `smoke-meeting-turn:${scene.id}:${index}`,
          index,
          input: language === 'zh'
            ? `第 ${index} 幕，玩家沿着这段见面继续往前。`
            : `Act ${index}: the player continues through the meeting.`,
          chapterTitle: language === 'zh' ? `相处的第 ${index} 页` : `Page ${index} Together`,
          blocks: baseTurn.blocks.map((block, blockIndex) => ({
            ...block,
            id: `smoke-meeting-block:${scene.id}:${index}:${blockIndex}`,
            text: block.kind === 'narration'
              ? language === 'zh'
                ? `场景在第 ${index} 幕继续展开，光线与声音都留下真实而克制的变化。`
                : `The scene continues through act ${index}, with restrained changes in light and sound.`
              : language === 'zh' ? `${block.text}（第 ${index} 幕）` : `${block.text} (Act ${index})`,
          })),
        };
      });
      await saveScene({
        ...scene,
        turns: [...scene.turns, ...additions],
        revision: scene.revision + 1,
        updatedAt: Date.now(),
      });
      return true;
    };
    return () => {
      delete scope.__NANA_SMOKE_SEED_LONG_MEETING__;
    };
  }, [activeScene, language, saveScene]);

  const run = useCallback(async <T,>(operation: () => Promise<T>) => {
    setBusy(true);
    setError(null);
    try {
      return await operation();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : copy.operationFailed;
      setError(message);
      throw reason;
    } finally {
      setBusy(false);
    }
  }, [copy.operationFailed]);

  const modelCompletion = useMemo(() => apiKey.trim() ? async ({
    systemPrompt,
    context,
    maxOutputCharacters,
  }: {
    systemPrompt: string;
    context: string;
    maxOutputCharacters: number;
  }) => generateStructuredText({
    apiUrl,
    apiKey,
    selectedModel,
    systemPrompt,
    context,
    maxOutputCharacters,
  }) : undefined, [apiKey, apiUrl, selectedModel]);

  const contextSeed = useCallback((scene: MeetingScene) => ({
    presetPrompt: scene.presetSnapshot.prompt,
    userPersona: `${myName}: ${myDesc}`,
    premise: scene.premise,
    playerSupplement: scene.playerSupplement,
    cast: scene.castIds.flatMap(id => {
      const character = characters.find(candidate => candidate.id === id);
      return character ? [{ id: character.id, name: character.name, definition: character.desc }] : [];
    }),
    worldBookEntries: worldBookForMeeting(worldBookEntries),
    memories: relationshipTraces.map(trace => ({
      id: trace.id,
      characterId: trace.characterId,
      summary: trace.summary,
      occurredAt: trace.occurredAt,
      recallWeight: trace.recallWeight,
      remember: trace.remember,
      userVerified: trace.userVerified,
    })),
  }), [characters, myDesc, myName, relationshipTraces, worldBookEntries]);

  const generateAndSave = useCallback(async (
    scene: MeetingScene,
    input: string,
    options?: { turnId?: string; attempt?: number; requestMiniTheater?: boolean },
  ) => {
    const result = await generateMeetingTurn({
      scene,
      currentInput: input,
      context: contextSeed(scene),
      completion: modelCompletion,
      locale: language === 'zh' ? 'zh-CN' : 'en-US',
      requestMiniTheater: options?.requestMiniTheater,
      turnId: options?.turnId,
      attempt: options?.attempt,
    });
    if (modelCompletion && result.providerError) {
      const failedTurn = createFailedMeetingTurn({
        scene,
        currentInput: input,
        turnId: result.turn.id,
        attempt: options?.attempt || 1,
        errorCode: 'remote-generation-failed',
      });
      await saveScene({
        ...scene,
        turns: [...scene.turns, failedTurn],
        revision: scene.revision + 1,
        updatedAt: failedTurn.completedAt,
      });
      throw new Error(result.providerError);
    }
    await saveScene(result.scene);
    return result.scene;
  }, [contextSeed, language, modelCompletion, saveScene]);

  const createSceneAction = useCallback((input: MeetingCreateInput) => run(async () => {
    const castIds = [...new Set(input.castIds)];
    if (castIds.length < 1 || castIds.length > 4) throw new Error(copy.selectCastRange);
    if (!input.premise.trim()) throw new Error(copy.needPremise);
    const preset = offlinePresets.find(candidate => candidate.id === input.presetId)
      || offlinePresets.find(candidate => candidate.id === activeOfflinePresetId)
      || offlinePresets[0];
    if (!preset) throw new Error(copy.createOfflinePresetFirst);
    const now = Date.now();
    const scene = createMeetingScene({
      id: `meeting:${now}:${Math.random().toString(36).slice(2, 8)}`,
      presetSnapshot: createMeetingPresetSnapshot({
        sourcePresetId: preset.id,
        name: preset.name,
        prompt: presetPrompt(preset),
        meetingConfig: preset.meetingConfig,
      }),
      title: input.title?.trim() || sceneTitleFromPremise(input.premise, copy.meeting),
      premise: input.premise,
      playerSupplement: input.playerSupplement,
      castIds,
      origin: input.origin || { type: 'manual' },
      now,
    });
    await saveScene(scene);
    useNanaStore.setState(state => {
      const chatId = input.origin?.type === 'chatHandoff' ? input.origin.chatId : undefined;
      const continuity = chatId ? state.conversationContinuityByCharacter[chatId] : undefined;
      const updatedContinuity = chatId
        ? transitionConversationMeetingHandoff(continuity, 'started', { sceneId: scene.id })
        : undefined;
      return {
        activeMeetingSceneId: scene.id,
        meetingPage: 'scene',
        pendingMeetingHandoffDraft: null,
        ...(chatId && updatedContinuity ? {
          conversationContinuityByCharacter: {
            ...state.conversationContinuityByCharacter,
            [chatId]: updatedContinuity,
          },
        } : {}),
      };
    });
    const opened = await generateAndSave(scene, OPENING_INPUT);
    useNanaStore.setState({ activeMeetingSceneId: opened.id, meetingPage: 'scene' });
    return opened;
  }), [activeOfflinePresetId, copy, generateAndSave, offlinePresets, run, saveScene]);

  const sendTurn = useCallback((sceneId: string, input: string) => run(async () => {
    const scene = await getMeetingScene(sceneId);
    if (!scene) throw new Error(copy.sceneMissing);
    await generateAndSave(scene, input);
  }), [copy.sceneMissing, generateAndSave, run]);

  const editTurn = useCallback((sceneId: string, turnId: string, input: string) => run(async () => {
    const scene = await getMeetingScene(sceneId);
    const turnIndex = scene?.turns.findIndex(turn => turn.id === turnId) ?? -1;
    if (!scene || turnIndex < 0) throw new Error(copy.editTurnMissing);
    const target = scene.turns[turnIndex];
    if (target.input === OPENING_INPUT) throw new Error(copy.openingCannotEdit);
    const previousTurns = scene.turns.slice(0, turnIndex);
    const previous = previousTurns.at(-1);
    const base: MeetingScene = {
      ...scene,
      turns: previousTurns,
      status: target.statusBefore,
      rollingRecap: previous?.rollingRecap || '',
      revision: scene.revision + 1,
      updatedAt: Date.now(),
    };
    await generateAndSave(base, input, { turnId: target.id, attempt: target.attempt + 1 });
  }), [copy.editTurnMissing, copy.openingCannotEdit, generateAndSave, run]);

  const retryTurn = useCallback((sceneId: string, turnId: string) => run(async () => {
    const scene = await getMeetingScene(sceneId);
    const target = scene?.turns.at(-1);
    if (!scene || !target || target.id !== turnId) throw new Error(copy.latestRetryOnly);
    const previousTurns = scene.turns.slice(0, -1);
    const previous = previousTurns.at(-1);
    const base: MeetingScene = {
      ...scene,
      turns: previousTurns,
      status: target.statusBefore,
      rollingRecap: previous?.rollingRecap || '',
      revision: scene.revision + 1,
      updatedAt: Date.now(),
    };
    await generateAndSave(base, target.input, { turnId: target.id, attempt: target.attempt + 1 });
  }), [copy.latestRetryOnly, generateAndSave, run]);

  const deleteTurn = useCallback((sceneId: string, turnId: string) => run(async () => {
    const scene = await getMeetingScene(sceneId);
    const turnIndex = scene?.turns.findIndex(turn => turn.id === turnId) ?? -1;
    if (!scene || turnIndex < 0) throw new Error(copy.deleteTurnMissing);
    const target = scene.turns[turnIndex];
    if (target.input === OPENING_INPUT) throw new Error(copy.openingCannotDelete);
    const turns = scene.turns.slice(0, turnIndex);
    const previous = turns.at(-1);
    await saveScene({
      ...scene,
      turns,
      status: target.statusBefore,
      rollingRecap: previous?.rollingRecap || '',
      revision: scene.revision + 1,
      updatedAt: Date.now(),
    });
  }), [copy.deleteTurnMissing, copy.openingCannotDelete, run, saveScene]);

  const generateEndDrafts = useCallback(async (scene: MeetingScene) => {
    const localDrafts = createMeetingMemoryDrafts(scene, { userId: 'user' });
    if (!modelCompletion) return localDrafts;
    const cast = scene.castIds.flatMap(id => {
      const character = characters.find(candidate => candidate.id === id);
      return character ? [{ id, name: character.name, definition: character.desc }] : [];
    });
    const mainline = scene.turns.filter(turn => turn.state === 'complete').map(turn => [
      turn.input === OPENING_INPUT ? '[opening]' : `User: ${turn.input}`,
      meetingTurnVisibleText(turn.blocks),
    ].join('\n')).join('\n\n');
    const raw = await modelCompletion({
      systemPrompt: [
        'Summarize this completed offline meeting separately for every cast member.',
        'Return JSON only: {"summaries":[{"characterId":"...","summary":"...","tone":"..."}]}.',
        'Do not mention mini-theaters, HTML, CSS, templates, or any event absent from the canonical mainline.',
        'Every supplied characterId must appear exactly once.',
      ].join('\n'),
      context: [
        `Scene: ${scene.title}\nPremise: ${scene.premise}`,
        `User persona: ${myName}: ${myDesc}\nScene supplement: ${scene.playerSupplement}`,
        `Cast:\n${cast.map(character => `${character.id} / ${character.name}: ${character.definition}`).join('\n')}`,
        `Rolling recap: ${scene.rollingRecap}`,
        `Canonical mainline:\n${mainline.slice(-18_000)}`,
      ].join('\n\n'),
      maxOutputCharacters: 8_000,
    });
    const parsed = extractJsonObject(raw, copy.modelSummaryMissing, copy.modelSummaryInvalid);
    const summaries = Array.isArray(parsed.summaries) ? parsed.summaries : [];
    return localDrafts.map(draft => {
      const match = summaries.find(value => value && typeof value === 'object'
        && !Array.isArray(value)
        && (value as Record<string, unknown>).characterId === draft.characterId) as Record<string, unknown> | undefined;
      const summary = typeof match?.summary === 'string' ? match.summary.trim().slice(0, 2_000) : '';
      if (!summary) throw new Error(copy.missingCastSummary(draft.characterId));
      return {
        ...draft,
        summary,
        ...(typeof match?.tone === 'string' && match.tone.trim()
          ? { tone: match.tone.trim().slice(0, 120) }
          : {}),
      };
    });
  }, [characters, copy, modelCompletion, myDesc, myName]);

  const endScene = useCallback((sceneId: string) => run(async () => {
    const scene = await getMeetingScene(sceneId);
    if (!scene || scene.state !== 'active') throw new Error(copy.activeSceneOnly);
    const memoryDrafts = await generateEndDrafts(scene);
    const completed = {
      ...completeMeetingScene(scene, { userId: 'user' }),
      memoryDrafts,
    };
    await saveScene(completed);
    useNanaStore.setState({ meetingPage: 'summary' });
    return memoryDrafts;
  }), [copy.activeSceneOnly, generateEndDrafts, run, saveScene]);

  const confirmMemoryReviews = useCallback((sceneId: string, reviews: MeetingMemoryReviewInput[]) => run(async () => {
    const scene = await getMeetingScene(sceneId);
    if (!scene) throw new Error(copy.sceneMissing);
    const reviewByCharacter = new Map(reviews.map(review => [review.characterId, review]));
    let traces = useNanaStore.getState().relationshipTraces;
    for (const characterId of scene.castIds) {
      const review = reviewByCharacter.get(characterId);
      if (!review?.checked) continue;
      const summary = review.summary.trim();
      if (!summary) throw new Error(copy.selectedSummaryRequired);
      const trace = createRelationshipTrace({
        characterId,
        source: 'offlineScene',
        sourceEventId: scene.id,
        origin: {
          app: 'offlineMeeting',
          mode: 'offline',
          sessionId: scene.id,
          presetId: scene.presetSnapshot.sourcePresetId,
        },
        occurredAt: scene.completedAt || scene.updatedAt,
        participantIds: ['user', ...scene.castIds],
        title: scene.title,
        summary,
        remember: true,
        recallWeight: 0.82,
        state: 'digested',
        userVerified: true,
      });
      traces = upsertRelationshipTrace(traces, trace);
    }
    useNanaStore.setState({ relationshipTraces: traces });
    const memoryDrafts = scene.memoryDrafts.map(draft => {
      const review = reviewByCharacter.get(draft.characterId);
      return {
        ...draft,
        summary: review?.summary.trim() || draft.summary,
        state: review?.checked ? 'committed' as const : 'discarded' as const,
        revision: draft.revision + 1,
      };
    });
    await saveScene({ ...scene, memoryDrafts, revision: scene.revision + 1, updatedAt: Date.now() });
    useNanaStore.setState({ meetingPage: 'list', activeMeetingSceneId: null });
    setActiveScene(null);
  }), [copy.sceneMissing, copy.selectedSummaryRequired, run, saveScene]);

  const generateMiniTheater = useCallback((sceneId: string, turnId: string) => run(async () => {
    const scene = await getMeetingScene(sceneId);
    const turnIndex = scene?.turns.findIndex(turn => turn.id === turnId) ?? -1;
    if (!scene || turnIndex < 0) throw new Error(copy.miniTheaterTurnMissing);
    const config = scene.presetSnapshot.meetingConfig.miniTheater;
    if (config.mode !== 'manual') throw new Error(copy.manualMiniTheaterDisabled);
    const sourceTurns = scene.turns.slice(0, turnIndex + 1);
    let title = language === 'zh' ? '幕间片刻' : 'Between the Lines';
    let content = meetingTurnVisibleText(sourceTurns.at(-1)?.blocks || []).slice(0, 600);
    if (modelCompletion) {
      const raw = await modelCompletion({
        systemPrompt: `${config.prompt}\nReturn JSON only: {"title":"...","content":"..."}. This is a non-canonical aside. Do not add state updates or recap.`,
        context: sourceTurns.map(turn => [
          turn.input === OPENING_INPUT ? '[opening]' : `User: ${turn.input}`,
          meetingTurnVisibleText(turn.blocks),
        ].join('\n')).join('\n\n').slice(-12_000),
        maxOutputCharacters: 3_000,
      });
      const parsed = extractJsonObject(raw, copy.modelSummaryMissing, copy.modelSummaryInvalid);
      if (typeof parsed.title === 'string' && parsed.title.trim()) title = parsed.title.trim().slice(0, 120);
      if (typeof parsed.content === 'string' && parsed.content.trim()) content = parsed.content.trim().slice(0, 2_000);
    }
    const miniTheater: MeetingMiniTheater = {
      schemaVersion: MEETING_SCHEMA_VERSION,
      title,
      content: content || (language === 'zh' ? '这一秒被悄悄收藏起来。' : 'This second is quietly kept.'),
      html: config.html,
      css: config.css,
      height: config.height,
    };
    const turns = scene.turns.map((turn, index) => index === turnIndex ? { ...turn, miniTheater } : turn);
    await saveScene({ ...scene, turns, revision: scene.revision + 1, updatedAt: Date.now() });
  }), [copy, language, modelCompletion, run, saveScene]);

  const deleteSceneAction = useCallback((sceneId: string) => run(async () => {
    await deleteMeetingScene(sceneId);
    useNanaStore.setState({ meetingPage: 'list', activeMeetingSceneId: null });
    setActiveScene(null);
    await refresh(null);
  }), [refresh, run]);

  const adapter = useMemo<MeetingModelAdapter>(() => ({
    createScene: createSceneAction,
    sendTurn,
    editTurn,
    retryTurn,
    deleteTurn,
    endScene,
    confirmMemoryReviews,
    generateMiniTheater,
    deleteScene: deleteSceneAction,
  }), [confirmMemoryReviews, createSceneAction, deleteSceneAction, deleteTurn, editTurn, endScene, generateMiniTheater, retryTurn, sendTurn]);

  const characterOptions = useMemo(() => characters.map(character => ({
    id: character.id,
    name: character.name,
    avatar: character.avatar,
    description: character.desc,
  })), [characters]);
  const presetOptions = useMemo(() => [...offlinePresets]
    .sort((left, right) => Number(right.id === activeOfflinePresetId) - Number(left.id === activeOfflinePresetId))
    .map(preset => ({
      id: preset.id,
      name: preset.name,
      sceneDescription: preset.sceneDescription,
    })), [activeOfflinePresetId, offlinePresets]);

  return (
    <MeetingView
      page={page}
      onPageChange={nextPage => useNanaStore.setState({ meetingPage: nextPage === 'review' ? 'summary' : nextPage })}
      onBack={() => {
        const state = useNanaStore.getState();
        if (state.meetingPage === 'handoff') {
          useNanaStore.setState({ meetingPage: 'list', pendingMeetingHandoffDraft: null });
        }
        useNanaStore.getState().goBack();
      }}
      onClose={() => useNanaStore.getState().goBack()}
      scenes={scenes}
      activeScene={activeScene}
      onSelectScene={sceneId => {
        const selected = scenes.find(scene => scene.id === sceneId) || null;
        setActiveScene(selected);
        useNanaStore.setState({ activeMeetingSceneId: sceneId, meetingPage: 'scene' });
      }}
      characters={characterOptions}
      presets={presetOptions}
      userPersona={`${myName}: ${myDesc}`}
      userName={myName}
      handoffDraft={handoffDraft}
      memoryDrafts={activeScene?.memoryDrafts}
      modelAdapter={adapter}
      busy={busy}
      error={error}
    />
  );
}
