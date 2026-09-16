import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { Image } from 'expo-image';

const bundledPortraits: Record<string, { source: number; initial: string }> = {
  'luna-id': {
    source: require('../../assets/generated/nana-characters/luna-default.png'),
    initial: 'L',
  },
  'kai-id': {
    source: require('../../assets/generated/nana-characters/kai-default.png'),
    initial: 'K',
  },
  'aria-id': {
    source: require('../../assets/generated/nana-characters/aria-default.png'),
    initial: 'A',
  },
};

export function resolveCharacterPortraitSource(characterId?: string | null, avatar?: ReactNode) {
  if (typeof avatar === 'string' && /^(https?:|data:|file:|content:|blob:)/.test(avatar)) {
    return { uri: avatar };
  }

  if (!characterId) return null;
  const bundled = bundledPortraits[characterId];
  if (!bundled) return null;

  const normalizedAvatar = typeof avatar === 'string' ? avatar.trim() : '';
  return !normalizedAvatar || normalizedAvatar === bundled.initial ? bundled.source : null;
}

export function CharacterPortrait({
  characterId,
  avatar,
  fallback = 'N',
  fontSize = 18,
  color = '#FFF7F3',
  contentFit = 'cover',
}: {
  characterId?: string | null;
  avatar?: ReactNode;
  fallback?: string;
  fontSize?: number;
  color?: string;
  contentFit?: 'cover' | 'contain';
}) {
  const source = resolveCharacterPortraitSource(characterId, avatar);
  if (source) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        source={source}
        contentFit={contentFit}
        cachePolicy="memory-disk"
        transition={0}
        style={{ width: '100%', height: '100%' }}
      />
    );
  }

  if (avatar !== null && avatar !== undefined && typeof avatar !== 'string') return avatar;
  const label = typeof avatar === 'string' && avatar.trim() ? avatar : fallback;
  return (
    <Text style={{ color, fontSize, fontWeight: '700' }}>
      {label.slice(0, 2)}
    </Text>
  );
}
