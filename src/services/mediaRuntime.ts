import type {
  CallOverlayState,
  CallTranscriptLine,
  Character,
  MessageType,
  ReplyMode,
} from '../types';

export type MediaRuntimeStatus = 'mock' | 'native' | 'unavailable';
export type MediaPermissionKind = 'microphone' | 'camera' | 'mediaLibrary';
export type MediaSessionPhase = 'idle' | 'requestingPermission' | 'permissionBlocked' | 'capturing' | 'processing' | 'ready' | 'failed';
export type MediaPermissionStatus = 'granted' | 'denied' | 'limited' | 'undetermined';
export type MediaPermissionSurface = 'voiceMessage' | 'voiceCall' | 'videoCall' | 'videoPreview' | 'cameraCapture' | 'photoLibrary';
export type SpeechToTextProvider = 'manual' | 'mock' | 'remote';
export type SpeechSynthesisProvider = 'expo-speech' | 'mock' | 'remote';
export type MediaCaptureKind = 'audio' | 'image' | 'videoFrame';
export type VideoPersonaProvider = 'expo-video' | 'mock';

export interface MediaRuntimePlan {
  voiceInput: MediaRuntimeStatus;
  speechSynthesis: MediaRuntimeStatus;
  cameraInput: MediaRuntimeStatus;
  videoPersona: MediaRuntimeStatus;
}

export interface CharacterMediaCapabilities {
  replyMode: ReplyMode;
  hasVoiceProfile: boolean;
  hasVideoPersona: boolean;
  voiceProfileId?: string;
  videoPersonaAsset?: string;
  canReceiveVoiceInput: boolean;
  canReceiveCameraInput: boolean;
  canSynthesizeVoice: boolean;
  canRenderVideoPersona: boolean;
}

export interface VoiceMessageDraft {
  type: 'voice';
  transcript: string;
  audioUri?: string;
  audioDurationSec: number;
  replyMode: ReplyMode;
}

export interface MediaPermissionRequest {
  kind: MediaPermissionKind;
  requiredFor: MediaPermissionSurface;
  requestTiming: 'eager' | 'lazy';
}

export interface PermissionGate {
  surface: MediaPermissionSurface;
  allowed: boolean;
  canAskAgain: boolean;
  requiredPermissions: MediaPermissionKind[];
  missingPermissions: MediaPermissionKind[];
  blockedPermissions: MediaPermissionKind[];
  statuses: Partial<Record<MediaPermissionKind, MediaPermissionStatus>>;
}

export interface NativePermissionSnapshot {
  granted?: boolean;
  canAskAgain?: boolean;
  status?: string;
}

export interface MediaCaptureResult {
  phase: MediaSessionPhase;
  mediaKind?: MediaCaptureKind;
  transcript?: string;
  localUri?: string;
  durationMillis?: number;
  durationSec?: number;
  width?: number;
  height?: number;
  errorMessage?: string;
}

export interface SpeechToTextJob extends MediaCaptureResult {
  provider: SpeechToTextProvider;
  language: string;
}

export interface SpeechSynthesisPlan {
  phase: MediaSessionPhase;
  provider: SpeechSynthesisProvider;
  text: string;
  language: string;
  voiceProfileId?: string;
  errorMessage?: string;
}

export interface VideoPersonaSession {
  phase: MediaSessionPhase;
  provider: VideoPersonaProvider;
  characterId?: string;
  characterName: string;
  sourceUri?: string;
  errorMessage?: string;
}

export interface CallMediaSession {
  type: 'voice' | 'video';
  phase: MediaSessionPhase;
  requiredPermissions: MediaPermissionKind[];
  canUseVoiceInput: boolean;
  canUseCameraInput: boolean;
  canSynthesizeVoice: boolean;
  canRenderVideoPersona: boolean;
  characterId?: string;
  characterName: string;
  startedAt: number;
  errorMessage?: string;
}

export const mediaRuntimePlan: MediaRuntimePlan = {
  voiceInput: 'native',
  speechSynthesis: 'native',
  cameraInput: 'native',
  videoPersona: 'native',
};

export const nativePermissionPlan: MediaPermissionRequest[] = [
  { kind: 'microphone', requiredFor: 'voiceMessage', requestTiming: 'lazy' },
  { kind: 'microphone', requiredFor: 'voiceCall', requestTiming: 'lazy' },
  { kind: 'microphone', requiredFor: 'videoCall', requestTiming: 'eager' },
  { kind: 'camera', requiredFor: 'videoCall', requestTiming: 'eager' },
  { kind: 'camera', requiredFor: 'videoPreview', requestTiming: 'eager' },
  { kind: 'camera', requiredFor: 'cameraCapture', requestTiming: 'eager' },
  { kind: 'mediaLibrary', requiredFor: 'photoLibrary', requestTiming: 'lazy' },
];

