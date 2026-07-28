import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { replaceMacros } from '../utils/macros';
import {
  generateReply,
  generateProactiveReply,
  fetchModelList,
  generatePaymentReaction,
} from '../services/ai';
import { synthesizeSpeechAudio, transcribeAudioCapture } from '../services/audioAiRuntime';
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
import { speakSpeechSynthesisPlan, stopSpeechSynthesis } from '../services/nativeSpeechRuntime';
import { playAudioUriOnce, stopOneShotAudioPlayback } from '../services/nativeAudioPlaybackRuntime';
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
  createInitialProactiveSchedule,
  createLocalProactiveMessage,
  normalizeProactiveChatSchedules,
  rescheduleAfterProactiveMessage,
  rescheduleProactiveAfterInteraction,
  selectDueProactiveCandidate,
  selectProactiveFocusEvent,
} from '../services/proactiveChatRuntime';
import {
  DEFAULT_ONLINE_PRESET,
  DEFAULT_OFFLINE_PRESET,
  DEFAULT_THEME_CONFIG,
} from '../constants/defaults';
import { isChromeStyle, isIconStyle, isWallpaperId } from '../services/theme';
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
  ProactiveChatSchedules,
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
    proactiveMessagingEnabled: value.proactiveMessagingEnabled !== false,
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

let proactiveHeartbeatInFlight = false;

export interface SendChatMessageOptions {
  textOverride?: string;
  skipUserAppend?: boolean;
  sourceMessageId?: number;
  targetChatId?: string;
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
  themeConfig: ThemeConfig;
  worldBookEntries: WorldBookEntry[];
  onlinePresets: Preset[];
  activeOnlinePresetId: string;
  offlinePresets: Preset[];
  activeOfflinePresetId: string;
  callLogs: CallLog[];
  relationshipTraces: RelationshipTrace[];
  proactiveChatSchedules: ProactiveChatSchedules;

  // Persisted: Memory & Voice
  memoryWindowSize: number;
  showMemoryDebug: boolean;
  autoTTS: boolean;
  speechLanguage: string;
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
  goBack: () => boolean;
  setWalletBalance: (value: string) => boolean;
  setCharacterProactiveMessagingEnabled: (characterId: string, enabled: boolean) => void;
  clearChat: (chatId: string) => void;
  correctRelationshipMemory: (traceId: string, summary: string) => boolean;
  sendChatMessage: (type?: MessageType, amount?: string, note?: string, mediaCapture?: MediaCaptureResult, options?: SendChatMessageOptions) => Promise<void>;
  sendPayment: (input: { chatId: string; kind: PaymentKind; amountMinor: number; note?: string }) => Promise<string>;
  transitionPayment: (id: string, next: PaymentStatus, meta?: PaymentTransitionMeta) => boolean;
  retryPayment: (id: string) => Promise<void>;
  reconcilePayments: (now?: number) => Promise<void>;
  runProactiveChatHeartbeat: (now?: number) => Promise<void>;
  retryChatMessage: (errorMessageId: number) => Promise<void>;
  startOutgoingCall: (type: 'voice' | 'video') => void;
  startIncomingCall: (type: 'voice' | 'video', characterId: string) => void;
  answerCall: () => void;
  endActiveCall: (status?: CallLog['status']) => void;
  sendCallSpeech: (capture: MediaCaptureResult) => Promise<void>;
  doFetchModels: (url: string, key: string) => Promise<void>;
  syncTempState: () => void;
}

export const NANA_PERSIST_VERSION = 8;

type PersistedStateRecord = Record<string, unknown>;

