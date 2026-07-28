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
    if (greeting) return name ? `我在。${name}刚刚还在想，你会不会来找我。` : '我在。刚刚还在想，你会不会来找我。';
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

  if (greeting) return name ? `I'm here. ${name} was wondering when you'd come find me.` : "I'm here. I was wondering when you'd come find me.";
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