export const createMockCaptureResult = (transcript: string): MediaCaptureResult => ({
  phase: transcript.trim() ? 'ready' : 'failed',
  mediaKind: 'audio',
  transcript: transcript.trim() || undefined,
  durationSec: transcript.trim() ? voiceDurationFromText(transcript) : undefined,
  errorMessage: transcript.trim() ? undefined : 'No transcript captured',
});

export const voiceDurationFromText = (text: string) => (
  Math.max(1, Math.min(60, Math.ceil(text.trim().length / 4)))
);

export const normalizePermissionStatus = (
  status: MediaPermissionStatus | NativePermissionSnapshot | undefined,
): MediaPermissionStatus => {
  if (!status) return 'undetermined';
  if (typeof status === 'string') {
    if (status === 'granted' || status === 'denied' || status === 'limited') return status;
    return 'undetermined';
  }
  if (status.granted) return 'granted';
  if (status.status === 'limited') return 'limited';
  return status.canAskAgain === false ? 'denied' : 'undetermined';
};

export const createPermissionGate = (
  surface: MediaPermissionSurface,
  statuses: Partial<Record<MediaPermissionKind, MediaPermissionStatus | NativePermissionSnapshot>>,
): PermissionGate => {
  const requiredPermissions = nativePermissionPlan
    .filter(permission => permission.requiredFor === surface)
    .map(permission => permission.kind);
  const normalizedStatuses = requiredPermissions.reduce<Partial<Record<MediaPermissionKind, MediaPermissionStatus>>>((acc, permission) => {
    acc[permission] = normalizePermissionStatus(statuses[permission]);
    return acc;
  }, {});
  const missingPermissions = requiredPermissions.filter(permission => {
    const status = normalizedStatuses[permission];
    return status !== 'granted' && status !== 'limited';
  });
  const blockedPermissions = missingPermissions.filter(permission => {
    const raw = statuses[permission];
    if (raw === 'denied') return true;
    return typeof raw === 'object' && raw !== null && raw.canAskAgain === false;
  });

  return {
    surface,
    allowed: missingPermissions.length === 0,
    canAskAgain: blockedPermissions.length === 0,
    requiredPermissions,
    missingPermissions,
    blockedPermissions,
    statuses: normalizedStatuses,
  };
};

export const startVoiceCaptureSession = (): MediaCaptureResult => ({
  phase: mediaRuntimePlan.voiceInput === 'unavailable' ? 'failed' : 'capturing',
  errorMessage: mediaRuntimePlan.voiceInput === 'unavailable' ? 'Voice input is unavailable' : undefined,
});

export const completeVoiceCaptureSession = (
  session: MediaCaptureResult,
  result: Partial<MediaCaptureResult>,
): MediaCaptureResult => {
  if (session.phase === 'failed') return session;
  if (result.phase === 'processing') {
    return {
      phase: 'processing',
      mediaKind: 'audio',
      localUri: result.localUri,
      durationMillis: result.durationMillis,
      durationSec: result.durationSec,
    };
  }

  return resolveSpeechToTextResult({
    transcript: result.transcript,
    localUri: result.localUri,
    durationMillis: result.durationMillis,
    durationSec: result.durationSec,
    errorMessage: result.errorMessage,
  });
};

export const createVoiceCaptureResultFromRecording = (recording: {
  uri?: string | null;
  durationMillis?: number | null;
}): MediaCaptureResult => {
  if (!recording.uri) {
    return {
      phase: 'failed',
      errorMessage: 'No recording captured',
    };
  }

  return {
    phase: 'processing',
    mediaKind: 'audio',
    localUri: recording.uri,
    durationMillis: Math.max(0, recording.durationMillis || 0),
    durationSec: Math.max(1, Math.ceil((recording.durationMillis || 0) / 1000)),
  };
};

export const createCameraCaptureResultFromPicture = (picture: {
  uri?: string | null;
  width?: number | null;
  height?: number | null;
}): MediaCaptureResult => {
  if (!picture.uri) {
    return {
      phase: 'failed',
      mediaKind: 'image',
      errorMessage: 'No camera frame captured',
    };
  }

  return {
    phase: 'ready',
    mediaKind: 'image',
    localUri: picture.uri,
    width: picture.width || undefined,
    height: picture.height || undefined,
  };
};

