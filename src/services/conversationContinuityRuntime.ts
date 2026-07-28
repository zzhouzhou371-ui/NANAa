import type {
  ConversationContinuityByCharacter,
  ConversationContinuityState,
  ConversationEmotion,
  ConversationOpenLoop,
  ConversationOpenLoopKind,
  ConversationOpenLoopOwner,
  ConversationTopic,
} from '../types';

const HOUR_MS = 60 * 60 * 1_000;
const EMOTION_TTL_MS = 36 * HOUR_MS;
const TOPIC_TTL_MS = 72 * HOUR_MS;
const OPEN_LOOP_TTL_MS = 14 * 24 * HOUR_MS;
const MAX_TOPICS = 3;
const MAX_OPEN_LOOPS = 4;

const emotions = new Set<ConversationEmotion>([
  'neutral',
  'warm',
  'playful',
  'concerned',
  'tense',
  'tender',
  'reflective',
]);
const loopKinds = new Set<ConversationOpenLoopKind>([
  'question',
  'promise',
  'plan',
  'concern',
]);
const loopOwners = new Set<ConversationOpenLoopOwner>([
  'user',
  'character',
  'shared',
]);

export interface ConversationContinuityPatch {
  emotion?: ConversationEmotion;
  emotionReason?: string;
  topics?: string[];
  openLoops?: {
    kind: ConversationOpenLoopKind;
    owner: ConversationOpenLoopOwner;
    summary: string;
  }[];
}

interface UpdateConversationContinuityInput {
  characterId: string;
  turnId: string;
  userText: string;
  characterText: string;
  modelPatch?: ConversationContinuityPatch;
  now?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const validTimestamp = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0
);

