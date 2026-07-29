import type {
  Character,
  ProactiveMomentSchedule,
  ProactiveMomentSchedules,
  ProactiveMomentsMode,
  RelationshipTrace,
} from '../types';

const HOUR_MS = 60 * 60 * 1_000;
export const PROACTIVE_MOMENT_GLOBAL_COOLDOWN_MS = 8 * HOUR_MS;
export const PROACTIVE_MOMENT_OCCASIONAL_MIN_MS = 42 * HOUR_MS;
export const PROACTIVE_MOMENT_OCCASIONAL_MAX_MS = 72 * HOUR_MS;
export const PROACTIVE_MOMENT_NORMAL_MIN_MS = 20 * HOUR_MS;
export const PROACTIVE_MOMENT_NORMAL_MAX_MS = 34 * HOUR_MS;

const stableHash = (value: string) => {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) || 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
};

const modeWindow = (mode: ProactiveMomentsMode) => {
  if (mode === 'normal') {
    return {
      minimum: PROACTIVE_MOMENT_NORMAL_MIN_MS,
      maximum: PROACTIVE_MOMENT_NORMAL_MAX_MS,
    };
  }
  if (mode === 'occasional') {
    return {
      minimum: PROACTIVE_MOMENT_OCCASIONAL_MIN_MS,
      maximum: PROACTIVE_MOMENT_OCCASIONAL_MAX_MS,
    };
  }
  return null;
};

const deterministicDelay = (
  characterId: string,
  mode: ProactiveMomentsMode,
  now: number,
  reason: string,
) => {
  const window = modeWindow(mode);
  if (!window) return Number.MAX_SAFE_INTEGER - now;
  const range = Math.max(1, window.maximum - window.minimum);
  const dayBucket = Math.floor(now / (24 * HOUR_MS));
  return window.minimum
    + (stableHash(`${characterId}:${mode}:${reason}:${dayBucket}`) % range);
};

export const createInitialMomentSchedule = (
  characterId: string,
  mode: ProactiveMomentsMode,
  now = Date.now(),
): ProactiveMomentSchedule | null => {
  if (mode === 'off') return null;
  return {
    characterId,
    nextDueAt: now + deterministicDelay(characterId, mode, now, 'initial'),
  };
};

export const rescheduleAfterMomentPost = (
  current: ProactiveMomentSchedule | undefined,
  characterId: string,
  mode: ProactiveMomentsMode,
  now = Date.now(),
  focusTraceId?: string,
): ProactiveMomentSchedule | null => {
  if (mode === 'off') return null;
  return {
    ...current,
    characterId,
    lastPostedAt: now,
    ...(focusTraceId ? { lastFocusTraceId: focusTraceId } : {}),
    nextDueAt: now + deterministicDelay(characterId, mode, now, 'posted'),
  };
};

const isTimestamp = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0
);

export const normalizeProactiveMomentSchedules = (
  value: unknown,
): ProactiveMomentSchedules => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const normalized: ProactiveMomentSchedules = {};
  for (const [characterId, candidate] of Object.entries(value)) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const schedule = candidate as Record<string, unknown>;
    if (
      schedule.characterId !== characterId
      || !isTimestamp(schedule.nextDueAt)
      || (schedule.lastPostedAt !== undefined && !isTimestamp(schedule.lastPostedAt))
      || (
        schedule.lastFocusTraceId !== undefined
        && typeof schedule.lastFocusTraceId !== 'string'
      )
    ) continue;
    normalized[characterId] = {
      characterId,
      nextDueAt: schedule.nextDueAt,
      ...(schedule.lastPostedAt !== undefined
        ? { lastPostedAt: schedule.lastPostedAt as number }
        : {}),
      ...(typeof schedule.lastFocusTraceId === 'string'
        ? { lastFocusTraceId: schedule.lastFocusTraceId }
        : {}),
    };
  }
  return normalized;
};

interface SelectDueMomentCandidateInput {
  characters: Character[];
  friends: string[];
  blockedUsers: string[];
  schedules: ProactiveMomentSchedules;
  appState: 'active' | 'background' | 'inactive' | 'unknown';
  pendingCharacterIds?: string[];
  now?: number;
}

export const selectDueMomentCandidate = ({
  characters,
  friends,
  blockedUsers,
  schedules,
  appState,
  pendingCharacterIds = [],
  now = Date.now(),
}: SelectDueMomentCandidateInput): Character | null => {
  if (appState !== 'active') return null;
  const latestPostedAt = Object.values(schedules).reduce(
    (latest, schedule) => Math.max(latest, schedule.lastPostedAt || 0),
    0,
  );
  if (latestPostedAt > now - PROACTIVE_MOMENT_GLOBAL_COOLDOWN_MS) return null;

  const friendIds = new Set(friends);
  const blockedIds = new Set(blockedUsers);
  const pendingIds = new Set(pendingCharacterIds);
  return characters
    .filter(character => {
      const mode = character.proactiveMomentsMode || 'off';
      const schedule = schedules[character.id];
      const window = modeWindow(mode);
      if (
        !window
        || !schedule
        || !friendIds.has(character.id)
        || blockedIds.has(character.id)
        || pendingIds.has(character.id)
        || schedule.nextDueAt > now
      ) return false;
      return !schedule.lastPostedAt
        || schedule.lastPostedAt <= now - window.minimum;
    })
    .sort((left, right) => (
      schedules[left.id].nextDueAt - schedules[right.id].nextDueAt
      || left.id.localeCompare(right.id)
    ))[0] || null;
};

