import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

export type NanaMediaKind = 'images' | 'audio' | 'avatars';

const NANA_MEDIA_ROOT = 'nana-media';
const AVATAR_STAGING_ROOT = 'nana-avatar-staging';

export interface PersistedAvatarExport {
  base64: string;
  byteLength: number;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  extension: 'jpg' | 'png' | 'webp';
}

const mediaDirectory = (kind: NanaMediaKind) => {
  const directory = new Directory(Paths.document, NANA_MEDIA_ROOT, kind);
  directory.create({ intermediates: true, idempotent: true });
  return directory;
};

const uriIsInside = (uri: string, directory: Directory) => (
  !!uri && uri.startsWith(directory.uri.endsWith('/') ? directory.uri : `${directory.uri}/`)
);

const safeExtension = (sourceUri: string, fallbackExtension: string) => {
  const clean = sourceUri.split('?')[0].split('#')[0].toLowerCase();
  const match = clean.match(/\.([a-z0-9]{2,5})$/);
  return match?.[1] || fallbackExtension.replace(/^\./, '') || 'bin';
};

const safeAvatarExtension = (extension: string): PersistedAvatarExport['extension'] => {
  const normalized = extension.replace(/^\./, '').toLowerCase();
  if (normalized === 'png' || normalized === 'webp') return normalized;
  if (normalized === 'jpg' || normalized === 'jpeg') return 'jpg';
  throw new Error(`Unsupported avatar extension: ${extension}`);
};

const avatarMimeType = (extension: PersistedAvatarExport['extension']) => (
  extension === 'png' ? 'image/png' as const
    : extension === 'webp' ? 'image/webp' as const
      : 'image/jpeg' as const
);

const avatarStagingDirectory = () => {
  const directory = new Directory(Paths.cache, AVATAR_STAGING_ROOT);
  directory.create({ intermediates: true, idempotent: true });
  return directory;
};

const base64ByteLength = (base64: string) => {
  const normalized = base64.replace(/\s/g, '');
  if (!normalized) return 0;
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
};

export function persistLocalMediaFile(
  sourceUri: string,
  kind: NanaMediaKind,
  fallbackExtension: string,
): string {
  if (!sourceUri || Platform.OS === 'web') return sourceUri;
  const directory = mediaDirectory(kind);
  if (sourceUri.startsWith(directory.uri)) return sourceUri;

  const destination = new File(
    directory,
    `${kind}-${Date.now()}-${Math.round(Math.random() * 1_000_000)}.${safeExtension(sourceUri, fallbackExtension)}`,
  );
  new File(sourceUri).copy(destination);
  return destination.uri;
}

/**
 * Promote a cache-backed capture into Nana's durable document directory. The
 * temporary source is removed only when it is owned by the app cache.
 */
export function finalizeLocalMediaFile(
  sourceUri: string,
  kind: NanaMediaKind,
  fallbackExtension: string,
): string {
  const persistedUri = persistLocalMediaFile(sourceUri, kind, fallbackExtension);
  if (Platform.OS !== 'web' && persistedUri !== sourceUri) {
    discardTemporaryMediaFile(sourceUri);
  }
  return persistedUri;
}

/** Delete only cache-owned files (or web blob URLs); never delete arbitrary URIs. */
export function discardTemporaryMediaFile(uri?: string | null): boolean {
  if (!uri) return false;
  if (Platform.OS === 'web') {
    if (uri.startsWith('blob:') && typeof URL !== 'undefined') {
      URL.revokeObjectURL(uri);
      return true;
    }
    return false;
  }

  const cacheRoot = Paths.cache;
  if (!uriIsInside(uri, cacheRoot)) return false;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
    return true;
  } catch {
    return false;
  }
}

export function isPersistedMediaUri(uri?: string | null, kind?: NanaMediaKind): boolean {
  if (!uri || Platform.OS === 'web') return false;
  if (kind) return uriIsInside(uri, mediaDirectory(kind));
  return uriIsInside(uri, new Directory(Paths.document, NANA_MEDIA_ROOT));
}