export const resolveSpeechToTextResult = (result: {
  transcript?: string;
  localUri?: string;
  durationMillis?: number;
  durationSec?: number;
  errorMessage?: string;
}): MediaCaptureResult => {
  const transcript = result.transcript?.trim();
  if (!transcript) {
    return {
      phase: 'failed',
      mediaKind: 'audio',
      localUri: result.localUri,
      durationMillis: result.durationMillis,
      durationSec: result.durationSec,
      errorMessage: result.errorMessage || 'No speech detected',
    };
  }

  return {
    phase: 'ready',
    mediaKind: 'audio',
    transcript,
    localUri: result.localUri,
    durationMillis: result.durationMillis,
    durationSec: result.durationSec && result.durationSec > 0
      ? result.durationSec
      : voiceDurationFromText(transcript),
  };
};

export const createSpeechToTextJob = ({
  capture,
  language,
  provider = 'manual',
}: {
  capture: MediaCaptureResult;
  language: string;
  provider?: SpeechToTextProvider;
}): SpeechToTextJob => {
  if (capture.phase === 'ready' && capture.transcript?.trim()) {
    return {
      phase: 'ready',
      provider,
      language,
      transcript: capture.transcript.trim(),
      localUri: capture.localUri,
      durationMillis: capture.durationMillis,
      durationSec: capture.durationSec,
    };
  }

  if (capture.localUri) {
    return {
      phase: 'processing',
      provider,
      language,
      localUri: capture.localUri,
      durationMillis: capture.durationMillis,
      durationSec: capture.durationSec,
    };
  }

  return {
    phase: 'failed',
    provider,
    language,
    errorMessage: capture.errorMessage || 'No audio captured for speech-to-text',
  };
};

export const createSpeechSynthesisPlan = ({
  character,
  text,
  language,
  provider = 'expo-speech',
}: {
  character?: Character;
  text: string;
  language: string;
  provider?: SpeechSynthesisProvider;
}): SpeechSynthesisPlan => {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return {
      phase: 'failed',
      provider,
      text: '',
      language,
      errorMessage: 'No text to synthesize',
    };
  }

  if (!getCharacterMediaCapabilities(character).canSynthesizeVoice) {
    return {
      phase: 'failed',
      provider,
      text: normalizedText,
      language,
      errorMessage: 'Character voice synthesis is not configured',
    };
  }

  return {
    phase: 'ready',
    provider,
    text: normalizedText,
    language,
    voiceProfileId: character?.voiceProfileId,
  };
};

export const createVideoPersonaSession = (
  character?: Character,
  provider: VideoPersonaProvider = 'expo-video',
): VideoPersonaSession => {
  const sourceUri = character?.supportsVideoPersona ? character.videoPersonaAsset?.trim() : '';
  if (!sourceUri) {
    return {
      phase: 'failed',
      provider,
      characterId: character?.id,
      characterName: character?.name || 'AI',
      errorMessage: 'Character video persona is not configured',
    };
  }

  return {
    phase: 'ready',
    provider,
    characterId: character?.id,
    characterName: character?.name || 'AI',
    sourceUri,
  };
};

export const getCharacterMediaCapabilities = (
  character?: Character | null,
): CharacterMediaCapabilities => {
  const hasVoiceProfile = !!(character?.supportsVoiceReply && character.voiceProfileId);
  const hasVideoPersona = !!(character?.supportsVideoPersona && character.videoPersonaAsset);

  return {
    replyMode: character?.preferredReplyMode || 'auto',
    hasVoiceProfile,
    hasVideoPersona,
    voiceProfileId: character?.voiceProfileId,
    videoPersonaAsset: character?.videoPersonaAsset,
    canReceiveVoiceInput: mediaRuntimePlan.voiceInput !== 'unavailable',
    canReceiveCameraInput: mediaRuntimePlan.cameraInput !== 'unavailable',
    canSynthesizeVoice: mediaRuntimePlan.speechSynthesis !== 'unavailable',
    canRenderVideoPersona: hasVideoPersona && mediaRuntimePlan.videoPersona !== 'unavailable',
  };
};

export const resolveCharacterReplyType = (
  character: Character | undefined,
  replyMode: ReplyMode,
  sourceType: MessageType,
): MessageType => {
  const capabilities = getCharacterMediaCapabilities(character);
  if (character?.supportsVoiceReply !== true) return 'text';
  if (!capabilities.canSynthesizeVoice) return 'text';
  if (replyMode === 'voice') return 'voice';
  if (replyMode === 'text') return 'text';
  return sourceType === 'voice' ? 'voice' : 'text';
};

