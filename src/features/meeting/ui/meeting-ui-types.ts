import type { MeetingMemoryDraft, MeetingScene, MeetingSceneOrigin } from '../domain/meeting-types';

export type MeetingPage = 'list' | 'create' | 'handoff' | 'scene' | 'review';

export interface MeetingCharacterOption {
  id: string;
  name: string;
  avatar?: string;
  description?: string;
}

export interface MeetingPresetOption {
  id: string;
  name: string;
  sceneDescription?: string;
}

export interface MeetingCreateInput {
  castIds: string[];
  premise: string;
  title?: string;
  playerSupplement: string;
  presetId: string;
  userPersona?: string;
  origin?: MeetingSceneOrigin;
}

export interface MeetingHandoffDraft {
  chatId: string;
  castIds: string[];
  title: string;
  premise: string;
  presetId: string;
  sourceMessageIds: number[];
  sourceTurnId?: string;
  sourceLabel: string;
  preparing?: boolean;
}

export interface MeetingMemoryReviewInput {
  draftId?: string;
  characterId: string;
  summary: string;
  checked: boolean;
}

export interface MeetingModelAdapter {
  createScene?: (input: MeetingCreateInput) => Promise<MeetingScene | void> | MeetingScene | void;
  sendTurn?: (sceneId: string, input: string) => Promise<void> | void;
  editTurn?: (sceneId: string, turnId: string, input: string) => Promise<void> | void;
  retryTurn?: (sceneId: string, turnId: string) => Promise<void> | void;
  generateMiniTheater?: (sceneId: string, turnId: string) => Promise<void> | void;
  deleteTurn?: (sceneId: string, turnId: string) => Promise<void> | void;
  endScene?: (sceneId: string) => Promise<MeetingMemoryDraft[] | void> | MeetingMemoryDraft[] | void;
  deleteScene?: (sceneId: string) => Promise<void> | void;
  confirmMemoryReviews?: (
    sceneId: string,
    reviews: MeetingMemoryReviewInput[],
  ) => Promise<void> | void;
}

export interface MeetingViewProps {
  page?: MeetingPage;
  initialPage?: MeetingPage;
  onPageChange?: (page: MeetingPage) => void;
  onBack?: () => void;
  onClose?: () => void;
  scenes: MeetingScene[];
  activeScene?: MeetingScene | null;
  onSelectScene?: (sceneId: string) => void;
  characters: MeetingCharacterOption[];
  presets: MeetingPresetOption[];
  userPersona?: string;
  userName?: string;
  handoffDraft?: MeetingHandoffDraft | null;
  memoryDrafts?: MeetingMemoryDraft[];
  modelAdapter?: MeetingModelAdapter;
  busy?: boolean;
  error?: string | null;
}
