import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useStableViewportMetrics } from '@/hooks/useStableViewportMetrics';
import type { MeetingMemoryDraft, MeetingScene } from '../domain/meeting-types';
import { MeetingCreateScreen } from './meeting-create-screen';
import { MeetingHandoffScreen } from './meeting-handoff-screen';
import { MeetingListScreen } from './meeting-list-screen';
import { MeetingReviewScreen } from './meeting-review-screen';
import { MeetingSceneScreen } from './meeting-scene-screen';
import { meetingColors } from './meeting-ui-kit';
import type {
  MeetingCreateInput,
  MeetingModelAdapter,
  MeetingPage,
  MeetingViewProps,
} from './meeting-ui-types';
import { useMeetingCopy } from './use-meeting-copy';

export function MeetingView({
  page,
  initialPage,
  onPageChange,
  onBack,
  onClose,
  scenes,
  activeScene,
  onSelectScene,
  characters,
  presets,
  userPersona,
  userName,
  handoffDraft,
  memoryDrafts,
  modelAdapter,
  busy,
  error,
}: MeetingViewProps) {
  const copy = useMeetingCopy();
  const { compact } = useStableViewportMetrics();
  const [localPage, setLocalPage] = useState<MeetingPage>(initialPage ?? (activeScene ? 'scene' : 'list'));
  const [selectedSceneId, setSelectedSceneId] = useState(activeScene?.id ?? '');
  const [localScene, setLocalScene] = useState<MeetingScene | null>(activeScene ?? null);
  const [localDrafts, setLocalDrafts] = useState<MeetingMemoryDraft[]>([]);
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const resolvedPage = page ?? localPage;
  const resolvedScene = activeScene
    ?? scenes.find(scene => scene.id === selectedSceneId)
    ?? (localScene?.id === selectedSceneId ? localScene : null);
  const isBusy = !!busy || localBusy;
  const visibleError = error ?? localError;

  useEffect(() => {
    if (activeScene?.id) {
      setSelectedSceneId(activeScene.id);
      setLocalScene(activeScene);
    }
  }, [activeScene]);

  const navigate = (nextPage: MeetingPage) => {
    if (page === undefined) setLocalPage(nextPage);
    onPageChange?.(nextPage);
  };

  const runAdapterAction = useCallback(async <T,>(action: () => Promise<T> | T): Promise<T | undefined> => {
    setLocalBusy(true);
    setLocalError(null);
    try {
      return await action();
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : copy.operationFailed);
      return undefined;
    } finally {
      setLocalBusy(false);
    }
  }, [copy.operationFailed]);

  const boundAdapter = useMemo<MeetingModelAdapter>(() => ({
    createScene: modelAdapter?.createScene,
    sendTurn: modelAdapter?.sendTurn
      ? (sceneId, input) => runAdapterAction(() => modelAdapter.sendTurn!(sceneId, input))
      : undefined,
    editTurn: modelAdapter?.editTurn
      ? (sceneId, turnId, input) => runAdapterAction(() => modelAdapter.editTurn!(sceneId, turnId, input))
      : undefined,
    retryTurn: modelAdapter?.retryTurn
      ? (sceneId, turnId) => runAdapterAction(() => modelAdapter.retryTurn!(sceneId, turnId))
      : undefined,
    generateMiniTheater: modelAdapter?.generateMiniTheater
      ? (sceneId, turnId) => runAdapterAction(() => modelAdapter.generateMiniTheater!(sceneId, turnId))
      : undefined,
    deleteTurn: modelAdapter?.deleteTurn
      ? (sceneId, turnId) => runAdapterAction(() => modelAdapter.deleteTurn!(sceneId, turnId))
      : undefined,
    endScene: modelAdapter?.endScene
      ? async (sceneId) => {
          const drafts = await runAdapterAction(() => modelAdapter.endScene!(sceneId));
          if (Array.isArray(drafts)) setLocalDrafts(drafts);
          return drafts;
        }
      : undefined,
    deleteScene: modelAdapter?.deleteScene
      ? sceneId => runAdapterAction(() => modelAdapter.deleteScene!(sceneId))
      : undefined,
    confirmMemoryReviews: modelAdapter?.confirmMemoryReviews
      ? (sceneId, reviews) => runAdapterAction(() => modelAdapter.confirmMemoryReviews!(sceneId, reviews))
      : undefined,
  }), [modelAdapter, runAdapterAction]);

  const openScene = (scene: MeetingScene) => {
    setSelectedSceneId(scene.id);
    onSelectScene?.(scene.id);
    navigate('scene');
  };

  const createScene = async (input: MeetingCreateInput) => {
    if (!modelAdapter?.createScene) return;
    const created = await runAdapterAction(() => modelAdapter.createScene!(input));
    if (created && typeof created === 'object' && 'id' in created) {
      setSelectedSceneId(created.id);
      setLocalScene(created);
      onSelectScene?.(created.id);
      navigate('scene');
    }
  };

  const requestDeleteScene = (scene: MeetingScene) => {
    if (!boundAdapter.deleteScene) return;
    const remove = async () => {
      await boundAdapter.deleteScene?.(scene.id);
      if (scene.id === resolvedScene?.id) {
        setSelectedSceneId('');
        setLocalScene(null);
        navigate('list');
      }
    };
    const message = copy.deleteMeetingBody(scene.title || copy.unnamedMeeting);
    if (process.env.EXPO_OS === 'web') {
      if (globalThis.confirm(`${copy.deleteMeetingTitle}\n\n${message}`)) void remove();
      return;
    }
    Alert.alert(copy.deleteMeetingTitle, message, [
      { text: copy.cancel, style: 'cancel' },
      { text: copy.delete, style: 'destructive', onPress: () => void remove() },
    ]);
  };

  const backFromList = onBack ?? onClose;
  let content;
  if (resolvedPage === 'handoff' && handoffDraft) {
    content = (
      <MeetingHandoffScreen
        draft={handoffDraft}
        characters={characters}
        presets={presets}
        userPersona={userPersona}
        compact={compact}
        busy={isBusy}
        error={visibleError}
        onBack={onBack ?? (() => navigate('list'))}
        onCreate={input => void createScene(input)}
      />
    );
  } else if (resolvedPage === 'create') {
    content = (
      <MeetingCreateScreen
        characters={characters}
        presets={presets}
        userPersona={userPersona}
        compact={compact}
        busy={isBusy}
        canCreate={!!modelAdapter?.createScene}
        error={visibleError}
        onBack={() => navigate('list')}
        onCreate={input => void createScene(input)}
      />
    );
  } else if ((resolvedPage === 'scene' || resolvedPage === 'review') && resolvedScene) {
    content = resolvedPage === 'review' ? (
      <MeetingReviewScreen
        scene={resolvedScene}
        drafts={memoryDrafts ?? (localDrafts.length ? localDrafts : resolvedScene.memoryDrafts)}
        characters={characters}
        compact={compact}
        busy={isBusy}
        error={visibleError}
        modelAdapter={boundAdapter}
        onBack={() => navigate('scene')}
        onConfirmed={() => navigate('list')}
      />
    ) : (
      <MeetingSceneScreen
        scene={resolvedScene}
        characters={characters}
        userName={userName}
        compact={compact}
        busy={isBusy}
        error={visibleError}
        modelAdapter={boundAdapter}
        onBack={() => navigate('list')}
        onReview={() => navigate('review')}
        onDeleteScene={boundAdapter.deleteScene ? () => requestDeleteScene(resolvedScene) : undefined}
      />
    );
  } else {
    content = (
      <MeetingListScreen
        scenes={scenes}
        characters={characters}
        compact={compact}
        onBack={backFromList}
        onCreate={() => navigate('create')}
        onOpenScene={openScene}
        onDeleteScene={boundAdapter.deleteScene ? requestDeleteScene : undefined}
      />
    );
  }

  return (
    <View style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: meetingColors.scrim }]} />
      {resolvedPage === 'scene' ? (
        <View style={{ flex: 1, minWidth: 0 }}>{content}</View>
      ) : (
        <KeyboardAvoidingView
          testID="meeting-page-keyboard-avoiding-content"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, minWidth: 0 }}
        >
          {content}
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

export const MeetingAppView = MeetingView;