export const selectMomentFocusEvent = (
  traces: RelationshipTrace[],
  characterId: string,
  schedule?: ProactiveMomentSchedule,
  now = Date.now(),
): RelationshipTrace | null => {
  const latest = traces
    .filter(trace => (
      trace.characterId === characterId
      && trace.remember
      && trace.state === 'digested'
      && trace.summary.trim().length > 0
      && trace.occurredAt <= now
    ))
    .sort((left, right) => (
      right.occurredAt - left.occurredAt
      || right.createdAt - left.createdAt
      || right.id.localeCompare(left.id)
    ))[0];
  return latest && latest.id !== schedule?.lastFocusTraceId ? latest : null;
};

const conciseExcerpt = (value: string, maximum: number) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const characters = Array.from(normalized);
  return characters.length <= maximum
    ? normalized
    : `${characters.slice(0, maximum).join('')}…`;
};

const resolvePersonaTone = (description: string) => {
  if (/(gentle|caring|soft|warm|温柔|体贴|柔和|关心)/iu.test(description)) return 'warm';
  if (/(quiet|reserved|stoic|calm|安静|克制|冷静|寡言)/iu.test(description)) return 'reserved';
  if (/(playful|witty|cheerful|lively|活泼|俏皮|幽默|开朗)/iu.test(description)) return 'playful';
  return 'neutral';
};

interface CreateLocalMomentDraftInput {
  characterId: string;
  characterName?: string;
  personaDescription?: string;
  recentEventSummary?: string;
  focusTraceId?: string;
  language?: string;
  now?: number;
}

export interface LocalMomentDraft {
  text: string;
  images: string[];
  generationSource: 'characterLocal';
  focusTraceId?: string;
}

export const createLocalMomentDraft = ({
  characterId,
  characterName,
  personaDescription = '',
  recentEventSummary,
  focusTraceId,
  language,
  now = Date.now(),
}: CreateLocalMomentDraftInput): LocalMomentDraft => {
  const isChinese = language?.toLowerCase().startsWith('zh') ?? false;
  const hour = new Date(now).getHours();
  const tone = resolvePersonaTone(personaDescription);
  const variant = stableHash(
    `${characterId}:${characterName || ''}:${tone}:${Math.floor(now / (24 * HOUR_MS))}`,
  ) % 3;

  if (recentEventSummary?.trim() && focusTraceId) {
    const excerpt = conciseExcerpt(recentEventSummary, isChinese ? 46 : 96);
    return {
      text: isChinese
        ? `今天又想起「${excerpt}」。有些共同经历，过一会儿再想，还是会觉得很特别。`
        : `I thought about “${excerpt}” again today. Some shared moments still feel special after a little time.`,
      images: [],
      generationSource: 'characterLocal',
      focusTraceId,
    };
  }

  const chineseCopy = {
    warm: [
      '路过一小片很好看的光，想把这一刻留给在意的人。',
      '今天也有好好生活。希望我在意的人也是。',
      '安静下来的时候，会更清楚地感觉到想念。',
    ],
    reserved: [
      '今天很安静。这样也不错。',
      '把事情一件一件做好，心也会慢慢安定下来。',
      '没什么特别的，只是想留下一点今天的痕迹。',
    ],
    playful: [
      '今日份的小快乐已捕获。猜猜还缺谁？',
      '普通的一天，被我过得稍微有趣了一点。',
      '偷偷宣布：今天的心情还不错。',
    ],
    neutral: [
      hour < 11 ? '早晨的光很好。新的一天，慢慢来。' : '给今天留一个小小的记号。',
      '有些普通时刻，记录下来以后就不普通了。',
      '今天也在认真感受生活。',
    ],
  } as const;
  const englishCopy = {
    warm: [
      'I passed through a beautiful patch of light and wanted to keep the moment for someone I care about.',
      'Taking gentle care of today. I hope the people I care about are, too.',
      'When everything gets quiet, missing someone becomes a little clearer.',
    ],
    reserved: [
      'A quiet day. That is not a bad thing.',
      'One thing at a time. The mind settles eventually.',
      'Nothing dramatic. I just wanted to leave a small trace of today.',
    ],
    playful: [
      'Today’s tiny happiness: captured. Guess who is missing?',
      'An ordinary day, made slightly more interesting.',
      'A secret announcement: today’s mood is pretty good.',
    ],
    neutral: [
      hour < 11 ? 'Soft morning light. I am taking the new day slowly.' : 'Leaving a small marker for today.',
      'Some ordinary moments stop being ordinary once you keep them.',
      'Paying attention to life today.',
    ],
  } as const;
  const selectedCopy = isChinese ? chineseCopy[tone] : englishCopy[tone];
  return {
    text: selectedCopy[variant],
    images: [],
    generationSource: 'characterLocal',
  };
};
