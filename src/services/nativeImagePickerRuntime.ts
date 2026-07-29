import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CallLog, CallOverlayState, Character, ChatHistory, Moment } from '../types';
import {
  createCameraCaptureResultFromPicture,
  type MediaCaptureResult,
} from './mediaRuntime';
import {
  deletePersistedMediaFile,
  discardTemporaryMediaFile,
  finalizeLocalMediaFile,
} from './localMediaRepository';

export type PhotoPickerSource = 'camera' | 'library';

const LEGACY_PENDING_PHOTO_CHAT_KEY = 'nana_pending_photo_chat';
export const PENDING_IMAGE_PICKER_INTENT_KEY = 'nana_pending_image_picker_intent';

export interface CharacterAvatarDraftSnapshot {
  editingCharId: string | null;
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
}

export interface UserAvatarDraftSnapshot {
  tempMyName: string;
  tempMyAvatar: string;
  tempMyDesc: string;
}

export type PendingImagePickerIntent =
  | { kind: 'chat-photo'; chatId: string }
  | { kind: 'character-avatar'; characterId: string }
  | { kind: 'character-avatar-draft'; draft: CharacterAvatarDraftSnapshot }
  | { kind: 'user-avatar-draft'; draft: UserAvatarDraftSnapshot }
  | { kind: 'theme-wallpaper' };

export interface PhotoPickerResult extends MediaCaptureResult {
  canceled?: boolean;
  source?: PhotoPickerSource;
}

export interface AvatarPickerResult extends MediaCaptureResult {
  canceled?: boolean;
  purpose: 'avatar';
}

export interface RecoveredImagePickerSelection {
  intent: PendingImagePickerIntent;
  result: PhotoPickerResult | AvatarPickerResult;
}

export interface PickedStickerAsset {
  uri: string;
  name: string;
  mimeType: string;
  animated: boolean;
  width: number;
  height: number;
  fileSize?: number;
}

export interface StickerPickerResult {
  canceled: boolean;
  assets: PickedStickerAsset[];
  rejectedCount: number;
  errorMessage?: string;
}

export interface CharacterAvatarStateSlice {
  characters: Character[];
  chatHistory: ChatHistory;
  momentsList: Moment[];
  callLogs: CallLog[];
  callOverlay: CallOverlayState;
  myAvatar: string;
  savedAvatars: string[];
}

const canceledResult = (source: PhotoPickerSource): PhotoPickerResult => ({
  phase: 'idle',
  mediaKind: 'image',
  canceled: true,
  source,
});

const failedResult = (source: PhotoPickerSource, error: unknown): PhotoPickerResult => ({
  phase: 'failed',
  mediaKind: 'image',
  source,
  errorMessage: error instanceof Error ? error.message : String(error || 'Photo selection failed'),
});

const canceledAvatarResult = (): AvatarPickerResult => ({
  phase: 'idle',
  mediaKind: 'image',
  canceled: true,
  purpose: 'avatar',
});

const failedAvatarResult = (error: unknown): AvatarPickerResult => ({
  phase: 'failed',
  mediaKind: 'image',
  purpose: 'avatar',
  errorMessage: error instanceof Error ? error.message : String(error || 'Avatar selection failed'),
});

const safeExtension = (asset: ImagePicker.ImagePickerAsset) => {
  const fileExtension = asset.fileName?.split('.').at(-1)?.toLowerCase();
  if (fileExtension && /^[a-z0-9]{2,5}$/.test(fileExtension)) return fileExtension;
  if (asset.mimeType === 'image/png') return 'png';
  if (asset.mimeType === 'image/webp') return 'webp';
  if (asset.mimeType === 'image/heic' || asset.mimeType === 'image/heif') return 'heic';
  return 'jpg';
};

/**
 * ImagePicker returns cache-backed URIs on native. Relationship media must survive
 * normal cache eviction, so promote the selected file before it enters persisted state.
 */
const persistPickedImage = (asset: ImagePicker.ImagePickerAsset) => {
  return finalizeLocalMediaFile(asset.uri, 'images', safeExtension(asset));
};

const normalizeAsset = (
  source: PhotoPickerSource,
  asset: ImagePicker.ImagePickerAsset,
): PhotoPickerResult => {
  const persistedUri = persistPickedImage(asset);
  const normalized = createCameraCaptureResultFromPicture({
    uri: persistedUri,
    width: asset.width,
    height: asset.height,
  });

  return {
    ...normalized,
    source,
    canceled: false,
  };
};