export const createVoiceMessageDraft = (
  transcript: string,
  replyMode: ReplyMode,
): VoiceMessageDraft => ({
  type: 'voice',
  transcript,
  audioDurationSec: voiceDurationFromText(transcript),
  replyMode,
});

let callTranscriptLineSequence = 0;

export const createVoiceMessageDraftFromCapture = (
  capture: MediaCaptureResult,
  replyMode: ReplyMode,
): VoiceMessageDraft | null => {
  const transcript = capture.transcript?.trim();
  if (capture.phase !== 'ready' || !transcript) return null;

  return {
    type: 'voice',
    transcript,
    audioUri: capture.localUri,
    audioDurationSec: capture.durationSec && capture.durationSec > 0
      ? capture.durationSec
      : voiceDurationFromText(transcript),
    replyMode,
  };
};

export const createCharacterVoiceReplyDraft = (
  character: Character | undefined,
  replyText: string,
  replyMode: ReplyMode,
): VoiceMessageDraft | null => {
  if (!replyText.trim()) return null;
  if (resolveCharacterReplyType(character, replyMode, 'voice') !== 'voice') return null;
  return createVoiceMessageDraft(replyText, replyMode);
};

export const createCallTranscriptLine = (
  line: Omit<CallTranscriptLine, 'id'>,
): CallTranscriptLine => ({
  id: Date.now() * 1000 + (callTranscriptLineSequence = (callTranscriptLineSequence + 1) % 1000),
  ...line,
});

export const appendCallTranscriptLine = (
  callOverlay: CallOverlayState,
  line: Omit<CallTranscriptLine, 'id'>,
): CallOverlayState => ({
  ...callOverlay,
  transcript: [
    ...callOverlay.transcript,
    createCallTranscriptLine(line),
  ],
});

export const startCallMediaSession = (
  type: 'voice' | 'video',
  character?: Character,
): CallMediaSession => {
  const capabilities = getCharacterMediaCapabilities(character);
  const requiredPermissions: MediaPermissionKind[] = type === 'video'
    ? ['microphone', 'camera']
    : ['microphone'];
  const unavailable = mediaRuntimePlan.voiceInput === 'unavailable'
    || (type === 'video' && mediaRuntimePlan.cameraInput === 'unavailable');

  return {
    type,
    phase: unavailable ? 'failed' : 'capturing',
    requiredPermissions,
    canUseVoiceInput: capabilities.canReceiveVoiceInput,
    canUseCameraInput: type === 'video' && capabilities.canReceiveCameraInput,
    canSynthesizeVoice: capabilities.canSynthesizeVoice,
    canRenderVideoPersona: type === 'video' && capabilities.canRenderVideoPersona,
    characterId: character?.id,
    characterName: character?.name || 'AI',
    startedAt: Date.now(),
    errorMessage: unavailable ? 'Call media is unavailable' : undefined,
  };
};

export const appendCallCaptureResult = (
  callOverlay: CallOverlayState,
  capture: MediaCaptureResult,
  speaker: 'user' | 'char',
): CallOverlayState => {
  const transcript = capture.transcript?.trim();
  if (capture.phase !== 'ready' || !transcript) return callOverlay;

  return appendCallTranscriptLine(callOverlay, {
    speaker,
    text: transcript,
    mode: 'speech',
    audioUri: capture.localUri,
  });
};

export const createCallOverlayState = (
  type: 'voice' | 'video',
  character?: Character,
  fallbackName = 'AI',
): CallOverlayState => {
  const capabilities = getCharacterMediaCapabilities(character);
  const videoPersona = type === 'video' ? createVideoPersonaSession(character) : null;
  const name = character?.name || fallbackName;

  return {
    show: true,
    type,
    status: 'ringing',
    direction: 'outgoing',
    characterId: character?.id,
    avatar: character?.avatar || '',
    name,
    interactionMode: 'voiceActivity',
    characterOutput: capabilities.hasVoiceProfile ? 'remoteVoice' : 'deviceVoice',
    speechPhase: 'idle',
    inputEpoch: 0,
    hasVoiceProfile: capabilities.hasVoiceProfile,
    hasVideoPersona: capabilities.hasVideoPersona,
    videoPersonaSourceUri: videoPersona?.phase === 'ready' ? videoPersona.sourceUri : undefined,
    startedAt: Date.now(),
    transcript: [],
  };
};
