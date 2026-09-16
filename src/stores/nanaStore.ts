import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { replaceMacros } from '../utils/macros';
import {
  generateReply,
  generateProactiveReply,
  generateMomentComment,
  generateMomentPost,
  fetchModelList,
  generatePaymentReaction,
} from '../services/ai';
import { synthesizeSpeechAudio, transcribeAudioCapture } from '../services/audioAiRuntime';
import { analyzeDurableImage } from '../services/imageAiRuntime';
import { createLegacyProviderCapabilitySettings } from '../services/providerCapabilityRuntime';
import { resolveVoiceProvider } from '../services/voiceProviderRuntime';
import {
  appendCallCaptureResult,
  appendCallTranscriptLine,
  createCallOverlayState,
  createMockCaptureResult,
  createCharacterVoiceReplyDraft,
  createSpeechSynthesisPlan,
  createVoiceMessageDraftFromCapture,
  resolveSpeechToTextResult,
  resolveCharacterReplyType,
  type MediaCaptureResult,
} from '../services/mediaRuntime';
import { buildCallConversationChatHistory } from '../services/callConversationRuntime';
import { speakSpeechSynthesisPlan, stopSpeechSynthesis } from '../services/nativeSpeechRuntime';
import { toSpeakableText } from '../services/speakableText';
import { VOICE_CALL_TRANSCRIPTION_MIN_DURATION_MS } from '../services/voiceTranscriptionGuard';
import {
  playAudioUriOnce,
  stopOneShotAudioPlayback,
  stopSharedVoiceMessagePlayback,
} from '../services/nativeAudioPlaybackRuntime';
import { discardVoiceCapture, finalizeVoiceCapture } from '../services/nativeAudioRuntime';
import { redactSecrets } from '../services/secretStore';
import {
  beginChatRequest,
  cancelChatRequest,
  completeChatRequest,
  isCurrentChatRequest,
} from '../services/chatRequestCoordinator';
import {
  appendUserMessageToBurst,
  beginUserMessageBurst,
  cancelUserMessageBurst,
  collectUserMessageBurst,
  generateLocalSandboxReply,
  isCollectingUserMessageBurst,
  planChatReply,
  splitCharacterReplyIntoMessages,
  waitForCharacterFollowUp,
  waitForChatReplyPlan,
  type ChatGenerationSource,
} from '../services/chatRhythmRuntime';
import {
  planMessageDelivery,
  resetFailedMessageDelivery,
  transitionMessageDelivery,
} from '../services/messageDeliveryRuntime';
import {
  normalizeConversationContinuityMap,
  selectConversationContinuityFollowUp,
  transitionConversationMeetingHandoff,
  updateConversationContinuity,
} from '../services/conversationContinuityRuntime';
import {
  createLocalMeetingHandoffDraft,
  prepareMeetingHandoffDraft,
} from '../services/meetingHandoffRuntime';
import type { MeetingHandoffDraft } from '../features/meeting/ui/meeting-ui-types';
import { getMeetingCopy } from '../features/meeting/meeting-copy';
import {
  createInitialProactiveSchedule,
  createLocalProactiveMessage,
  normalizeProactiveChatSchedules,
  rescheduleAfterProactiveMessage,
  rescheduleProactiveAfterInteraction,
  selectDueProactiveCandidate,
  selectProactiveFocusEvent,
} from '../services/proactiveChatRuntime';
import type { RemoteProactiveEnvelope } from '../services/remoteProactiveRuntime';
import {
  createInitialMomentSchedule,
  createLocalMomentDraft,
  normalizeProactiveMomentSchedules,
  rescheduleAfterMomentPost,
  selectDueMomentCandidate,
  selectMomentFocusEvent,
} from '../services/momentsRuntime';
import {
  chooseCharacterStickerForReply,
  filterStickersForChat,
  normalizeStickerAssets,
} from '../services/stickerRuntime';
import {
  createLocalMomentReactionComment,
  planCharacterMomentReactions,
} from '../services/momentReactionRuntime';
import { deletePersistedMediaFile } from '../services/localMediaRepository';
import {
  normalizeCharacterMediaAssets,
  selectCharacterMediaAsset,
  type CharacterMediaAsset,
  type CharacterMediaIntent,
  type CharacterMediaSendRecord,
} from '../services/characterMediaRuntime';
import {
  DEFAULT_ONLINE_PRESET,
  DEFAULT_OFFLINE_PRESET,
  DEFAULT_THEME_CONFIG,
} from '../constants/defaults';
import { isWallpaperId } from '../services/theme';
import { normalizeMeetingConfig } from '../features/meeting/domain/meeting-config';
import {
  correctRelationshipTrace,
  createRelationshipTrace,
  normalizeRelationshipTraces,
  upsertRelationshipTrace,
} from '../repositories/relationshipTraceRepository';
import {
  createPayment,
  failPaymentReactionEntity,
  formatCnyMinor,
  legacyWalletBalanceToMinor,
  parsePaymentAmountToMinor,
  paymentMustRemainVisibleDuringChatClear,
  paymentFundsStateIsValid,
  paymentNeedsExpiry,
  paymentReactionIsDue,
  reconcilePaymentIntegrityEntity,
  reconcileExpiredPaymentEntity,
  reservePaymentFunds,
  resolvePaymentReactionEntity,
  schedulePaymentReaction,
  transitionPaymentEntity,
} from '../services/paymentRuntime';
import type {
  Message, MessageType, Character, Preset, WorldBookEntry, Moment,
  ChatHistory, PromptModalState, ThemeConfig,
  WeChatTab, WeChatPage, ChatPanel, IslandNotification,
  CallLog, CallOverlayState, RelationshipTrace,
  ChatReplyPreference, Payment, PaymentKind, PaymentStatus, ReplyMode,
  ProactiveChatSchedules, ConversationContinuityByCharacter,
  ProactiveMomentSchedules, ProactiveMomentsMode, ProactiveMessagingFrequency,
  StickerAsset, MomentComment,
} from '../types';

import { triggerHaptic } from '../utils/haptics';
import { suppressMemoryEvidenceForTrace } from '../utils/memory';
import {
  runtimeCallEnded,
  runtimeCallRecord,
  runtimeCallSummaryFallback,
  runtimeCallTypeLabel,
  runtimeCopyFor,
  runtimePaymentLabel,
  runtimePaymentSummary,
  type RuntimeCopy,
} from '../services/runtimeCopy';

// Store

const emptyCallOverlay: CallOverlayState = {
  show: false,
  type: 'voice',
  status: 'ended',
  direction: 'outgoing',
  avatar: '',
  name: '',
  interactionMode: 'voiceActivity',
  characterOutput: 'captionsOnly',
  speechPhase: 'idle',
  inputEpoch: 0,
  hasVoiceProfile: false,
  hasVideoPersona: false,
  transcript: [],
};

const withCallInteractionContract = (overlay: CallOverlayState): CallOverlayState => ({
  ...overlay,
  interactionMode: 'voiceActivity',
  characterOutput: overlay.hasVoiceProfile ? 'remoteVoice' : 'deviceVoice',
  speechPhase: overlay.speechPhase || 'idle',
  inputEpoch: overlay.inputEpoch || 0,
});

let lastMessageId = Date.now();
const nextMessageId = () => {
  lastMessageId = Math.max(lastMessageId + 1, Date.now());
  return lastMessageId;
};

const legacyReplyModeToPreference = (mode: unknown): ChatReplyPreference => {
  if (mode === 'text') return 'textOnly';
  if (mode === 'voice') return 'voicePreferred';
  return 'adaptive';
};

const preferenceToLegacyReplyMode = (preference: unknown): ReplyMode => {
  if (preference === 'textOnly') return 'text';
  if (preference === 'voicePreferred') return 'voice';
  return 'auto';
};

const characterReplyMode = (character?: Character): ReplyMode => (
  character?.chatReplyPreference
    ? preferenceToLegacyReplyMode(character.chatReplyPreference)
    : (character?.preferredReplyMode || 'auto')
);

const inferCharacterMediaIntent = (text: string): CharacterMediaIntent => {
  if (/(sad|upset|cry|hurt|难过|伤心|哭|安慰)/i.test(text)) return 'comfort';
  if (/(congrat|celebrat|happy birthday|恭喜|庆祝|生日快乐)/i.test(text)) return 'celebration';
  if (/(remember|memory|以前|记得|回忆)/i.test(text)) return 'memory';
  if (/(where|place|outside|这里|哪里|风景|地点)/i.test(text)) return 'location';
  if (/(wear|outfit|dress|穿|衣服|造型)/i.test(text)) return 'outfit';
  return 'dailyLife';
};

const normalizeCharacter = (value: unknown): unknown => {
  if (!isPersistedStateRecord(value)) return value;
  const preference = value.chatReplyPreference === 'adaptive'
    || value.chatReplyPreference === 'textOnly'
    || value.chatReplyPreference === 'voicePreferred'
    ? value.chatReplyPreference
    : legacyReplyModeToPreference(value.preferredReplyMode);
  return {
    ...value,
    chatReplyPreference: preference,
    preferredReplyMode: preferenceToLegacyReplyMode(preference),
    proactiveMessagingEnabled: value.proactiveMessagingFrequency === 'off'
      ? false
      : value.proactiveMessagingEnabled !== false,
    proactiveMessagingFrequency: value.proactiveMessagingFrequency === 'off'
      || value.proactiveMessagingFrequency === 'occasional'
      || value.proactiveMessagingFrequency === 'normal'
      || value.proactiveMessagingFrequency === 'frequent'
      ? value.proactiveMessagingFrequency
      : value.proactiveMessagingEnabled === false
        ? 'off'
        : 'normal',
    timeZone: typeof value.timeZone === 'string' && value.timeZone.trim()
      ? value.timeZone.trim()
      : undefined,
    proactiveMomentsMode: value.proactiveMomentsMode === 'off'
      || value.proactiveMomentsMode === 'normal'
      || value.proactiveMomentsMode === 'occasional'
      ? value.proactiveMomentsMode
      : 'occasional',
    autonomousImageSharingEnabled: value.autonomousImageSharingEnabled === true,
  };
};

const PAYMENT_STATUSES = new Set<PaymentStatus>([
  'sending', 'pending', 'completed', 'declined', 'expired', 'refunded', 'failed',
]);
const PAYMENT_KINDS = new Set<PaymentKind>(['transfer', 'redPacket']);
const PAYMENT_FUNDS_STATES = new Set(['held', 'captured', 'released']);
const PAYMENT_REACTION_STATES = new Set(['idle', 'scheduled', 'processing', 'resolved', 'failed']);

const normalizePayment = (value: unknown, now = Date.now()): Payment | null => {
  if (!isPersistedStateRecord(value)) return null;
  if (
    value.schemaVersion !== 1
    || typeof value.id !== 'string'
    || typeof value.chatId !== 'string'
    || !PAYMENT_KINDS.has(value.kind as PaymentKind)
    || (value.direction !== 'outgoing' && value.direction !== 'incoming')
    || typeof value.senderId !== 'string'
    || typeof value.recipientId !== 'string'
    || !Number.isSafeInteger(value.amountMinor)
    || (value.amountMinor as number) <= 0
    || (value.kind === 'redPacket' && (value.amountMinor as number) > 20_000)
    || (value.note !== undefined && (
      typeof value.note !== 'string' || Array.from(value.note).length > 32
    ))
    || value.currency !== 'CNY'
    || !PAYMENT_STATUSES.has(value.status as PaymentStatus)
    || !PAYMENT_FUNDS_STATES.has(value.fundsState as string)
    || typeof value.createdAt !== 'number'
    || !Number.isFinite(value.createdAt)
    || typeof value.updatedAt !== 'number'
    || !Number.isFinite(value.updatedAt)
    || typeof value.expiresAt !== 'number'
    || !Number.isFinite(value.expiresAt)
    || !PAYMENT_REACTION_STATES.has(value.reactionState as string)
    || !Number.isSafeInteger(value.reactionAttempts)
    || (value.reactionAttempts as number) < 0
  ) return null;

  const payment = value as unknown as Payment;
  if (!paymentFundsStateIsValid(payment)) {
    return {
      ...payment,
      failureCode: 'invalid',
      failureMessage: 'Payment state requires reconciliation.',
    };
  }
  if (payment.reactionState !== 'processing') return payment;
  return {
    ...payment,
    reactionState: 'failed',
    reactionDueAt: now,
    reactionError: 'Payment reaction was interrupted and is ready to retry.',
    updatedAt: now,
  };
};

const normalizePaymentsById = (value: unknown): Record<string, Payment> => {
  if (!isPersistedStateRecord(value)) return {};
  const result: Record<string, Payment> = {};
  for (const [id, candidate] of Object.entries(value)) {
    const payment = normalizePayment(candidate);
    if (payment && payment.id === id) result[id] = payment;
  }
  return result;
};

const paymentLabel = (kind: PaymentKind, language?: string) => (
  runtimePaymentLabel(runtimeCopyFor(language), kind)
);

const paymentSummary = (payment: Payment, characterName: string, language?: string) => (
  runtimePaymentSummary(runtimeCopyFor(language), payment, characterName)
);

