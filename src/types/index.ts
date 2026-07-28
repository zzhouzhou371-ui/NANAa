import type { ReactNode } from 'react';

export type LegacyPaymentMessageType = 'transfer' | 'redpacket' | 'transfer_received' | 'redpacket_received';
export type MessageType = 'text' | 'voice' | 'image' | 'payment' | LegacyPaymentMessageType | 'system';

/** @deprecated Persisted V1/UI compatibility. New product code uses ChatReplyPreference. */
export type ReplyMode = 'auto' | 'text' | 'voice';
export type ChatReplyPreference = 'adaptive' | 'textOnly' | 'voicePreferred';

export type PaymentKind = 'transfer' | 'redPacket';
export type PaymentDirection = 'outgoing' | 'incoming';
export type PaymentStatus = 'sending' | 'pending' | 'completed' | 'declined' | 'expired' | 'refunded' | 'failed';
export type PaymentFundsState = 'held' | 'captured' | 'released';
export type PaymentReactionState = 'idle' | 'scheduled' | 'processing' | 'resolved' | 'failed';
export type PaymentReactionDecision = 'accept' | 'decline';

export interface Payment {
  schemaVersion: 1;
  id: string;
  chatId: string;
  kind: PaymentKind;
  direction: PaymentDirection;
  senderId: string;
  recipientId: string;
  amountMinor: number;
  currency: 'CNY';
  note?: string;
  status: PaymentStatus;
  fundsState: PaymentFundsState;
  createdAt: number;
  updatedAt: number;
  pendingAt?: number;
  completedAt?: number;
  expiresAt: number;
  reactionState: PaymentReactionState;
  reactionDecision?: PaymentReactionDecision;
  reactionDueAt?: number;
  reactionAttemptedAt?: number;
  reactionAttempts: number;
  reactionReply?: string;
  reactionMessageId?: number;
  reactionError?: string;
  failureCode?: 'timeout' | 'insufficientFunds' | 'runtime' | 'invalid' | 'interrupted';
  failureMessage?: string;
}

export interface Message {
  id: number;
  sender: string;
  text: string;
  time: string;
  avatar?: string;
  type?: MessageType;
  amount?: string;
  note?: string;
  audioUri?: string;
  audioDurationSec?: number;
  transcript?: string;
  imageUri?: string;
  imageWidth?: number;
  imageHeight?: number;
  replyMode?: ReplyMode;
  paymentId?: string;
  generationSource?: 'remote' | 'localSandbox' | 'proactive';
}

export type ChatHistory = Record<string, Message[]>;

export interface Character {
  id: string;
  name: string;
  avatar: string;
  desc: string;
  gender?: string;
  age?: string;
  chatReplyPreference?: ChatReplyPreference;
  /** @deprecated Persisted V1/UI compatibility. */
  preferredReplyMode?: ReplyMode;
  supportsVoiceReply?: boolean;
  voiceProfileId?: string;
  supportsVideoPersona?: boolean;
  videoPersonaAsset?: string;
}

export type WallpaperId =
  | 'system'
  | 'lavender-nocturne'
  | 'peach-quiet'
  | 'blue-hour'
  | 'custom';

export type IconStyle = 'system' | 'neumorphic-v1';
export type ChromeStyle = 'system' | 'neumorphic-v1';

export interface ThemeConfig {
  themeName: string;
  wallpaperId: WallpaperId;
  /** Durable user-selected image URI. Built-in wallpapers are stored by wallpaperId. */
  backgroundImage: string;
  fontFamily: string;
  primaryColor: string;
  customThemeColor: string;
  customTextColor: string;
  language: string;
  iconStyle: IconStyle;
  /** Shared visual language for the dynamic island, home widget, and dock. */
  chromeStyle: ChromeStyle;
}

export interface BatteryState {
  level: number;
  charging: boolean;
}

export interface Preset {
  id: string;
  name: string;
  sceneMode?: 'online' | 'offline';
  sceneDescription?: string;
  main: string[];
  jailbreak: string[];
  authorsNote: string[];
  authorsNoteDepth: number;
}

export interface MemoryRecord {
  id: string;
  sourceEventId?: string;
  suppressedByTraceId?: string;
  sender: 'user' | 'char';
  text: string;
  time: string;
  type?: MessageType;
  amount?: string;
  note?: string;
  summarized: boolean;
  remember: boolean;
  order: number;
}

