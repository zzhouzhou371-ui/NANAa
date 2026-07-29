import type { Character, Moment } from '../types';

export interface CharacterMomentReactionPlan {
  character: Character;
  shouldLike: boolean;
  shouldComment: boolean;
}

const stableHash = (value: string) => {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) || 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
};

export function planCharacterMomentReactions(input: {
  moment: Moment;
  characters: Character[];
  friends: string[];
  blockedUsers: string[];
  maximum?: number;
}): CharacterMomentReactionPlan[] {
  if (input.moment.authorId !== 'me' && input.moment.authorId !== 'user') return [];
  const maximum = Math.max(0, Math.min(2, input.maximum ?? 2));
  if (maximum === 0) return [];

  const friendIds = new Set(input.friends);
  const blockedIds = new Set(input.blockedUsers);
  const existingAuthorIds = new Set([
    ...(input.moment.likes || []).map(like => like.authorId),
    ...(input.moment.comments || []).map(comment => comment.authorId),
  ]);

  return input.characters
    .filter(character => (
      friendIds.has(character.id)
      && !blockedIds.has(character.id)
      && !existingAuthorIds.has(character.id)
    ))
    .sort((left, right) => (
      stableHash(`${input.moment.id}:${left.id}`)
      - stableHash(`${input.moment.id}:${right.id}`)
      || left.id.localeCompare(right.id)
    ))
    .slice(0, maximum)
    .map((character, index) => ({
      character,
      shouldLike: true,
      shouldComment: index === 0,
    }));
}

export function createLocalMomentReactionComment(input: {
  character: Character;
  momentText: string;
  language: string;
}) {
  const isChinese = input.language.toLowerCase().startsWith('zh');
  const persona = input.character.desc.toLowerCase();
  const excerpt = Array.from(input.momentText.replace(/\s+/g, ' ').trim())
    .slice(0, isChinese ? 24 : 52)
    .join('');
  const reserved = /(quiet|reserved|stoic|calm|安静|克制|冷静|寡言)/iu.test(persona);
  const playful = /(playful|witty|cheerful|lively|俏皮|活泼|幽默|开朗)/iu.test(persona);
  const gentle = /(gentle|caring|soft|warm|温柔|体贴|柔和|关心)/iu.test(persona);

  if (isChinese) {
    if (playful) return excerpt ? `被我看到了～“${excerpt}”很有你的风格。` : '被我看到啦～';
    if (reserved) return excerpt ? `嗯，我看到这条了。“${excerpt}”` : '看到了。';
    if (gentle) return excerpt ? `看到你分享“${excerpt}”，感觉今天也变温柔了一点。` : '看到你的分享啦。';
    return excerpt ? `看到你分享的“${excerpt}”了。` : '看到你的朋友圈了。';
  }

  if (playful) return excerpt ? `Spotted this—“${excerpt}” feels very you.` : 'Spotted this one.';
  if (reserved) return excerpt ? `I saw this. “${excerpt}”` : 'I saw it.';
  if (gentle) return excerpt ? `Seeing you share “${excerpt}” made the day feel softer.` : 'I’m glad I saw this.';
  return excerpt ? `I saw your post about “${excerpt}”.` : 'I saw your post.';
}