const normalizedAvatarFileSize = (uri: string, base64?: string) => {
  if (Platform.OS === 'web') return base64 ? Math.ceil(base64.length * 0.75) : 0;
  try {
    return new File(uri).size || 0;
  } catch {
    return 0;
  }
};

const saveNormalizedAvatar = async (
  image: Awaited<ReturnType<ReturnType<typeof ImageManipulator.manipulate>['renderAsync']>>,
  compress: number,
) => image.saveAsync({
  base64: Platform.OS === 'web',
  compress,
  format: SaveFormat.JPEG,
});

const normalizeAvatarAsset = async (
  asset: ImagePicker.ImagePickerAsset,
): Promise<AvatarPickerResult> => {
  let temporarySavedUri: string | undefined;
  try {
    if (asset.type && asset.type !== 'image') {
      return failedAvatarResult('Please choose a still image for the character portrait');
    }

    const context = ImageManipulator.manipulate(asset.uri);
    if (asset.width > 0 && asset.height > 0) {
      const side = Math.min(asset.width, asset.height);
      context.crop({
        originX: Math.max(0, Math.round((asset.width - side) / 2)),
        originY: Math.max(0, Math.round((asset.height - side) / 2)),
        width: side,
        height: side,
      });
    }
    context.resize({ width: 768, height: 768 });
    const image = await context.renderAsync();
    let saved = await saveNormalizedAvatar(image, 0.84);
    temporarySavedUri = saved.uri;
    for (const compress of [0.68, 0.52, 0.38]) {
      if (normalizedAvatarFileSize(saved.uri, saved.base64) <= 512 * 1024) break;
      discardTemporaryMediaFile(saved.uri);
      temporarySavedUri = undefined;
      saved = await saveNormalizedAvatar(image, compress);
      temporarySavedUri = saved.uri;
    }
    if (normalizedAvatarFileSize(saved.uri, saved.base64) > 512 * 1024) {
      throw new Error('The selected portrait could not be reduced below 512 KiB');
    }

    const localUri = Platform.OS === 'web'
      ? (saved.base64 ? `data:image/jpeg;base64,${saved.base64}` : saved.uri)
      : finalizeLocalMediaFile(saved.uri, 'avatars', 'jpg');
    discardTemporaryMediaFile(temporarySavedUri);
    temporarySavedUri = undefined;
    discardTemporaryMediaFile(asset.uri);
    try { image.release(); } catch { /* Native image refs can already be released during teardown. */ }

    return {
      phase: 'ready',
      mediaKind: 'image',
      localUri,
      width: 768,
      height: 768,
      canceled: false,
      purpose: 'avatar',
    };
  } catch (error) {
    discardTemporaryMediaFile(temporarySavedUri);
    discardTemporaryMediaFile(asset.uri);
    return failedAvatarResult(error);
  }
};

const launchPicker = async (source: PhotoPickerSource): Promise<PhotoPickerResult> => {
  try {
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        return failedResult(source, 'Camera permission is required to take a photo');
      }
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 0.88,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 0.88,
          selectionLimit: 1,
        });

    if (result.canceled || !result.assets[0]) return canceledResult(source);
    return normalizeAsset(source, result.assets[0]);
  } catch (error) {
    return failedResult(source, error);
  }
};

export const pickPhotoFromLibrary = () => launchPicker('library');

export const takePhotoWithSystemCamera = () => launchPicker('camera');

const isAnimatedStickerAsset = (asset: ImagePicker.ImagePickerAsset) => {
  const mimeType = asset.mimeType?.toLowerCase() || '';
  const fileName = asset.fileName?.toLowerCase() || '';
  return mimeType === 'image/gif'
    || mimeType === 'image/apng'
    || mimeType === 'image/webp'
    || /\.(gif|apng|webp)$/.test(fileName);
};

/**
 * Keep the original asset so Android animated GIFs do not collapse to their
 * first frame. Sticker files are promoted into Nana's durable document area
 * before the result is returned to persisted state.
 */