export type RelationshipTraceSource =
  | 'chat'
  | 'voiceMessage'
  | 'photo'
  | 'payment'
  | 'voiceCall'
  | 'videoCall'
  | 'moment'
  | 'offlineScene';

export type RelationshipTraceState = 'pending' | 'digested' | 'ignored' | 'failed';

export interface RelationshipTraceOrigin {
  app: 'wechat' | 'offlineMeeting';
  mode: 'online' | 'offline';
  sessionId?: string;
  presetId?: string;
}

export interface RelationshipTrace {
  schemaVersion: 1;
  id: string;
  characterId: string;
  source: RelationshipTraceSource;
  sourceEventId: string;
  origin: RelationshipTraceOrigin;
  occurredAt: number;
  createdAt: number;
  participantIds: string[];
  title: string;
  summary: string;
  tone?: string;
  mediaUris?: string[];
  remember: boolean;
  recallWeight: number;
  state: RelationshipTraceState;
  digestId?: string;
  revision: number;
  userVerified?: boolean;
}

export interface WorldBookEntry {
  id: string;
  keys: string;
  content: string;
  characterId?: string;
  group?: string;           // "memory" = chat-exported, undefined = normal
  alwaysActive?: boolean;   // true = always injected, no keyword match needed
  sourceLanguage?: string;  // original language of content ('en' | 'zh')
  records?: MemoryRecord[]; // Module 1: structured chat records (memory entries)
  summaryState?: 'active' | 'stale';
  summaryInvalidatedByTraceId?: string;
}

export interface Moment {
  id: string;
  authorId: string;
  authorName: string;
  avatar: string;
  text: string;
  images: string[];
  timestamp: number;
}

export interface PaymentModalState {
  type: 'transfer' | 'redpacket' | 'none';
}

export interface PromptModalState {
  isOpen: boolean;
  title: string;
  value: string;
  onSave: (val: string) => void;
  showSavedAvatars?: boolean;
  inputMode?: 'text' | 'numeric' | 'decimal';
}

export interface IslandNotification {
  title: string;
  desc: string;
  icon?: string | ReactNode;
  status?: 'typing' | 'processing' | 'success' | 'error' | 'memory' | 'payment';
}

export type CallReplyMode = ReplyMode;
export type CallInteractionMode = 'voiceActivity';
export type CallCharacterOutput = 'remoteVoice' | 'deviceVoice' | 'captionsOnly';
export type CallSpeechPhase = 'idle' | 'recording' | 'transcribing' | 'thinking' | 'speaking' | 'failed';

export interface CallTranscriptLine {
  id: number;
  speaker: 'user' | 'char';
  text: string;
  mode: 'speech' | 'text';
  audioUri?: string;
}

export type CallStatus = 'incoming' | 'ringing' | 'connected' | 'ending' | 'ended' | 'missed' | 'failed';
export type CallDirection = 'incoming' | 'outgoing';

export interface CallOverlayState {
  show: boolean;
  type: 'voice' | 'video';
  status: CallStatus;
  direction: CallDirection;
  characterId?: string;
  avatar: string | ReactNode;
  name: string;
  interactionMode: CallInteractionMode;
  characterOutput: CallCharacterOutput;
  speechPhase: CallSpeechPhase;
  inputEpoch: number;
  hasVoiceProfile: boolean;
  hasVideoPersona: boolean;
  videoPersonaSourceUri?: string;
  startedAt?: number;
  connectedAt?: number;
  endedAt?: number;
  durationSec?: number;
  errorMessage?: string;
  transcript: CallTranscriptLine[];
}

export interface CallLog {
  id: string;
  characterId?: string;
  characterName: string;
  avatar?: string;
  type: 'voice' | 'video';
  direction: CallDirection;
  status: 'completed' | 'missed' | 'failed' | 'cancelled';
  startedAt: number;
  endedAt: number;
  durationSec: number;
  transcript: CallTranscriptLine[];
  summary?: string;
}

export type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'error';

export type AppName = 'wechat' | 'characters' | 'settings' | 'worldbook' | 'theme' | 'user' | 'presets';
export type WeChatTab = 'chats' | 'contacts' | 'discover' | 'me';
export type WeChatPage = 'root' | 'chat' | 'profile' | 'moments' | 'wallet' | 'context';
export type ChatPanel = 'none' | 'voice' | 'emoji' | 'plus';

export interface ThemeStyles {
  outer: string;
  blobsOuter: string[];
  blobsInner: string[];
  glass: string;
}
