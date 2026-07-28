export type ChatPresence = 'online' | 'away' | 'resting';
export type ChatGenerationSource = 'remote' | 'localSandbox' | 'proactive';

export interface ChatReplyPlan {
  presence: ChatPresence;
  requestedAt: number;
  deliverNotBefore: number;
  delayMs: number;
}

interface PlanChatReplyInput {
  characterId: string;
  userText: string;
  now?: number;
  fast?: boolean;
}

interface LocalSandboxReplyInput {
  characterName?: string;
  userText: string;
  language?: string;
}

interface CharacterFollowUpDelayInput {
  characterId: string;
  messageText: string;
  messageIndex: number;
  fast?: boolean;
}

export interface UserMessageBurstItem {
  sourceMessageId: number;
  text: string;
}

interface UserMessageBurst {
  chatId: string;
  requestId: string;
  startedAt: number;
  updatedAt: number;
  collecting: boolean;
  items: UserMessageBurstItem[];
}

interface CollectUserMessageBurstInput {
  chatId: string;
  requestId: string;
  quietWindowMs?: number;
  maxWindowMs?: number;
  fast?: boolean;
}

export const CHAT_BUBBLE_SEPARATOR = '<NANA_MSG>';
const userMessageBursts = new Map<string, UserMessageBurst>();

const stableHash = (value: string) => {
  let hash = 2_166_136_261;
  for (const char of value) {
    hash ^= char.codePointAt(0) || 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
};

const shiftedMinutesOfDay = (characterId: string, now: number) => {
  const date = new Date(now);
  const characterOffset = (stableHash(characterId) % 121) - 60;
  return (date.getHours() * 60 + date.getMinutes() + characterOffset + 1_440) % 1_440;
};

export const resolveChatPresence = (
  characterId: string,
  now = Date.now(),
): ChatPresence => {
  const minutes = shiftedMinutesOfDay(characterId, now);
  if (minutes < 7 * 60) return 'resting';
  if (minutes < 18 * 60) return 'away';
  return 'online';
};

export const planChatReply = ({
  characterId,
  userText,
  now = Date.now(),
  fast = false,
}: PlanChatReplyInput): ChatReplyPlan => {
  const presence = resolveChatPresence(characterId, now);
  if (fast) {
    return {
      presence,
      requestedAt: now,
      deliverNotBefore: now,
      delayMs: 0,
    };
  }

  const textLength = Math.min(120, Array.from(userText.trim()).length);
  const readingDelay = Math.min(1_600, textLength * 24);
  const presenceDelay = presence === 'online'
    ? 650
    : presence === 'away'
      ? 1_600
      : 2_800;
  const jitterRange = presence === 'online' ? 850 : presence === 'away' ? 1_500 : 2_200;
  const minuteBucket = Math.floor(now / 60_000);
  const jitter = stableHash(`${characterId}:${userText}:${minuteBucket}`) % jitterRange;
  const delayMs = presenceDelay + readingDelay + jitter;

  return {
    presence,
    requestedAt: now,
    deliverNotBefore: now + delayMs,
    delayMs,
  };
};

export const waitForChatReplyPlan = async (
  plan: ChatReplyPlan,
  now = Date.now,
): Promise<void> => {
  const remaining = Math.max(0, plan.deliverNotBefore - now());
  if (remaining === 0) return;
  await new Promise<void>(resolve => setTimeout(resolve, remaining));
};

const mergeOverflowMessages = (messages: string[], maxMessages: number) => {
  if (messages.length <= maxMessages) return messages;
  return [
    ...messages.slice(0, maxMessages - 1),
    messages.slice(maxMessages - 1).join(' '),
  ];
};

const sentenceSegments = (value: string) => (
  value
    .match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/gu)
    ?.map(segment => segment.trim())
    .filter(Boolean)
  || []
);