export const pickStickersFromLibrary = async (): Promise<StickerPickerResult> => {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      allowsMultipleSelection: true,
      quality: 1,
      selectionLimit: 24,
      base64: false,
      exif: false,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      shouldDownloadFromNetwork: true,
    });
    if (result.canceled) return { canceled: true, assets: [], rejectedCount: 0 };

    let rejectedCount = 0;
    const assets = result.assets.flatMap((asset): PickedStickerAsset[] => {
      if (asset.type && asset.type !== 'image') {
        rejectedCount += 1;
        return [];
      }
      if (typeof asset.fileSize === 'number' && asset.fileSize > 8 * 1024 * 1024) {
        rejectedCount += 1;
        return [];
      }
      try {
        const extension = safeExtension(asset);
        return [{
          uri: finalizeLocalMediaFile(asset.uri, 'stickers', extension),
          name: asset.fileName?.replace(/\.[^.]+$/, '').trim() || 'Sticker',
          mimeType: asset.mimeType || `image/${extension}`,
          animated: isAnimatedStickerAsset(asset),
          width: asset.width,
          height: asset.height,
          fileSize: asset.fileSize,
        }];
      } catch {
        rejectedCount += 1;
        return [];
      }
    });
    return { canceled: false, assets, rejectedCount };
  } catch (error) {
    return {
      canceled: false,
      assets: [],
      rejectedCount: 0,
      errorMessage: error instanceof Error ? error.message : 'Sticker selection failed',
    };
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isPendingImagePickerIntent = (value: unknown): value is PendingImagePickerIntent => {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'chat-photo') return typeof value.chatId === 'string' && !!value.chatId;
  if (value.kind === 'character-avatar') return typeof value.characterId === 'string' && !!value.characterId;
  if (value.kind === 'character-avatar-draft' || value.kind === 'user-avatar-draft') {
    return isRecord(value.draft);
  }
  if (value.kind === 'theme-wallpaper') return true;
  return false;
};

export const rememberPendingImagePickerIntent = async (intent: PendingImagePickerIntent) => {
  await AsyncStorage.setItem(PENDING_IMAGE_PICKER_INTENT_KEY, JSON.stringify(intent));
};

export const readPendingImagePickerIntent = async (): Promise<PendingImagePickerIntent | null> => {
  const raw = await AsyncStorage.getItem(PENDING_IMAGE_PICKER_INTENT_KEY);
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isPendingImagePickerIntent(parsed)) return parsed;
    } catch {
      // Fall through to the legacy chat-only recovery below.
    }
  }
  const legacyChatId = await AsyncStorage.getItem(LEGACY_PENDING_PHOTO_CHAT_KEY);
  return legacyChatId ? { kind: 'chat-photo', chatId: legacyChatId } : null;
};

export const clearPendingImagePickerIntent = async () => {
  await AsyncStorage.multiRemove([
    PENDING_IMAGE_PICKER_INTENT_KEY,
    LEGACY_PENDING_PHOTO_CHAT_KEY,
  ]);
};

export const pickWallpaperFromLibrary = async (): Promise<PhotoPickerResult> => {
  await rememberPendingImagePickerIntent({ kind: 'theme-wallpaper' });
  try {
    return await launchPicker('library');
  } finally {
    await clearPendingImagePickerIntent();
  }
};

export const consumePendingImagePickerIntent = async () => {
  const intent = await readPendingImagePickerIntent();
  await clearPendingImagePickerIntent();
  return intent;
};

export const rememberPendingPhotoChat = async (chatId: string) => {
  await rememberPendingImagePickerIntent({ kind: 'chat-photo', chatId });
};

export const consumePendingPhotoChat = async () => {
  const intent = await consumePendingImagePickerIntent();
  return intent?.kind === 'chat-photo' ? intent.chatId : null;
};

export const pickCharacterAvatarFromLibrary = async (
  intent?: Exclude<PendingImagePickerIntent, { kind: 'chat-photo' }>,
): Promise<AvatarPickerResult> => {
  if (intent) await rememberPendingImagePickerIntent(intent);
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      allowsEditing: true,
      aspect: [1, 1],
      shape: 'rectangle',
      quality: 1,
      base64: false,
      exif: false,
      selectionLimit: 1,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      shouldDownloadFromNetwork: true,
    });
    if (result.canceled || !result.assets[0]) return canceledAvatarResult();
    return await normalizeAvatarAsset(result.assets[0]);
  } catch (error) {
    return failedAvatarResult(error);
  } finally {
    if (intent) await clearPendingImagePickerIntent();
  }
};

export const discardPickedAvatar = (uri?: string | null) => (
  deletePersistedMediaFile(uri, 'avatars') || discardTemporaryMediaFile(uri)
);

export const cleanupReplacedWallpaper = (
  previousUri?: string | null,
  currentUri?: string | null,
) => (
  !!previousUri
  && previousUri !== currentUri
  && deletePersistedMediaFile(previousUri, 'images')
);

