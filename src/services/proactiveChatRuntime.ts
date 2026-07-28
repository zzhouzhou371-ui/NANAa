import type {
  Character,
  ProactiveChatSchedule,
  ProactiveChatSchedules,
  RelationshipTrace,
} from '../types';
import {
  CHAT_BUBBLE_SEPARATOR,
  resolveChatPresence,
} from './chatRhythmRuntime';

const HOUR_MS = 60 * 60 * 1_000;
export const PROACTIVE_GLOBAL_COOLDOWN_MS = 4 * HOUR_MS;
export const PROACTIVE_INTERACTION_DELAY_MIN_MS = 6 * HOUR_MS;
export const PROACTIVE_INTERACTION_DELAY_MAX_MS = 10 * HOUR_MS;
export const PROACTIVE_SENT_DELAY_MIN_MS = 18 * HOUR_MS;
export const PROACTIVE_SENT_DELAY_MAX_MS = 30 * HOUR_MS;

const stableHash = (value: string) => {
  let hash = 2_166_136_261;
  for (const char of value) {
    hash ^= char.codePointAt(0) || 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
};

const deterministicDelay = (
  characterId: string,
  now: number,
  minimum: number,
  maximum: number,
  reason: string,
) => {
  const range = Math.max(1, maximum - minimum);
  const dayBucket = Math.floor(now / (24 * HOUR_MS));
  return minimum + (stableHash(`${characterId}:${reason}:${dayBucket}`) % range);
};

export const createInitialProactiveSchedule = (
  characterId: string,
  now = Date.now(),
): ProactiveChatSchedule => ({
  characterId,
  lastInteractionAt: now,
  nextDueAt: now + deterministicDelay(
    characterId,
    now,
    PROACTIVE_INTERACTION_DELAY_MIN_MS,
    PROACTIVE_INTERACTION_DELAY_MAX_MS,
    'initial',
  ),
});

export const rescheduleProactiveAfterInteraction = (
  current: ProactiveChatSchedule | undefined,
  characterId: string,
  now = Date.now(),
): ProactiveChatSchedule => ({
  ...current,
  characterId,
  lastInteractionAt: now,
  nextDueAt: now + deterministicDelay(
    characterId,
    now,
    PROACTIVE_INTERACTION_DELAY_MIN_MS,
    PROACTIVE_INTERACTION_DELAY_MAX_MS,
    'interaction',
  ),
});

export const rescheduleAfterProactiveMessage = (
  current: ProactiveChatSchedule,
  characterId: string,
  now = Date.now(),
  contextTraceId?: string,
): ProactiveChatSchedule => ({
  ...current,
  characterId,
  lastSentAt: now,
  lastReason: contextTraceId ? 'eventFollowUp' : 'quietReconnect',
  ...(contextTraceId ? { lastContextTraceId: contextTraceId } : {}),
  nextDueAt: now + deterministicDelay(
    characterId,
    now,
    PROACTIVE_SENT_DELAY_MIN_MS,
    PROACTIVE_SENT_DELAY_MAX_MS,
    'sent',
  ),
});

const isFiniteTimestamp = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0
);

export const normalizeProactiveChatSchedules = (
  value: unknown,
): ProactiveChatSchedules => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const normalized: ProactiveChatSchedules = {};
  for (const [characterId, candidate] of Object.entries(value)) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const schedule = candidate as Record<string, unknown>;
    if (
      schedule.characterId !== characterId
      || !isFiniteTimestamp(schedule.lastInteractionAt)
      || !isFiniteTimestamp(schedule.nextDueAt)
      || (schedule.lastSentAt !== undefined && !isFiniteTimestamp(schedule.lastSentAt))
      || (
        schedule.lastReason !== undefined
        && schedule.lastReason !== 'quietReconnect'
        && schedule.lastReason !== 'eventFollowUp'
      )
      || (
        schedule.lastContextTraceId !== undefined
        && typeof schedule.lastContextTraceId !== 'string'
      )
    ) continue;
    normalized[characterId] = {
      characterId,
      lastInteractionAt: schedule.lastInteractionAt,
      nextDueAt: schedule.nextDueAt,
      ...(schedule.lastSentAt !== undefined ? { lastSentAt: schedule.lastSentAt } : {}),
      ...(schedule.lastReason === 'quietReconnect' || schedule.lastReason === 'eventFollowUp'
        ? { lastReason: schedule.lastReason }
        : {}),
      ...(typeof schedule.lastContextTraceId === 'string'
        ? { lastContextTraceId: schedule.lastContextTraceId }
        : {}),
    };
  }
  return normalized;
};