/** Delete only a file inside the expected Nana media directory. */
export function deletePersistedMediaFile(
  uri?: string | null,
  kind?: NanaMediaKind,
): boolean {
  if (!isPersistedMediaUri(uri, kind)) return false;
  try {
    const file = new File(uri!);
    if (file.exists) file.delete();
    return true;
  } catch {
    return false;
  }
}

export function pruneUnreferencedAvatarFiles(referencedUris: Iterable<string>): number {
  if (Platform.OS === 'web') return 0;
  const keep = new Set(referencedUris);
  const directory = mediaDirectory('avatars');
  let deleted = 0;
  try {
    for (const entry of directory.list()) {
      if (entry instanceof File && !keep.has(entry.uri)) {
        entry.delete();
        deleted += 1;
      }
    }
  } catch {
    return deleted;
  }
  return deleted;
}

export async function readPersistedAvatarForExport(uri: string): Promise<PersistedAvatarExport> {
  if (Platform.OS === 'web') {
    const match = uri.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!match) throw new Error('Only Nana-managed avatar data can be exported on web');
    const mimeType = match[1] as PersistedAvatarExport['mimeType'];
    const extension: PersistedAvatarExport['extension'] = mimeType === 'image/png'
      ? 'png'
      : mimeType === 'image/webp' ? 'webp' : 'jpg';
    return {
      base64: match[2],
      byteLength: base64ByteLength(match[2]),
      mimeType,
      extension,
    };
  }

  if (!isPersistedMediaUri(uri, 'avatars')) {
    throw new Error('Avatar is not stored in Nana media');
  }
  const file = new File(uri);
  if (!file.exists) throw new Error('Avatar file is missing');
  const extension = safeAvatarExtension(safeExtension(uri, 'jpg'));
  return {
    base64: await file.base64(),
    byteLength: file.size,
    mimeType: avatarMimeType(extension),
    extension,
  };
}

export function stageImportedAvatar(base64: string, extension: string): string {
  const normalizedBase64 = base64.replace(/\s/g, '');
  if (!normalizedBase64) throw new Error('Imported avatar data is empty');
  const safeExt = safeAvatarExtension(extension);
  if (Platform.OS === 'web') {
    return `data:${avatarMimeType(safeExt)};base64,${normalizedBase64}`;
  }
  const destination = new File(
    avatarStagingDirectory(),
    `avatar-stage-${Date.now()}-${Math.round(Math.random() * 1_000_000)}.${safeExt}`,
  );
  destination.create({ intermediates: true, overwrite: false });
  try {
    destination.write(normalizedBase64, { encoding: 'base64' });
    return destination.uri;
  } catch (error) {
    if (destination.exists) destination.delete();
    throw error;
  }
}

export function promoteStagedAvatar(stagingUri: string, extension: string): string {
  if (Platform.OS === 'web') return stagingUri;
  if (!uriIsInside(stagingUri, avatarStagingDirectory())) {
    throw new Error('Avatar import staging URI is outside Nana cache');
  }
  return finalizeLocalMediaFile(stagingUri, 'avatars', safeAvatarExtension(extension));
}

export function deleteStagedAvatar(uri?: string | null): boolean {
  if (!uri || Platform.OS === 'web') return false;
  if (!uriIsInside(uri, avatarStagingDirectory())) return false;
  return discardTemporaryMediaFile(uri);
}

export function deleteFinalAvatar(uri?: string | null): boolean {
  return deletePersistedMediaFile(uri, 'avatars');
}

export function createWritableMediaFile(kind: NanaMediaKind, fileName: string): File {
  const directory = Platform.OS === 'web'
    ? new Directory(Paths.cache, 'nana-audio')
    : mediaDirectory(kind);
  directory.create({ intermediates: true, idempotent: true });
  return new File(directory, fileName);
}

export function clearPersistedMedia(): void {
  const persistentRoot = new Directory(Paths.document, NANA_MEDIA_ROOT);
  if (persistentRoot.exists) persistentRoot.delete();

  const legacyAudioCache = new Directory(Paths.cache, 'nana-audio');
  if (legacyAudioCache.exists) legacyAudioCache.delete();

  const avatarStagingCache = new Directory(Paths.cache, AVATAR_STAGING_ROOT);
  if (avatarStagingCache.exists) avatarStagingCache.delete();
}