export const splitCharacterReplyIntoMessages = (
  value: string,
  maxMessages = 3,
): string[] => {
  const normalized = value
    .replace(/^```(?:text|markdown)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  if (!normalized) return [];

  const explicitSegments = normalized
    .split(/\s*(?:<NANA_MSG>|\|\|\|)\s*/i)
    .map(segment => segment.trim())
    .filter(Boolean);
  if (explicitSegments.length > 1) {
    return mergeOverflowMessages(explicitSegments, maxMessages);
  }

  const paragraphSegments = normalized
    .split(/\n{2,}/)
    .map(segment => segment.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
  if (paragraphSegments.length > 1) {
    return mergeOverflowMessages(paragraphSegments, maxMessages);
  }

  const chars = Array.from(normalized);
  const looksMostlyCjk = /[\u3400-\u9fff]/u.test(normalized);
  const longReplyThreshold = looksMostlyCjk ? 72 : 150;
  if (chars.length < longReplyThreshold) return [normalized];

  const sentences = sentenceSegments(normalized);
  if (sentences.length < 2) return [normalized];
  return mergeOverflowMessages(sentences, maxMessages);
};

export const characterFollowUpDelayMs = ({
  characterId,
  messageText,
  messageIndex,
  fast = false,
}: CharacterFollowUpDelayInput): number => {
  if (fast) return 0;
  const readingBeat = Math.min(800, Array.from(messageText).length * 18);
  const jitter = stableHash(`${characterId}:${messageIndex}:${messageText}`) % 650;
  return 350 + readingBeat + jitter;
};

export const waitForCharacterFollowUp = async (
  input: CharacterFollowUpDelayInput,
): Promise<void> => {
  const delayMs = characterFollowUpDelayMs(input);
  if (delayMs === 0) return;
  await new Promise<void>(resolve => setTimeout(resolve, delayMs));
};

export const beginUserMessageBurst = (
  chatId: string,
  requestId: string,
  item: UserMessageBurstItem,
  now = Date.now(),
): void => {
  userMessageBursts.set(chatId, {
    chatId,
    requestId,
    startedAt: now,
    updatedAt: now,
    collecting: true,
    items: [item],
  });
};

export const isCollectingUserMessageBurst = (
  chatId: string,
  requestId?: string,
): boolean => {
  const burst = userMessageBursts.get(chatId);
  return !!burst?.collecting && (!requestId || burst.requestId === requestId);
};

export const appendUserMessageToBurst = (
  chatId: string,
  requestId: string,
  item: UserMessageBurstItem,
  now = Date.now(),
): boolean => {
  const burst = userMessageBursts.get(chatId);
  if (!burst?.collecting || burst.requestId !== requestId) return false;
  if (burst.items.some(existing => existing.sourceMessageId === item.sourceMessageId)) return true;
  burst.items.push(item);
  burst.updatedAt = now;
  return true;
};

export const collectUserMessageBurst = async ({
  chatId,
  requestId,
  quietWindowMs = 900,
  maxWindowMs = 2_800,
  fast = false,
}: CollectUserMessageBurstInput): Promise<UserMessageBurstItem[] | null> => {
  while (true) {
    const burst = userMessageBursts.get(chatId);
    if (!burst || burst.requestId !== requestId) return null;
    const now = Date.now();
    const quietFor = now - burst.updatedAt;
    const openFor = now - burst.startedAt;
    if (fast || quietFor >= quietWindowMs || openFor >= maxWindowMs) {
      burst.collecting = false;
      return burst.items.map(item => ({ ...item }));
    }
    const untilQuiet = quietWindowMs - quietFor;
    const untilForcedClose = maxWindowMs - openFor;
    await new Promise<void>(resolve => setTimeout(resolve, Math.max(1, Math.min(untilQuiet, untilForcedClose))));
  }
};

export const cancelUserMessageBurst = (
  chatId: string,
  requestId?: string,
): void => {
  const burst = userMessageBursts.get(chatId);
  if (!burst || (requestId && burst.requestId !== requestId)) return;
  userMessageBursts.delete(chatId);
};

const conciseExcerpt = (value: string, maxLength: number) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const chars = Array.from(normalized);
  return chars.length <= maxLength
    ? normalized
    : `${chars.slice(0, maxLength).join('')}…`;
};

export const generateLocalSandboxReply = ({
  characterName,
  userText,
  language,
}: LocalSandboxReplyInput): string => {
  const normalized = userText.trim();
  const isChinese = language?.toLowerCase().startsWith('zh') ?? false;
  const name = characterName?.trim();
  const greeting = /^(hi|hello|hey|嗨|哈喽|你好|在吗)[!！?？。\s]*$/i.test(normalized);
  const question = /[?？]\s*$/.test(normalized);
  const excerpt = conciseExcerpt(normalized, isChinese ? 18 : 42);
  const variant = stableHash(`${name || 'character'}:${normalized}`) % 3;

  if (isChinese) {
    if (greeting) return name
      ? `我在。${CHAT_BUBBLE_SEPARATOR}${name}刚刚还在想，你会不会来找我。`
      : `我在。${CHAT_BUBBLE_SEPARATOR}刚刚还在想，你会不会来找我。`;
    if (question) {
      return [
        '我有在认真想。你先告诉我，为什么会突然问这个？',
        '如果只对你说实话，我的答案可能会比你想的更直接。',
        '我想先听听你的答案，然后再把我的告诉你。',
      ][variant];
    }
    return [
      `我有认真看到“${excerpt}”。再多和我说一点，好吗？`,
      `嗯，我记住了。关于“${excerpt}”，我其实还有点在意。`,
      `原来你现在在想这个。别停，我想继续听你说。`,
    ][variant];
  }

  if (greeting) return name
    ? `I'm here.${CHAT_BUBBLE_SEPARATOR}${name} was wondering when you'd come find me.`
    : `I'm here.${CHAT_BUBBLE_SEPARATOR}I was wondering when you'd come find me.`;
  if (question) {
    return [
      'I am thinking about it seriously. Tell me what made you ask first?',
      'If I answer you honestly, it may be more direct than you expect.',
      'I want to hear your answer first, then I will tell you mine.',
    ][variant];
  }
  return [
    `I really read what you said about “${excerpt}.” Tell me a little more?`,
    `I will remember that. There is something about “${excerpt}” I keep thinking about.`,
    'So that is what has been on your mind. Keep going—I want to hear you.',
  ][variant];
};