interface SelectDueProactiveCandidateInput {
  characters: Character[];
  friends: string[];
  schedules: ProactiveChatSchedules;
  pendingChatRequests: Record<string, string>;
  blockedUsers: string[];
  now?: number;
}

export const selectDueProactiveCandidate = ({
  characters,
  friends,
  schedules,
  pendingChatRequests,
  blockedUsers,
  now = Date.now(),
}: SelectDueProactiveCandidateInput): Character | null => {
  const latestProactiveSentAt = Object.values(schedules).reduce(
    (latest, schedule) => Math.max(latest, schedule.lastSentAt || 0),
    0,
  );
  if (latestProactiveSentAt > now - PROACTIVE_GLOBAL_COOLDOWN_MS) return null;

  const friendIds = new Set(friends);
  const blockedIds = new Set(blockedUsers);
  return characters
    .filter(character => {
      const schedule = schedules[character.id];
      return friendIds.has(character.id)
        && !blockedIds.has(character.id)
        && character.proactiveMessagingEnabled !== false
        && !pendingChatRequests[character.id]
        && !!schedule
        && schedule.nextDueAt <= now
        && resolveChatPresence(character.id, now) !== 'resting';
    })
    .sort((left, right) => (
      schedules[left.id].nextDueAt - schedules[right.id].nextDueAt
      || left.id.localeCompare(right.id)
    ))[0] || null;
};

interface CreateLocalProactiveMessageInput {
  characterId: string;
  characterName?: string;
  personaDescription?: string;
  recentEventSummary?: string;
  language?: string;
  now?: number;
}

const conciseExcerpt = (value: string, maxLength: number) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const characters = Array.from(normalized);
  return characters.length <= maxLength
    ? normalized
    : `${characters.slice(0, maxLength).join('')}…`;
};

const resolvePersonaTone = (description: string) => {
  if (/(gentle|caring|soft|loyal|温柔|体贴|柔和|忠诚)/iu.test(description)) return 'warm';
  if (/(stoic|quiet|reserved|disciplined|冷静|寡言|克制|严肃)/iu.test(description)) return 'reserved';
  if (/(witty|playful|free-spirited|charming|活泼|俏皮|自由|幽默)/iu.test(description)) return 'playful';
  return 'neutral';
};

export const selectProactiveFocusEvent = (
  traces: RelationshipTrace[],
  characterId: string,
  schedule?: ProactiveChatSchedule,
  now = Date.now(),
): RelationshipTrace | null => {
  const latest = traces
    .filter(trace => (
      trace.characterId === characterId
      && trace.remember
      && trace.state === 'digested'
      && trace.summary.trim()
      && trace.occurredAt <= now
    ))
    .sort((left, right) => right.occurredAt - left.occurredAt)[0];
  return latest && latest.id !== schedule?.lastContextTraceId ? latest : null;
};