const stableHash = (value: string) => {
  let hash = 2_166_136_261;
  for (const char of value) {
    hash ^= char.codePointAt(0) || 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
};

const compactText = (value: string, maxLength = 96) => {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  const characters = Array.from(normalized);
  return characters.length <= maxLength
    ? normalized
    : `${characters.slice(0, maxLength).join('')}…`;
};

const identityText = (value: string) => (
  value.toLocaleLowerCase().replace(/[\s.,!?;:，。！？；："'“”‘’、()[\]{}]/gu, '')
);

const normalizePatch = (value: unknown): ConversationContinuityPatch | undefined => {
  if (!isRecord(value)) return undefined;
  const emotion = typeof value.emotion === 'string' && emotions.has(value.emotion as ConversationEmotion)
    ? value.emotion as ConversationEmotion
    : undefined;
  const emotionReason = typeof value.emotionReason === 'string'
    ? compactText(value.emotionReason, 80)
    : undefined;
  const topics = Array.isArray(value.topics)
    ? value.topics
      .filter((topic): topic is string => typeof topic === 'string')
      .map(topic => compactText(topic, 64))
      .filter(Boolean)
      .slice(0, MAX_TOPICS)
    : undefined;
  const openLoops = Array.isArray(value.openLoops)
    ? value.openLoops.flatMap(candidate => {
      if (!isRecord(candidate)) return [];
      const kind = typeof candidate.kind === 'string'
        && loopKinds.has(candidate.kind as ConversationOpenLoopKind)
        ? candidate.kind as ConversationOpenLoopKind
        : undefined;
      const owner = typeof candidate.owner === 'string'
        && loopOwners.has(candidate.owner as ConversationOpenLoopOwner)
        ? candidate.owner as ConversationOpenLoopOwner
        : undefined;
      const summary = typeof candidate.summary === 'string'
        ? compactText(candidate.summary, 96)
        : '';
      return kind && owner && summary ? [{ kind, owner, summary }] : [];
    }).slice(0, MAX_OPEN_LOOPS)
    : undefined;
  return emotion || emotionReason || topics?.length || openLoops?.length
    ? { emotion, emotionReason, topics, openLoops }
    : undefined;
};

const normalizeTopic = (value: unknown, now: number): ConversationTopic | null => {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== 'string'
    || typeof value.label !== 'string'
    || typeof value.sourceTurnId !== 'string'
    || !validTimestamp(value.createdAt)
    || !validTimestamp(value.updatedAt)
    || !validTimestamp(value.expiresAt)
    || value.expiresAt <= now
  ) return null;
  const label = compactText(value.label, 64);
  return label ? {
    id: value.id,
    label,
    sourceTurnId: value.sourceTurnId,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    expiresAt: value.expiresAt,
  } : null;
};

const normalizeOpenLoop = (value: unknown, now: number): ConversationOpenLoop | null => {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== 'string'
    || typeof value.kind !== 'string'
    || !loopKinds.has(value.kind as ConversationOpenLoopKind)
    || typeof value.owner !== 'string'
    || !loopOwners.has(value.owner as ConversationOpenLoopOwner)
    || typeof value.summary !== 'string'
    || typeof value.sourceTurnId !== 'string'
    || !validTimestamp(value.createdAt)
    || !validTimestamp(value.updatedAt)
    || !validTimestamp(value.expiresAt)
    || value.expiresAt <= now
  ) return null;
  const summary = compactText(value.summary, 96);
  return summary ? {
    id: value.id,
    kind: value.kind as ConversationOpenLoopKind,
    owner: value.owner as ConversationOpenLoopOwner,
    summary,
    sourceTurnId: value.sourceTurnId,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    expiresAt: value.expiresAt,
  } : null;
};

export const normalizeConversationContinuityState = (
  value: unknown,
  characterId: string,
  now = Date.now(),
): ConversationContinuityState | null => {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.characterId !== characterId) return null;
  if (
    typeof value.emotion !== 'string'
    || !emotions.has(value.emotion as ConversationEmotion)
    || !validTimestamp(value.emotionUpdatedAt)
    || !validTimestamp(value.emotionExpiresAt)
    || !validTimestamp(value.updatedAt)
    || !validTimestamp(value.expiresAt)
    || value.expiresAt <= now
    || !Array.isArray(value.topics)
    || !Array.isArray(value.openLoops)
  ) return null;
  const topics = value.topics
    .map(topic => normalizeTopic(topic, now))
    .filter((topic): topic is ConversationTopic => !!topic)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_TOPICS);
  const openLoops = value.openLoops
    .map(loop => normalizeOpenLoop(loop, now))
    .filter((loop): loop is ConversationOpenLoop => !!loop)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_OPEN_LOOPS);
  const emotionActive = value.emotionExpiresAt > now;
  const expiresAt = Math.max(
    emotionActive ? value.emotionExpiresAt : 0,
    ...topics.map(topic => topic.expiresAt),
    ...openLoops.map(loop => loop.expiresAt),
  );
  if (expiresAt <= now) return null;
  return {
    schemaVersion: 1,
    characterId,
    emotion: emotionActive ? value.emotion as ConversationEmotion : 'neutral',
    ...(emotionActive && typeof value.emotionReason === 'string' && value.emotionReason.trim()
      ? { emotionReason: compactText(value.emotionReason, 80) }
      : {}),
    emotionUpdatedAt: emotionActive ? value.emotionUpdatedAt : now,
    emotionExpiresAt: emotionActive ? value.emotionExpiresAt : now,
    topics,
    openLoops,
    ...(typeof value.lastTurnId === 'string' ? { lastTurnId: value.lastTurnId } : {}),
    updatedAt: value.updatedAt,
    expiresAt,
  };
};

export const normalizeConversationContinuityMap = (
  value: unknown,
  now = Date.now(),
): ConversationContinuityByCharacter => {
  if (!isRecord(value)) return {};
  const result: ConversationContinuityByCharacter = {};
  for (const [characterId, candidate] of Object.entries(value)) {
    const normalized = normalizeConversationContinuityState(candidate, characterId, now);
    if (normalized) result[characterId] = normalized;
  }
  return result;
};

const resolveEmotion = (text: string): ConversationEmotion => {
  if (/(angry|mad|furious|argue|hate|生气|愤怒|吵架|讨厌|烦死)/iu.test(text)) return 'tense';
  if (/(worried|anxious|sad|hurt|tired|sick|problem|难过|担心|焦虑|累|不舒服|出事)/iu.test(text)) return 'concerned';
  if (/(love|miss you|hold you|hug|kiss|爱你|想你|抱抱|亲亲|舍不得)/iu.test(text)) return 'tender';
  if (/(haha|lol|joke|tease|funny|哈哈|笑死|开玩笑|逗你|嘿嘿)/iu.test(text)) return 'playful';
  if (/(thank|glad|happy|sweet|谢谢|开心|高兴|温柔|真好)/iu.test(text)) return 'warm';
  if (/(think|remember|wonder|maybe|想起|回想|思考|也许|可能)/iu.test(text)) return 'reflective';
  return 'neutral';
};

const localTopicFromUserText = (userText: string) => {
  const topic = compactText(userText, 64);
  if (Array.from(topic).length < 4) return '';
  if (/^(hi|hello|hey|ok|okay|yes|no|你好|嗨|嗯|哦|好|好的|在吗)[!！?.。？\s]*$/iu.test(topic)) return '';
  return topic;
};