const createPaymentChatMessage = (
  payment: Payment,
  avatar: string,
  messageId = nextMessageId(),
): Message => ({
  id: messageId,
  sender: 'user',
  text: '',
  time: new Date(payment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  avatar,
  type: 'payment',
  paymentId: payment.id,
});

const paymentWakeupTimers = new Map<string, ReturnType<typeof setTimeout>>();
let activeCallVoiceRequestController: AbortController | null = null;
let activeVoicePreviewController: AbortController | null = null;

const cancelActiveCallVoiceRequest = () => {
  activeCallVoiceRequestController?.abort();
  activeCallVoiceRequestController = null;
};

const cancelActiveVoicePreview = () => {
  activeVoicePreviewController?.abort();
  activeVoicePreviewController = null;
};

const schedulePaymentReconcileAt = (
  paymentId: string,
  reason: 'reaction' | 'expiry',
  wakeAt: number | undefined,
) => {
  if (typeof wakeAt !== 'number' || !Number.isFinite(wakeAt)) return;
  const key = `${paymentId}:${reason}:${wakeAt}`;
  if (paymentWakeupTimers.has(key)) return;
  const delay = Math.max(0, Math.min(2_147_483_647, wakeAt - Date.now()));
  const timer = setTimeout(() => {
    paymentWakeupTimers.delete(key);
    void useNanaStore.getState().reconcilePayments();
  }, delay);
  paymentWakeupTimers.set(key, timer);
};

const unreadAfterRemoteEvent = (state: NanaStore, chatId: string) => (
  state.activeApp === 'wechat' && state.activeChatId === chatId && state.weChatPage === 'chat'
    ? 0
    : (state.unreadCounts[chatId] || 0) + 1
);

interface MessageDeliveryTimer {
  chatId: string;
  messageId: number;
  timer: ReturnType<typeof setTimeout>;
}

const messageDeliveryTimers = new Map<string, MessageDeliveryTimer>();

const updateMessageDeliveryStatus = (
  chatId: string,
  messageIds: readonly number[],
  status: Message['deliveryStatus'],
  now = Date.now(),
  failureMessage?: string,
) => {
  if (!status || messageIds.length === 0) return;
  const targetIds = new Set(messageIds);
  useNanaStore.setState(state => {
    const current = state.chatHistory[chatId] || [];
    let changed = false;
    const next = current.map(message => {
      if (!targetIds.has(message.id)) return message;
      const transitioned = transitionMessageDelivery(message, status, now, failureMessage);
      if (transitioned !== message) changed = true;
      return transitioned;
    });
    return changed
      ? { chatHistory: { ...state.chatHistory, [chatId]: next } }
      : {};
  });
};

const cancelMessageDeliveryTimers = (
  chatId: string,
  messageIds?: readonly number[],
) => {
  const targetIds = messageIds ? new Set(messageIds) : null;
  for (const [key, scheduled] of messageDeliveryTimers) {
    if (scheduled.chatId !== chatId) continue;
    if (targetIds && !targetIds.has(scheduled.messageId)) continue;
    clearTimeout(scheduled.timer);
    messageDeliveryTimers.delete(key);
  }
};

const scheduleMessageDeliveryTransition = (
  chatId: string,
  messageId: number,
  status: 'sent' | 'delivered',
  transitionAt: number,
) => {
  const key = `${chatId}:${messageId}:${status}`;
  const existing = messageDeliveryTimers.get(key);
  if (existing) clearTimeout(existing.timer);
  const delay = Math.max(0, Math.min(2_147_483_647, transitionAt - Date.now()));
  const timer = setTimeout(() => {
    messageDeliveryTimers.delete(key);
    updateMessageDeliveryStatus(chatId, [messageId], status, Date.now());
  }, delay);
  messageDeliveryTimers.set(key, { chatId, messageId, timer });
};

const scheduleOutgoingMessageDelivery = (
  chatId: string,
  characterId: string,
  message: Message,
  fast: boolean,
) => {
  const attemptedAt = message.deliveryAttemptedAt || message.createdAt || Date.now();
  const plan = planMessageDelivery({
    characterId,
    messageId: message.id,
    messageText: message.transcript || message.text,
    attemptedAt,
    fast,
  });
  if (fast) {
    updateMessageDeliveryStatus(chatId, [message.id], 'sent', plan.sentAt);
    updateMessageDeliveryStatus(chatId, [message.id], 'delivered', plan.deliveredAt);
    return plan;
  }
  scheduleMessageDeliveryTransition(chatId, message.id, 'sent', plan.sentAt);
  scheduleMessageDeliveryTransition(chatId, message.id, 'delivered', plan.deliveredAt);
  return plan;
};

const messageIdsForTurn = (chatId: string, turnId: string) => (
  (useNanaStore.getState().chatHistory[chatId] || [])
    .filter(message => message.sender === 'user' && message.turnId === turnId)
    .map(message => message.id)
);

const waitForOutgoingTurnReadWindow = async (
  chatId: string,
  characterId: string,
  turnId: string,
  fast: boolean,
) => {
  const now = Date.now();
  const messages = (useNanaStore.getState().chatHistory[chatId] || [])
    .filter(message => message.sender === 'user' && message.turnId === turnId);
  const readNotBefore = messages.reduce((latest, message) => {
    const attemptedAt = message.deliveryAttemptedAt || message.createdAt || now;
    const plan = planMessageDelivery({
      characterId,
      messageId: message.id,
      messageText: message.transcript || message.text,
      attemptedAt,
      fast,
    });
    return Math.max(latest, plan.readNotBefore);
  }, now);
  const delay = Math.max(0, readNotBefore - Date.now());
  if (delay > 0) await new Promise<void>(resolve => setTimeout(resolve, delay));
};

const transitionOutgoingTurn = (
  chatId: string,
  turnId: string,
  status: 'read' | 'failed',
  failureMessage?: string,
) => {
  const messageIds = messageIdsForTurn(chatId, turnId);
  cancelMessageDeliveryTimers(chatId, messageIds);
  updateMessageDeliveryStatus(chatId, messageIds, status, Date.now(), failureMessage);
};

let proactiveHeartbeatInFlight = false;
let proactiveMomentHeartbeatInFlight = false;
const activeMomentReactionIds = new Set<string>();

export interface SendChatMessageOptions {
  textOverride?: string;
  skipUserAppend?: boolean;
  skipDeliverySchedule?: boolean;
  sourceMessageId?: number;
  targetChatId?: string;
  retryMessageIds?: number[];
  turnIdOverride?: string;
  stickerId?: string;
}

export interface PaymentTransitionMeta {
  now?: number;
  failureCode?: Payment['failureCode'];
  failureMessage?: string;
}

interface AppReturnTarget {
  activeApp: 'wechat';
  weChatTab: WeChatTab;
  weChatPage: WeChatPage;
  activeChatId: string | null;
  activeProfileId: string | null;
}

const formatCallDuration = (durationSec: number) => {
  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const callLogSummary = (overlay: CallOverlayState, durationSec: number, copy: RuntimeCopy) => {
  const spokenLines = overlay.transcript
    .filter(line => line.text.trim())
    .slice(-4)
    .map(line => `${line.speaker === 'user' ? copy.fallbackUser : overlay.name}: ${line.text}`)
    .join(' / ');
  return spokenLines || runtimeCallSummaryFallback(
    copy,
    overlay.name,
    overlay.type,
    formatCallDuration(durationSec),
  );
};

const createCallLogFromOverlay = (
  overlay: CallOverlayState,
  status: CallLog['status'],
  copy: RuntimeCopy,
  endedAt = Date.now(),
): CallLog | null => {
  if (!overlay.startedAt) return null;
  const connectedAt = overlay.connectedAt || overlay.startedAt;
  const durationSec = status === 'completed'
    ? Math.max(0, Math.round((endedAt - connectedAt) / 1000))
    : 0;

  return {
    id: `call-${endedAt}-${Math.round(Math.random() * 10000)}`,
    characterId: overlay.characterId,
    characterName: overlay.name || copy.fallbackCharacter,
    avatar: typeof overlay.avatar === 'string' ? overlay.avatar : undefined,
    type: overlay.type,
    direction: overlay.direction,
    status,
    startedAt: overlay.startedAt,
    endedAt,
    durationSec,
    transcript: overlay.transcript,
    summary: callLogSummary(overlay, durationSec, copy),
  };
};

export interface NanaStore {
  // Persisted
  selectedModel: string;
  myDesc: string;
  apiUrl: string;
  apiKey: string;
  myAvatar: string;
  myName: string;
  walletBalanceMinor: number;
  walletBalance: string;
  paymentsById: Record<string, Payment>;
  momentsBg: string;
  friends: string[];
  characters: Character[];
  savedAvatars: string[];
  chatHistory: ChatHistory;
  momentsList: Moment[];
  stickers: StickerAsset[];
  characterMediaAssets: CharacterMediaAsset[];
  characterMediaSendHistory: CharacterMediaSendRecord[];
  themeConfig: ThemeConfig;
  worldBookEntries: WorldBookEntry[];
  onlinePresets: Preset[];
  activeOnlinePresetId: string;
  offlinePresets: Preset[];
  activeOfflinePresetId: string;
  callLogs: CallLog[];
  relationshipTraces: RelationshipTrace[];
  proactiveChatSchedules: ProactiveChatSchedules;
  proactiveMomentSchedules: ProactiveMomentSchedules;
  proactiveNotificationsEnabled: boolean;
  conversationContinuityByCharacter: ConversationContinuityByCharacter;

  // Persisted: Memory & Voice
  memoryWindowSize: number;
  showMemoryDebug: boolean;
  autoTTS: boolean;
  speechLanguage: string;
  voiceProviderEnabled: boolean;
  voiceApiUrl: string;
  voiceApiKey: string;
  voiceSttModel: string;
  voiceTtsModel: string;
  lastForwardedMsgId: Record<string, number>;
  unreadCounts: Record<string, number>;

  // Transient: App shell
  activeApp: string | null;
  appReturnTarget: AppReturnTarget | null;
  isGenerating: boolean;
  pendingChatRequests: Record<string, string>;
  pendingPaymentReactions: Record<string, string>;
  lastUserMessage: string;
  blockedUsers: string[];
  islandNotification: IslandNotification | null;
  promptModal: PromptModalState;
  isEditingBalance: boolean;
  tempBalance: string;

  // Transient: Preset view
  presetView: string;
  presetMode: string;
  editingPreset: Preset | null;

  // Transient: Meeting navigation. Scene/turn data stays in its repository.
  meetingPage: 'list' | 'create' | 'handoff' | 'scene' | 'summary';
  activeMeetingSceneId: string | null;
  pendingMeetingHandoffDraft: MeetingHandoffDraft | null;

  // Transient: WeChat navigation
  weChatTab: WeChatTab;
  weChatPage: WeChatPage;
  activeChatId: string | null;
  activeProfileId: string | null;
  chatPanel: ChatPanel;
  showAddFriend: boolean;
  searchQuery: string;
  showComposeMoment: boolean;
  momentText: string;
  momentImageUrl: string;
  stickerManagerCharacterId: string | null;
  pendingMomentCharacterIds: string[];
  chatInput: string;
  callOverlay: CallOverlayState;

  // Transient: Character editor
  editingCharId: string | null;
  characterEditorOpen: boolean;
  newCharName: string;
  newCharAvatar: string;
  newCharDesc: string;
  newCharGender: string;
  newCharAge: string;
  newCharPreferredReplyMode: 'auto' | 'text' | 'voice';
  newCharSupportsVoiceReply: boolean;
  newCharVoiceProfileId: string;
  newCharSupportsVideoPersona: boolean;
  newCharVideoPersonaAsset: string;

  // Transient: World Book editor
  worldBookView: 'list' | 'edit' | 'chardetail';
  worldBookTab: 'global' | 'local';
  worldBookCharId: string | null;
  editingEntryId: string | null;
  editKeys: string;
  editContent: string;
  editCharId: string;
  editAlwaysActive: boolean;

  // Transient: Payment
  paymentModal: { type: 'transfer' | 'redpacket' | 'none' };
  paymentAmount: string;
  paymentNote: string;

  // Transient: Temp form state
  tempApiUrl: string;
  tempApiKey: string;
  tempVoiceApiUrl: string;
  tempVoiceApiKey: string;
  tempVoiceSttModel: string;
  tempVoiceTtsModel: string;
  tempMyName: string;
  tempMyAvatar: string;
  tempMyDesc: string;

  // Transient: Chat selection mode
  selectMode: boolean;
  selectedMsgIds: number[];
  selectTargetCharId: string | null;

  // Transient: Memory debug
  lastLoreCount: number;

  // Transient: Models
  models: string[];
  isLoadingModels: boolean;

  // Actions
  setActiveApp: (app: string | null) => void;
  openMeetingHandoff: (chatId: string, mode?: 'automatic' | 'manual') => Promise<void>;
  dismissMeetingHandoff: (characterId: string) => void;
  goBack: () => boolean;
  setWalletBalance: (value: string) => boolean;
  setCharacterProactiveMessagingEnabled: (characterId: string, enabled: boolean) => void;
  setCharacterProactiveMessagingFrequency: (
    characterId: string,
    frequency: ProactiveMessagingFrequency,
  ) => void;
  setCharacterProactiveMomentsMode: (characterId: string, mode: ProactiveMomentsMode) => void;
  setCharacterTimeZone: (characterId: string, timeZone?: string) => void;
  setMomentsCover: (uri: string) => void;
  resetMomentsCover: () => void;
  saveUserIdentity: (input: { name: string; avatar: string; description: string }) => void;
  setCharacterAutonomousImageSharingEnabled: (characterId: string, enabled: boolean) => void;
  addCharacterMediaAsset: (characterId: string, uri: string) => void;
  publishMoment: (draft: { text: string; images: string[] }) => string | null;
  runCharacterMomentReactions: (momentId: string) => Promise<void>;
  toggleMomentLike: (momentId: string) => void;
  addMomentComment: (momentId: string, text: string, replyToCommentId?: string) => Promise<void>;
  addStickers: (stickers: StickerAsset[]) => void;
  updateSticker: (sticker: StickerAsset) => void;
  removeSticker: (stickerId: string) => void;
  sendSticker: (stickerId: string) => Promise<void>;
  clearChat: (chatId: string) => void;
  correctRelationshipMemory: (traceId: string, summary: string) => boolean;
  sendChatMessage: (type?: MessageType, amount?: string, note?: string, mediaCapture?: MediaCaptureResult, options?: SendChatMessageOptions) => Promise<void>;
  sendPayment: (input: { chatId: string; kind: PaymentKind; amountMinor: number; note?: string }) => Promise<string>;
  transitionPayment: (id: string, next: PaymentStatus, meta?: PaymentTransitionMeta) => boolean;
  retryPayment: (id: string) => Promise<void>;
  reconcilePayments: (now?: number) => Promise<void>;
  reconcileChatDeliveryStates: (now?: number) => void;
  runProactiveChatHeartbeat: (now?: number) => Promise<void>;
  receiveRemoteProactiveMessage: (
    envelope: RemoteProactiveEnvelope,
  ) => 'committed' | 'duplicate' | 'rejected';
  runProactiveMomentsHeartbeat: (now?: number) => Promise<void>;
  retryChatMessage: (errorMessageId: number) => Promise<void>;
  startOutgoingCall: (type: 'voice' | 'video') => void;
  startIncomingCall: (type: 'voice' | 'video', characterId: string) => void;
  answerCall: () => void;
  invalidateActiveCallVoiceInput: (startedAt?: number) => void;
  endActiveCall: (status?: CallLog['status']) => void;
  sendCallSpeech: (capture: MediaCaptureResult) => Promise<void>;
  previewCharacterVoice: (input?: {
    characterId?: string;
    characterName?: string;
    voiceProfileId?: string;
  }) => Promise<boolean>;
  doFetchModels: (url: string, key: string) => Promise<void>;
  syncTempState: () => void;
}

export const NANA_PERSIST_VERSION = 15;

type PersistedStateRecord = Record<string, unknown>;

const isPersistedStateRecord = (value: unknown): value is PersistedStateRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const normalizeMoment = (value: unknown): Moment | null => {
  if (!isPersistedStateRecord(value)) return null;
  if (
    typeof value.id !== 'string'
    || typeof value.authorId !== 'string'
    || typeof value.authorName !== 'string'
    || typeof value.avatar !== 'string'
    || typeof value.text !== 'string'
    || !Array.isArray(value.images)
    || typeof value.timestamp !== 'number'
    || !Number.isFinite(value.timestamp)
  ) return null;
  const likes = Array.isArray(value.likes)
    ? value.likes.flatMap(candidate => {
        if (!isPersistedStateRecord(candidate)) return [];
        if (
          typeof candidate.authorId !== 'string'
          || typeof candidate.authorName !== 'string'
          || typeof candidate.avatar !== 'string'
          || typeof candidate.timestamp !== 'number'
        ) return [];
        return [{
          authorId: candidate.authorId,
          authorName: candidate.authorName,
          avatar: candidate.avatar,
          timestamp: candidate.timestamp,
        }];
      })
    : [];
  const comments = Array.isArray(value.comments)
    ? value.comments.flatMap(candidate => {
        if (!isPersistedStateRecord(candidate)) return [];
        if (
          typeof candidate.id !== 'string'
          || typeof candidate.authorId !== 'string'
          || typeof candidate.authorName !== 'string'
          || typeof candidate.avatar !== 'string'
          || typeof candidate.text !== 'string'
          || typeof candidate.timestamp !== 'number'
        ) return [];
        return [{
          id: candidate.id,
          authorId: candidate.authorId,
          authorName: candidate.authorName,
          avatar: candidate.avatar,
          text: candidate.text,
          timestamp: candidate.timestamp,
          ...(typeof candidate.replyToCommentId === 'string'
            ? { replyToCommentId: candidate.replyToCommentId }
            : {}),
          ...(typeof candidate.replyToAuthorName === 'string'
            ? { replyToAuthorName: candidate.replyToAuthorName }
            : {}),
        }];
      })
    : [];
  return {
    id: value.id,
    authorId: value.authorId,
    authorName: value.authorName,
    avatar: value.avatar,
    text: value.text.slice(0, 2_000),
    images: value.images.filter((uri): uri is string => typeof uri === 'string').slice(0, 9),
    timestamp: value.timestamp,
    likes,
    comments,
    generationSource: value.generationSource === 'characterRemote'
      || value.generationSource === 'characterLocal'
      ? value.generationSource
      : value.authorId === 'me' || value.authorId === 'user' ? 'user' : 'characterLocal',
    ...(typeof value.focusTraceId === 'string' ? { focusTraceId: value.focusTraceId } : {}),
  };
};

const normalizeMoments = (value: unknown): Moment[] => (
  Array.isArray(value) ? value.flatMap(candidate => {
    const normalized = normalizeMoment(candidate);
    return normalized ? [normalized] : [];
  }).slice(0, 500) : []
);

const normalizeThemeConfig = (value: unknown): ThemeConfig => {
  const config = isPersistedStateRecord(value) ? value : {};
  const backgroundImage = typeof config.backgroundImage === 'string'
    ? config.backgroundImage
    : DEFAULT_THEME_CONFIG.backgroundImage;
  const legacyWallpaperId = backgroundImage ? 'custom' : 'system';

  return {
    themeName: typeof config.themeName === 'string'
      ? config.themeName
      : DEFAULT_THEME_CONFIG.themeName,
    wallpaperId: isWallpaperId(config.wallpaperId)
      ? config.wallpaperId
      : legacyWallpaperId,
    backgroundImage,
    fontFamily: typeof config.fontFamily === 'string'
      ? config.fontFamily
      : DEFAULT_THEME_CONFIG.fontFamily,
    primaryColor: typeof config.primaryColor === 'string'
      ? config.primaryColor
      : DEFAULT_THEME_CONFIG.primaryColor,
    customThemeColor: typeof config.customThemeColor === 'string'
      ? config.customThemeColor
      : DEFAULT_THEME_CONFIG.customThemeColor,
    customTextColor: typeof config.customTextColor === 'string'
      ? config.customTextColor
      : DEFAULT_THEME_CONFIG.customTextColor,
    language: config.language === 'zh' ? 'zh' : 'en',
    // The original Nana icon/chrome variants are no longer user-facing.
    // Normalize legacy persisted selections so existing installs cannot become
    // stranded on a hidden theme.
    iconStyle: 'neumorphic-v1',
    chromeStyle: 'neumorphic-v1',
  };
};

const normalizePresetList = (
  value: unknown,
  sceneMode: 'online' | 'offline',
): Preset[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate): Preset[] => {
    if (!isPersistedStateRecord(candidate)) return [];
    if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string') return [];
    const normalizePromptList = (promptValue: unknown) => (
      Array.isArray(promptValue)
        ? promptValue.filter((entry): entry is string => typeof entry === 'string').slice(0, 16)
        : []
    );
    return [{
      id: candidate.id,
      name: candidate.name.slice(0, 120),
      sceneMode,
      sceneDescription: typeof candidate.sceneDescription === 'string'
        ? candidate.sceneDescription.slice(0, 4_000)
        : '',
      main: normalizePromptList(candidate.main),
      jailbreak: normalizePromptList(candidate.jailbreak),
      authorsNote: normalizePromptList(candidate.authorsNote),
      authorsNoteDepth: typeof candidate.authorsNoteDepth === 'number'
        && Number.isFinite(candidate.authorsNoteDepth)
        ? Math.max(0, Math.min(64, Math.floor(candidate.authorsNoteDepth)))
        : 0,
      ...(sceneMode === 'offline'
        ? { meetingConfig: normalizeMeetingConfig(candidate.meetingConfig) }
        : {}),
    }];
  });
};

export function migrateNanaPersistedState(persistedState: unknown): PersistedStateRecord {
  const redacted = redactSecrets(persistedState);
  const state = isPersistedStateRecord(redacted) ? redacted : {};
  const walletBalanceMinor = typeof state.walletBalanceMinor === 'number'
    && Number.isSafeInteger(state.walletBalanceMinor)
    && state.walletBalanceMinor >= 0
    ? state.walletBalanceMinor
    : legacyWalletBalanceToMinor(state.walletBalance, 888_800);
  return {
    ...state,
    walletBalanceMinor,
    walletBalance: formatCnyMinor(walletBalanceMinor),
    paymentsById: normalizePaymentsById(state.paymentsById),
    momentsBg: typeof state.momentsBg === 'string'
      && state.momentsBg !== 'https://images.unsplash.com/photo-1707343843437-caacff5cfa74?q=80&w=600'
      ? state.momentsBg
      : '',
    ...(Array.isArray(state.characters)
      ? { characters: state.characters.map(normalizeCharacter) }
      : {}),
    ...(Array.isArray(state.onlinePresets)
      ? { onlinePresets: normalizePresetList(state.onlinePresets, 'online') }
      : {}),
    ...(Array.isArray(state.offlinePresets)
      ? { offlinePresets: normalizePresetList(state.offlinePresets, 'offline') }
      : {}),
    momentsList: normalizeMoments(state.momentsList),
    stickers: normalizeStickerAssets(state.stickers),
    characterMediaAssets: normalizeCharacterMediaAssets(state.characterMediaAssets),
    characterMediaSendHistory: Array.isArray(state.characterMediaSendHistory)
      ? state.characterMediaSendHistory.flatMap(candidate => {
          if (
            !isPersistedStateRecord(candidate)
            || typeof candidate.assetId !== 'string'
            || typeof candidate.characterId !== 'string'
            || typeof candidate.sentAt !== 'number'
          ) return [];
          return [{
            assetId: candidate.assetId,
            characterId: candidate.characterId,
            sentAt: candidate.sentAt,
          }];
        }).slice(-500)
      : [],
    unreadCounts: isPersistedStateRecord(state.unreadCounts) ? state.unreadCounts : {},
    blockedUsers: Array.isArray(state.blockedUsers)
      ? state.blockedUsers.filter((value): value is string => typeof value === 'string')
      : [],
    relationshipTraces: normalizeRelationshipTraces(state.relationshipTraces),
    proactiveChatSchedules: normalizeProactiveChatSchedules(state.proactiveChatSchedules),
    proactiveMomentSchedules: normalizeProactiveMomentSchedules(state.proactiveMomentSchedules),
    proactiveNotificationsEnabled: state.proactiveNotificationsEnabled === true,
    voiceProviderEnabled: state.voiceProviderEnabled === true,
    voiceApiUrl: typeof state.voiceApiUrl === 'string' ? state.voiceApiUrl.trim() : '',
    voiceSttModel: typeof state.voiceSttModel === 'string' && state.voiceSttModel.trim()
      ? state.voiceSttModel.trim()
      : 'gpt-4o-mini-transcribe',
    voiceTtsModel: typeof state.voiceTtsModel === 'string' && state.voiceTtsModel.trim()
      ? state.voiceTtsModel.trim() === 'gpt-4o-mini-tts'
        ? 'tts-1'
        : state.voiceTtsModel.trim()
      : 'tts-1',
    conversationContinuityByCharacter: normalizeConversationContinuityMap(
      state.conversationContinuityByCharacter,
    ),
    memoryWindowSize: typeof state.memoryWindowSize === 'number'
      && Number.isFinite(state.memoryWindowSize)
      ? Math.max(1, Math.min(50, Math.floor(state.memoryWindowSize)))
      : 10,
    themeConfig: normalizeThemeConfig(state.themeConfig),
  };
}

export function mergeNanaPersistedState(
  persistedState: unknown,
  currentState: NanaStore,
): NanaStore {
  const safePersistedState = migrateNanaPersistedState(persistedState);
  return {
    ...currentState,
    ...safePersistedState,
    apiKey: currentState.apiKey,
    tempApiKey: currentState.tempApiKey,
    voiceApiKey: currentState.voiceApiKey,
    tempVoiceApiKey: currentState.tempVoiceApiKey,
  } as NanaStore;
}

export function selectNanaPersistedState(state: NanaStore): PersistedStateRecord {
  return {
    selectedModel: state.selectedModel,
    myDesc: state.myDesc,
    apiUrl: state.apiUrl,
    myAvatar: state.myAvatar,
    myName: state.myName,
    walletBalanceMinor: state.walletBalanceMinor,
    walletBalance: state.walletBalance,
    paymentsById: state.paymentsById,
    momentsBg: state.momentsBg,
    friends: state.friends,
    characters: state.characters,
    savedAvatars: state.savedAvatars,
    momentsList: state.momentsList,
    stickers: state.stickers,
    characterMediaAssets: state.characterMediaAssets,
    characterMediaSendHistory: state.characterMediaSendHistory,
    themeConfig: state.themeConfig,
    worldBookEntries: state.worldBookEntries,
    onlinePresets: state.onlinePresets,
    activeOnlinePresetId: state.activeOnlinePresetId,
    offlinePresets: state.offlinePresets,
    activeOfflinePresetId: state.activeOfflinePresetId,
    callLogs: state.callLogs,
    relationshipTraces: state.relationshipTraces,
    proactiveChatSchedules: state.proactiveChatSchedules,
    proactiveMomentSchedules: state.proactiveMomentSchedules,
    proactiveNotificationsEnabled: state.proactiveNotificationsEnabled,
    conversationContinuityByCharacter: state.conversationContinuityByCharacter,
    memoryWindowSize: state.memoryWindowSize,
    showMemoryDebug: state.showMemoryDebug,
    autoTTS: state.autoTTS,
    speechLanguage: state.speechLanguage,
    voiceProviderEnabled: state.voiceProviderEnabled,
    voiceApiUrl: state.voiceApiUrl,
    voiceSttModel: state.voiceSttModel,
    voiceTtsModel: state.voiceTtsModel,
    lastForwardedMsgId: state.lastForwardedMsgId,
    unreadCounts: state.unreadCounts,
    blockedUsers: state.blockedUsers,
  };
}

