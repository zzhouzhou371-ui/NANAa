export type AvatarValuePlatform = 'web' | 'native';

export type AvatarValueResult =
  | { ok: true; value: string }
  | { ok: false; reason: 'temporary' | 'externalLocal' | 'invalidData' | 'unsupported' };

const URI_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const WEB_IMAGE_DATA_URI = /^data:image\/(?:jpeg|jpg|png|webp);base64,[a-z0-9+/]+={0,2}$/i;

export const isPortableAvatarDataUri = (value: string): boolean => WEB_IMAGE_DATA_URI.test(value);

export const hasNanaManagedAvatarPath = (value: string): boolean => {
  const normalized = value.replace(/\\/g, '/');
  const isLocalUri = /^file:/i.test(normalized)
    || normalized.startsWith('/')
    || /^[a-z]:\//i.test(normalized);
  return isLocalUri && normalized.includes('/nana-media/avatars/');
};

/**
 * Validate only the value that is about to enter persisted state. Picker
 * results are first promoted into Nana's avatar directory, so arbitrary
 * file/content/blob URIs never become durable avatar references.
 */
export function normalizeAvatarValue(
  input: string,
  platform: AvatarValuePlatform,
): AvatarValueResult {
  const value = input.trim();
  if (!value) return { ok: true, value: '' };

  if (/^blob:/i.test(value)) return { ok: false, reason: 'temporary' };
  if (/^https?:\/\/\S+$/i.test(value)) return { ok: true, value };

  if (/^data:/i.test(value)) {
    return platform === 'web' && isPortableAvatarDataUri(value)
      ? { ok: true, value }
      : { ok: false, reason: 'invalidData' };
  }

  if (/^(?:file|content):/i.test(value)) {
    return platform === 'native' && /^file:/i.test(value) && hasNanaManagedAvatarPath(value)
      ? { ok: true, value }
      : { ok: false, reason: 'externalLocal' };
  }

  if (URI_SCHEME.test(value)) return { ok: false, reason: 'unsupported' };
  return { ok: true, value };
}