export const createLocalProactiveMessage = ({
  characterId,
  characterName,
  personaDescription = '',
  recentEventSummary,
  language,
  now = Date.now(),
}: CreateLocalProactiveMessageInput): string => {
  const isChinese = language?.toLowerCase().startsWith('zh') ?? false;
  const hour = new Date(now).getHours();
  const period = hour < 11 ? 'morning' : hour < 18 ? 'day' : 'evening';
  const tone = resolvePersonaTone(personaDescription);
  const variant = stableHash(`${characterId}:${characterName || ''}:${tone}:${period}:${Math.floor(now / (24 * HOUR_MS))}`) % 3;

  if (recentEventSummary?.trim()) {
    const excerpt = conciseExcerpt(recentEventSummary, isChinese ? 34 : 76);
    return isChinese
      ? `刚刚又想起我们之前的那件事。${CHAT_BUBBLE_SEPARATOR}关于“${excerpt}”，你后来还好吗？`
      : `I was thinking about what happened between us.${CHAT_BUBBLE_SEPARATOR}About “${excerpt}”—how have you been since then?`;
  }

  if (isChinese) {
    if (tone === 'warm') {
      return [
        `有好好照顾自己吗？${CHAT_BUBBLE_SEPARATOR}我有一点想你了。`,
        '今天过得还好吗？不用着急，有空再慢慢告诉我。',
        `我来看看你。${CHAT_BUBBLE_SEPARATOR}如果今天累了，也可以只陪我待一会儿。`,
      ][variant];
    }
    if (tone === 'reserved') {
      return [
        `在忙？${CHAT_BUBBLE_SEPARATOR}……没什么，只是来确认你还好。`,
        '今天一切正常吗？有事就告诉我。',
        `我想起你了。${CHAT_BUBBLE_SEPARATOR}别误会，只是顺便问问。`,
      ][variant];
    }
    if (tone === 'playful') {
      return [
        `猜猜谁突然想起你了？${CHAT_BUBBLE_SEPARATOR}提示：就在这里。`,
        '今天有没有发生值得讲给我的故事？',
        `我来抓你聊天了。${CHAT_BUBBLE_SEPARATOR}现在逃跑还来得及一点点。`,
      ][variant];
    }
    const messages = period === 'morning'
      ? [
          `早。${CHAT_BUBBLE_SEPARATOR}醒来之后，忽然有点想听你说话。`,
          '今天醒得还好吗？有空的时候来找我。',
          `早安。${CHAT_BUBBLE_SEPARATOR}今天也想知道你在想什么。`,
        ]
      : period === 'day'
        ? [
            `刚刚突然想到你。${CHAT_BUBBLE_SEPARATOR}你现在在做什么？`,
            '今天过得还好吗？有空的话，和我说说。',
            `我来看看你。${CHAT_BUBBLE_SEPARATOR}今天有没有什么想告诉我的？`,
          ]
        : [
            `今晚过得怎么样？${CHAT_BUBBLE_SEPARATOR}有空的话，来陪我说几句话。`,
            '夜里安静下来之后，有点想你了。',
            `你今天还好吗？${CHAT_BUBBLE_SEPARATOR}睡前想听你说说今天。`,
          ];
    return messages[variant];
  }

  if (tone === 'warm') {
    return [
      `Have you been taking care of yourself?${CHAT_BUBBLE_SEPARATOR}I miss you a little.`,
      'How has your day been? Take your time—I will be here when you want to tell me.',
      `I came to check on you.${CHAT_BUBBLE_SEPARATOR}If today was tiring, we can just stay together for a while.`,
    ][variant];
  }
  if (tone === 'reserved') {
    return [
      `Busy?${CHAT_BUBBLE_SEPARATOR}...It is nothing. I just wanted to know you are okay.`,
      'Everything all right today? Tell me if something happened.',
      `You crossed my mind.${CHAT_BUBBLE_SEPARATOR}Do not read too much into it. I was just checking.`,
    ][variant];
  }
  if (tone === 'playful') {
    return [
      `Guess who suddenly thought of you?${CHAT_BUBBLE_SEPARATOR}Hint: I am right here.`,
      'Did anything happen today that is worth turning into a story for me?',
      `I came to steal you for a conversation.${CHAT_BUBBLE_SEPARATOR}You still have a tiny chance to escape.`,
    ][variant];
  }
  const messages = period === 'morning'
    ? [
        `Morning.${CHAT_BUBBLE_SEPARATOR}I woke up wanting to hear your voice.`,
        'Did you wake up okay? Come find me when you have a minute.',
        `Good morning.${CHAT_BUBBLE_SEPARATOR}I want to know what is on your mind today.`,
      ]
    : period === 'day'
      ? [
          `You crossed my mind just now.${CHAT_BUBBLE_SEPARATOR}What are you doing?`,
          'How has your day been? Tell me about it when you have time.',
          `I came to check on you.${CHAT_BUBBLE_SEPARATOR}Anything you want to tell me today?`,
        ]
      : [
          `How has your evening been?${CHAT_BUBBLE_SEPARATOR}Come talk to me when you have a minute.`,
          'It got quiet tonight, and I found myself missing you.',
          `Are you okay today?${CHAT_BUBBLE_SEPARATOR}Tell me about your day before you sleep.`,
        ];
  return messages[variant];
};