export const useNanaStore = create<NanaStore>()(
  persist(
    (set, get) => ({
      // Persisted defaults
      selectedModel: 'gemini-2.5-flash',
      myDesc: 'I am a friendly user.',
      apiUrl: '',
      apiKey: '',
      myAvatar: 'U',
      myName: 'User',
      walletBalanceMinor: 888_800,
      walletBalance: '8888.00',
      paymentsById: {},
      momentsBg: '',
      friends: ['luna-id', 'kai-id', 'aria-id'],
      characters: [
        { id: 'luna-id', name: 'Luna', avatar: 'L', gender: 'Female', age: '22', desc: 'A gentle and caring maid who always puts others first. She speaks with a soft, polite tone and is fiercely loyal to those she trusts.', proactiveMessagingEnabled: true, proactiveMessagingFrequency: 'normal', proactiveMomentsMode: 'occasional', autonomousImageSharingEnabled: false },
        { id: 'kai-id', name: 'Kai', avatar: 'K', gender: 'Male', age: '27', desc: 'A stoic warrior from the northern clans. Quiet, observant, and disciplined in combat, with a softer side he rarely shows.', proactiveMessagingEnabled: true, proactiveMessagingFrequency: 'normal', proactiveMomentsMode: 'occasional', autonomousImageSharingEnabled: false },
        { id: 'aria-id', name: 'Aria', avatar: 'A', gender: 'Female', age: '24', desc: 'A free-spirited bard who travels the world collecting stories and songs. Witty, charming, and never without her trusty lute.', proactiveMessagingEnabled: true, proactiveMessagingFrequency: 'normal', proactiveMomentsMode: 'occasional', autonomousImageSharingEnabled: false },
      ],
      savedAvatars: ['U', 'L', 'K', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop'],
      chatHistory: {
        'luna-id': [
          { id: 1, sender: 'char', text: 'Welcome home, Master. Shall I prepare your favorite tea today?', time: '09:30 AM' },
          { id: 2, sender: 'user', text: "That sounds lovely, Luna. How has your day been?", time: '09:31 AM' },
          { id: 3, sender: 'char', text: 'It has been peaceful. I reorganized the library and found an old photo album... Would you like to look through it together sometime?', time: '09:32 AM' },
        ],
        'kai-id': [
          { id: 4, sender: 'char', text: '...You are late. The northern winds have been restless today.', time: 'Yesterday' },
          { id: 5, sender: 'user', text: 'Sorry Kai, got held up. Anything to report?', time: 'Yesterday' },
          { id: 6, sender: 'char', text: 'Scouts spotted movements beyond the ridge. Nothing immediate, but stay alert. Also, I found a kitten. It is now mine.', time: 'Yesterday' },
        ],
      },
      momentsList: [
        { id: '1', authorId: 'luna-id', authorName: 'Luna', avatar: 'L', text: 'Beautiful day for gardening. The roses are blooming.', images: ['https://images.unsplash.com/photo-1490750967868-869aa97d9a71?w=500'], timestamp: Date.now() - 3600000 },
        { id: '2', authorId: 'aria-id', authorName: 'Aria', avatar: 'A', text: 'Composed a new melody today. The muses were kind.', images: [], timestamp: Date.now() - 7200000 },
        { id: '3', authorId: 'kai-id', authorName: 'Kai', avatar: 'K', text: 'The northern lights were spectacular tonight.', images: ['https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=500'], timestamp: Date.now() - 86400000 },
      ],
      stickers: [],
      characterMediaAssets: [],
      characterMediaSendHistory: [],
      themeConfig: { ...DEFAULT_THEME_CONFIG },
      worldBookEntries: [
        { id: '1', keys: 'Luna,maid', content: 'Luna is a gentle and considerate maid who usually wears a black-and-white maid outfit.' },
      ],
      onlinePresets: [DEFAULT_ONLINE_PRESET],
      activeOnlinePresetId: 'default_online',
      offlinePresets: [DEFAULT_OFFLINE_PRESET],
      activeOfflinePresetId: 'default_offline',
      callLogs: [],
      relationshipTraces: [],
      proactiveChatSchedules: {},
      proactiveMomentSchedules: {},
      proactiveNotificationsEnabled: false,
      conversationContinuityByCharacter: {},

      memoryWindowSize: 10,
      showMemoryDebug: false,
      autoTTS: false,
      speechLanguage: 'zh-CN',
      voiceProviderEnabled: false,
      voiceApiUrl: '',
      voiceApiKey: '',
      voiceSttModel: 'gpt-4o-mini-transcribe',
      voiceTtsModel: 'tts-1',
      lastForwardedMsgId: {},
      unreadCounts: {},

      // Transient defaults
      activeApp: null,
      appReturnTarget: null,
      isGenerating: false,
      pendingChatRequests: {},
      pendingPaymentReactions: {},
      lastUserMessage: '',
      blockedUsers: [],
      islandNotification: null,
      promptModal: { isOpen: false, title: '', value: '', onSave: () => {} },
      isEditingBalance: false,
      tempBalance: '',

      presetView: 'list',
      presetMode: 'online',
      editingPreset: null,

      meetingPage: 'list',
      activeMeetingSceneId: null,
      pendingMeetingHandoffDraft: null,

      weChatTab: 'chats',
      weChatPage: 'root',
      activeChatId: null,
      activeProfileId: null,
      chatPanel: 'none',
      showAddFriend: false,
      searchQuery: '',
      showComposeMoment: false,
      momentText: '',
      momentImageUrl: '',
      stickerManagerCharacterId: null,
      pendingMomentCharacterIds: [],
      chatInput: '',
      callOverlay: emptyCallOverlay,

      editingCharId: null,
      characterEditorOpen: false,
      newCharName: '',
      newCharAvatar: '',
      newCharDesc: '',
      newCharGender: '',
      newCharAge: '',
      newCharPreferredReplyMode: 'auto',
      newCharSupportsVoiceReply: false,
      newCharVoiceProfileId: '',
      newCharSupportsVideoPersona: false,
      newCharVideoPersonaAsset: '',

      worldBookView: 'list',
      worldBookTab: 'global',
      worldBookCharId: null,
      editingEntryId: null,
      editKeys: '',
      editContent: '',
      editCharId: '',
      editAlwaysActive: false,

      paymentModal: { type: 'none' },
      paymentAmount: '',
      paymentNote: '',

      tempApiUrl: '',
      tempApiKey: '',
      tempVoiceApiUrl: '',
      tempVoiceApiKey: '',
      tempVoiceSttModel: 'gpt-4o-mini-transcribe',
      tempVoiceTtsModel: 'tts-1',
      tempMyName: '',
      tempMyAvatar: '',
      tempMyDesc: '',

      selectMode: false,
      selectedMsgIds: [],
      selectTargetCharId: null,

      lastLoreCount: 0,

      models: [],
      isLoadingModels: false,

      // Actions
      setActiveApp: (app) => {
        triggerHaptic('light');
        if (app === null) {
          set({
            activeApp: null, weChatTab: 'chats', weChatPage: 'root', activeChatId: null,
            appReturnTarget: null,
            activeProfileId: null, chatPanel: 'none', showAddFriend: false, searchQuery: '',
            chatInput: '', showComposeMoment: false, momentText: '', momentImageUrl: '',
            stickerManagerCharacterId: null, pendingMomentCharacterIds: [],
            editingCharId: null, newCharName: '', newCharAvatar: '', newCharDesc: '',
            characterEditorOpen: false, newCharGender: '', newCharAge: '',
            newCharPreferredReplyMode: 'auto', newCharSupportsVoiceReply: false,
            newCharVoiceProfileId: '', newCharSupportsVideoPersona: false, newCharVideoPersonaAsset: '',
            worldBookView: 'list', worldBookCharId: null,
            editingEntryId: null, editKeys: '', editContent: '', editCharId: '', editAlwaysActive: false,
            paymentModal: { type: 'none' }, paymentAmount: '', paymentNote: '',
            promptModal: { isOpen: false, title: '', value: '', onSave: () => {} },
            callOverlay: emptyCallOverlay,
            selectMode: false, selectedMsgIds: [], selectTargetCharId: null,
            presetView: 'list',
            meetingPage: 'list', activeMeetingSceneId: null, pendingMeetingHandoffDraft: null,
          });
        } else {
          const state = get();
          const returnPatch = state.activeApp === 'wechat' && app !== 'wechat'
            ? {
                appReturnTarget: {
                  activeApp: 'wechat' as const,
                  weChatTab: state.weChatTab,
                  weChatPage: state.weChatPage,
                  activeChatId: state.activeChatId,
                  activeProfileId: state.activeProfileId,
                },
              }
            : {};

          if (app === 'presets') {
            set({ activeApp: app, presetView: 'list', ...returnPatch });
          } else if (app === 'meeting') {
            set({ activeApp: app, meetingPage: 'list', activeMeetingSceneId: null, pendingMeetingHandoffDraft: null, ...returnPatch });
          } else if (app === 'settings') {
            set({
              activeApp: app,
              tempApiUrl: state.apiUrl || '',
              tempApiKey: state.apiKey || '',
              tempVoiceApiUrl: state.voiceApiUrl || '',
              tempVoiceApiKey: state.voiceApiKey || '',
              tempVoiceSttModel: state.voiceSttModel || 'gpt-4o-mini-transcribe',
              tempVoiceTtsModel: state.voiceTtsModel || 'tts-1',
              ...returnPatch,
            });
          } else if (app === 'user') {
            set({
              activeApp: app,
              tempMyName: state.myName || '',
              tempMyAvatar: state.myAvatar || '',
              tempMyDesc: state.myDesc || '',
              ...returnPatch,
            });
          } else {
            set({ activeApp: app, ...returnPatch });
            if (app === 'wechat') {
              setTimeout(() => void get().reconcilePayments(), 0);
            }
          }
        }
      },

      openMeetingHandoff: async (chatId, mode = 'manual') => {
        const state = get();
        const meetingCopy = getMeetingCopy(state.themeConfig.language);
        const character = state.characters.find(candidate => candidate.id === chatId);
        const presetId = state.activeOfflinePresetId || state.offlinePresets[0]?.id || '';
        if (!character || !presetId) {
          set({
            islandNotification: {
              title: meetingCopy.goToMeeting,
              desc: !character ? meetingCopy.currentCharacterMissing : meetingCopy.createOfflinePresetFirst,
              status: 'error',
            },
          });
          return;
        }
        const existingHandoff = state.conversationContinuityByCharacter[chatId]?.meetingHandoff;
        if (mode === 'automatic' && existingHandoff?.state === 'started' && existingHandoff.sceneId) {
          get().setActiveApp('meeting');
          set({ meetingPage: 'scene', activeMeetingSceneId: existingHandoff.sceneId });
          return;
        }
        const fallback = createLocalMeetingHandoffDraft({
          chatId,
          characterId: character.id,
          characterName: character.name,
          messages: state.chatHistory[chatId] || [],
          presetId,
          existingHandoff,
          language: state.themeConfig.language,
        });
        get().setActiveApp('meeting');
        set({
          meetingPage: 'handoff',
          activeMeetingSceneId: null,
          pendingMeetingHandoffDraft: mode === 'manual' && state.apiKey.trim()
            ? { ...fallback, preparing: true }
            : fallback,
        });
        if (mode !== 'manual' || !state.apiKey.trim()) return;
        const prepared = await prepareMeetingHandoffDraft({
          fallback,
          messages: state.chatHistory[chatId] || [],
          characterName: character.name,
          userName: state.myName,
          apiUrl: state.apiUrl,
          apiKey: state.apiKey,
          selectedModel: state.selectedModel,
          language: state.themeConfig.language,
        });
        set(current => current.pendingMeetingHandoffDraft?.chatId === chatId
          ? { pendingMeetingHandoffDraft: { ...prepared, preparing: false } }
          : {});
      },

      dismissMeetingHandoff: (characterId) => {
        set(state => {
          const current = state.conversationContinuityByCharacter[characterId];
          const updated = transitionConversationMeetingHandoff(current, 'dismissed');
          return updated ? {
            conversationContinuityByCharacter: {
              ...state.conversationContinuityByCharacter,
              [characterId]: updated,
            },
          } : {};
        });
      },

      goBack: () => {
        const state = get();

        if (state.callOverlay.show) {
          const callStatus: CallLog['status'] = state.callOverlay.status === 'connected'
            ? 'completed'
            : state.callOverlay.status === 'incoming'
              ? 'missed'
              : 'cancelled';
          get().endActiveCall(callStatus);
          return true;
        }
        if (state.paymentModal.type !== 'none') {
          set({ paymentModal: { type: 'none' }, paymentAmount: '', paymentNote: '' });
          return true;
        }
        if (state.promptModal.isOpen) {
          set({ promptModal: { isOpen: false, title: '', value: '', onSave: () => {} } });
          return true;
        }
        if (state.showAddFriend || state.showComposeMoment) {
          set({ showAddFriend: false, showComposeMoment: false, momentText: '', momentImageUrl: '' });
          return true;
        }
        if (state.selectMode) {
          set({ selectMode: false, selectedMsgIds: [], selectTargetCharId: null });
          return true;
        }
        if (state.chatPanel !== 'none') {
          set({ chatPanel: 'none' });
          return true;
        }

        if (state.activeApp === 'wechat' && state.weChatPage === 'context' && state.activeProfileId) {
          set({ weChatPage: 'profile' });
          return true;
        }

        if (state.activeApp === 'wechat' && state.weChatPage === 'stickers') {
          if (state.activeProfileId) {
            set({ weChatPage: 'profile', stickerManagerCharacterId: null });
          } else if (state.activeChatId) {
            set({ weChatPage: 'chat', stickerManagerCharacterId: null, chatPanel: 'none' });
          } else {
            set({ weChatPage: 'root', stickerManagerCharacterId: null });
          }
          return true;
        }

        if (state.activeApp === 'wechat' && state.weChatPage === 'profile' && state.activeChatId) {
          set({
            weChatPage: 'chat',
            activeProfileId: null,
            chatPanel: 'none',
          });
          return true;
        }

        if (state.activeApp === 'wechat' && (state.weChatPage !== 'root' || state.activeChatId || state.activeProfileId)) {
          set({
            weChatPage: 'root',
            activeChatId: null,
            activeProfileId: null,
            stickerManagerCharacterId: null,
            chatPanel: 'none',
            selectMode: false,
            selectedMsgIds: [],
          });
          return true;
        }

        if (state.activeApp === 'worldbook') {
          if (state.worldBookView === 'edit') {
            set({
              worldBookView: state.worldBookCharId ? 'chardetail' : 'list',
              editingEntryId: null,
              editKeys: '',
              editContent: '',
              editCharId: '',
              editAlwaysActive: false,
            });
            return true;
          }
          if (state.worldBookView === 'chardetail') {
            set({ worldBookView: 'list', worldBookCharId: null });
            return true;
          }
        }

        if (state.activeApp === 'presets' && state.presetView !== 'list') {
          set({ presetView: 'list', editingPreset: null });
          return true;
        }

        if (state.activeApp === 'meeting' && state.meetingPage !== 'list') {
          set({ meetingPage: 'list', activeMeetingSceneId: null, pendingMeetingHandoffDraft: null });
          return true;
        }

        if (state.activeApp === 'characters' && (
          state.editingCharId ||
          state.characterEditorOpen ||
          state.newCharName ||
          state.newCharAvatar ||
          state.newCharDesc ||
          state.newCharGender ||
          state.newCharAge ||
          state.newCharVoiceProfileId ||
          state.newCharVideoPersonaAsset
        )) {
          set({
            editingCharId: null,
            characterEditorOpen: false,
            newCharName: '',
            newCharAvatar: '',
            newCharDesc: '',
            newCharGender: '',
            newCharAge: '',
            newCharPreferredReplyMode: 'auto',
            newCharSupportsVoiceReply: false,
            newCharVoiceProfileId: '',
            newCharSupportsVideoPersona: false,
            newCharVideoPersonaAsset: '',
          });
          return true;
        }

        // Fallbacks use the still-intact WeChat state when a development reload
        // recreated the Zustand actions before the transient origin snapshot.
        if (
          (state.activeApp === 'user' || state.activeApp === 'settings')
          && state.weChatPage === 'root'
          && state.weChatTab === 'me'
        ) {
          set({ activeApp: 'wechat', appReturnTarget: null });
          return true;
        }

        if (
          state.activeApp === 'worldbook'
          && state.weChatPage === 'chat'
          && !!state.activeChatId
        ) {
          set({ activeApp: 'wechat', appReturnTarget: null });
          return true;
        }

        if (state.activeApp && state.appReturnTarget) {
          set({
            ...state.appReturnTarget,
            appReturnTarget: null,
          });
          return true;
        }

        if (state.activeApp) {
          get().setActiveApp(null);
          return true;
        }

        return false;
      },

      setWalletBalance: (value) => {
        const walletBalanceMinor = legacyWalletBalanceToMinor(value, -1);
        if (walletBalanceMinor < 0) return false;
        const walletBalance = formatCnyMinor(walletBalanceMinor);
        set({
          walletBalanceMinor,
          walletBalance,
          tempBalance: walletBalance,
          isEditingBalance: false,
        });
        return true;
      },

      setCharacterProactiveMessagingEnabled: (characterId, enabled) => {
        const now = Date.now();
        set(state => {
          if (!state.characters.some(character => character.id === characterId)) return {};
          return {
            characters: state.characters.map(character => (
              character.id === characterId
                ? {
                    ...character,
                    proactiveMessagingEnabled: enabled,
                    proactiveMessagingFrequency: enabled
                      ? character.proactiveMessagingFrequency === 'off'
                        ? 'normal'
                        : character.proactiveMessagingFrequency || 'normal'
                      : 'off',
                  }
                : character
            )),
            proactiveChatSchedules: enabled
              ? {
                  ...state.proactiveChatSchedules,
                  [characterId]: rescheduleProactiveAfterInteraction(
                    state.proactiveChatSchedules[characterId],
                    characterId,
                    now,
                    state.characters.find(character => character.id === characterId)
                      ?.proactiveMessagingFrequency === 'off'
                      ? 'normal'
                      : state.characters.find(character => character.id === characterId)
                        ?.proactiveMessagingFrequency || 'normal',
                  ),
                }
              : state.proactiveChatSchedules,
          };
        });
      },

      setCharacterProactiveMessagingFrequency: (characterId, frequency) => {
        const now = Date.now();
        set(state => {
          if (!state.characters.some(character => character.id === characterId)) return {};
          const enabled = frequency !== 'off';
          const proactiveChatSchedules = { ...state.proactiveChatSchedules };
          if (enabled) {
            proactiveChatSchedules[characterId] = rescheduleProactiveAfterInteraction(
              proactiveChatSchedules[characterId],
              characterId,
              now,
              frequency,
            );
          }
          return {
            characters: state.characters.map(character => (
              character.id === characterId
                ? {
                    ...character,
                    proactiveMessagingFrequency: frequency,
                    proactiveMessagingEnabled: enabled,
                  }
                : character
            )),
            proactiveChatSchedules,
          };
        });
      },

      setCharacterTimeZone: (characterId, timeZone) => {
        const normalizedTimeZone = timeZone?.trim() || undefined;
        set(state => ({
          characters: state.characters.map(character => (
            character.id === characterId
              ? { ...character, timeZone: normalizedTimeZone }
              : character
          )),
        }));
      },

      setMomentsCover: (uri) => {
        set({ momentsBg: uri.trim() });
      },

      resetMomentsCover: () => {
        set({ momentsBg: '' });
      },

      saveUserIdentity: ({ name, avatar, description }) => {
        const normalizedName = name.trim() || 'User';
        const normalizedAvatar = avatar.trim() || 'U';
        const normalizedDescription = description.trim() || 'I am a friendly user.';
        set(state => ({
          myName: normalizedName,
          myAvatar: normalizedAvatar,
          myDesc: normalizedDescription,
          tempMyName: normalizedName,
          tempMyAvatar: normalizedAvatar,
          tempMyDesc: normalizedDescription,
          chatHistory: Object.fromEntries(
            Object.entries(state.chatHistory).map(([chatId, messages]) => [
              chatId,
              messages.map(message => (
                message.sender === 'user'
                  ? { ...message, avatar: normalizedAvatar }
                  : message
              )),
            ]),
          ),
          momentsList: state.momentsList.map(moment => ({
            ...moment,
            ...(moment.authorId === 'me' || moment.authorId === 'user'
              ? { authorName: normalizedName, avatar: normalizedAvatar }
              : {}),
            likes: moment.likes?.map(like => (
              like.authorId === 'me' || like.authorId === 'user'
                ? { ...like, authorName: normalizedName, avatar: normalizedAvatar }
                : like
            )),
            comments: moment.comments?.map(comment => (
              comment.authorId === 'me' || comment.authorId === 'user'
                ? { ...comment, authorName: normalizedName, avatar: normalizedAvatar }
                : comment
            )),
          })),
        }));
      },

      setCharacterProactiveMomentsMode: (characterId, mode) => {
        const now = Date.now();
        set(state => {
          if (!state.characters.some(character => character.id === characterId)) return {};
          const proactiveMomentSchedules = { ...state.proactiveMomentSchedules };
          const nextSchedule = createInitialMomentSchedule(characterId, mode, now);
          if (nextSchedule) proactiveMomentSchedules[characterId] = nextSchedule;
          else delete proactiveMomentSchedules[characterId];
          return {
            characters: state.characters.map(character => (
              character.id === characterId ? { ...character, proactiveMomentsMode: mode } : character
            )),
            proactiveMomentSchedules,
          };
        });
      },

      setCharacterAutonomousImageSharingEnabled: (characterId, enabled) => {
        set(state => ({
          characters: state.characters.map(character => (
            character.id === characterId
              ? { ...character, autonomousImageSharingEnabled: enabled }
              : character
          )),
        }));
      },

      addCharacterMediaAsset: (characterId, uri) => {
        if (!characterId || !uri) return;
        const createdAt = Date.now();
        set(state => ({
          characterMediaAssets: normalizeCharacterMediaAssets([
            ...state.characterMediaAssets,
            {
              schemaVersion: 1,
              id: `character-media:${characterId}:${createdAt}:${Math.random().toString(36).slice(2, 8)}`,
              characterId,
              uri,
              source: 'userImported',
              userApproved: true,
              tags: ['daily', 'reaction', state.characters.find(character => character.id === characterId)?.name || 'character'],
              intents: ['dailyLife', 'reaction', 'comfort'],
              createdAt,
              enabled: true,
            },
          ]),
        }));
      },

      publishMoment: ({ text, images }) => {
        const normalizedText = text.trim();
        const normalizedImages = images.filter(Boolean).slice(0, 9);
        if (!normalizedText && normalizedImages.length === 0) return null;
        const timestamp = Date.now();
        const momentId = `moment:user:${timestamp}:${Math.random().toString(36).slice(2, 8)}`;
        set(state => ({
          momentsList: [{
            id: momentId,
            authorId: 'me',
            authorName: state.myName || runtimeCopyFor(state.themeConfig.language).fallbackUser,
            avatar: state.myAvatar,
            text: normalizedText,
            images: normalizedImages,
            timestamp,
            likes: [],
            comments: [],
            generationSource: 'user' as const,
          }, ...state.momentsList].slice(0, 500),
          showComposeMoment: false,
          momentText: '',
          momentImageUrl: '',
        }));
        setTimeout(() => {
          void get().runCharacterMomentReactions(momentId);
        }, 1_200);
        return momentId;
      },

      runCharacterMomentReactions: async (momentId) => {
        if (activeMomentReactionIds.has(momentId)) return;
        const initial = get();
        const moment = initial.momentsList.find(item => item.id === momentId);
        if (!moment || (moment.authorId !== 'me' && moment.authorId !== 'user')) return;
        const plans = planCharacterMomentReactions({
          moment,
          characters: initial.characters,
          friends: initial.friends,
          blockedUsers: initial.blockedUsers,
        });
        if (plans.length === 0) return;

        activeMomentReactionIds.add(momentId);
        try {
          for (const plan of plans) {
            const liveBeforeGeneration = get();
            const liveMoment = liveBeforeGeneration.momentsList.find(item => item.id === momentId);
            if (
              !liveMoment
              || (liveMoment.authorId !== 'me' && liveMoment.authorId !== 'user')
              || !liveBeforeGeneration.friends.includes(plan.character.id)
              || liveBeforeGeneration.blockedUsers.includes(plan.character.id)
            ) continue;

            let commentText = '';
            if (plan.shouldComment) {
              commentText = createLocalMomentReactionComment({
                character: plan.character,
                momentText: liveMoment.text,
                language: liveBeforeGeneration.themeConfig.language,
              });
              if (liveBeforeGeneration.apiKey.trim()) {
                try {
                  commentText = await generateMomentComment({
                    character: plan.character,
                    userName: liveBeforeGeneration.myName,
                    momentText: liveMoment.text,
                    language: liveBeforeGeneration.themeConfig.language,
                    apiUrl: liveBeforeGeneration.apiUrl,
                    apiKey: liveBeforeGeneration.apiKey,
                    selectedModel: liveBeforeGeneration.selectedModel,
                  });
                } catch (error) {
                  console.warn('Moment reaction generation failed; using local persona fallback.', error);
                }
              }
            }

            const reactedAt = Date.now();
            set(state => {
              const currentMoment = state.momentsList.find(item => item.id === momentId);
              if (
                !currentMoment
                || (currentMoment.authorId !== 'me' && currentMoment.authorId !== 'user')
                || !state.friends.includes(plan.character.id)
                || state.blockedUsers.includes(plan.character.id)
              ) return {};
              const alreadyLiked = currentMoment.likes?.some(
                like => like.authorId === plan.character.id,
              );
              const alreadyCommented = currentMoment.comments?.some(
                comment => comment.authorId === plan.character.id,
              );
              const shouldAddComment = plan.shouldComment
                && !alreadyCommented
                && !!commentText.trim();
              const nextMoment: Moment = {
                ...currentMoment,
                likes: plan.shouldLike && !alreadyLiked
                  ? [...(currentMoment.likes || []), {
                      authorId: plan.character.id,
                      authorName: plan.character.name,
                      avatar: plan.character.avatar,
                      timestamp: reactedAt,
                    }]
                  : currentMoment.likes,
                comments: shouldAddComment
                  ? [...(currentMoment.comments || []), {
                      id: `moment-comment:${plan.character.id}:${reactedAt}:${Math.random().toString(36).slice(2, 8)}`,
                      authorId: plan.character.id,
                      authorName: plan.character.name,
                      avatar: plan.character.avatar,
                      text: commentText.trim().slice(0, 500),
                      timestamp: reactedAt,
                      replyToAuthorName: state.myName || runtimeCopyFor(state.themeConfig.language).fallbackUser,
                    }]
                  : currentMoment.comments,
              };
              return {
                momentsList: state.momentsList.map(item => (
                  item.id === momentId ? nextMoment : item
                )),
                ...(shouldAddComment ? {
                  relationshipTraces: upsertRelationshipTrace(state.relationshipTraces, createRelationshipTrace({
                    characterId: plan.character.id,
                    source: 'moment',
                    sourceEventId: `${momentId}:reaction:${plan.character.id}`,
                    title: runtimeCopyFor(state.themeConfig.language).language === 'zh'
                      ? '朋友圈回应'
                      : 'Moment response',
                    summary: `${plan.character.name}: ${commentText.trim()}`,
                    occurredAt: reactedAt,
                    recallWeight: 0.5,
                    state: 'digested',
                  })),
                } : {}),
              };
            });
          }
        } finally {
          activeMomentReactionIds.delete(momentId);
        }
      },

      toggleMomentLike: (momentId) => {
        const now = Date.now();
        set(state => {
          const moment = state.momentsList.find(item => item.id === momentId);
          if (!moment) return {};
          const likes = moment.likes || [];
          const alreadyLiked = likes.some(like => like.authorId === 'me' || like.authorId === 'user');
          const nextLikes = alreadyLiked
            ? likes.filter(like => like.authorId !== 'me' && like.authorId !== 'user')
            : [...likes, {
                authorId: 'me',
                authorName: state.myName || runtimeCopyFor(state.themeConfig.language).fallbackUser,
                avatar: state.myAvatar,
                timestamp: now,
              }];
          const character = state.characters.find(item => item.id === moment.authorId);
          return {
            momentsList: state.momentsList.map(item => (
              item.id === momentId ? { ...item, likes: nextLikes } : item
            )),
            ...(!alreadyLiked && character ? {
              relationshipTraces: upsertRelationshipTrace(state.relationshipTraces, createRelationshipTrace({
                characterId: character.id,
                source: 'moment',
                sourceEventId: `${momentId}:like:me`,
                title: runtimeCopyFor(state.themeConfig.language).language === 'zh' ? '朋友圈互动' : 'Moment interaction',
                summary: runtimeCopyFor(state.themeConfig.language).language === 'zh'
                  ? `${state.myName || '你'}赞了${character.name}的朋友圈：“${moment.text.slice(0, 80)}”`
                  : `${state.myName || 'You'} liked ${character.name}'s moment: "${moment.text.slice(0, 120)}"`,
                occurredAt: now,
                recallWeight: 0.35,
                state: 'digested',
              })),
            } : {}),
          };
        });
      },

      addMomentComment: async (momentId, text, replyToCommentId) => {
        const normalizedText = text.trim();
        if (!normalizedText) return;
        const now = Date.now();
        let targetMoment: Moment | undefined;
        let targetCharacter: Character | undefined;
        let replyToComment: MomentComment | undefined;
        set(state => {
          targetMoment = state.momentsList.find(moment => moment.id === momentId);
          if (!targetMoment) return {};
          targetCharacter = state.characters.find(character => character.id === targetMoment?.authorId);
          replyToComment = targetMoment.comments?.find(comment => comment.id === replyToCommentId);
          const userComment: MomentComment = {
            id: `moment-comment:user:${now}:${Math.random().toString(36).slice(2, 8)}`,
            authorId: 'me',
            authorName: state.myName || runtimeCopyFor(state.themeConfig.language).fallbackUser,
            avatar: state.myAvatar,
            text: normalizedText.slice(0, 500),
            timestamp: now,
            ...(replyToComment ? {
              replyToCommentId: replyToComment.id,
              replyToAuthorName: replyToComment.authorName,
            } : {}),
          };
          return {
            momentsList: state.momentsList.map(moment => (
              moment.id === momentId
                ? { ...moment, comments: [...(moment.comments || []), userComment] }
                : moment
            )),
            ...(targetCharacter ? {
              relationshipTraces: upsertRelationshipTrace(state.relationshipTraces, createRelationshipTrace({
                characterId: targetCharacter.id,
                source: 'moment',
                sourceEventId: `${momentId}:comment:${userComment.id}`,
                title: runtimeCopyFor(state.themeConfig.language).language === 'zh' ? '朋友圈对话' : 'Moment conversation',
                summary: `${userComment.authorName}: ${userComment.text}`,
                occurredAt: now,
                recallWeight: 0.55,
                state: 'digested',
              })),
            } : {}),
          };
        });
        if (!targetMoment || !targetCharacter) return;

        const live = get();
        let replyText = createLocalMomentDraft({
          characterId: targetCharacter.id,
          characterName: targetCharacter.name,
          personaDescription: targetCharacter.desc,
          recentEventSummary: normalizedText,
          focusTraceId: `${momentId}:comment`,
          language: live.themeConfig.language,
          now,
        }).text;
        if (live.apiKey.trim()) {
          try {
            replyText = await generateMomentComment({
              character: targetCharacter,
              userName: live.myName,
              momentText: targetMoment.text,
              replyToText: normalizedText,
              language: live.themeConfig.language,
              apiUrl: live.apiUrl,
              apiKey: live.apiKey,
              selectedModel: live.selectedModel,
            });
          } catch (error) {
            console.warn('Moment comment generation failed; using local persona fallback.', error);
          }
        }
        const replyAt = Date.now();
        const reply: MomentComment = {
          id: `moment-comment:${targetCharacter.id}:${replyAt}:${Math.random().toString(36).slice(2, 8)}`,
          authorId: targetCharacter.id,
          authorName: targetCharacter.name,
          avatar: targetCharacter.avatar,
          text: replyText.slice(0, 500),
          timestamp: replyAt,
          replyToAuthorName: live.myName || runtimeCopyFor(live.themeConfig.language).fallbackUser,
        };
        set(state => ({
          momentsList: state.momentsList.map(moment => (
            moment.id === momentId
              ? { ...moment, comments: [...(moment.comments || []), reply] }
              : moment
          )),
          relationshipTraces: upsertRelationshipTrace(state.relationshipTraces, createRelationshipTrace({
            characterId: targetCharacter!.id,
            source: 'moment',
            sourceEventId: `${momentId}:reply:${reply.id}`,
            title: runtimeCopyFor(state.themeConfig.language).language === 'zh' ? '朋友圈对话' : 'Moment conversation',
            summary: `${targetCharacter!.name}: ${reply.text}`,
            occurredAt: replyAt,
            recallWeight: 0.6,
            state: 'digested',
          })),
        }));
      },

      addStickers: (incoming) => {
        set(state => ({ stickers: normalizeStickerAssets([...state.stickers, ...incoming]).slice(0, 500) }));
      },

      updateSticker: (sticker) => {
        set(state => ({
          stickers: normalizeStickerAssets(
            state.stickers.some(item => item.id === sticker.id)
              ? state.stickers.map(item => item.id === sticker.id ? sticker : item)
              : [...state.stickers, sticker],
          ).slice(0, 500),
        }));
      },

      removeSticker: (stickerId) => {
        const sticker = get().stickers.find(item => item.id === stickerId);
        set(state => ({ stickers: state.stickers.filter(item => item.id !== stickerId) }));
        if (sticker) deletePersistedMediaFile(sticker.uri, 'stickers');
      },

      sendSticker: async (stickerId) => {
        await get().sendChatMessage('sticker', undefined, undefined, undefined, { stickerId });
      },

      clearChat: (chatId) => {
        if (!chatId) return;
        cancelUserMessageBurst(chatId);
        cancelMessageDeliveryTimers(chatId);
        set(state => {
          const visiblePayments = Object.values(state.paymentsById)
            .filter(payment => payment.chatId === chatId && paymentMustRemainVisibleDuringChatClear(payment))
            .sort((left, right) => left.createdAt - right.createdAt);
          const visiblePaymentIds = new Set(visiblePayments.map(payment => payment.id));
          const preservedMessages = (state.chatHistory[chatId] || []).filter(message => (
            message.type === 'payment'
            && typeof message.paymentId === 'string'
            && visiblePaymentIds.has(message.paymentId)
          ));
          const preservedIds = new Set(preservedMessages.map(message => message.paymentId));
          const recoveredMessages = visiblePayments
            .filter(payment => !preservedIds.has(payment.id))
            .map(payment => createPaymentChatMessage(payment, state.myAvatar));
          const nextPendingChatRequests = cancelChatRequest(state.pendingChatRequests, chatId);
          const conversationContinuityByCharacter = {
            ...state.conversationContinuityByCharacter,
          };
          delete conversationContinuityByCharacter[chatId];
          return {
            chatHistory: {
              ...state.chatHistory,
              [chatId]: [...preservedMessages, ...recoveredMessages].sort((left, right) => left.id - right.id),
            },
            pendingChatRequests: nextPendingChatRequests,
            conversationContinuityByCharacter,
            isGenerating: Object.keys(nextPendingChatRequests).length > 0,
            unreadCounts: { ...state.unreadCounts, [chatId]: 0 },
            ...(state.activeChatId === chatId ? {
              selectMode: false,
              selectedMsgIds: [],
              selectTargetCharId: null,
            } : {}),
          };
        });
        void get().reconcilePayments();
      },

      correctRelationshipMemory: (traceId, summary) => {
        const normalizedSummary = summary.trim();
        if (!traceId || !normalizedSummary) return false;

        let didCorrect = false;
        set(state => {
          const sourceTrace = state.relationshipTraces.find(trace => trace.id === traceId);
          if (!sourceTrace) return {};
          const relationshipTraces = correctRelationshipTrace(
            state.relationshipTraces,
            { traceId, summary: normalizedSummary },
          );
          const worldBookEntries = suppressMemoryEvidenceForTrace(
            state.worldBookEntries,
            sourceTrace,
          );
          if (
            relationshipTraces === state.relationshipTraces
            && worldBookEntries === state.worldBookEntries
          ) return {};
          didCorrect = true;
          return { relationshipTraces, worldBookEntries };
        });
        return didCorrect;
      },

      sendPayment: async ({ chatId, kind, amountMinor, note }) => {
        const state = get();
        const copy = runtimeCopyFor(state.themeConfig.language);
        const activeChar = state.characters.find(character => character.id === chatId);
        if (!activeChar) throw new Error(copy.paymentRecipientMissing);

        const currentBalanceMinor = state.walletBalanceMinor;
        const now = Date.now();
        const paymentId = `payment:${now}:${Math.random().toString(36).slice(2, 10)}`;
        const payment = createPayment({
          id: paymentId,
          chatId,
          kind,
          senderId: 'user',
          recipientId: chatId,
          amountMinor,
          note,
          now,
        });
        try {
          reservePaymentFunds(currentBalanceMinor, amountMinor);
        } catch {
          set({
            walletBalanceMinor: currentBalanceMinor,
            walletBalance: formatCnyMinor(currentBalanceMinor),
            islandNotification: {
              title: runtimePaymentLabel(copy, kind),
              desc: copy.insufficientBalance,
              status: 'error',
            },
          });
          throw new Error(copy.insufficientBalance);
        }

        const message = createPaymentChatMessage(payment, state.myAvatar);
        let committed = false;
        set(current => {
          if (current.paymentsById[paymentId]) return {};
          let nextBalance: number;
          try {
            nextBalance = reservePaymentFunds(current.walletBalanceMinor, amountMinor);
          } catch {
            return {};
          }
          committed = true;
          return {
            walletBalanceMinor: nextBalance,
            walletBalance: formatCnyMinor(nextBalance),
            paymentsById: { ...current.paymentsById, [paymentId]: payment },
            chatHistory: {
              ...current.chatHistory,
              [chatId]: [...(current.chatHistory[chatId] || []), message],
            },
            proactiveChatSchedules: {
              ...current.proactiveChatSchedules,
              [chatId]: rescheduleProactiveAfterInteraction(
                current.proactiveChatSchedules[chatId],
                chatId,
                payment.createdAt,
                current.characters.find(character => character.id === chatId)
                  ?.proactiveMessagingFrequency || 'normal',
              ),
            },
            relationshipTraces: upsertRelationshipTrace(current.relationshipTraces, createRelationshipTrace({
              characterId: chatId,
              source: 'payment',
              sourceEventId: paymentId,
              title: runtimePaymentLabel(copy, kind),
              summary: paymentSummary(payment, activeChar.name, state.themeConfig.language),
              recallWeight: 0.7,
              state: 'pending',
            })),
            paymentModal: { type: 'none' },
            paymentAmount: '',
            paymentNote: '',
            chatPanel: 'none' as ChatPanel,
            islandNotification: {
              title: activeChar.name,
              desc: kind === 'transfer' ? copy.transferSent : copy.redPacketSent,
              icon: activeChar.avatar,
              status: 'payment',
            },
          };
        });
        if (!committed) throw new Error(copy.paymentSubmitFailed);

        get().transitionPayment(paymentId, 'pending', { now });
        triggerHaptic('success');
        setTimeout(() => useNanaStore.setState({ islandNotification: null }), 1800);
        return paymentId;
      },

      transitionPayment: (id, nextStatus, meta = {}) => {
        let didTransition = false;
        let wakeAt: number | undefined;
        let expiryAt: number | undefined;
        set(state => {
          const current = state.paymentsById[id];
          if (!current) return {};
          let transition;
          try {
            transition = transitionPaymentEntity(current, nextStatus, meta.now);
          } catch {
            return {};
          }
          if (!transition.changed) return {};
          if (transition.walletDeltaMinor < 0 && state.walletBalanceMinor < -transition.walletDeltaMinor) {
            return {};
          }

          let nextPayment = transition.payment;
          if (nextStatus === 'pending') {
            nextPayment = schedulePaymentReaction(nextPayment, meta.now);
            wakeAt = nextPayment.reactionDueAt;
            expiryAt = nextPayment.expiresAt;
          }
          if (nextStatus === 'failed') {
            const copy = runtimeCopyFor(state.themeConfig.language);
            nextPayment = {
              ...nextPayment,
              failureCode: meta.failureCode || 'runtime',
              failureMessage: meta.failureMessage || copy.paymentCouldNotComplete,
            };
          } else if (nextStatus === 'sending') {
            nextPayment = { ...nextPayment, failureCode: undefined, failureMessage: undefined };
          }

          const nextBalance = state.walletBalanceMinor + transition.walletDeltaMinor;
          const copy = runtimeCopyFor(state.themeConfig.language);
          const characterName = state.characters.find(character => character.id === current.chatId)?.name || copy.fallbackCharacter;
          const isTerminal = nextStatus === 'completed' || nextStatus === 'refunded' || nextStatus === 'failed';
          didTransition = true;
          return {
            paymentsById: { ...state.paymentsById, [id]: nextPayment },
            walletBalanceMinor: nextBalance,
            walletBalance: formatCnyMinor(nextBalance),
            ...(isTerminal ? {
              relationshipTraces: upsertRelationshipTrace(state.relationshipTraces, createRelationshipTrace({
                characterId: current.chatId,
                source: 'payment',
                sourceEventId: current.id,
                title: paymentLabel(current.kind, state.themeConfig.language),
                summary: paymentSummary(nextPayment, characterName, state.themeConfig.language),
                recallWeight: nextStatus === 'failed' ? 0.35 : 0.75,
                state: nextStatus === 'failed' ? 'failed' : 'digested',
              })),
              pendingPaymentReactions: Object.fromEntries(
                Object.entries(state.pendingPaymentReactions).filter(([paymentId]) => paymentId !== id),
              ),
            } : {}),
          };
        });

        if (didTransition) {
          schedulePaymentReconcileAt(id, 'reaction', wakeAt);
          schedulePaymentReconcileAt(id, 'expiry', expiryAt);
        }
        return didTransition;
      },

      retryPayment: async (id) => {
        const currentState = get();
        const payment = currentState.paymentsById[id];
        if (!payment) return;
        const copy = runtimeCopyFor(currentState.themeConfig.language);

        if (payment.status === 'failed') {
          if (!get().transitionPayment(id, 'sending')) {
            set({
              islandNotification: {
                title: runtimePaymentLabel(copy, payment.kind),
                desc: copy.insufficientBalanceToRetry,
                status: 'error',
              },
            });
            return;
          }
          get().transitionPayment(id, 'pending');
          return;
        }

        if (payment.status !== 'pending' || payment.reactionState === 'processing') return;
        const now = Date.now();
        set(state => {
          const current = state.paymentsById[id];
          if (!current || current.status !== 'pending' || current.reactionState === 'processing') return {};
          return {
            paymentsById: {
              ...state.paymentsById,
              [id]: {
                ...current,
                reactionState: 'scheduled',
                reactionDueAt: now,
                reactionError: undefined,
                updatedAt: now,
              },
            },
          };
        });
        await get().reconcilePayments(now);
      },

      reconcilePayments: async (now = Date.now()) => {
        const integrityIds = Object.values(get().paymentsById).map(payment => payment.id);
        for (const id of integrityIds) {
          let wakeAt: number | undefined;
          let expiryAt: number | undefined;
          set(state => {
            const current = state.paymentsById[id];
            if (!current) return {};
            const result = reconcilePaymentIntegrityEntity(current, now);
            if (!result.changed) return {};

            const recovered = result.payment;
            wakeAt = recovered.status === 'pending' ? recovered.reactionDueAt : undefined;
            expiryAt = recovered.status === 'pending' ? recovered.expiresAt : undefined;
            const existingMessages = state.chatHistory[recovered.chatId] || [];
            const hasPaymentCard = existingMessages.some(message => (
              message.type === 'payment' && message.paymentId === recovered.id
            ));
            const copy = runtimeCopyFor(state.themeConfig.language);
            const characterName = state.characters.find(character => character.id === recovered.chatId)?.name || copy.fallbackCharacter;
            const nextPending = { ...state.pendingPaymentReactions };
            if (recovered.status !== 'pending') delete nextPending[id];
            const nextBalance = state.walletBalanceMinor + result.walletDeltaMinor;
            const traceState = recovered.status === 'failed'
              ? 'failed' as const
              : recovered.status === 'pending' ? 'pending' as const : 'digested' as const;
            return {
              paymentsById: { ...state.paymentsById, [id]: recovered },
              walletBalanceMinor: nextBalance,
              walletBalance: formatCnyMinor(nextBalance),
              pendingPaymentReactions: nextPending,
              chatHistory: hasPaymentCard ? state.chatHistory : {
                ...state.chatHistory,
                [recovered.chatId]: [
                  ...existingMessages,
                  createPaymentChatMessage(recovered, state.myAvatar),
                ],
              },
              relationshipTraces: upsertRelationshipTrace(state.relationshipTraces, createRelationshipTrace({
                characterId: recovered.chatId,
                source: 'payment',
                sourceEventId: recovered.id,
                title: paymentLabel(recovered.kind, state.themeConfig.language),
                summary: paymentSummary(recovered, characterName, state.themeConfig.language),
                recallWeight: recovered.status === 'failed' ? 0.35 : 0.7,
                state: traceState,
              })),
            };
          });
          schedulePaymentReconcileAt(id, 'reaction', wakeAt);
          schedulePaymentReconcileAt(id, 'expiry', expiryAt);
        }

        for (const payment of Object.values(get().paymentsById)) {
          if (payment.status !== 'pending') continue;
          if (typeof payment.reactionDueAt === 'number' && payment.reactionDueAt > now) {
            schedulePaymentReconcileAt(payment.id, 'reaction', payment.reactionDueAt);
          }
          if (payment.expiresAt > now) {
            schedulePaymentReconcileAt(payment.id, 'expiry', payment.expiresAt);
          }
        }
        const expiringIds = Object.values(get().paymentsById)
          .filter(payment => paymentNeedsExpiry(payment, now))
          .map(payment => payment.id);
        for (const id of expiringIds) {
          set(state => {
            const current = state.paymentsById[id];
            if (!current) return {};
            const result = reconcileExpiredPaymentEntity(current, now);
            if (!result.changed) return {};
            const nextBalance = state.walletBalanceMinor + result.walletDeltaMinor;
            const copy = runtimeCopyFor(state.themeConfig.language);
            const characterName = state.characters.find(character => character.id === current.chatId)?.name || copy.fallbackCharacter;
            const nextPending = { ...state.pendingPaymentReactions };
            delete nextPending[id];
            return {
              paymentsById: { ...state.paymentsById, [id]: result.payment },
              walletBalanceMinor: nextBalance,
              walletBalance: formatCnyMinor(nextBalance),
              pendingPaymentReactions: nextPending,
              relationshipTraces: upsertRelationshipTrace(state.relationshipTraces, createRelationshipTrace({
                characterId: current.chatId,
                source: 'payment',
                sourceEventId: current.id,
                title: paymentLabel(current.kind, state.themeConfig.language),
                summary: paymentSummary(result.payment, characterName, state.themeConfig.language),
                recallWeight: 0.7,
                state: 'digested',
              })),
            };
          });
        }

        const dueIds = Object.values(get().paymentsById)
          .filter(payment => paymentReactionIsDue(payment, now))
          .map(payment => payment.id);

        for (const id of dueIds) {
          const token = `payment-reaction:${id}:${now}:${Math.random().toString(36).slice(2, 8)}`;
          let requestPayment: Payment | undefined;
          let requestCharacter: Character | undefined;
          let requestState: NanaStore | undefined;
          set(state => {
            const current = state.paymentsById[id];
            if (!current || !paymentReactionIsDue(current, now) || state.pendingPaymentReactions[id]) return {};
            requestPayment = {
              ...current,
              reactionState: 'processing',
              reactionAttemptedAt: now,
              reactionAttempts: current.reactionAttempts + 1,
              reactionError: undefined,
              updatedAt: now,
            };
            requestCharacter = state.characters.find(character => character.id === current.recipientId);
            requestState = state;
            return {
              paymentsById: { ...state.paymentsById, [id]: requestPayment },
              pendingPaymentReactions: { ...state.pendingPaymentReactions, [id]: token },
            };
          });
          if (!requestPayment || !requestState) continue;

          try {
            const reaction = await generatePaymentReaction({
              kind: requestPayment.kind,
              amountMinor: requestPayment.amountMinor,
              note: requestPayment.note,
              userName: requestState.myName,
              character: requestCharacter,
              apiUrl: requestState.apiUrl,
              apiKey: requestState.apiKey,
              selectedModel: requestState.selectedModel,
              language: requestState.themeConfig.language,
              recentChat: requestState.chatHistory[requestPayment.chatId] || [],
              relationshipTraces: requestState.relationshipTraces,
            });
            let didCommit = false;
            set(state => {
              const current = state.paymentsById[id];
              if (
                state.pendingPaymentReactions[id] !== token
                || !current
                || current.status !== 'pending'
                || current.reactionState !== 'processing'
              ) return {};

              const reactionMessageId = current.reactionMessageId ?? nextMessageId();
              const reactionResult = resolvePaymentReactionEntity(
                current,
                reaction.decision,
                reaction.replyText,
                reactionMessageId,
              );
              const resolved = reactionResult.payment;
              const alreadyHasReply = (state.chatHistory[resolved.chatId] || [])
                .some(message => message.id === reactionMessageId);
              const copy = runtimeCopyFor(state.themeConfig.language);
              const characterName = requestCharacter?.name || copy.fallbackCharacter;
              const nextBalance = state.walletBalanceMinor + reactionResult.walletDeltaMinor;
              const nextPending = { ...state.pendingPaymentReactions };
              delete nextPending[id];
              didCommit = true;
              return {
                paymentsById: { ...state.paymentsById, [id]: resolved },
                pendingPaymentReactions: nextPending,
                walletBalanceMinor: nextBalance,
                walletBalance: formatCnyMinor(nextBalance),
                chatHistory: alreadyHasReply ? state.chatHistory : {
                  ...state.chatHistory,
                  [resolved.chatId]: [...(state.chatHistory[resolved.chatId] || []), {
                    id: reactionMessageId,
                    sender: 'char',
                    text: reaction.replyText,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    type: 'text' as MessageType,
                  }],
                },
                relationshipTraces: upsertRelationshipTrace(state.relationshipTraces, createRelationshipTrace({
                  characterId: resolved.chatId,
                  source: 'payment',
                  sourceEventId: resolved.id,
                  title: paymentLabel(resolved.kind, state.themeConfig.language),
                  summary: `${paymentSummary(resolved, characterName, state.themeConfig.language)} ${characterName}: ${reaction.replyText}`,
                  recallWeight: 0.8,
                  state: 'digested',
                })),
                unreadCounts: alreadyHasReply ? state.unreadCounts : {
                  ...state.unreadCounts,
                  [resolved.chatId]: unreadAfterRemoteEvent(state, resolved.chatId),
                },
                islandNotification: {
                  title: characterName,
                  desc: reaction.decision === 'accept'
                    ? copy.paymentAccepted
                    : copy.paymentReturned,
                  icon: requestCharacter?.avatar,
                  status: 'success',
                },
              };
            });
            if (didCommit) {
              triggerHaptic(reaction.decision === 'decline' ? 'medium' : 'success');
              setTimeout(() => useNanaStore.setState({ islandNotification: null }), 2600);
            }
          } catch (error) {
            const failureMessage = error instanceof Error
              ? error.message
              : runtimeCopyFor(get().themeConfig.language).characterResponseFailed;
            let retryAt: number | undefined;
            set(state => {
              const current = state.paymentsById[id];
              if (state.pendingPaymentReactions[id] !== token || !current || current.status !== 'pending') return {};
              const nextPending = { ...state.pendingPaymentReactions };
              delete nextPending[id];
              const failedReaction = failPaymentReactionEntity(current, failureMessage);
              retryAt = failedReaction.reactionDueAt;
              return {
                paymentsById: {
                  ...state.paymentsById,
                  [id]: failedReaction,
                },
                pendingPaymentReactions: nextPending,
              };
            });
            if (typeof retryAt === 'number') {
              schedulePaymentReconcileAt(id, 'reaction', retryAt);
            }
          }
        }
      },

      reconcileChatDeliveryStates: (now = Date.now()) => {
        set(state => {
          let changed = false;
          const chatHistory: ChatHistory = {};
          for (const [chatId, messages] of Object.entries(state.chatHistory)) {
            let chatChanged = false;
            const nextMessages = messages.map(message => {
              if (
                message.sender !== 'user'
                || (message.deliveryStatus !== 'sending' && message.deliveryStatus !== 'sent')
              ) return message;
              const delivered = transitionMessageDelivery(message, 'delivered', now);
              if (delivered !== message) {
                chatChanged = true;
                changed = true;
              }
              return delivered;
            });
            chatHistory[chatId] = chatChanged ? nextMessages : messages;
          }
          return changed ? { chatHistory } : {};
        });
      },

      sendChatMessage: async (type = 'text', amount, note, mediaCapture, options) => {
        const state = get();
        const copy = runtimeCopyFor(state.themeConfig.language);
        const chatId = options?.targetChatId ?? state.activeChatId;
        if (!chatId) {
          if (type === 'voice') discardVoiceCapture(mediaCapture);
          return;
        }

        if (type === 'transfer' || type === 'redpacket') {
          const amountMinor = parsePaymentAmountToMinor(amount || '');
          if (amountMinor === null) {
            set({
              islandNotification: {
                title: type === 'transfer' ? copy.transfer : copy.redPacket,
                desc: copy.amountInvalid,
                status: 'error',
              },
            });
            return;
          }
          try {
            await get().sendPayment({
              chatId,
              kind: type === 'transfer' ? 'transfer' : 'redPacket',
              amountMinor,
              note,
            });
          } catch (error) {
            set({
              islandNotification: {
                title: type === 'transfer' ? copy.transfer : copy.redPacket,
                desc: error instanceof Error ? error.message : copy.paymentFailed,
                status: 'error',
              },
            });
            triggerHaptic('error');
          }
          return;
        }
        if (type === 'payment') return;

        const selectedSticker = type === 'sticker'
          ? filterStickersForChat(state.stickers, chatId)
              .find(sticker => sticker.id === options?.stickerId)
          : undefined;
        if (type === 'sticker' && !selectedSticker) {
          set({
            islandNotification: {
              title: copy.language === 'zh' ? '表情包' : 'Sticker',
              desc: copy.language === 'zh' ? '这个表情包已不可用' : 'This sticker is no longer available',
              status: 'error',
            },
          });
          return;
        }

        const requestedText = (options?.textOverride ?? state.chatInput).trim();
        const voiceCaptureIsValid = !mediaCapture || (
          (mediaCapture.phase === 'ready' || mediaCapture.phase === 'processing')
          && !!mediaCapture.localUri
        );
        if (type === 'voice' && !voiceCaptureIsValid) {
          discardVoiceCapture(mediaCapture);
          set({
            islandNotification: {
              title: copy.voiceMessage,
              desc: mediaCapture?.errorMessage || copy.recordingCancelledOrTooShort,
              status: 'error',
            },
          });
          triggerHaptic('error');
          return;
        }
        if (type === 'text' && !requestedText) return;
        if (type === 'voice' && !note && !requestedText && !mediaCapture?.transcript && !mediaCapture?.localUri) {
          discardVoiceCapture(mediaCapture);
          return;
        }
        const pendingRequestId = state.pendingChatRequests[chatId];
        const joiningUserBurst = type === 'text'
          && !!pendingRequestId
          && isCollectingUserMessageBurst(chatId, pendingRequestId);
        if ((type === 'text' || type === 'voice' || type === 'sticker') && pendingRequestId && !joiningUserBurst) {
          if (type === 'voice') discardVoiceCapture(mediaCapture);
          set({
            islandNotification: {
              title: state.characters.find(c => c.id === chatId)?.name || 'AI',
              desc: copy.waitingForReply,
              status: 'processing',
            },
          });
          setTimeout(() => useNanaStore.setState({ islandNotification: null }), 1600);
          return;
        }

        const finalizedMediaCapture = type === 'voice' && mediaCapture
          ? finalizeVoiceCapture(mediaCapture)
          : mediaCapture;
        if (type === 'voice' && mediaCapture && (
          (finalizedMediaCapture?.phase !== 'ready' && finalizedMediaCapture?.phase !== 'processing')
          || !finalizedMediaCapture.localUri
        )) {
          discardVoiceCapture(finalizedMediaCapture);
          set({
            islandNotification: {
              title: copy.voiceMessage,
              desc: finalizedMediaCapture?.errorMessage || copy.recordingCancelledOrTooShort,
              status: 'error',
            },
          });
          triggerHaptic('error');
          return;
        }

        triggerHaptic('light');
        const initialVoiceTranscript = type === 'voice'
          ? (note || finalizedMediaCapture?.transcript || requestedText).trim() || undefined
          : undefined;
        let userText = type === 'voice'
          ? (initialVoiceTranscript || '')
          : type === 'text'
            ? requestedText
            : type === 'image'
              ? (note || copy.sharedAPhoto)
              : type === 'sticker'
                ? `[Sticker: ${selectedSticker?.name || 'Sticker'}; meaning: ${selectedSticker?.tags.join(', ') || 'reaction'}]`
              : (note || '');
        let imageAnalysisShouldRemember = false;
        const activeChar = state.characters.find(c => c.id === chatId);
        const interactionAt = Date.now();
        const fastChat = process.env.EXPO_PUBLIC_NANA_FAST_CHAT === '1';
        const messageId = options?.skipUserAppend && options.sourceMessageId
          ? options.sourceMessageId
          : nextMessageId();
        const sourceMessageId = options?.sourceMessageId ?? messageId;
        const turnId = options?.turnIdOverride
          || (joiningUserBurst && pendingRequestId
            ? pendingRequestId
            : `reply:${chatId}:${sourceMessageId}:${interactionAt}`);
        let continuitySourceMessageIds = [sourceMessageId];
        const deliveryMessageIds = options?.retryMessageIds?.length
          ? [...new Set(options.retryMessageIds)]
          : [messageId];
        const realTime = new Date(interactionAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const replyMode = characterReplyMode(activeChar);
        const voiceDraft = type !== 'voice'
          ? null
          : finalizedMediaCapture
            ? {
                audioUri: finalizedMediaCapture.localUri,
                audioDurationSec: finalizedMediaCapture.durationSec || 1,
                transcript: initialVoiceTranscript,
                replyMode,
              }
            : createVoiceMessageDraftFromCapture(createMockCaptureResult(userText), replyMode);
        const newMsg: Message = {
          id: messageId,
          sender: 'user',
          text: userText,
          time: realTime,
          avatar: state.myAvatar,
          type,
          amount,
          note,
          createdAt: interactionAt,
          turnId,
          deliveryStatus: 'sending',
          deliveryAttemptedAt: interactionAt,
          deliveryUpdatedAt: interactionAt,
          deliveryAttemptCount: 1,
          ...(voiceDraft ? {
            audioUri: voiceDraft.audioUri,
            audioDurationSec: voiceDraft.audioDurationSec,
            transcript: voiceDraft.transcript,
            voiceTranscriptionStatus: voiceDraft.transcript ? 'ready' : 'pending',
            replyMode: voiceDraft.replyMode,
          } : {}),
          ...(type === 'image' && finalizedMediaCapture?.localUri ? {
            imageUri: finalizedMediaCapture.localUri,
            imageWidth: finalizedMediaCapture.width,
            imageHeight: finalizedMediaCapture.height,
          } : {}),
          ...(type === 'sticker' && selectedSticker ? {
            stickerId: selectedSticker.id,
            stickerUri: selectedSticker.uri,
            stickerName: selectedSticker.name,
          } : {}),
        };

        const traceSource = type === 'voice'
          ? 'voiceMessage' as const
          : type === 'image'
            ? 'photo' as const
            : 'chat' as const;
        const traceTitle = type === 'voice'
          ? copy.voiceMessage
          : type === 'image'
            ? copy.sharedPhoto
            : type === 'sticker'
              ? (copy.language === 'zh' ? '表情包' : 'Sticker')
            : copy.chatExchange;
        const traceUserName = state.myName || copy.fallbackUser;
        const traceCharacterName = activeChar?.name || copy.fallbackCharacter;
        let initialSummary = type === 'image'
          ? copy.language === 'zh'
            ? `${traceUserName}向${traceCharacterName}分享了一张照片。`
            : `${traceUserName} shared a photo with ${traceCharacterName}.`
          : type === 'voice' && !userText
            ? copy.language === 'zh'
              ? `${traceUserName}向${traceCharacterName}发送了一条语音消息。`
              : `${traceUserName} sent a voice message to ${traceCharacterName}.`
            : `${traceUserName}: ${userText}`;
        const initialTrace = createRelationshipTrace({
          characterId: chatId,
          source: traceSource,
          sourceEventId: String(sourceMessageId),
          title: traceTitle,
          summary: initialSummary,
          mediaUris: type === 'sticker' && selectedSticker
            ? [selectedSticker.uri]
            : finalizedMediaCapture?.localUri ? [finalizedMediaCapture.localUri] : undefined,
          remember: type !== 'sticker' && type !== 'image',
          recallWeight: type === 'text' ? 0.35 : 0.65,
          state: type === 'sticker' || type === 'image' ? 'ignored' : 'pending',
        });

        set(s => ({
          lastUserMessage: userText,
          chatHistory: options?.skipUserAppend
            ? s.chatHistory
            : {
                ...s.chatHistory,
                [chatId]: [...(s.chatHistory[chatId] || []), newMsg],
              },
          relationshipTraces: options?.skipUserAppend || joiningUserBurst
            ? s.relationshipTraces
            : upsertRelationshipTrace(s.relationshipTraces, initialTrace),
          proactiveChatSchedules: {
            ...s.proactiveChatSchedules,
            [chatId]: rescheduleProactiveAfterInteraction(
              s.proactiveChatSchedules[chatId],
              chatId,
              interactionAt,
              s.characters.find(character => character.id === chatId)
                ?.proactiveMessagingFrequency || 'normal',
            ),
          },
          ...(type === 'text' || type === 'voice'
            ? { chatInput: '', chatPanel: 'none' as ChatPanel }
            : { chatPanel: 'none' as ChatPanel }),
        }));

        if (!options?.skipDeliverySchedule) {
          for (const deliveryMessageId of deliveryMessageIds) {
            const deliveryMessage = (get().chatHistory[chatId] || [])
              .find(message => message.id === deliveryMessageId);
            if (deliveryMessage) {
              scheduleOutgoingMessageDelivery(chatId, chatId, deliveryMessage, fastChat);
            }
          }
        }

        if (joiningUserBurst && pendingRequestId) {
          appendUserMessageToBurst(chatId, pendingRequestId, {
            sourceMessageId,
            text: userText,
          });
          return;
        }

        const sourceMessageStillExists = () => (
          (get().chatHistory[chatId] || []).some(message => message.id === sourceMessageId)
        );

        if (type === 'voice' && finalizedMediaCapture && !initialVoiceTranscript) {
          const voiceProvider = resolveVoiceProvider({
            voiceProviderEnabled: state.voiceProviderEnabled,
            voiceApiUrl: state.voiceApiUrl,
            voiceApiKey: state.voiceApiKey,
            voiceSttModel: state.voiceSttModel,
            voiceTtsModel: state.voiceTtsModel,
            chatApiUrl: state.apiUrl,
            chatApiKey: state.apiKey,
            chatModel: state.selectedModel,
          });
          set({
            islandNotification: {
              title: activeChar?.name || copy.voiceMessage,
              desc: copy.transcribingVoiceMessage,
              icon: activeChar?.avatar,
              status: 'processing',
            },
          });
          const transcriptCapture = await transcribeAudioCapture({
            capture: finalizedMediaCapture,
            apiUrl: voiceProvider.stt.apiUrl,
            apiKey: voiceProvider.stt.apiKey,
            selectedModel: voiceProvider.stt.model,
            sttModel: voiceProvider.stt.model,
            language: state.speechLanguage || 'zh-CN',
          });
          if (!sourceMessageStillExists()) return;
          const transcript = transcriptCapture.phase === 'ready'
            ? transcriptCapture.transcript?.trim()
            : undefined;
          if (!transcript) {
            const localSpeechRejected = transcriptCapture.errorCode === 'noSpeechDetected'
              || transcriptCapture.errorCode === 'audioTooShort';
            // The audio message was already persisted and entered the normal
            // delivery lifecycle before transcription began. STT is an
            // enrichment step for the character reply, not message transport;
            // a provider/upload failure must not turn a playable voice bubble
            // into a red "send failed" state.
            set(s => ({
              chatHistory: {
                ...s.chatHistory,
                [chatId]: (s.chatHistory[chatId] || []).map(message => (
                  message.id === messageId
                    ? {
                        ...message,
                        voiceTranscriptionStatus: localSpeechRejected ? 'unavailable' : 'failed',
                        voiceTranscriptionError: localSpeechRejected
                          ? undefined
                          : transcriptCapture.errorMessage || copy.voiceTranscriptionFailed,
                      }
                    : message
                )),
              },
              relationshipTraces: upsertRelationshipTrace(s.relationshipTraces, createRelationshipTrace({
                characterId: chatId,
                source: 'voiceMessage',
                sourceEventId: String(sourceMessageId),
                title: copy.voiceMessage,
                summary: initialSummary,
                mediaUris: finalizedMediaCapture.localUri ? [finalizedMediaCapture.localUri] : undefined,
                remember: !localSpeechRejected,
                recallWeight: localSpeechRejected ? 0.1 : 0.45,
                state: localSpeechRejected ? 'ignored' : 'failed',
              })),
              islandNotification: {
                title: activeChar?.name || copy.voiceMessage,
                desc: localSpeechRejected
                  ? copy.noSpeechDetected
                  : transcriptCapture.errorMessage || copy.voiceTranscriptionFailed,
                icon: activeChar?.avatar,
                ...(localSpeechRejected ? {} : { status: 'error' as const }),
              },
            }));
            triggerHaptic(localSpeechRejected ? 'light' : 'error');
            setTimeout(() => useNanaStore.setState({ islandNotification: null }), 2600);
            return;
          }

          userText = transcript;
          initialSummary = `${traceUserName}: ${transcript}`;
          set(s => ({
            lastUserMessage: transcript,
            chatHistory: {
              ...s.chatHistory,
              [chatId]: (s.chatHistory[chatId] || []).map(message => (
                message.id === messageId
                  ? {
                      ...message,
                      text: transcript,
                      transcript,
                      voiceTranscriptionStatus: 'ready',
                      voiceTranscriptionError: undefined,
                    }
                  : message
              )),
            },
            relationshipTraces: upsertRelationshipTrace(s.relationshipTraces, createRelationshipTrace({
              characterId: chatId,
              source: 'voiceMessage',
              sourceEventId: String(sourceMessageId),
              title: copy.voiceMessage,
              summary: initialSummary,
              mediaUris: finalizedMediaCapture.localUri ? [finalizedMediaCapture.localUri] : undefined,
              remember: true,
              recallWeight: 0.65,
              state: 'pending',
            })),
          }));
        }

        if (type === 'image') {
          await waitForOutgoingTurnReadWindow(chatId, chatId, turnId, fastChat);
          if (!sourceMessageStillExists()) return;
          transitionOutgoingTurn(chatId, turnId, 'read');
          if (state.apiKey.trim() && finalizedMediaCapture?.localUri) {
            set({
              islandNotification: {
                title: activeChar?.name || copy.photo,
                desc: copy.language === 'zh' ? '正在看你发来的图片…' : 'Looking at your photo…',
                icon: activeChar?.avatar,
                status: 'processing',
              },
            });
            try {
              const providerSettings = createLegacyProviderCapabilitySettings({
                apiUrl: state.apiUrl,
                apiKey: state.apiKey,
                selectedModel: state.selectedModel,
              });
              const analysis = await analyzeDurableImage({
                imageUri: finalizedMediaCapture.localUri,
                vision: providerSettings.vision,
                language: state.themeConfig.language === 'zh' ? 'zh-CN' : 'en',
                relationshipContext: `${state.myName} shared this image with ${activeChar?.name || 'the character'}.`,
              });
              userText = copy.language === 'zh'
                ? `${state.myName || '用户'}发来一张图片。你看到的内容：${analysis.description}`
                : `${state.myName || 'User'} shared a photo. Visible content: ${analysis.description}`;
              initialSummary = userText;
              imageAnalysisShouldRemember = !analysis.sensitive;
              set(current => ({
                relationshipTraces: upsertRelationshipTrace(current.relationshipTraces, createRelationshipTrace({
                  characterId: chatId,
                  source: 'photo',
                  sourceEventId: String(sourceMessageId),
                  title: copy.sharedPhoto,
                  summary: initialSummary,
                  mediaUris: [finalizedMediaCapture.localUri!],
                  remember: !analysis.sensitive,
                  recallWeight: analysis.sensitive ? 0.2 : 0.55,
                  state: analysis.sensitive ? 'ignored' : 'pending',
                })),
              }));
            } catch (error) {
              console.warn('Image understanding failed; continuing with a safe generic photo reply.', error);
              userText = note || copy.sharedAPhoto;
            }
          }
        }

        if (!sourceMessageStillExists()) return;

        const requestId = turnId;
        const hasRemoteApiKey = state.apiKey.trim().length > 0;
        const generationSource: ChatGenerationSource = hasRemoteApiKey ? 'remote' : 'localSandbox';
        if (type === 'text') {
          beginUserMessageBurst(chatId, requestId, {
            sourceMessageId,
            text: userText,
          });
        }
        set(s => ({
          pendingChatRequests: beginChatRequest(s.pendingChatRequests, chatId, requestId).pending,
        }));

        try {
          if (type === 'text') {
            const burstItems = await collectUserMessageBurst({
              chatId,
              requestId,
              fast: fastChat,
            });
            if (!burstItems || !isCurrentChatRequest(get().pendingChatRequests, chatId, requestId)) return;
            cancelUserMessageBurst(chatId, requestId);
            userText = burstItems.map(item => item.text).join('\n');
            continuitySourceMessageIds = burstItems.map(item => item.sourceMessageId);
          }
          await waitForOutgoingTurnReadWindow(chatId, chatId, requestId, fastChat);
          if (!isCurrentChatRequest(get().pendingChatRequests, chatId, requestId)) return;
          set(current => (
            isCurrentChatRequest(current.pendingChatRequests, chatId, requestId)
              ? {
                  islandNotification: {
                    title: activeChar?.name || 'AI',
                    desc: copy.typing,
                    icon: activeChar?.avatar,
                    status: 'typing',
                  },
                  isGenerating: true,
                }
              : {}
          ));
          const replyPlan = planChatReply({
            characterId: chatId,
            userText,
            fast: fastChat,
          });
          const activePreset = state.onlinePresets.find(p => p.id === state.activeOnlinePresetId) || DEFAULT_ONLINE_PRESET;
          const generatedReply = hasRemoteApiKey
            ? await generateReply({
                userText, userName: state.myName, userDesc: state.myDesc,
                activeChar, activePreset,
                chatHistory: state.chatHistory[chatId] || [],
                worldBookEntries: state.worldBookEntries,
                relationshipTraces: state.relationshipTraces,
                conversationContinuity: state.conversationContinuityByCharacter[chatId],
                memoryWindowSize: state.memoryWindowSize,
                activeChatId: chatId,
                apiUrl: state.apiUrl, apiKey: state.apiKey, selectedModel: state.selectedModel, replaceMacros,
              })
            : {
                text: generateLocalSandboxReply({
                  characterName: activeChar?.name,
                  userText,
                  language: state.themeConfig.language,
                }),
                loreCount: 0,
              };
          const { text: rawReplyText, loreCount } = generatedReply;
          const continuityPatch = 'continuityPatch' in generatedReply
            ? generatedReply.continuityPatch
            : undefined;
          const parsedReplyMessages = splitCharacterReplyIntoMessages(rawReplyText);
          const replyMessages = parsedReplyMessages.length > 0
            ? parsedReplyMessages
            : [rawReplyText.trim() || (copy.language === 'zh' ? '我在。' : "I'm here.")];
          const normalizedReplyText = replyMessages.join(' ');
          transitionOutgoingTurn(chatId, requestId, 'read');
          await waitForChatReplyPlan(replyPlan);
          if (!isCurrentChatRequest(get().pendingChatRequests, chatId, requestId)) return;

          const charReplyMode = characterReplyMode(activeChar);
          const replyType = resolveCharacterReplyType(activeChar, charReplyMode, type);
          const deliveryMessages = replyType === 'voice' ? [normalizedReplyText] : replyMessages;
          let charVoiceDraft = replyType === 'voice'
            ? createCharacterVoiceReplyDraft(activeChar, normalizedReplyText, charReplyMode)
            : null;

          if (replyType === 'voice' && charVoiceDraft) {
            const voiceProvider = resolveVoiceProvider({
              voiceProviderEnabled: state.voiceProviderEnabled,
              voiceApiUrl: state.voiceApiUrl,
              voiceApiKey: state.voiceApiKey,
              voiceSttModel: state.voiceSttModel,
              voiceTtsModel: state.voiceTtsModel,
              chatApiUrl: state.apiUrl,
              chatApiKey: state.apiKey,
              chatModel: state.selectedModel,
            });
            const speechAudio = await synthesizeSpeechAudio({
              text: normalizedReplyText,
              apiUrl: voiceProvider.tts.apiUrl,
              apiKey: voiceProvider.tts.apiKey,
              voiceProfileId: activeChar?.voiceProfileId,
              ttsModel: voiceProvider.tts.model,
            });
            if (!isCurrentChatRequest(get().pendingChatRequests, chatId, requestId)) return;
            if (speechAudio.phase === 'ready' && speechAudio.localUri) {
              charVoiceDraft = createVoiceMessageDraftFromCapture(
                resolveSpeechToTextResult({
                  transcript: normalizedReplyText,
                  localUri: speechAudio.localUri,
                  durationSec: speechAudio.durationSec,
                }),
                charReplyMode,
              ) || charVoiceDraft;
              if (state.autoTTS || type === 'voice') void playAudioUriOnce(speechAudio.localUri);
            } else if (state.autoTTS || type === 'voice') {
              void speakSpeechSynthesisPlan(createSpeechSynthesisPlan({
                character: activeChar,
                text: normalizedReplyText,
                language: state.speechLanguage || 'zh-CN',
              }));
            }
          }

          const selectedCharacterMedia = activeChar?.autonomousImageSharingEnabled
            ? selectCharacterMediaAsset({
                characterId: activeChar.id,
                assets: state.characterMediaAssets,
                sendHistory: state.characterMediaSendHistory,
                intent: inferCharacterMediaIntent(`${userText} ${normalizedReplyText}`),
                tags: `${userText} ${normalizedReplyText}`
                  .toLowerCase()
                  .split(/[^\p{L}\p{N}]+/u)
                  .filter(Boolean)
                  .slice(0, 12),
                policy: { enabled: true },
              }).asset
            : null;
          const selectedCharacterSticker = chooseCharacterStickerForReply({
            stickers: state.stickers,
            replyText: normalizedReplyText,
            characterId: chatId,
            seed: `${sourceMessageId}:${requestId}`,
            force: type === 'sticker',
          });

          let didCommitAll = false;
          const committedReplyMessageIds: number[] = [];
          for (const [messageIndex, messageText] of deliveryMessages.entries()) {
            if (messageIndex > 0) {
              await waitForCharacterFollowUp({
                characterId: chatId,
                messageText,
                messageIndex,
                fast: fastChat,
              });
            }
            if (!isCurrentChatRequest(get().pendingChatRequests, chatId, requestId)) return;

            const isLastMessage = messageIndex === deliveryMessages.length - 1;
            const replyMessageId = nextMessageId();
            let didCommitMessage = false;
            set(s => {
              if (!isCurrentChatRequest(s.pendingChatRequests, chatId, requestId)) return {};
              const completion = isLastMessage
                ? completeChatRequest(s.pendingChatRequests, chatId, requestId)
                : { completed: true, pending: s.pendingChatRequests };
              if (!completion.completed) return {};
              const nextPending = completion.pending;
              const completedAt = Date.now();
              const replyTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              didCommitMessage = true;
              if (isLastMessage) didCommitAll = true;
              return {
                ...(isLastMessage ? {
                  islandNotification: null,
                  isGenerating: Object.keys(nextPending).length > 0,
                  pendingChatRequests: nextPending,
                  lastLoreCount: loreCount,
                  relationshipTraces: upsertRelationshipTrace(s.relationshipTraces, createRelationshipTrace({
                    characterId: chatId,
                    source: traceSource,
                    sourceEventId: String(sourceMessageId),
                    title: traceTitle,
                    summary: `${traceUserName}: ${userText} / ${traceCharacterName}: ${normalizedReplyText}`,
                    mediaUris: type === 'sticker' && selectedSticker
                      ? [selectedSticker.uri]
                      : finalizedMediaCapture?.localUri ? [finalizedMediaCapture.localUri] : undefined,
                    remember: type !== 'sticker' && (type !== 'image' || imageAnalysisShouldRemember),
                    recallWeight: type === 'sticker' ? 0.1 : type === 'voice' ? 0.7 : 0.5,
                    state: type === 'sticker' || (type === 'image' && !imageAnalysisShouldRemember)
                      ? 'ignored'
                      : 'digested',
                  })),
                  proactiveChatSchedules: {
                    ...s.proactiveChatSchedules,
                    [chatId]: rescheduleProactiveAfterInteraction(
                      s.proactiveChatSchedules[chatId],
                      chatId,
                      Date.now(),
                      s.characters.find(character => character.id === chatId)
                        ?.proactiveMessagingFrequency || 'normal',
                    ),
                  },
                  conversationContinuityByCharacter: {
                    ...s.conversationContinuityByCharacter,
                    [chatId]: updateConversationContinuity(
                      s.conversationContinuityByCharacter[chatId],
                      {
                        characterId: chatId,
                        turnId: requestId,
                        userText,
                        characterText: normalizedReplyText,
                        modelPatch: continuityPatch,
                        sourceMessageIds: [
                          ...continuitySourceMessageIds,
                          ...committedReplyMessageIds,
                          replyMessageId,
                        ],
                        now: completedAt,
                      },
                    ),
                  },
                } : {}),
                chatHistory: {
                  ...s.chatHistory,
                  [chatId]: [...(s.chatHistory[chatId] || []), {
                    id: replyMessageId,
                    sender: 'char',
                    text: messageText,
                    time: replyTime,
                    generationSource,
                    ...(charVoiceDraft && messageIndex === 0
                      ? {
                          type: 'voice' as MessageType,
                          audioUri: charVoiceDraft.audioUri,
                          audioDurationSec: charVoiceDraft.audioDurationSec,
                          transcript: charVoiceDraft.transcript,
                          replyMode: charVoiceDraft.replyMode,
                        }
                      : {}),
                  }],
                },
                unreadCounts: {
                  ...s.unreadCounts,
                  [chatId]: unreadAfterRemoteEvent(s, chatId),
                },
              };
            });
            if (!didCommitMessage) return;
            committedReplyMessageIds.push(replyMessageId);
            if (!isLastMessage) triggerHaptic('light');
          }
          if (!didCommitAll) return;
          if (selectedCharacterMedia) {
            const mediaSentAt = Date.now();
            set(current => ({
              chatHistory: {
                ...current.chatHistory,
                [chatId]: [...(current.chatHistory[chatId] || []), {
                  id: nextMessageId(),
                  sender: 'char',
                  text: copy.sharedAPhoto,
                  time: new Date(mediaSentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  type: 'image',
                  imageUri: selectedCharacterMedia.uri,
                  generationSource,
                  createdAt: mediaSentAt,
                }],
              },
              characterMediaSendHistory: [
                ...current.characterMediaSendHistory,
                {
                  assetId: selectedCharacterMedia.id,
                  characterId: chatId,
                  sentAt: mediaSentAt,
                },
              ].slice(-500),
              relationshipTraces: upsertRelationshipTrace(current.relationshipTraces, createRelationshipTrace({
                characterId: chatId,
                source: 'photo',
                sourceEventId: `character-photo:${selectedCharacterMedia.id}:${mediaSentAt}`,
                title: copy.sharedPhoto,
                summary: copy.language === 'zh'
                  ? `${activeChar?.name || '角色'}给${state.myName || '你'}发来一张图片。`
                  : `${activeChar?.name || 'The character'} shared a photo with ${state.myName || 'you'}.`,
                mediaUris: [selectedCharacterMedia.uri],
                recallWeight: 0.45,
                state: 'digested',
              })),
            }));
          }
          if (selectedCharacterSticker) {
            set(current => ({
              chatHistory: {
                ...current.chatHistory,
                [chatId]: [...(current.chatHistory[chatId] || []), {
                  id: nextMessageId(),
                  sender: 'char',
                  text: `[Sticker: ${selectedCharacterSticker.name}]`,
                  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  type: 'sticker',
                  stickerId: selectedCharacterSticker.id,
                  stickerUri: selectedCharacterSticker.uri,
                  stickerName: selectedCharacterSticker.name,
                  generationSource,
                  createdAt: Date.now(),
                }],
              },
            }));
          }
          triggerHaptic('medium');
          set({
            islandNotification: {
              title: activeChar?.name || 'AI',
              desc: charVoiceDraft ? copy.newVoiceMessage : copy.newMessage,
              icon: activeChar?.avatar,
              status: 'success',
            },
          });
          setTimeout(() => set({ islandNotification: null }), 3000);
        } catch (error) {
          cancelUserMessageBurst(chatId, requestId);
          console.error(error);
          const failureMessage = error instanceof Error ? error.message : copy.apiCallFailed;
          transitionOutgoingTurn(chatId, requestId, 'failed', failureMessage);
          let didCommit = false;
          set(s => {
            const completion = completeChatRequest(s.pendingChatRequests, chatId, requestId);
            if (!completion.completed) return {};
            const nextPending = completion.pending;
            didCommit = true;
            return {
              islandNotification: {
                title: activeChar?.name || 'AI',
                desc: failureMessage,
                icon: activeChar?.avatar,
                status: 'error',
              },
              isGenerating: Object.keys(nextPending).length > 0,
              pendingChatRequests: nextPending,
              relationshipTraces: upsertRelationshipTrace(s.relationshipTraces, createRelationshipTrace({
                characterId: chatId,
                source: traceSource,
                sourceEventId: String(sourceMessageId),
                title: traceTitle,
                summary: initialSummary,
                mediaUris: type === 'sticker' && selectedSticker
                  ? [selectedSticker.uri]
                  : finalizedMediaCapture?.localUri ? [finalizedMediaCapture.localUri] : undefined,
                remember: type !== 'sticker' && (type !== 'image' || imageAnalysisShouldRemember),
                recallWeight: type === 'sticker' ? 0.1 : type === 'voice' ? 0.5 : 0.25,
                state: type === 'sticker' || (type === 'image' && !imageAnalysisShouldRemember)
                  ? 'ignored'
                  : 'failed',
              })),
            };
          });
          if (didCommit) {
            triggerHaptic('error');
            setTimeout(() => useNanaStore.setState({ islandNotification: null }), 2600);
          }
        }
      },

      runProactiveChatHeartbeat: async (now = Date.now()) => {
        if (proactiveHeartbeatInFlight) return;
        proactiveHeartbeatInFlight = true;
        try {
          set(state => {
            let nextSchedules = state.proactiveChatSchedules;
            let changed = false;
            const friendIds = new Set(state.friends);
            for (const character of state.characters) {
              if (
                !friendIds.has(character.id)
                || character.proactiveMessagingEnabled === false
                || nextSchedules[character.id]
              ) continue;
              if (!changed) nextSchedules = { ...nextSchedules };
              nextSchedules[character.id] = createInitialProactiveSchedule(
                character.id,
                now,
                character.proactiveMessagingFrequency || 'normal',
              );
              changed = true;
            }
            return changed ? { proactiveChatSchedules: nextSchedules } : {};
          });

          const state = get();
          if (
            state.callOverlay.show
            || Object.keys(state.pendingChatRequests).length > 0
            || Object.keys(state.pendingPaymentReactions).length > 0
          ) return;
          const character = selectDueProactiveCandidate({
            characters: state.characters,
            friends: state.friends,
            schedules: state.proactiveChatSchedules,
            pendingChatRequests: state.pendingChatRequests,
            blockedUsers: state.blockedUsers,
            now,
          });
          if (!character) return;

          const originalSchedule = state.proactiveChatSchedules[character.id];
          if (!originalSchedule) return;
          const copy = runtimeCopyFor(state.themeConfig.language);
          const focusEvent = selectProactiveFocusEvent(
            state.relationshipTraces,
            character.id,
            originalSchedule,
            now,
          );
          const continuitySummary = selectConversationContinuityFollowUp(
            state.conversationContinuityByCharacter[character.id],
            now,
          );
          let draft = createLocalProactiveMessage({
            characterId: character.id,
            characterName: character.name,
            personaDescription: character.desc,
            recentEventSummary: focusEvent?.summary,
            continuitySummary,
            language: state.themeConfig.language,
            now,
            timeZone: character.timeZone,
          });
          let continuityPatch: Awaited<ReturnType<typeof generateProactiveReply>>['continuityPatch'];
          if (state.apiKey.trim()) {
            const activePreset = state.onlinePresets.find(preset => (
              preset.id === state.activeOnlinePresetId
            )) || DEFAULT_ONLINE_PRESET;
            try {
              const generated = await generateProactiveReply({
                userName: state.myName,
                userDesc: state.myDesc,
                activeChar: character,
                activePreset,
                chatHistory: state.chatHistory[character.id] || [],
                worldBookEntries: state.worldBookEntries,
                relationshipTraces: state.relationshipTraces,
                conversationContinuity: state.conversationContinuityByCharacter[character.id],
                memoryWindowSize: state.memoryWindowSize,
                activeChatId: character.id,
                apiUrl: state.apiUrl,
                apiKey: state.apiKey,
                selectedModel: state.selectedModel,
                replaceMacros,
                language: state.themeConfig.language,
                focusEvent: focusEvent || undefined,
              });
              draft = generated.text;
              continuityPatch = generated.continuityPatch;
            } catch (error) {
              console.warn('Proactive model generation failed; using local fallback.', error);
            }
          }
          const proactiveMessages = splitCharacterReplyIntoMessages(draft);
          if (proactiveMessages.length === 0) return;
          const fastChat = process.env.EXPO_PUBLIC_NANA_FAST_CHAT === '1';

          let deliveredAll = false;
          for (const [messageIndex, messageText] of proactiveMessages.entries()) {
            if (messageIndex > 0) {
              await waitForCharacterFollowUp({
                characterId: character.id,
                messageText,
                messageIndex,
                fast: fastChat,
              });
            }

            const isLastMessage = messageIndex === proactiveMessages.length - 1;
            let didCommit = false;
            set(current => {
              const liveSchedule = current.proactiveChatSchedules[character.id];
              const sequenceIsCurrent = messageIndex === 0
                ? liveSchedule?.nextDueAt === originalSchedule.nextDueAt
                  && liveSchedule.nextDueAt <= now
                : liveSchedule?.lastSentAt === now
                  && liveSchedule.lastInteractionAt === originalSchedule.lastInteractionAt;
              if (
                !sequenceIsCurrent
                || current.callOverlay.show
                || Object.keys(current.pendingChatRequests).length > 0
                || Object.keys(current.pendingPaymentReactions).length > 0
                || current.blockedUsers.includes(character.id)
                || !current.friends.includes(character.id)
                || current.characters.find(item => item.id === character.id)?.proactiveMessagingEnabled === false
              ) return {};

              didCommit = true;
              if (isLastMessage) deliveredAll = true;
              return {
                chatHistory: {
                  ...current.chatHistory,
                  [character.id]: [...(current.chatHistory[character.id] || []), {
                    id: nextMessageId(),
                    sender: 'char',
                    text: messageText,
                    time: new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    type: 'text' as MessageType,
                    generationSource: 'proactive' as const,
                  }],
                },
                proactiveChatSchedules: messageIndex === 0
                  ? {
                      ...current.proactiveChatSchedules,
                      [character.id]: rescheduleAfterProactiveMessage(
                        liveSchedule,
                        character.id,
                        now,
                        focusEvent?.id,
                        character.proactiveMessagingFrequency || 'normal',
                      ),
                    }
                  : current.proactiveChatSchedules,
                unreadCounts: {
                  ...current.unreadCounts,
                  [character.id]: unreadAfterRemoteEvent(current, character.id),
                },
                ...(isLastMessage ? {
                  conversationContinuityByCharacter: {
                    ...current.conversationContinuityByCharacter,
                    [character.id]: updateConversationContinuity(
                      current.conversationContinuityByCharacter[character.id],
                      {
                        characterId: character.id,
                        turnId: `proactive:${character.id}:${now}`,
                        userText: '',
                        characterText: proactiveMessages.join(' '),
                        modelPatch: continuityPatch,
                        now,
                      },
                    ),
                  },
                } : {}),
              };
            });
            if (!didCommit) return;
          }

          if (!deliveredAll) return;
          set({
            islandNotification: {
              title: character.name,
              desc: copy.newMessage,
              icon: character.avatar,
              status: 'success',
            },
          });
          setTimeout(() => useNanaStore.setState({ islandNotification: null }), 3000);
        } finally {
          proactiveHeartbeatInFlight = false;
        }
      },

      receiveRemoteProactiveMessage: (envelope) => {
        const turnId = `remote-proactive:${envelope.eventId}`;
        const messageTexts = splitCharacterReplyIntoMessages(envelope.text);
        if (messageTexts.length === 0) return 'rejected';

        let result: 'committed' | 'duplicate' | 'rejected' = 'rejected';
        let didCommit = false;
        set(current => {
          const character = current.characters.find(item => item.id === envelope.characterId);
          if (
            !character
            || !current.friends.includes(envelope.characterId)
            || current.blockedUsers.includes(envelope.characterId)
            || character.proactiveMessagingEnabled === false
            || character.proactiveMessagingFrequency === 'off'
          ) return {};

          const history = current.chatHistory[envelope.characterId] || [];
          if (history.some(message => message.turnId === turnId)) {
            result = 'duplicate';
            return {};
          }

          const receivedAt = Date.now();
          const schedule = current.proactiveChatSchedules[envelope.characterId]
            || createInitialProactiveSchedule(
              envelope.characterId,
              receivedAt,
              character.proactiveMessagingFrequency || 'normal',
            );
          result = 'committed';
          didCommit = true;
          return {
            chatHistory: {
              ...current.chatHistory,
              [envelope.characterId]: [
                ...history,
                ...messageTexts.map(messageText => ({
                  id: nextMessageId(),
                  sender: 'char',
                  text: messageText,
                  time: new Date(envelope.generatedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                  type: 'text' as MessageType,
                  generationSource: 'proactive' as const,
                  createdAt: envelope.generatedAt,
                  turnId,
                })),
              ],
            },
            proactiveChatSchedules: {
              ...current.proactiveChatSchedules,
              [envelope.characterId]: rescheduleAfterProactiveMessage(
                schedule,
                envelope.characterId,
                receivedAt,
                undefined,
                character.proactiveMessagingFrequency || 'normal',
              ),
            },
            unreadCounts: {
              ...current.unreadCounts,
              [envelope.characterId]: unreadAfterRemoteEvent(current, envelope.characterId),
            },
            conversationContinuityByCharacter: {
              ...current.conversationContinuityByCharacter,
              [envelope.characterId]: updateConversationContinuity(
                current.conversationContinuityByCharacter[envelope.characterId],
                {
                  characterId: envelope.characterId,
                  turnId,
                  userText: '',
                  characterText: messageTexts.join(' '),
                  now: receivedAt,
                },
              ),
            },
            islandNotification: {
              title: character.name,
              desc: runtimeCopyFor(current.themeConfig.language).newMessage,
              icon: character.avatar,
              status: 'success' as const,
            },
          };
        });
        if (didCommit) {
          setTimeout(() => useNanaStore.setState({ islandNotification: null }), 3000);
        }
        return result;
      },

      runProactiveMomentsHeartbeat: async (now = Date.now()) => {
        if (proactiveMomentHeartbeatInFlight) return;
        proactiveMomentHeartbeatInFlight = true;
        try {
          set(state => {
            let schedules = state.proactiveMomentSchedules;
            let changed = false;
            const friendIds = new Set(state.friends);
            for (const character of state.characters) {
              const mode = character.proactiveMomentsMode || 'occasional';
              if (!friendIds.has(character.id) || mode === 'off' || schedules[character.id]) continue;
              const schedule = createInitialMomentSchedule(character.id, mode, now);
              if (!schedule) continue;
              if (!changed) schedules = { ...schedules };
              schedules[character.id] = schedule;
              changed = true;
            }
            return changed ? { proactiveMomentSchedules: schedules } : {};
          });

          const state = get();
          if (
            state.callOverlay.show
            || Object.keys(state.pendingChatRequests).length > 0
            || Object.keys(state.pendingPaymentReactions).length > 0
          ) return;
          const character = selectDueMomentCandidate({
            characters: state.characters,
            friends: state.friends,
            blockedUsers: state.blockedUsers,
            schedules: state.proactiveMomentSchedules,
            appState: 'active',
            pendingCharacterIds: state.pendingMomentCharacterIds,
            now,
          });
          if (!character) return;
          const schedule = state.proactiveMomentSchedules[character.id];
          if (!schedule) return;
          set(current => ({
            pendingMomentCharacterIds: current.pendingMomentCharacterIds.includes(character.id)
              ? current.pendingMomentCharacterIds
              : [...current.pendingMomentCharacterIds, character.id],
          }));

          const focusEvent = selectMomentFocusEvent(
            state.relationshipTraces,
            character.id,
            schedule,
            now,
          );
          const localDraft = createLocalMomentDraft({
            characterId: character.id,
            characterName: character.name,
            personaDescription: character.desc,
            recentEventSummary: focusEvent?.summary,
            focusTraceId: focusEvent?.id,
            language: state.themeConfig.language,
            now,
          });
          let text = localDraft.text;
          let generationSource: Moment['generationSource'] = 'characterLocal';
          if (state.apiKey.trim()) {
            try {
              text = await generateMomentPost({
                character,
                userName: state.myName,
                recentChat: state.chatHistory[character.id] || [],
                relationshipTraces: state.relationshipTraces,
                focusEvent: focusEvent || undefined,
                language: state.themeConfig.language,
                apiUrl: state.apiUrl,
                apiKey: state.apiKey,
                selectedModel: state.selectedModel,
              });
              generationSource = 'characterRemote';
            } catch (error) {
              console.warn('Moment post generation failed; using local persona fallback.', error);
            }
          }

          const momentId = `moment:${character.id}:${now}:${Math.random().toString(36).slice(2, 8)}`;
          let committed = false;
          set(current => {
            const liveCharacter = current.characters.find(item => item.id === character.id);
            const liveSchedule = current.proactiveMomentSchedules[character.id];
            const mode = liveCharacter?.proactiveMomentsMode || 'occasional';
            const pendingMomentCharacterIds = current.pendingMomentCharacterIds
              .filter(id => id !== character.id);
            if (
              !liveCharacter
              || mode === 'off'
              || !current.friends.includes(character.id)
              || current.blockedUsers.includes(character.id)
              || liveSchedule?.nextDueAt !== schedule.nextDueAt
            ) return { pendingMomentCharacterIds };
            const nextSchedule = rescheduleAfterMomentPost(
              liveSchedule,
              character.id,
              mode,
              now,
              focusEvent?.id,
            );
            if (!nextSchedule) return { pendingMomentCharacterIds };
            committed = true;
            return {
              momentsList: [{
                id: momentId,
                authorId: liveCharacter.id,
                authorName: liveCharacter.name,
                avatar: liveCharacter.avatar,
                text,
                images: [],
                timestamp: now,
                likes: [],
                comments: [],
                generationSource,
                ...(focusEvent ? { focusTraceId: focusEvent.id } : {}),
              }, ...current.momentsList].slice(0, 500),
              proactiveMomentSchedules: {
                ...current.proactiveMomentSchedules,
                [character.id]: nextSchedule,
              },
              pendingMomentCharacterIds,
            };
          });
          if (committed) {
            set({
              islandNotification: {
                title: character.name,
                desc: runtimeCopyFor(state.themeConfig.language).language === 'zh'
                  ? '发布了一条朋友圈'
                  : 'Posted a new moment',
                icon: character.avatar,
                status: 'success',
              },
            });
            setTimeout(() => useNanaStore.setState({ islandNotification: null }), 2400);
          }
        } finally {
          const pending = get().pendingMomentCharacterIds;
          if (pending.length > 0) {
            set({ pendingMomentCharacterIds: [] });
          }
          proactiveMomentHeartbeatInFlight = false;
        }
      },

      retryChatMessage: async (errorMessageId) => {
        const state = get();
        const copy = runtimeCopyFor(state.themeConfig.language);
        const chatId = state.activeChatId;
        if (!chatId || state.pendingChatRequests[chatId]) return;
        const history = state.chatHistory[chatId] || [];
        const failedVoiceTranscription = history.find(message => (
          message.id === errorMessageId
          && message.sender === 'user'
          && message.type === 'voice'
          && message.voiceTranscriptionStatus === 'failed'
          && !!message.audioUri
        ));
        if (failedVoiceTranscription?.audioUri) {
          const retryCapture: MediaCaptureResult = {
            phase: 'processing',
            mediaKind: 'audio',
            localUri: failedVoiceTranscription.audioUri,
            durationSec: failedVoiceTranscription.audioDurationSec || 1,
          };
          set(current => ({
            chatHistory: {
              ...current.chatHistory,
              [chatId]: (current.chatHistory[chatId] || []).map(message => (
                message.id === failedVoiceTranscription.id
                  ? {
                      ...message,
                      voiceTranscriptionStatus: 'pending',
                      voiceTranscriptionError: undefined,
                    }
                  : message
              )),
            },
          }));
          await get().sendChatMessage(
            'voice',
            failedVoiceTranscription.amount,
            undefined,
            retryCapture,
            {
              textOverride: '',
              skipUserAppend: true,
              skipDeliverySchedule: true,
              sourceMessageId: failedVoiceTranscription.id,
              turnIdOverride: failedVoiceTranscription.turnId,
            },
          );
          return;
        }
        const failedMessage = history.find(message => (
          message.id === errorMessageId
          && message.sender === 'user'
          && message.deliveryStatus === 'failed'
        ));
        if (failedMessage) {
          const turnId = failedMessage.turnId
            || `reply:${chatId}:${failedMessage.id}:${Date.now()}`;
          const retryMessages = failedMessage.turnId
            ? history.filter(message => (
                message.sender === 'user'
                && message.turnId === failedMessage.turnId
                && message.deliveryStatus === 'failed'
              ))
            : [failedMessage];
          if (retryMessages.length === 0) return;
          const retryMessageIds = retryMessages.map(message => message.id);
          const original = retryMessages[0];
          const retryText = retryMessages
            .map(message => message.transcript || message.text)
            .filter(Boolean)
            .join('\n');
          const retryVoiceCapture: MediaCaptureResult | undefined = original.type === 'voice'
            && original.audioUri
            ? {
                phase: 'processing',
                mediaKind: 'audio',
                localUri: original.audioUri,
                durationSec: original.audioDurationSec || 1,
                transcript: original.transcript || retryText || undefined,
              }
            : undefined;
          if (original.type === 'voice' && !retryVoiceCapture && !retryText) {
            set({
              islandNotification: {
                title: copy.voiceMessage,
                desc: copy.recordingCancelledOrTooShort,
                status: 'error',
              },
            });
            triggerHaptic('error');
            return;
          }
          const retryAt = Date.now();
          cancelMessageDeliveryTimers(chatId, retryMessageIds);
          set(current => ({
            chatHistory: {
              ...current.chatHistory,
              [chatId]: (current.chatHistory[chatId] || []).map(message => (
                retryMessageIds.includes(message.id)
                  ? {
                      ...resetFailedMessageDelivery(message, retryAt),
                      turnId,
                    }
                  : message
              )),
            },
          }));
          await get().sendChatMessage(
            retryMessages.length === 1 && original.type === 'voice' && retryVoiceCapture
              ? 'voice'
              : 'text',
            original.amount,
            original.note,
            retryVoiceCapture,
            {
              textOverride: retryText,
              skipUserAppend: true,
              sourceMessageId: original.id,
              retryMessageIds,
              turnIdOverride: turnId,
            },
          );
          return;
        }

        const errorIndex = history.findIndex(message => message.id === errorMessageId && message.sender === 'system');
        if (errorIndex < 0) return;
        const original = history.slice(0, errorIndex).reverse().find(message => message.sender === 'user');
        if (!original) return;
        const legacyRetryText = original.transcript || original.text;
        const legacyVoiceCapture: MediaCaptureResult | undefined = original.type === 'voice'
          && original.audioUri
          ? {
              phase: 'processing',
              mediaKind: 'audio',
              localUri: original.audioUri,
              durationSec: original.audioDurationSec || 1,
              transcript: original.transcript || legacyRetryText || undefined,
            }
          : undefined;
        if (original.type === 'voice' && !legacyVoiceCapture && !legacyRetryText) {
          set({
            islandNotification: {
              title: copy.voiceMessage,
              desc: copy.recordingCancelledOrTooShort,
              status: 'error',
            },
          });
          triggerHaptic('error');
          return;
        }

        const retryAt = Date.now();
        const legacyTurnId = original.turnId || `reply:${chatId}:${original.id}:${retryAt}`;
        set(s => ({
          chatHistory: {
            ...s.chatHistory,
            [chatId]: (s.chatHistory[chatId] || [])
              .filter(message => message.id !== errorMessageId)
              .map(message => (
                message.id === original.id
                  ? {
                      ...message,
                      turnId: legacyTurnId,
                      deliveryStatus: 'sending',
                      deliveryAttemptedAt: retryAt,
                      deliveryUpdatedAt: retryAt,
                      deliveryAttemptCount: Math.max(1, message.deliveryAttemptCount || 0) + 1,
                    }
                  : message
              )),
          },
        }));
        await get().sendChatMessage(
          original.type === 'voice' && legacyVoiceCapture ? 'voice' : 'text',
          original.amount,
          original.note,
          legacyVoiceCapture,
          {
            textOverride: legacyRetryText,
            skipUserAppend: true,
            sourceMessageId: original.id,
            retryMessageIds: [original.id],
            turnIdOverride: legacyTurnId,
          },
        );
      },

      startOutgoingCall: (type) => {
        cancelActiveCallVoiceRequest();
        cancelActiveVoicePreview();
        stopSharedVoiceMessagePlayback();
        stopOneShotAudioPlayback();
        stopSpeechSynthesis();
        const state = get();
        if (!state.activeChatId) return;
        const copy = runtimeCopyFor(state.themeConfig.language);
        const activeChar = state.characters.find(c => c.id === state.activeChatId);
        const overlay = withCallInteractionContract(createCallOverlayState(type, activeChar, 'AI'));

        set({
          chatPanel: 'none',
          callOverlay: overlay,
          islandNotification: {
            title: activeChar?.name || 'AI',
            desc: copy.calling,
            icon: activeChar?.avatar,
            status: 'processing',
          },
        });

        setTimeout(() => {
          const latest = get().callOverlay;
          if (!latest.show || latest.startedAt !== overlay.startedAt || latest.status !== 'ringing') return;
          set({
            callOverlay: {
              ...latest,
              status: 'connected',
              connectedAt: Date.now(),
            },
            islandNotification: null,
          });
        }, 900);
      },

      startIncomingCall: (type, characterId) => {
        cancelActiveCallVoiceRequest();
        cancelActiveVoicePreview();
        stopSharedVoiceMessagePlayback();
        stopOneShotAudioPlayback();
        stopSpeechSynthesis();
        const state = get();
        const copy = runtimeCopyFor(state.themeConfig.language);
        const activeChar = state.characters.find(c => c.id === characterId);
        const overlay = withCallInteractionContract({
          ...createCallOverlayState(type, activeChar, 'AI'),
          status: 'incoming' as const,
          direction: 'incoming' as const,
          characterId,
          transcript: [],
        });
        set({
          activeApp: 'wechat',
          activeChatId: characterId,
          weChatPage: 'chat',
          chatPanel: 'none',
          callOverlay: overlay,
          islandNotification: {
            title: overlay.name,
            desc: type === 'video' ? copy.incomingVideoCall : copy.incomingVoiceCall,
            icon: activeChar?.avatar,
            status: 'processing',
          },
        });
      },

      answerCall: () => {
        const state = get();
        const overlay = state.callOverlay;
        if (!overlay.show) return;
        set({
          callOverlay: {
            ...overlay,
            status: 'connected',
            connectedAt: Date.now(),
          },
          islandNotification: null,
        });
      },

      invalidateActiveCallVoiceInput: (startedAt) => {
        cancelActiveCallVoiceRequest();
        stopOneShotAudioPlayback();
        stopSpeechSynthesis();
        set(state => {
          const overlay = state.callOverlay;
          if (
            !overlay.show
            || (startedAt !== undefined && overlay.startedAt !== startedAt)
          ) return {};
          return {
            callOverlay: {
              ...overlay,
              inputEpoch: overlay.inputEpoch + 1,
              speechPhase: overlay.status === 'connected' ? 'idle' as const : overlay.speechPhase,
              errorMessage: undefined,
            },
          };
        });
      },

      endActiveCall: (status = 'completed') => {
        const state = get();
        const overlay = state.callOverlay;
        if (!overlay.show) return;

        stopOneShotAudioPlayback();
        stopSharedVoiceMessagePlayback();
        stopSpeechSynthesis();
        cancelActiveCallVoiceRequest();
        const endedAt = Date.now();
        const normalizedStatus: CallLog['status'] = overlay.status === 'incoming' && status === 'completed'
          ? 'missed'
          : status;
        const copy = runtimeCopyFor(state.themeConfig.language);
        const log = createCallLogFromOverlay(overlay, normalizedStatus, copy, endedAt);
        const chatId = overlay.characterId || state.activeChatId;
        const recordText = log
          ? runtimeCallRecord(copy, overlay.type, normalizedStatus, formatCallDuration(log.durationSec))
          : runtimeCallEnded(copy, overlay.type);

        set(s => ({
          chatPanel: 'none',
          callOverlay: emptyCallOverlay,
          callLogs: log ? [log, ...s.callLogs].slice(0, 200) : s.callLogs,
          relationshipTraces: log && chatId
            ? upsertRelationshipTrace(s.relationshipTraces, createRelationshipTrace({
                characterId: chatId,
                source: overlay.type === 'video' ? 'videoCall' : 'voiceCall',
                sourceEventId: log.id,
                title: runtimeCallTypeLabel(copy, overlay.type),
                summary: log.summary || recordText,
                occurredAt: endedAt,
                recallWeight: normalizedStatus === 'completed' ? 0.85 : 0.3,
                state: 'digested',
              }))
            : s.relationshipTraces,
          ...(chatId ? {
            chatHistory: {
              ...s.chatHistory,
              [chatId]: [
                ...(s.chatHistory[chatId] || []),
                {
                  id: nextMessageId(),
                  sender: 'system',
                  text: recordText,
                  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  type: 'system' as MessageType,
                },
              ],
            },
          } : {}),
          islandNotification: log ? {
            title: overlay.name || copy.fallbackCall,
            desc: log.summary || recordText,
            icon: typeof overlay.avatar === 'string' ? overlay.avatar : undefined,
            status: normalizedStatus === 'completed' ? 'success' : 'processing',
          } : null,
        }));
        setTimeout(() => useNanaStore.setState({ islandNotification: null }), 2200);
      },

      sendCallSpeech: async (capture) => {
        cancelActiveCallVoiceRequest();
        const state = get();
        const copy = runtimeCopyFor(state.themeConfig.language);
        const overlay = state.callOverlay;
        if (!overlay.show || overlay.status !== 'connected') return;
        const requestController = new AbortController();
        activeCallVoiceRequestController = requestController;
        const activeChar = state.characters.find(c => c.id === (overlay.characterId || state.activeChatId));
        const activeChatId = overlay.characterId || state.activeChatId;
        const callSessionStartedAt = overlay.startedAt;
        const callInputEpoch = overlay.inputEpoch;
        const isCurrentCallSession = (candidate: CallOverlayState) => (
          candidate.show
          && candidate.status === 'connected'
          && candidate.startedAt === callSessionStartedAt
          && candidate.characterId === overlay.characterId
          && candidate.inputEpoch === callInputEpoch
        );
        const voiceProvider = resolveVoiceProvider({
          voiceProviderEnabled: state.voiceProviderEnabled,
          voiceApiUrl: state.voiceApiUrl,
          voiceApiKey: state.voiceApiKey,
          voiceSttModel: state.voiceSttModel,
          voiceTtsModel: state.voiceTtsModel,
          chatApiUrl: state.apiUrl,
          chatApiKey: state.apiKey,
          chatModel: state.selectedModel,
        });

        set({
          callOverlay: { ...overlay, speechPhase: 'transcribing' },
          islandNotification: {
            title: overlay.name || copy.fallbackCall,
            desc: copy.transcribing,
            icon: typeof overlay.avatar === 'string' ? overlay.avatar : undefined,
            status: 'processing',
          },
        });

        try {
          const transcriptCapture = await transcribeAudioCapture({
            capture,
            apiUrl: voiceProvider.stt.apiUrl,
            apiKey: voiceProvider.stt.apiKey,
            selectedModel: voiceProvider.stt.model,
            sttModel: voiceProvider.stt.model,
            language: state.speechLanguage || 'zh-CN',
            minimumDurationMillis: VOICE_CALL_TRANSCRIPTION_MIN_DURATION_MS,
            signal: requestController.signal,
          });

          if (transcriptCapture.phase !== 'ready' || !transcriptCapture.transcript?.trim()) {
            let didCommit = false;
            set(s => {
              if (!isCurrentCallSession(s.callOverlay)) return {};
              didCommit = true;
              return {
                callOverlay: {
                  ...s.callOverlay,
                  speechPhase: 'failed' as const,
                  errorMessage: transcriptCapture.errorMessage || copy.noSpeechDetected,
                },
                islandNotification: {
                  title: overlay.name || copy.fallbackCall,
                  desc: transcriptCapture.errorMessage || copy.noSpeechDetected,
                  icon: typeof overlay.avatar === 'string' ? overlay.avatar : undefined,
                  status: 'error',
                },
              };
            });
            if (!didCommit) return;
            setTimeout(() => useNanaStore.setState({ islandNotification: null }), 2200);
            return;
          }

          set(s => ({
            ...(isCurrentCallSession(s.callOverlay) ? {
              callOverlay: {
                ...appendCallTranscriptLine(s.callOverlay, {
                  speaker: 'user',
                  text: transcriptCapture.transcript!.trim(),
                  mode: 'speech',
                }),
                speechPhase: 'thinking' as const,
              },
              islandNotification: {
                title: overlay.name || copy.fallbackCall,
                desc: copy.thinking,
                icon: typeof overlay.avatar === 'string' ? overlay.avatar : undefined,
                status: 'typing' as const,
              },
            } : {}),
          }));

          const currentCallOverlay = get().callOverlay;
          if (!isCurrentCallSession(currentCallOverlay)) return;

          if (!state.apiKey || !activeChatId) {
            throw new Error(copy.apiKeyRequiredSystem);
          }

          const activePreset = state.onlinePresets.find(p => p.id === state.activeOnlinePresetId) || DEFAULT_ONLINE_PRESET;
          const callConversationHistory = buildCallConversationChatHistory({
            chatHistory: state.chatHistory[activeChatId] || [],
            transcript: currentCallOverlay.transcript,
            currentUserText: transcriptCapture.transcript,
          });
          const { text: replyText, continuityPatch } = await generateReply({
            userText: transcriptCapture.transcript,
            userName: state.myName,
            userDesc: state.myDesc,
            activeChar,
            activePreset,
            chatHistory: callConversationHistory,
            worldBookEntries: state.worldBookEntries,
            relationshipTraces: state.relationshipTraces,
            conversationContinuity: state.conversationContinuityByCharacter[activeChatId],
            memoryWindowSize: state.memoryWindowSize,
            activeChatId,
            apiUrl: state.apiUrl,
            apiKey: state.apiKey,
            selectedModel: state.selectedModel,
            replaceMacros,
            signal: requestController.signal,
          });

          const currentOverlay = get().callOverlay;
          if (!isCurrentCallSession(currentOverlay)) return;
          set({ callOverlay: { ...currentOverlay, speechPhase: 'speaking' } });
          const replyType = currentOverlay.characterOutput === 'captionsOnly' ? 'text' : 'voice';
          let replyCapture = resolveSpeechToTextResult({ transcript: replyText });

          if (replyType === 'voice' && toSpeakableText(replyText)) {
            const speechAudio = await synthesizeSpeechAudio({
              text: replyText,
              apiUrl: voiceProvider.tts.apiUrl,
              apiKey: voiceProvider.tts.apiKey,
              voiceProfileId: activeChar?.voiceProfileId,
              ttsModel: voiceProvider.tts.model,
              signal: requestController.signal,
            });
            if (!isCurrentCallSession(get().callOverlay)) {
              if (speechAudio.localUri) deletePersistedMediaFile(speechAudio.localUri, 'audio');
              return;
            }
            if (speechAudio.phase === 'ready' && speechAudio.localUri) {
              let played = false;
              try {
                played = await playAudioUriOnce(speechAudio.localUri, { waitForCompletion: true });
              } finally {
                deletePersistedMediaFile(speechAudio.localUri, 'audio');
              }
              if (!isCurrentCallSession(get().callOverlay)) return;
              if (!played) {
                const deviceSpeech = await speakSpeechSynthesisPlan(createSpeechSynthesisPlan({
                  character: activeChar,
                  text: replyText,
                  language: state.speechLanguage || 'zh-CN',
                }), { waitForCompletion: true });
                if (deviceSpeech.phase !== 'ready') {
                  throw new Error(deviceSpeech.errorMessage || copy.callSpeechFailed);
                }
              }
            } else {
              const deviceSpeech = await speakSpeechSynthesisPlan(createSpeechSynthesisPlan({
                character: activeChar,
                text: replyText,
                language: state.speechLanguage || 'zh-CN',
              }), { waitForCompletion: true });
              if (deviceSpeech.phase !== 'ready') {
                throw new Error(deviceSpeech.errorMessage || copy.callSpeechFailed);
              }
            }
          }

          if (!isCurrentCallSession(get().callOverlay)) return;

          set(s => isCurrentCallSession(s.callOverlay) ? ({
            callOverlay: {
              ...appendCallCaptureResult(s.callOverlay, replyCapture, 'char'),
              speechPhase: 'idle' as const,
            },
            conversationContinuityByCharacter: {
              ...s.conversationContinuityByCharacter,
              [activeChatId]: updateConversationContinuity(
                s.conversationContinuityByCharacter[activeChatId],
                {
                  characterId: activeChatId,
                  turnId: `call:${currentOverlay.startedAt || Date.now()}:${currentOverlay.inputEpoch}`,
                  userText: transcriptCapture.transcript!.trim(),
                  characterText: replyText,
                  modelPatch: continuityPatch,
                },
              ),
            },
            islandNotification: null,
          }) : ({}));
        } catch (error) {
          const message = error instanceof Error ? error.message : copy.callSpeechFailed;
          let didCommit = false;
          set(s => {
            if (!isCurrentCallSession(s.callOverlay)) return {};
            didCommit = true;
            return {
              callOverlay: {
                ...s.callOverlay,
                speechPhase: 'failed' as const,
                errorMessage: message,
              },
              islandNotification: {
                title: overlay.name || copy.fallbackCall,
                desc: message,
                icon: typeof overlay.avatar === 'string' ? overlay.avatar : undefined,
                status: 'error',
              },
            };
          });
          if (!didCommit) return;
          triggerHaptic('error');
          setTimeout(() => useNanaStore.setState({ islandNotification: null }), 2600);
        } finally {
          if (activeCallVoiceRequestController === requestController) {
            activeCallVoiceRequestController = null;
          }
        }
      },

      previewCharacterVoice: async (input = {}) => {
        cancelActiveVoicePreview();
        const previewController = new AbortController();
        activeVoicePreviewController = previewController;
        const state = get();
        const activeChar = state.characters.find(character => (
          character.id === (input.characterId || state.editingCharId || state.activeProfileId || state.activeChatId)
        ));
        const characterName = input.characterName?.trim() || activeChar?.name || 'Nana';
        const voiceProvider = resolveVoiceProvider({
          voiceProviderEnabled: state.voiceProviderEnabled,
          voiceApiUrl: state.voiceApiUrl,
          voiceApiKey: state.voiceApiKey,
          voiceSttModel: state.voiceSttModel,
          voiceTtsModel: state.voiceTtsModel,
          chatApiUrl: state.apiUrl,
          chatApiKey: state.apiKey,
          chatModel: state.selectedModel,
        });
        const voiceProfileId = input.voiceProfileId?.trim()
          || activeChar?.voiceProfileId
          || (voiceProvider.tts.provider === 'openAICompatible' ? 'alloy' : '');
        const isChinese = state.themeConfig.language === 'zh';
        const sampleText = isChinese
          ? `你好，我是${characterName}。以后，就用这个声音陪你说话。`
          : `Hi, I'm ${characterName}. I'll use this voice when we talk.`;
        stopOneShotAudioPlayback();
        await stopSpeechSynthesis();
        set({
          islandNotification: {
            title: characterName,
            desc: isChinese ? '正在准备语音试听…' : 'Preparing voice preview…',
            icon: activeChar?.avatar,
            status: 'processing',
          },
        });

        try {
          const remoteAudio = await synthesizeSpeechAudio({
            text: sampleText,
            apiUrl: voiceProvider.tts.apiUrl,
            apiKey: voiceProvider.tts.apiKey,
            voiceProfileId,
            ttsModel: voiceProvider.tts.model,
            signal: previewController.signal,
          });
          if (previewController.signal.aborted) {
            if (remoteAudio.localUri) deletePersistedMediaFile(remoteAudio.localUri, 'audio');
            return false;
          }
          if (remoteAudio.phase === 'ready' && remoteAudio.localUri) {
            set({
              islandNotification: {
                title: characterName,
                desc: isChinese ? '正在播放远程音色' : 'Playing remote voice',
                icon: activeChar?.avatar,
                status: 'success',
              },
            });
            let played = false;
            try {
              played = await playAudioUriOnce(remoteAudio.localUri, { waitForCompletion: true });
            } finally {
              deletePersistedMediaFile(remoteAudio.localUri, 'audio');
            }
            if (previewController.signal.aborted) return false;
            if (played) {
              setTimeout(() => useNanaStore.setState({ islandNotification: null }), 900);
              return true;
            }
          }

          const previewCharacter: Character = activeChar
            ? {
                ...activeChar,
                supportsVoiceReply: true,
                voiceProfileId,
              }
            : {
                id: 'voice-preview',
                name: characterName,
                avatar: '',
                desc: '',
                supportsVoiceReply: true,
                voiceProfileId,
              };
          const deviceSpeech = await speakSpeechSynthesisPlan(createSpeechSynthesisPlan({
            character: previewCharacter,
            text: sampleText,
            language: state.speechLanguage || (isChinese ? 'zh-CN' : 'en-US'),
          }));
          if (deviceSpeech.phase !== 'ready') {
            throw new Error(deviceSpeech.errorMessage || (isChinese ? '设备语音不可用' : 'Device speech is unavailable'));
          }
          set({
            islandNotification: {
              title: characterName,
              desc: isChinese ? '远程音色不可用，已使用设备语音试听' : 'Remote voice unavailable; using device speech',
              icon: activeChar?.avatar,
              status: 'success',
            },
          });
          setTimeout(() => useNanaStore.setState({ islandNotification: null }), 2600);
          return true;
        } catch (error) {
          set({
            islandNotification: {
              title: characterName,
              desc: error instanceof Error
                ? error.message
                : isChinese ? '语音试听失败' : 'Voice preview failed',
              icon: activeChar?.avatar,
              status: 'error',
            },
          });
          setTimeout(() => useNanaStore.setState({ islandNotification: null }), 2800);
          return false;
        } finally {
          if (activeVoicePreviewController === previewController) {
            activeVoicePreviewController = null;
          }
        }
      },

      doFetchModels: async (url, key) => {
        set({ isLoadingModels: true });
        const fetched = await fetchModelList(url, key);
        const state = get();
        set({
          models: fetched,
          isLoadingModels: false,
          ...(fetched.length > 0 && !fetched.includes(state.selectedModel)
            ? { selectedModel: fetched[0] }
            : {}),
        });
      },

      syncTempState: () => {
        const s = get();
        if (s.activeApp === 'settings') {
          set({
            tempApiUrl: s.apiUrl || '',
            tempApiKey: s.apiKey || '',
            tempVoiceApiUrl: s.voiceApiUrl || '',
            tempVoiceApiKey: s.voiceApiKey || '',
            tempVoiceSttModel: s.voiceSttModel || 'gpt-4o-mini-transcribe',
            tempVoiceTtsModel: s.voiceTtsModel || 'tts-1',
          });
        }
        if (s.activeApp === 'user') {
          set({ tempMyName: s.myName || '', tempMyAvatar: s.myAvatar || '', tempMyDesc: s.myDesc || '' });
        }
      },
    }),
    {
      name: 'nana-root',
      storage: createJSONStorage(() => AsyncStorage),
      version: NANA_PERSIST_VERSION,
      migrate: (persistedState) => migrateNanaPersistedState(persistedState),
      merge: (persistedState, currentState) => mergeNanaPersistedState(persistedState, currentState),
      skipHydration: true,
      partialize: selectNanaPersistedState,
    },
  ),
);

export function resolveAction<T>(value: T | ((prev: T) => T), prev: T): T {
  return typeof value === 'function' ? (value as (prev: T) => T)(prev) : value;
}