export const createCharacterAvatarStatePatch = (
  state: CharacterAvatarStateSlice,
  characterId: string,
  avatar: string,
): Pick<CharacterAvatarStateSlice, 'characters' | 'chatHistory' | 'momentsList' | 'callLogs' | 'callOverlay'> => ({
  characters: state.characters.map(character => (
    character.id === characterId ? { ...character, avatar } : character
  )),
  chatHistory: {
    ...state.chatHistory,
    [characterId]: (state.chatHistory[characterId] || []).map(message => (
      message.sender === 'char' && message.avatar ? { ...message, avatar } : message
    )),
  },
  momentsList: state.momentsList.map(moment => (
    moment.authorId === characterId ? { ...moment, avatar } : moment
  )),
  callLogs: state.callLogs.map(call => (
    call.characterId === characterId ? { ...call, avatar } : call
  )),
  callOverlay: state.callOverlay.characterId === characterId
    ? { ...state.callOverlay, avatar }
    : state.callOverlay,
});

export const createUserAvatarStatePatch = (
  state: CharacterAvatarStateSlice,
  avatar: string,
): Pick<CharacterAvatarStateSlice, 'myAvatar' | 'chatHistory' | 'momentsList'> => ({
  myAvatar: avatar,
  chatHistory: Object.fromEntries(
    Object.entries(state.chatHistory).map(([chatId, messages]) => [
      chatId,
      messages.map(message => message.sender === 'user' ? { ...message, avatar } : message),
    ]),
  ),
  momentsList: state.momentsList.map(moment => (
    moment.authorId === 'me' || moment.authorId === 'user'
      ? { ...moment, avatar }
      : moment
  )),
});

export const avatarUrisReferencedByState = (state: CharacterAvatarStateSlice) => new Set([
  state.myAvatar,
  ...state.savedAvatars,
  ...state.characters.map(character => character.avatar),
  ...state.momentsList.map(moment => moment.avatar),
  ...state.callLogs.map(call => call.avatar || ''),
  ...(typeof state.callOverlay.avatar === 'string' ? [state.callOverlay.avatar] : []),
  ...Object.values(state.chatHistory).flatMap(messages => messages.map(message => message.avatar || '')),
].filter(Boolean));

export const cleanupReplacedAvatar = (
  previousAvatar: string | undefined,
  stateAfterReplacement: CharacterAvatarStateSlice,
) => {
  if (!previousAvatar || avatarUrisReferencedByState(stateAfterReplacement).has(previousAvatar)) return false;
  return deletePersistedMediaFile(previousAvatar, 'avatars');
};

export const recoverPendingPhotoSelection = async (): Promise<PhotoPickerResult | null> => {
  if (Platform.OS !== 'android') return null;

  try {
    const pending = await ImagePicker.getPendingResultAsync();
    if (!pending) return null;
    if ('code' in pending) return failedResult('library', pending.message || pending.code);
    if (pending.canceled || !pending.assets[0]) return canceledResult('library');
    return normalizeAsset('library', pending.assets[0]);
  } catch (error) {
    return failedResult('library', error);
  }
};

export const recoverPendingImagePickerSelection = async (): Promise<RecoveredImagePickerSelection | null> => {
  if (Platform.OS !== 'android') return null;
  const intent = await readPendingImagePickerIntent();
  if (!intent) return null;

  try {
    const pending = await ImagePicker.getPendingResultAsync();
    if (!pending) return null;
    if ('code' in pending) {
      return {
        intent,
        result: intent.kind === 'chat-photo' || intent.kind === 'theme-wallpaper'
          ? failedResult('library', pending.message || pending.code)
          : failedAvatarResult(pending.message || pending.code),
      };
    }
    if (pending.canceled || !pending.assets[0]) {
      return {
        intent,
        result: intent.kind === 'chat-photo' || intent.kind === 'theme-wallpaper'
          ? canceledResult('library')
          : canceledAvatarResult(),
      };
    }
    return {
      intent,
      result: intent.kind === 'chat-photo'
        ? normalizeAsset('library', pending.assets[0])
        : intent.kind === 'theme-wallpaper'
          ? normalizeAsset('library', pending.assets[0])
          : await normalizeAvatarAsset(pending.assets[0]),
    };
  } catch (error) {
    return {
      intent,
      result: intent.kind === 'chat-photo' || intent.kind === 'theme-wallpaper'
        ? failedResult('library', error)
        : failedAvatarResult(error),
    };
  } finally {
    await clearPendingImagePickerIntent();
  }
};