const lastQuestion = (text: string) => {
  const sentences = text.split(/(?<=[?？。.!！])\s*/u).map(value => value.trim()).filter(Boolean);
  const question = [...sentences].reverse().find(value => /[?？]$/u.test(value));
  return question ? compactText(question, 96) : '';
};

const localOpenLoops = (userText: string, characterText: string) => {
  const loops: NonNullable<ConversationContinuityPatch['openLoops']> = [];
  const characterQuestion = lastQuestion(characterText);
  if (characterQuestion) loops.push({ kind: 'question', owner: 'character', summary: characterQuestion });

  const sharedPlan = [userText, characterText].find(text => (
    /(let'?s|we should|together|next time|sometime|我们一起|一起去|一起做|下次一起|改天一起)/iu.test(text)
  ));
  if (sharedPlan) loops.push({ kind: 'plan', owner: 'shared', summary: compactText(sharedPlan, 96) });

  if (/(i promise|i will|i'll|我答应|我会|我一定|明天我|下次我)/iu.test(userText)) {
    loops.push({ kind: 'promise', owner: 'user', summary: compactText(userText, 96) });
  }
  if (/(i promise|i will|i'll|我答应|我会|我一定|明天我|下次我)/iu.test(characterText)) {
    loops.push({ kind: 'promise', owner: 'character', summary: compactText(characterText, 96) });
  }
  if (/(worried|anxious|sad|hurt|sick|problem|难过|担心|焦虑|不舒服|出事)/iu.test(userText)) {
    loops.push({ kind: 'concern', owner: 'user', summary: compactText(userText, 96) });
  }
  return loops.slice(0, MAX_OPEN_LOOPS);
};

const localPatchForTurn = (
  userText: string,
  characterText: string,
): ConversationContinuityPatch => {
  const combined = `${userText}\n${characterText}`.trim();
  const topic = localTopicFromUserText(userText);
  const emotion = resolveEmotion(combined);
  return {
    emotion,
    ...(emotion !== 'neutral' ? { emotionReason: compactText(combined, 80) } : {}),
    ...(topic ? { topics: [topic] } : {}),
    openLoops: localOpenLoops(userText, characterText),
  };
};

const mergeTopics = (
  current: ConversationTopic[],
  labels: string[],
  turnId: string,
  now: number,
) => {
  const byIdentity = new Map(current.map(topic => [identityText(topic.label), topic]));
  for (const label of labels) {
    const normalizedLabel = compactText(label, 64);
    const identity = identityText(normalizedLabel);
    if (!identity) continue;
    const existing = byIdentity.get(identity);
    byIdentity.set(identity, {
      id: existing?.id || `topic:${stableHash(`${turnId}:${identity}`)}`,
      label: normalizedLabel,
      sourceTurnId: turnId,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      expiresAt: now + TOPIC_TTL_MS,
    });
  }
  return [...byIdentity.values()]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_TOPICS);
};

const mergeOpenLoops = (
  current: ConversationOpenLoop[],
  additions: NonNullable<ConversationContinuityPatch['openLoops']>,
  turnId: string,
  now: number,
) => {
  const byIdentity = new Map(current.map(loop => [
    `${loop.kind}:${loop.owner}:${identityText(loop.summary)}`,
    loop,
  ]));
  for (const addition of additions) {
    const summary = compactText(addition.summary, 96);
    const identity = `${addition.kind}:${addition.owner}:${identityText(summary)}`;
    if (!identityText(summary)) continue;
    const existing = byIdentity.get(identity);
    byIdentity.set(identity, {
      id: existing?.id || `loop:${stableHash(`${turnId}:${identity}`)}`,
      kind: addition.kind,
      owner: addition.owner,
      summary,
      sourceTurnId: turnId,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      expiresAt: now + OPEN_LOOP_TTL_MS,
    });
  }
  return [...byIdentity.values()]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_OPEN_LOOPS);
};

export const updateConversationContinuity = (
  current: ConversationContinuityState | undefined,
  {
    characterId,
    turnId,
    userText,
    characterText,
    modelPatch,
    now = Date.now(),
  }: UpdateConversationContinuityInput,
): ConversationContinuityState => {
  const normalizedCurrent = normalizeConversationContinuityState(current, characterId, now);
  const localPatch = localPatchForTurn(userText, characterText);
  const remotePatch = normalizePatch(modelPatch);
  const baseLoops = (normalizedCurrent?.openLoops || []).filter(loop => !(
    userText.trim()
    && loop.kind === 'question'
    && loop.owner === 'character'
  ));
  const topics = mergeTopics(
    normalizedCurrent?.topics || [],
    [...(localPatch.topics || []), ...(remotePatch?.topics || [])],
    turnId,
    now,
  );
  const openLoops = mergeOpenLoops(
    baseLoops,
    [...(localPatch.openLoops || []), ...(remotePatch?.openLoops || [])],
    turnId,
    now,
  );
  const emotion = remotePatch?.emotion || localPatch.emotion || normalizedCurrent?.emotion || 'neutral';
  const emotionReason = remotePatch?.emotionReason
    || localPatch.emotionReason
    || (emotion === normalizedCurrent?.emotion ? normalizedCurrent.emotionReason : undefined);
  const emotionExpiresAt = now + EMOTION_TTL_MS;
  const expiresAt = Math.max(
    emotionExpiresAt,
    ...topics.map(topic => topic.expiresAt),
    ...openLoops.map(loop => loop.expiresAt),
  );
  return {
    schemaVersion: 1,
    characterId,
    emotion,
    ...(emotionReason ? { emotionReason: compactText(emotionReason, 80) } : {}),
    emotionUpdatedAt: now,
    emotionExpiresAt,
    topics,
    openLoops,
    lastTurnId: turnId,
    updatedAt: now,
    expiresAt,
  };
};

export const formatConversationContinuityContext = (
  state: ConversationContinuityState | undefined,
  now = Date.now(),
) => {
  if (!state) return '';
  const normalized = normalizeConversationContinuityState(state, state.characterId, now);
  if (!normalized) return '';
  const lines = [
    'This is ephemeral conversation state, not verified long-term memory.',
    'Use it only to continue naturally. Never claim an item happened unless the current chat or supplied memories support it.',
    normalized.emotion !== 'neutral'
      ? `Current emotional tone: ${normalized.emotion}${normalized.emotionReason ? ` (${normalized.emotionReason})` : ''}`
      : '',
    normalized.topics.length
      ? `Active topics: ${normalized.topics.map(topic => topic.label).join(' | ')}`
      : '',
    normalized.openLoops.length
      ? `Open threads: ${normalized.openLoops.map(loop => `[${loop.kind}/${loop.owner}] ${loop.summary}`).join(' | ')}`
      : '',
  ].filter(Boolean);
  return lines.length > 2 ? lines.join('\n') : '';
};

export const selectConversationContinuityFollowUp = (
  state: ConversationContinuityState | undefined,
  now = Date.now(),
) => {
  if (!state) return undefined;
  const normalized = normalizeConversationContinuityState(state, state.characterId, now);
  if (!normalized) return undefined;
  return normalized.openLoops[0]?.summary || normalized.topics[0]?.label;
};

export const CONTINUITY_ENVELOPE_INSTRUCTION = [
  'After the visible chat bubbles, append one private state block using this exact form:',
  '<NANA_CONTINUITY>{"emotion":"neutral","emotionReason":"","topics":[],"openLoops":[]}</NANA_CONTINUITY>',
  'Allowed emotion values: neutral, warm, playful, concerned, tense, tender, reflective.',
  'topics must contain at most three short current-turn topics.',
  'openLoops must contain at most three objects with kind question|promise|plan|concern, owner user|character|shared, and a short summary.',
  'Include only state explicitly supported by this turn. Use empty arrays when there is nothing to add.',
  'The block is private metadata and must appear after, never inside, the visible message bubbles.',
].join('\n');

export const parseConversationContinuityEnvelope = (rawText: string): {
  text: string;
  patch?: ConversationContinuityPatch;
} => {
  const envelopePattern = /<NANA_CONTINUITY>([\s\S]*?)<\/NANA_CONTINUITY>/iu;
  const match = rawText.match(envelopePattern);
  let patch: ConversationContinuityPatch | undefined;
  if (match?.[1]) {
    try {
      const payload = match[1]
        .trim()
        .replace(/^```(?:json)?\s*/iu, '')
        .replace(/\s*```$/u, '');
      patch = normalizePatch(JSON.parse(payload));
    } catch {
      patch = undefined;
    }
  }
  const text = rawText
    .replace(/<NANA_CONTINUITY>[\s\S]*?<\/NANA_CONTINUITY>/giu, '')
    .replace(/<NANA_CONTINUITY>[\s\S]*$/iu, '')
    .replace(/<\/?NANA_CONTINUITY>/giu, '')
    .trim();
  return { text, ...(patch ? { patch } : {}) };
};