const isPersistedStateRecord = (value: unknown): value is PersistedStateRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const normalizeThemeConfig = (value: unknown): ThemeConfig => {
  const config = isPersistedStateRecord(value) ? value : {};
  const backgroundImage = typeof config.backgroundImage === 'string'
    ? config.backgroundImage
    : DEFAULT_THEME_CONFIG.backgroundImage;
  const legacyWallpaperId = backgroundImage ? 'custom' : 'system';
  const legacyIconStyle = config.iconStyle === 'default' ? 'system' : config.iconStyle;

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
    iconStyle: isIconStyle(legacyIconStyle)
      ? legacyIconStyle
      : DEFAULT_THEME_CONFIG.iconStyle,
    chromeStyle: isChromeStyle(config.chromeStyle)
      ? config.chromeStyle
      : DEFAULT_THEME_CONFIG.chromeStyle,
  };
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
    ...(Array.isArray(state.characters)
      ? { characters: state.characters.map(normalizeCharacter) }
      : {}),
    unreadCounts: isPersistedStateRecord(state.unreadCounts) ? state.unreadCounts : {},
    blockedUsers: Array.isArray(state.blockedUsers)
      ? state.blockedUsers.filter((value): value is string => typeof value === 'string')
      : [],
    relationshipTraces: normalizeRelationshipTraces(state.relationshipTraces),
    proactiveChatSchedules: normalizeProactiveChatSchedules(state.proactiveChatSchedules),
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
    themeConfig: state.themeConfig,
    worldBookEntries: state.worldBookEntries,
    onlinePresets: state.onlinePresets,
    activeOnlinePresetId: state.activeOnlinePresetId,
    offlinePresets: state.offlinePresets,
    activeOfflinePresetId: state.activeOfflinePresetId,
    callLogs: state.callLogs,
    relationshipTraces: state.relationshipTraces,
    proactiveChatSchedules: state.proactiveChatSchedules,
    memoryWindowSize: state.memoryWindowSize,
    showMemoryDebug: state.showMemoryDebug,
    autoTTS: state.autoTTS,
    speechLanguage: state.speechLanguage,
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
      momentsBg: 'https://images.unsplash.com/photo-1707343843437-caacff5cfa74?q=80&w=600',
      friends: ['luna-id', 'kai-id', 'aria-id'],
      characters: [
        { id: 'luna-id', name: 'Luna', avatar: 'L', gender: 'Female', age: '22', desc: 'A gentle and caring maid who always puts others first. She speaks with a soft, polite tone and is fiercely loyal to those she trusts.', proactiveMessagingEnabled: true },
        { id: 'kai-id', name: 'Kai', avatar: 'K', gender: 'Male', age: '27', desc: 'A stoic warrior from the northern clans. Quiet, observant, and disciplined in combat, with a softer side he rarely shows.', proactiveMessagingEnabled: true },
        { id: 'aria-id', name: 'Aria', avatar: 'A', gender: 'Female', age: '24', desc: 'A free-spirited bard who travels the world collecting stories and songs. Witty, charming, and never without her trusty lute.', proactiveMessagingEnabled: true },
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

      memoryWindowSize: 10,
      showMemoryDebug: false,
      autoTTS: false,
      speechLanguage: 'zh-CN',
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
          } else if (app === 'settings') {
            set({ activeApp: app, tempApiUrl: state.apiUrl || '', tempApiKey: state.apiKey || '', ...returnPatch });
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
                ? { ...character, proactiveMessagingEnabled: enabled }
                : character
            )),
            proactiveChatSchedules: enabled
              ? {
                  ...state.proactiveChatSchedules,
                  [characterId]: rescheduleProactiveAfterInteraction(
                    state.proactiveChatSchedules[characterId],
                    characterId,
                    now,
                  ),
                }
              : state.proactiveChatSchedules,
          };
        });
      },

      clearChat: (chatId) => {
        if (!chatId) return;
        cancelUserMessageBurst(chatId);
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
          return {
            chatHistory: {
              ...state.chatHistory,
              [chatId]: [...preservedMessages, ...recoveredMessages].sort((left, right) => left.id - right.id),
            },
            pendingChatRequests: nextPendingChatRequests,
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
        if ((type === 'text' || type === 'voice') && pendingRequestId && !joiningUserBurst) {
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
              : (note || '');
        const activeChar = state.characters.find(c => c.id === chatId);
        const interactionAt = Date.now();
        const messageId = nextMessageId();
        const sourceMessageId = options?.sourceMessageId ?? messageId;
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
          ...(voiceDraft ? {
            audioUri: voiceDraft.audioUri,
            audioDurationSec: voiceDraft.audioDurationSec,
            transcript: voiceDraft.transcript,
            replyMode: voiceDraft.replyMode,
          } : {}),
          ...(type === 'image' && finalizedMediaCapture?.localUri ? {
            imageUri: finalizedMediaCapture.localUri,
            imageWidth: finalizedMediaCapture.width,
            imageHeight: finalizedMediaCapture.height,
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
          mediaUris: finalizedMediaCapture?.localUri ? [finalizedMediaCapture.localUri] : undefined,
          remember: true,
          recallWeight: type === 'text' ? 0.35 : 0.65,
          state: type === 'image' ? 'digested' : 'pending',
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
            ),
          },
          ...(type === 'text' || type === 'voice'
            ? { chatInput: '', chatPanel: 'none' as ChatPanel }
            : { chatPanel: 'none' as ChatPanel }),
        }));

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
            apiUrl: state.apiUrl,
            apiKey: state.apiKey,
            selectedModel: state.selectedModel,
            language: state.speechLanguage || 'zh-CN',
          });
          if (!sourceMessageStillExists()) return;
          const transcript = transcriptCapture.phase === 'ready'
            ? transcriptCapture.transcript?.trim()
            : undefined;
          if (!transcript) {
            set(s => ({
              relationshipTraces: upsertRelationshipTrace(s.relationshipTraces, createRelationshipTrace({
                characterId: chatId,
                source: 'voiceMessage',
                sourceEventId: String(sourceMessageId),
                title: copy.voiceMessage,
                summary: initialSummary,
                mediaUris: finalizedMediaCapture.localUri ? [finalizedMediaCapture.localUri] : undefined,
                remember: true,
                recallWeight: 0.45,
                state: 'failed',
              })),
              islandNotification: {
                title: activeChar?.name || copy.voiceMessage,
                desc: transcriptCapture.errorMessage || copy.voiceTranscriptionFailed,
                icon: activeChar?.avatar,
                status: 'error',
              },
            }));
            triggerHaptic('error');
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
                  ? { ...message, text: transcript, transcript }
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
          triggerHaptic('success');
          set({
            islandNotification: {
              title: activeChar?.name || copy.photo,
              desc: copy.photoSent,
              icon: activeChar?.avatar,
              status: 'success',
            },
          });
          setTimeout(() => useNanaStore.setState({ islandNotification: null }), 1800);
          return;
        }

        if (!sourceMessageStillExists()) return;

        const requestId = `reply:${chatId}:${sourceMessageId}:${Date.now()}`;
        const hasRemoteApiKey = state.apiKey.trim().length > 0;
        const generationSource: ChatGenerationSource = hasRemoteApiKey ? 'remote' : 'localSandbox';
        const fastChat = process.env.EXPO_PUBLIC_NANA_FAST_CHAT === '1';
        if (type === 'text') {
          beginUserMessageBurst(chatId, requestId, {
            sourceMessageId,
            text: userText,
          });
        }
        set(s => ({
          pendingChatRequests: beginChatRequest(s.pendingChatRequests, chatId, requestId).pending,
          islandNotification: { title: activeChar?.name || 'AI', desc: copy.typing, icon: activeChar?.avatar, status: 'typing' },
          isGenerating: true,
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
          }
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
          const parsedReplyMessages = splitCharacterReplyIntoMessages(rawReplyText);
          const replyMessages = parsedReplyMessages.length > 0
            ? parsedReplyMessages
            : [rawReplyText.trim() || (copy.language === 'zh' ? '我在。' : "I'm here.")];
          const normalizedReplyText = replyMessages.join(' ');
          await waitForChatReplyPlan(replyPlan);
          if (!isCurrentChatRequest(get().pendingChatRequests, chatId, requestId)) return;

          const charReplyMode = characterReplyMode(activeChar);
          const replyType = resolveCharacterReplyType(activeChar, charReplyMode, type);
          const deliveryMessages = replyType === 'voice' ? [normalizedReplyText] : replyMessages;
          let charVoiceDraft = replyType === 'voice'
            ? createCharacterVoiceReplyDraft(activeChar, normalizedReplyText, charReplyMode)
            : null;

          if (replyType === 'voice') {
            const speechAudio = await synthesizeSpeechAudio({
              text: normalizedReplyText,
              apiUrl: state.apiUrl,
              apiKey: state.apiKey,
              voiceProfileId: activeChar?.voiceProfileId,
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

          let didCommitAll = false;
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
            let didCommitMessage = false;
            set(s => {
              if (!isCurrentChatRequest(s.pendingChatRequests, chatId, requestId)) return {};
              const completion = isLastMessage
                ? completeChatRequest(s.pendingChatRequests, chatId, requestId)
                : { completed: true, pending: s.pendingChatRequests };
              if (!completion.completed) return {};
              const nextPending = completion.pending;
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
                    mediaUris: finalizedMediaCapture?.localUri ? [finalizedMediaCapture.localUri] : undefined,
                    recallWeight: type === 'voice' ? 0.7 : 0.5,
                    state: 'digested',
                  })),
                  proactiveChatSchedules: {
                    ...s.proactiveChatSchedules,
                    [chatId]: rescheduleProactiveAfterInteraction(
                      s.proactiveChatSchedules[chatId],
                      chatId,
                      Date.now(),
                    ),
                  },
                } : {}),
                chatHistory: {
                  ...s.chatHistory,
                  [chatId]: [...(s.chatHistory[chatId] || []), {
                    id: nextMessageId(),
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
            if (!isLastMessage) triggerHaptic('light');
          }
          if (!didCommitAll) return;
          triggerHaptic('medium');
          set({
            islandNotification: {
              title: activeChar?.name || 'AI',
              desc: replyType === 'voice' ? copy.newVoiceMessage : copy.newMessage,
              icon: activeChar?.avatar,
              status: 'success',
            },
          });
          setTimeout(() => set({ islandNotification: null }), 3000);
        } catch (error) {
          cancelUserMessageBurst(chatId, requestId);
          console.error(error);
          const failureMessage = error instanceof Error ? error.message : copy.apiCallFailed;
          let didCommit = false;
          set(s => {
            const completion = completeChatRequest(s.pendingChatRequests, chatId, requestId);
            if (!completion.completed) return {};
            const nextPending = completion.pending;
            didCommit = true;
            return {
              islandNotification: null,
              isGenerating: Object.keys(nextPending).length > 0,
              pendingChatRequests: nextPending,
              chatHistory: {
                ...s.chatHistory,
                [chatId]: [...(s.chatHistory[chatId] || []), {
                  id: nextMessageId(), sender: 'system',
                  text: copy.language === 'zh' ? `错误：${failureMessage}` : `Error: ${failureMessage}`,
                  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  type: 'system',
                }],
              },
              relationshipTraces: upsertRelationshipTrace(s.relationshipTraces, createRelationshipTrace({
                characterId: chatId,
                source: traceSource,
                sourceEventId: String(sourceMessageId),
                title: traceTitle,
                summary: initialSummary,
                mediaUris: finalizedMediaCapture?.localUri ? [finalizedMediaCapture.localUri] : undefined,
                recallWeight: type === 'voice' ? 0.5 : 0.25,
                state: 'failed',
              })),
              unreadCounts: {
                ...s.unreadCounts,
                [chatId]: unreadAfterRemoteEvent(s, chatId),
              },
            };
          });
          if (didCommit) triggerHaptic('error');
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
              nextSchedules[character.id] = createInitialProactiveSchedule(character.id, now);
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
          let draft = createLocalProactiveMessage({
            characterId: character.id,
            characterName: character.name,
            personaDescription: character.desc,
            recentEventSummary: focusEvent?.summary,
            language: state.themeConfig.language,
            now,
          });
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
                      ),
                    }
                  : current.proactiveChatSchedules,
                unreadCounts: {
                  ...current.unreadCounts,
                  [character.id]: unreadAfterRemoteEvent(current, character.id),
                },
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

      retryChatMessage: async (errorMessageId) => {
        const state = get();
        const chatId = state.activeChatId;
        if (!chatId || state.pendingChatRequests[chatId]) return;
        const history = state.chatHistory[chatId] || [];
        const errorIndex = history.findIndex(message => message.id === errorMessageId && message.sender === 'system');
        if (errorIndex < 0) return;
        const original = history.slice(0, errorIndex).reverse().find(message => message.sender === 'user');
        if (!original) return;

        set(s => ({
          chatHistory: {
            ...s.chatHistory,
            [chatId]: (s.chatHistory[chatId] || []).filter(message => message.id !== errorMessageId),
          },
        }));
        await get().sendChatMessage(
          original.type === 'voice' ? 'voice' : 'text',
          original.amount,
          original.note,
          undefined,
          {
            textOverride: original.transcript || original.text,
            skipUserAppend: true,
            sourceMessageId: original.id,
          },
        );
      },

      startOutgoingCall: (type) => {
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

      endActiveCall: (status = 'completed') => {
        const state = get();
        const overlay = state.callOverlay;
        if (!overlay.show) return;

        stopOneShotAudioPlayback();
        stopSpeechSynthesis();
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
        const state = get();
        const copy = runtimeCopyFor(state.themeConfig.language);
        const overlay = state.callOverlay;
        if (!overlay.show || overlay.status !== 'connected') return;
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
            apiUrl: state.apiUrl,
            apiKey: state.apiKey,
            selectedModel: state.selectedModel,
            language: state.speechLanguage || 'zh-CN',
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

          if (!isCurrentCallSession(get().callOverlay)) return;

          if (!state.apiKey || !activeChatId) {
            throw new Error(copy.apiKeyRequiredSystem);
          }

          const activePreset = state.onlinePresets.find(p => p.id === state.activeOnlinePresetId) || DEFAULT_ONLINE_PRESET;
          const { text: replyText } = await generateReply({
            userText: transcriptCapture.transcript,
            userName: state.myName,
            userDesc: state.myDesc,
            activeChar,
            activePreset,
            chatHistory: state.chatHistory[activeChatId] || [],
            worldBookEntries: state.worldBookEntries,
            relationshipTraces: state.relationshipTraces,
            memoryWindowSize: state.memoryWindowSize,
            activeChatId,
            apiUrl: state.apiUrl,
            apiKey: state.apiKey,
            selectedModel: state.selectedModel,
            replaceMacros,
          });

          const currentOverlay = get().callOverlay;
          if (!isCurrentCallSession(currentOverlay)) return;
          set({ callOverlay: { ...currentOverlay, speechPhase: 'speaking' } });
          const replyType = currentOverlay.characterOutput === 'captionsOnly' ? 'text' : 'voice';
          let replyCapture = resolveSpeechToTextResult({ transcript: replyText });

          if (replyType === 'voice') {
            const speechAudio = await synthesizeSpeechAudio({
              text: replyText,
              apiUrl: state.apiUrl,
              apiKey: state.apiKey,
              voiceProfileId: activeChar?.voiceProfileId,
            });
            if (!isCurrentCallSession(get().callOverlay)) return;
            if (speechAudio.phase === 'ready' && speechAudio.localUri) {
              replyCapture = resolveSpeechToTextResult({
                transcript: replyText,
                localUri: speechAudio.localUri,
                durationSec: speechAudio.durationSec,
              });
              await playAudioUriOnce(speechAudio.localUri, { waitForCompletion: true });
            } else {
              await speakSpeechSynthesisPlan(createSpeechSynthesisPlan({
                character: activeChar,
                text: replyText,
                language: state.speechLanguage || 'zh-CN',
              }), { waitForCompletion: true });
            }
          }

          if (!isCurrentCallSession(get().callOverlay)) return;

          set(s => isCurrentCallSession(s.callOverlay) ? ({
            callOverlay: {
              ...appendCallCaptureResult(s.callOverlay, replyCapture, 'char'),
              speechPhase: 'idle' as const,
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
          set({ tempApiUrl: s.apiUrl || '', tempApiKey: s.apiKey || '' });
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
