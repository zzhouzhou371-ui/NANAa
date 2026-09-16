import type {
  Message,
  Character,
  Preset,
  WorldBookEntry,
  MemoryRecord,
  RelationshipTrace,
  PaymentKind,
  PaymentReactionDecision,
  ConversationContinuityState,
} from '../types';
import {
  fetchWithTimeout,
  isOfficialGeminiBaseUrl,
  readResponsePayload,
  responseErrorMessage,
} from './network';
import { resolveRuntimeLanguage, runtimeLocalPaymentReply } from './runtimeCopy';
import {
  CONTINUITY_ENVELOPE_INSTRUCTION,
  formatConversationContinuityContext,
  parseConversationContinuityEnvelope,
  type ConversationContinuityPatch,
} from './conversationContinuityRuntime';

type ChatRole = 'system' | 'user' | 'assistant';

export interface AiContextSection {
  title: string;
  content: string;
}

export interface AiContextBuildResult {
  systemInstruction: string;
  sections: AiContextSection[];
  loreCount: number;
  matchedLore: WorldBookEntry[];
  rememberedRecords: MemoryRecord[];
  recalledTraces: RelationshipTrace[];
}

function normalizeBaseUrl(apiUrl: string): string {
  return (apiUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
}

function openAIChatCompletionsUrl(baseUrl: string): string {
  const rootUrl = baseUrl.replace(/\/(v1|v1beta)$/i, '');
  return `${rootUrl}/v1/chat/completions`;
}

function presetBlocks(blocks: string[] | string | undefined): string {
  if (Array.isArray(blocks)) return blocks.filter(Boolean).join('\n\n');
  return blocks || '';
}

function activeTextMessages(chatHistory: Message[]): Message[] {
  return chatHistory.filter(m => m.type === 'text' || !m.type);
}

function appendSection(sections: AiContextSection[], title: string, content: string) {
  const trimmed = content.trim();
  if (trimmed) sections.push({ title, content: trimmed });
}

async function postGeminiText(params: {
  baseUrl: string;
  model: string;
  apiKey: string;
  text: string;
  temperature: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<string> {
  const response = await fetchWithTimeout(`${params.baseUrl}/v1beta/models/${params.model}:generateContent?key=${params.apiKey.trim()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: params.text }] }],
      generationConfig: { temperature: params.temperature },
    }),
    signal: params.signal,
  }, params.timeoutMs);
  const payload = await readResponsePayload(response);
  if (!response.ok) throw new Error(responseErrorMessage(response, payload));
  const data = payload.data;
  if (!data) throw new Error('AI service returned an unreadable response.');
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function postOpenAICompatible(params: {
  baseUrl: string;
  model: string;
  apiKey: string;
  messages: { role: ChatRole; content: string }[];
  temperature: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<string> {
  const response = await fetchWithTimeout(openAIChatCompletionsUrl(params.baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      temperature: params.temperature,
    }),
    signal: params.signal,
  }, params.timeoutMs);
  const payload = await readResponsePayload(response);
  if (!response.ok) throw new Error(responseErrorMessage(response, payload));
  const data = payload.data;
  if (!data) throw new Error('AI service returned an unreadable response.');
  return data.choices?.[0]?.message?.content || '';
}

export interface GenerateStructuredTextParams {
  apiUrl: string;
  apiKey: string;
  selectedModel: string;
  systemPrompt: string;
  context: string;
  temperature?: number;
  maxOutputCharacters?: number;
  signal?: AbortSignal;
}

/** Shared non-streaming completion path for structured relationship features. */
export async function generateStructuredText(
  params: GenerateStructuredTextParams,
): Promise<string> {
  if (!params.apiKey.trim()) throw new Error('An API key is required for remote generation.');
  const baseUrl = normalizeBaseUrl(params.apiUrl);
  const model = params.selectedModel || 'gemini-2.5-flash';
  const temperature = Math.max(0, Math.min(1.5, params.temperature ?? 0.72));
  const rawText = isOfficialGeminiBaseUrl(baseUrl)
    ? await postGeminiText({
        baseUrl,
        model,
        apiKey: params.apiKey,
        text: `${params.systemPrompt}\n\n${params.context}`,
        temperature,
        timeoutMs: 60_000,
        signal: params.signal,
      })
    : await postOpenAICompatible({
        baseUrl,
        model,
        apiKey: params.apiKey,
        messages: [
          { role: 'system', content: params.systemPrompt },
          { role: 'user', content: params.context },
        ],
        temperature,
        timeoutMs: 60_000,
        signal: params.signal,
      });
  const maxCharacters = Math.max(1_000, Math.min(48_000, params.maxOutputCharacters || 12_000));
  return Array.from(rawText.trim()).slice(0, maxCharacters).join('');
}

export async function fetchModelList(apiUrl: string, apiKey: string): Promise<string[]> {
  if (!apiUrl || !apiKey) return [];

  const baseUrl = apiUrl.replace(/\/+$/, '');
  const candidates: { endpoint: string; headers: Record<string, string> }[] = [];

  if (isOfficialGeminiBaseUrl(baseUrl)) {
    candidates.push({ endpoint: `${baseUrl}/v1beta/models?key=${apiKey.trim()}`, headers: {} });
  } else {
    const authHeaders = { Authorization: `Bearer ${apiKey.trim()}` };
    if (baseUrl.endsWith('/v1') || baseUrl.endsWith('/v1beta')) {
      candidates.push({ endpoint: `${baseUrl}/models`, headers: authHeaders });
    }
    candidates.push({ endpoint: `${baseUrl}/v1/models`, headers: authHeaders });
    candidates.push({ endpoint: `${baseUrl}/models`, headers: authHeaders });
  }

  for (const { endpoint, headers } of candidates) {
    try {
      const res = await fetchWithTimeout(endpoint, { headers }, 20_000);
      if (!res.ok) continue;
      const data = await res.json();
      let fetchedModels: string[] = [];

      if (data.models && Array.isArray(data.models)) {
        fetchedModels = data.models.map((m: any) => (m.name || m.id || '').replace('models/', '')).filter(Boolean);
      }
      if (fetchedModels.length === 0 && data.data && Array.isArray(data.data)) {
        fetchedModels = data.data.map((m: any) => m.id).filter(Boolean);
      }
      if (fetchedModels.length === 0 && Array.isArray(data)) {
        fetchedModels = data.map((m: any) => m.id || m.name || '').filter(Boolean);
      }

      if (fetchedModels.length > 0) return fetchedModels;
    } catch {
      // Try next candidate.
    }
  }

  return [];
}

interface GenerateParams {
  userText: string;
  userName: string;
  userDesc: string;
  activeChar: Character | undefined;
  activePreset: Preset;
  chatHistory: Message[];
  worldBookEntries: WorldBookEntry[];
  relationshipTraces?: RelationshipTrace[];
  conversationContinuity?: ConversationContinuityState;
  memoryWindowSize?: number;
  activeChatId: string;
  apiUrl: string;
  apiKey: string;
  selectedModel: string;
  replaceMacros: (text: string, userName: string, charName: string, persona: string) => string;
  signal?: AbortSignal;
  now?: number;
  deviceTimeZone?: string;
}

export interface ModelLocalClock {
  date: string;
  weekday: string;
  time: string;
  timeZone: string;
  utcOffset: string;
}

export interface ModelTimeContext {
  now: number;
  device: ModelLocalClock;
  character: ModelLocalClock;
  characterFollowsDevice: boolean;
}

const validTimeZone = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const candidate = value.trim();
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(0);
    return candidate;
  } catch {
    return null;
  }
};

const resolvedDeviceTimeZone = (override?: string) => (
  validTimeZone(override)
  || validTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  || 'UTC'
);

const modelLocalClock = (now: number, timeZone: string): ModelLocalClock => {
  const date = new Date(now);
  const parts = new Intl.DateTimeFormat('en-US-u-ca-iso8601-nu-latn', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find(candidate => candidate.type === type)?.value || ''
  );
  let utcOffset = 'UTC';
  try {
    const offsetPart = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    }).formatToParts(date).find(candidate => candidate.type === 'timeZoneName')?.value;
    if (offsetPart) utcOffset = offsetPart;
  } catch {
    // Some older Hermes/Intl builds omit longOffset. The IANA zone remains explicit.
  }

  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    weekday: part('weekday'),
    time: `${part('hour')}:${part('minute')}:${part('second')}`,
    timeZone,
    utcOffset,
  };
};

export function resolveModelTimeContext(params: {
  activeChar?: Character;
  now?: number;
  deviceTimeZone?: string;
}): ModelTimeContext {
  const now = typeof params.now === 'number' && Number.isFinite(params.now)
    ? params.now
    : Date.now();
  const deviceTimeZone = resolvedDeviceTimeZone(params.deviceTimeZone);
  const characterTimeZone = validTimeZone(params.activeChar?.timeZone) || deviceTimeZone;
  return {
    now,
    device: modelLocalClock(now, deviceTimeZone),
    character: modelLocalClock(now, characterTimeZone),
    characterFollowsDevice: characterTimeZone === deviceTimeZone,
  };
}

export function formatModelTimeContext(context: ModelTimeContext) {
  const deviceLine = [
    `Device local date: ${context.device.date}`,
    `Device weekday: ${context.device.weekday}`,
    `Device local time: ${context.device.time}`,
    `Device time zone: ${context.device.timeZone} (${context.device.utcOffset})`,
  ].join('\n');
  const characterLine = context.characterFollowsDevice
    ? 'Character time zone: follows the device time zone.'
    : [
        `Character local date: ${context.character.date}`,
        `Character weekday: ${context.character.weekday}`,
        `Character local time: ${context.character.time}`,
        `Character time zone: ${context.character.timeZone} (${context.character.utcOffset})`,
      ].join('\n');

  return [
    deviceLine,
    characterLine,
    'Treat this as current clock context only. Do not invent an event, activity, location, or memory from the time.',
  ].join('\n');
}

export function buildAiContext(params: Omit<GenerateParams, 'apiUrl' | 'apiKey' | 'selectedModel'>): AiContextBuildResult {
  const {
    userText, userName, userDesc, activeChar, activePreset,
    worldBookEntries, relationshipTraces = [], conversationContinuity, memoryWindowSize = 12,
    activeChatId, replaceMacros,
  } = params;
  const charName = activeChar?.name || 'Character';
  const sections: AiContextSection[] = [];
  const recallWindowSize = Number.isFinite(memoryWindowSize)
    ? Math.max(1, Math.min(50, Math.floor(memoryWindowSize)))
    : 12;

  appendSection(
    sections,
    'Current Local Date And Time',
    formatModelTimeContext(resolveModelTimeContext({
      activeChar,
      now: params.now,
      deviceTimeZone: params.deviceTimeZone,
    })),
  );

  const sceneLines = [
    activePreset.sceneMode ? `Mode: ${activePreset.sceneMode}` : '',
    activePreset.sceneDescription ? activePreset.sceneDescription : '',
  ].filter(Boolean).join('\n');
  appendSection(sections, 'Scene Mode', sceneLines);

  const finalMain = replaceMacros(presetBlocks(activePreset.main), userName, charName, userDesc);
  const finalJailbreak = replaceMacros(presetBlocks(activePreset.jailbreak), userName, charName, userDesc);
  const finalAuthorsNote = replaceMacros(presetBlocks(activePreset.authorsNote), userName, charName, userDesc);

  appendSection(sections, 'Main Prompt', finalMain);
  appendSection(sections, 'Jailbreak / NSFW', finalJailbreak);

  const characterFacts = [
    `Name: ${charName}`,
    activeChar?.gender ? `Gender: ${activeChar.gender}` : '',
    activeChar?.age ? `Age: ${activeChar.age}` : '',
    activeChar?.desc ? `Description: ${activeChar.desc}` : '',
  ].filter(Boolean).join('\n');
  appendSection(sections, 'Character Definition', characterFacts);

  if (userDesc || userName) {
    appendSection(sections, 'User Persona', `User Name: ${userName}\nUser Background: ${userDesc}`);
  }

  appendSection(sections, "Author's Note", finalAuthorsNote);
  appendSection(
    sections,
    'Online Message Format',
    [
      'Reply as natural chat messages, not as an essay.',
      'Return one message bubble most of the time. When it feels conversational, you may return two or three short bubbles.',
      'Separate multiple bubbles with the exact token <NANA_MSG> and do not number them.',
      'Never return more than three bubbles.',
    ].join('\n'),
  );
  appendSection(
    sections,
    'Current Conversation Continuity',
    formatConversationContinuityContext(conversationContinuity),
  );
  appendSection(sections, 'Private Continuity Update', CONTINUITY_ENVELOPE_INSTRUCTION);

  const matchedLore = worldBookEntries
    .filter(entry => {
      if (entry.group === 'memory') return false;
      if (entry.characterId && entry.characterId !== activeChatId) return false;
      if (entry.alwaysActive) return true;
      return entry.keys.split(',').some(k => {
        const key = k.trim();
        if (!key) return false;
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(/^[a-zA-Z]/.test(key) ? `\\b${escaped}\\b` : escaped, 'i').test(userText);
      });
    });

  appendSection(sections, 'Background Lore / Rules', matchedLore.map(e => e.content).filter(Boolean).join('\n'));

  const memEntry = worldBookEntries.find(e => e.characterId === activeChatId && e.group === 'memory');
  const rememberedRecords = memEntry
    ? (memEntry.records || [])
      .filter(r => r.remember && !r.summarized && !r.suppressedByTraceId)
      .sort((a, b) => a.order - b.order)
    : [];

  if (memEntry?.summaryState !== 'stale' && memEntry?.content?.trim()) {
    appendSection(sections, 'Memory Summary', memEntry.content.trim());
  }
  if (rememberedRecords.length > 0) {
    appendSection(
      sections,
      'Remembered Chat History',
      rememberedRecords.slice(-recallWindowSize).map(r =>
        `[${r.time}] ${r.sender === 'user' ? (userName || 'User') : charName}: ${r.text}`
      ).join('\n'),
    );
  }

  const recallableTraces = relationshipTraces
    .filter(trace => (
      trace.characterId === activeChatId
      && trace.remember
      && trace.state === 'digested'
      && trace.summary.trim()
    ));
  const verifiedTraces = recallableTraces
    .filter(trace => trace.userVerified)
    .sort((left, right) => right.occurredAt - left.occurredAt)
    .slice(0, recallWindowSize);
  const ordinaryTraces = recallableTraces
    .filter(trace => !trace.userVerified)
    .sort((left, right) => (
      right.recallWeight - left.recallWeight
      || right.occurredAt - left.occurredAt
    ))
    .slice(0, Math.max(0, recallWindowSize - verifiedTraces.length));
  const recalledTraces = [...verifiedTraces, ...ordinaryTraces]
    .sort((left, right) => left.occurredAt - right.occurredAt);

  if (ordinaryTraces.length > 0) {
    appendSection(
      sections,
      'Shared Memories',
      ordinaryTraces
        .sort((left, right) => left.occurredAt - right.occurredAt)
        .map(trace => (
        `[${new Date(trace.occurredAt).toLocaleString()}] ${trace.source}: ${trace.summary}`
      )).join('\n'),
    );
  }
  if (verifiedTraces.length > 0) {
    appendSection(
      sections,
      'Verified Memory Corrections',
      [
        'These user-verified memories override any conflicting summary, raw record, or ordinary relationship event.',
        ...verifiedTraces
          .sort((left, right) => left.occurredAt - right.occurredAt)
          .map(trace => (
            `[${new Date(trace.occurredAt).toLocaleString()}] ${trace.source}: ${trace.summary}`
          )),
      ].join('\n'),
    );
  }

  return {
    systemInstruction: sections.map(section => `[${section.title}]:\n${section.content}`).join('\n\n'),
    sections,
    loreCount: matchedLore.length,
    matchedLore,
    rememberedRecords,
    recalledTraces,
  };
}

export interface GenerateReplyResult {
  text: string;
  loreCount: number;
  continuityPatch?: ConversationContinuityPatch;
}

export async function generateReply(params: GenerateParams): Promise<GenerateReplyResult> {
  const {
    userText, userName, activeChar, activePreset,
    chatHistory, worldBookEntries, relationshipTraces, conversationContinuity, memoryWindowSize, activeChatId,
    apiUrl, apiKey, selectedModel, replaceMacros,
  } = params;
  const charName = activeChar?.name || 'Character';
  const context = buildAiContext({
    userText,
    userName,
    userDesc: params.userDesc,
    activeChar,
    activePreset,
    chatHistory,
    worldBookEntries,
    relationshipTraces,
    conversationContinuity,
    memoryWindowSize,
    activeChatId,
    replaceMacros,
  });

  const baseUrl = normalizeBaseUrl(apiUrl);
  const modelName = selectedModel || 'gemini-1.5-flash';

  if (isOfficialGeminiBaseUrl(baseUrl)) {
    const rawText = await postGeminiText({
      baseUrl,
      model: modelName,
      apiKey,
      text: buildPrompt(context.systemInstruction, chatHistory, userText, userName, charName),
      temperature: 0.8,
      signal: params.signal,
    });
    const parsed = parseConversationContinuityEnvelope(rawText);
    return {
      text: parsed.text || '(No response)',
      loreCount: context.loreCount,
      ...(parsed.patch ? { continuityPatch: parsed.patch } : {}),
    };
  }

  const rawText = await postOpenAICompatible({
    baseUrl,
    model: modelName,
    apiKey,
    messages: [
      { role: 'system', content: context.systemInstruction },
      ...activeTextMessages(chatHistory).slice(-15).map(m => ({
        role: m.sender === 'user' ? 'user' as const : 'assistant' as const,
        content: m.text,
      })),
      { role: 'user', content: userText },
    ],
    temperature: 0.8,
    signal: params.signal,
  });
  const parsed = parseConversationContinuityEnvelope(rawText);
  return {
    text: parsed.text || '(No response)',
    loreCount: context.loreCount,
    ...(parsed.patch ? { continuityPatch: parsed.patch } : {}),
  };
}

interface GenerateProactiveParams extends Omit<GenerateParams, 'userText'> {
  language: string;
  focusEvent?: RelationshipTrace;
}

export async function generateProactiveReply(
  params: GenerateProactiveParams,
): Promise<GenerateReplyResult> {
  const {
    userName,
    activeChar,
    activePreset,
    chatHistory,
    worldBookEntries,
    relationshipTraces,
    conversationContinuity,
    memoryWindowSize,
    activeChatId,
    apiUrl,
    apiKey,
    selectedModel,
    replaceMacros,
    focusEvent,
  } = params;
  const charName = activeChar?.name || 'Character';
  const contextSearchText = focusEvent?.summary || activeChar?.desc || '';
  const context = buildAiContext({
    userText: contextSearchText,
    userName,
    userDesc: params.userDesc,
    activeChar,
    activePreset,
    chatHistory,
    worldBookEntries,
    relationshipTraces,
    conversationContinuity,
    memoryWindowSize,
    activeChatId,
    replaceMacros,
  });
  const isChinese = params.language.toLowerCase().startsWith('zh');
  const taskInstruction = [
    'Initiate an online chat as the character. The user has not just sent a new message.',
    'Stay fully consistent with the character definition, online scene preset, recent conversation, and shared memories.',
    focusEvent
      ? `A recent real relationship event may motivate this outreach: ${focusEvent.summary}`
      : 'There is no new event to follow up. Reach out naturally because the character thought of the user.',
    'Do not invent a real-world event, meeting, action, promise, or memory that is not present in the supplied context.',
    'Do not mention prompts, memory systems, APIs, scheduling, or that this is a proactive task.',
    'Write one short visible message most of the time; two or three short bubbles are allowed only when natural, separated by <NANA_MSG>.',
    'After the visible message, include the required private continuity block.',
    isChinese ? 'Write the message in natural Chinese.' : 'Write the message in natural English.',
  ].join('\n');
  const baseUrl = normalizeBaseUrl(apiUrl);
  const modelName = selectedModel || 'gemini-1.5-flash';

  let text = '';
  if (isOfficialGeminiBaseUrl(baseUrl)) {
    const formattedHistory = activeTextMessages(chatHistory)
      .map(message => `${message.sender === 'user' ? userName : charName}: ${message.text}`)
      .slice(-15)
      .join('\n');
    text = await postGeminiText({
      baseUrl,
      model: modelName,
      apiKey,
      text: `System: ${context.systemInstruction}\n\n[Proactive Outreach Task]\n${taskInstruction}\n\nRecent Chat History:\n${formattedHistory}\n\n${charName}:`,
      temperature: 0.9,
      timeoutMs: 20_000,
    });
  } else {
    text = await postOpenAICompatible({
      baseUrl,
      model: modelName,
      apiKey,
      messages: [
        {
          role: 'system',
          content: `${context.systemInstruction}\n\n[Proactive Outreach Task]\n${taskInstruction}`,
        },
        ...activeTextMessages(chatHistory).slice(-15).map(message => ({
          role: message.sender === 'user' ? 'user' as const : 'assistant' as const,
          content: message.text,
        })),
        {
          role: 'user',
          content: 'Write the character message that should be sent now, followed by the required private continuity block.',
        },
      ],
      temperature: 0.9,
      timeoutMs: 20_000,
    });
  }
  const parsed = parseConversationContinuityEnvelope(text);
  if (!parsed.text.trim()) throw new Error('AI service returned an empty proactive message.');
  return {
    text: parsed.text,
    loreCount: context.loreCount,
    ...(parsed.patch ? { continuityPatch: parsed.patch } : {}),
  };
}

export interface GenerateMomentPostParams {
  character: Character;
  userName: string;
  recentChat: Message[];
  relationshipTraces: RelationshipTrace[];
  focusEvent?: RelationshipTrace;
  language: string;
  apiUrl: string;
  apiKey: string;
  selectedModel: string;
}

export async function generateMomentPost(params: GenerateMomentPostParams): Promise<string> {
  const isChinese = params.language.toLowerCase().startsWith('zh');
  const recentChat = activeTextMessages(params.recentChat)
    .slice(-8)
    .map(message => `${message.sender === 'user' ? params.userName : params.character.name}: ${message.text}`)
    .join('\n');
  const recentTraces = params.relationshipTraces
    .filter(trace => (
      trace.characterId === params.character.id
      && trace.state === 'digested'
      && trace.remember
    ))
    .sort((left, right) => right.occurredAt - left.occurredAt)
    .slice(0, 5)
    .map(trace => trace.summary)
    .join('\n');
  const systemInstruction = [
    `Write one short social feed post as ${params.character.name}.`,
    `Character: ${params.character.desc}`,
    'Stay consistent with the character and the supplied real context.',
    'Never invent a shared meeting, promise, purchase, photo, or event that is not in the context.',
    'Do not mention prompts, models, memory systems, scheduling, or the user unless it is natural and supported.',
    'Return only the visible post text, without Markdown, quotes, hashtags, or private notes.',
    isChinese ? 'Use natural Chinese and keep it within 80 Chinese characters.' : 'Use natural language and keep it under 180 characters.',
  ].join('\n');
  const userPrompt = [
    params.focusEvent ? `Optional real event focus: ${params.focusEvent.summary}` : '',
    recentTraces ? `Recent relationship context:\n${recentTraces}` : '',
    recentChat ? `Recent chat:\n${recentChat}` : '',
    'Write the post now.',
  ].filter(Boolean).join('\n\n');
  const result = await runSinglePrompt({
    apiUrl: params.apiUrl,
    apiKey: params.apiKey,
    selectedModel: params.selectedModel,
    systemInstruction,
    userPrompt,
    temperature: 0.85,
    timeoutMs: 20_000,
  });
  const normalized = result.replace(/^["'“”]+|["'“”]+$/g, '').trim();
  if (!normalized) throw new Error('AI service returned an empty moment post.');
  return normalized.slice(0, isChinese ? 160 : 240);
}

export interface GenerateMomentCommentParams {
  character: Character;
  userName: string;
  momentText: string;
  replyToText?: string;
  language: string;
  apiUrl: string;
  apiKey: string;
  selectedModel: string;
}

export async function generateMomentComment(params: GenerateMomentCommentParams): Promise<string> {
  const isChinese = params.language.toLowerCase().startsWith('zh');
  const result = await runSinglePrompt({
    apiUrl: params.apiUrl,
    apiKey: params.apiKey,
    selectedModel: params.selectedModel,
    systemInstruction: [
      `Reply as ${params.character.name}. Character: ${params.character.desc}`,
      'Write one brief, natural comment for a private friends feed.',
      'Do not invent events or shared memories. Return visible comment text only.',
      isChinese ? 'Use natural Chinese, within 45 Chinese characters.' : 'Keep it under 100 characters.',
    ].join('\n'),
    userPrompt: [
      `${params.userName}'s post: ${params.momentText}`,
      params.replyToText ? `Comment being replied to: ${params.replyToText}` : '',
    ].filter(Boolean).join('\n'),
    temperature: 0.75,
    timeoutMs: 16_000,
  });
  const normalized = result.replace(/^["'“”]+|["'“”]+$/g, '').trim();
  if (!normalized) throw new Error('AI service returned an empty moment comment.');
  return normalized.slice(0, isChinese ? 90 : 140);
}

function buildPrompt(
  systemInstruction: string,
  chatHistory: Message[],
  userText: string,
  userName: string,
  charName: string,
): string {
  const formattedHistory = activeTextMessages(chatHistory)
    .map(m => `${m.sender === 'user' ? userName : charName}: ${m.text}`)
    .slice(-15)
    .join('\n');

  return `System: ${systemInstruction}\n\nRecent Chat History:\n${formattedHistory}\n${userName}: ${userText}\n${charName}:`;
}

interface SummarizeParams {
  chatHistory: Message[];
  characterName: string;
  userName: string;
  apiUrl: string;
  apiKey: string;
  selectedModel: string;
  language: string;
}

export async function summarizeChatHistory(params: SummarizeParams): Promise<string> {
  const { chatHistory, characterName, userName, apiUrl, apiKey, selectedModel, language } = params;

  const textMsgs = activeTextMessages(chatHistory);
  if (textMsgs.length === 0) return '';

  const formattedHistory = textMsgs
    .map(m => `${m.sender === 'user' ? userName : characterName}: ${m.text}`)
    .join('\n');

  const isZh = language === 'zh';
  const systemInstruction = isZh
    ? `你是一个记忆压缩助手。根据以下聊天记录，提炼 3-6 条关于用户性格、偏好，以及用户与 ${characterName} 关系的关键事实。

输出格式为项目符号列表，每条一行：
- 事实描述。（"引用原话"）
- 事实描述。（"引用原话"）

每条必须包含原文引用，并用括号包住。只输出列表，不要解释。`
    : `You are a memory compression assistant. Extract 3-6 key facts about the user's personality, preferences, and relationship with ${characterName} from the chat history.

Output format (a bullet list, one fact per line):
- Fact description. ("quoted original message")
- Fact description. ("quoted original message")

Each line MUST include a direct quote from the conversation in parentheses. Only output the list, no explanations.`;

  const userPrompt = isZh
    ? `${userName} 与 ${characterName} 的聊天记录：\n\n${formattedHistory}\n\n提炼为记忆事实：`
    : `Chat history between ${userName} and ${characterName}:\n\n${formattedHistory}\n\nExtract memory facts:`;
  return runSinglePrompt({
    apiUrl,
    apiKey,
    selectedModel,
    systemInstruction,
    userPrompt,
    temperature: 0.3,
  });
}

interface TranslateParams {
  content: string;
  fromLang: string;
  toLang: string;
  apiUrl: string;
  apiKey: string;
  selectedModel: string;
}

export async function translateEntry(params: TranslateParams): Promise<string> {
  const { content, fromLang, toLang, apiUrl, apiKey, selectedModel } = params;

  const langNames: Record<string, string> = { zh: 'Chinese', en: 'English' };
  const fromName = langNames[fromLang] || fromLang;
  const toName = langNames[toLang] || toLang;

  const systemInstruction = `Translate the following text from ${fromName} to ${toName}. Preserve the bullet list format and quoted text in parentheses. Only output the translated text, no explanations.`;

  const translated = await runSinglePrompt({
    apiUrl,
    apiKey,
    selectedModel,
    systemInstruction,
    userPrompt: content,
    temperature: 0.2,
  });
  return translated || content;
}

interface SummarizeRecordsParams {
  records: MemoryRecord[];
  characterName: string;
  userName: string;
  apiUrl: string;
  apiKey: string;
  selectedModel: string;
  language: string;
}

export async function summarizeRecords(params: SummarizeRecordsParams): Promise<string> {
  const { records, characterName, userName, apiUrl, apiKey, selectedModel, language } = params;
  if (records.length === 0) return '';

  const isZh = language === 'zh';
  const formatted = records
    .sort((a, b) => a.order - b.order)
    .map(r => `[${r.time}] ${r.sender === 'user' ? userName : characterName}: ${r.text}`)
    .join('\n');

  const systemInstruction = isZh
    ? '将以下聊天记录总结为一段简洁的摘要（2-4 句话），概括关键内容和情感走向。直接输出摘要，不要前缀或解释。'
    : 'Summarize the following chat records into a concise summary (2-4 sentences) covering key topics and emotional tone. Output the summary directly, no prefix or explanation.';

  const userPrompt = isZh
    ? `聊天记录：\n${formatted}\n\n摘要：`
    : `Chat records:\n${formatted}\n\nSummary:`;

  return runSinglePrompt({
    apiUrl,
    apiKey,
    selectedModel,
    systemInstruction,
    userPrompt,
    temperature: 0.4,
  });
}

export async function consolidateSummary(params: {
  summary: string;
  records: MemoryRecord[];
  characterName: string;
  language: string;
  apiUrl: string;
  apiKey: string;
  selectedModel: string;
}): Promise<string> {
  const { summary, records, characterName, language, apiUrl, apiKey, selectedModel } = params;
  const isZh = language === 'zh';
  const recordText = records.slice(-30).map(r =>
    `[${r.time}] ${r.sender === 'user' ? 'User' : characterName}: ${r.text}`
  ).join('\n');
  const systemInstruction = isZh
    ? '你是一个记忆整合助手。请将现有记忆摘要和补充记录整合成一份简洁、连贯的摘要（3-6 句话）。直接输出，不要前缀或解释。'
    : 'You are a memory consolidator. Merge the existing summary and records into one concise, coherent summary (3-6 sentences). Output only the summary.';
  const userPrompt = isZh
    ? `现有摘要：\n${summary}\n\n补充记录：\n${recordText}\n\n整合后的摘要：`
    : `Existing summary:\n${summary}\n\nRecords:\n${recordText}\n\nConsolidated summary:`;
  const result = await runSinglePrompt({
    apiUrl,
    apiKey,
    selectedModel,
    systemInstruction,
    userPrompt,
    temperature: 0.3,
  });
  return result || summary;
}

async function runSinglePrompt(params: {
  apiUrl: string;
  apiKey: string;
  selectedModel: string;
  systemInstruction: string;
  userPrompt: string;
  temperature: number;
  timeoutMs?: number;
}): Promise<string> {
  const baseUrl = normalizeBaseUrl(params.apiUrl);
  const model = params.selectedModel || 'gemini-1.5-flash';

  if (isOfficialGeminiBaseUrl(baseUrl)) {
    return postGeminiText({
      baseUrl,
      model,
      apiKey: params.apiKey,
      text: `System: ${params.systemInstruction}\n\n${params.userPrompt}`,
      temperature: params.temperature,
      timeoutMs: params.timeoutMs,
    });
  }

  return postOpenAICompatible({
    baseUrl,
    model,
    apiKey: params.apiKey,
    messages: [
      { role: 'system', content: params.systemInstruction },
      { role: 'user', content: params.userPrompt },
    ],
    temperature: params.temperature,
    timeoutMs: params.timeoutMs,
  });
}

export interface PaymentReactionResult {
  decision: PaymentReactionDecision;
  replyText: string;
  reason?: string;
  source: 'remote' | 'local';
}

export interface GeneratePaymentReactionParams {
  kind: PaymentKind;
  amountMinor: number;
  note?: string;
  userName: string;
  character: Character | undefined;
  apiUrl: string;
  apiKey: string;
  selectedModel: string;
  language?: string;
  recentChat?: Message[];
  relationshipTraces?: RelationshipTrace[];
  timeoutMs?: number;
}

const conciseText = (value: unknown, maxLength = 280) => (
  typeof value === 'string' ? Array.from(value.trim()).slice(0, maxLength).join('') : ''
);

function localPaymentReaction(params: GeneratePaymentReactionParams): PaymentReactionResult {
  const name = params.character?.name || 'Character';
  const description = `${params.character?.desc || ''} ${params.character?.gender || ''}`.toLowerCase();
  const tone = /stoic|quiet|disciplined|reserved|cold|克制|安静|冷静|寡言/.test(description)
    ? 'reserved'
    : /witty|free-spirited|bard|playful|cheerful|俏皮|活泼|幽默|开朗/.test(description)
      ? 'playful'
      : /gentle|caring|soft|kind|loyal|温柔|体贴|善良|忠诚/.test(description)
        ? 'gentle'
        : 'default';
  const note = params.note?.toLowerCase() || '';
  const guardedPersona = /proud|independent|cautious|suspicious|strict|不收|独立|谨慎|警惕|要强/.test(description);
  const boundaryNote = /loan|debt|owe|repay|借|欠|还钱|补偿/.test(note);
  const unusuallyLarge = params.amountMinor >= (params.kind === 'redPacket' ? 20_000 : 50_000);
  const decision: PaymentReactionDecision = boundaryNote
    || params.amountMinor >= 100_000
    || (guardedPersona && unusuallyLarge)
    ? 'decline'
    : 'accept';
  const replyText = runtimeLocalPaymentReply(params.language, tone, params.kind, name, decision);

  return { decision, replyText, source: 'local' };
}

function parsePaymentReaction(text: string): Omit<PaymentReactionResult, 'source'> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = (fenced || text).trim();
  const objectText = candidate.startsWith('{')
    ? candidate
    : candidate.slice(candidate.indexOf('{'), candidate.lastIndexOf('}') + 1);

  let value: unknown;
  try {
    value = JSON.parse(objectText);
  } catch {
    throw new Error('The character payment response was not valid structured JSON.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The character payment response was not an object.');
  }

  const record = value as Record<string, unknown>;
  const decision = record.decision;
  if (decision !== 'accept' && decision !== 'decline') {
    throw new Error('The character payment response used an unsupported decision.');
  }
  const replyText = conciseText(record.replyText);
  if (!replyText) {
    throw new Error('The character payment response did not include reply text.');
  }
  const reason = conciseText(record.reason, 180) || undefined;
  return { decision, replyText, reason };
}

export async function generatePaymentReaction(
  params: GeneratePaymentReactionParams,
): Promise<PaymentReactionResult> {
  if (!params.apiKey.trim()) return localPaymentReaction(params);

  const characterName = params.character?.name || 'Character';
  const amount = `CNY ${(Math.max(0, params.amountMinor) / 100).toFixed(2)}`;
  const systemInstruction = [
    `You decide how ${characterName} responds to a relationship payment inside a fictional private-phone role-play.`,
    'Stay in character. Return exactly one JSON object and no Markdown.',
    'Schema: {"decision":"accept|decline","replyText":"one short in-character message","reason":"optional short internal reason"}.',
    'The character may accept or decline. Decide from their personality, the amount, the note, and supplied relationship context; do not default to accepting.',
    'Do not claim a real bank transfer happened. Do not invent a different amount.',
    resolveRuntimeLanguage(params.language) === 'zh'
      ? 'Write replyText in natural Simplified Chinese.'
      : 'Write replyText in natural English.',
  ].join('\n');
  const userPrompt = [
    `Character name: ${characterName}`,
    `Character description: ${params.character?.desc || 'No description provided.'}`,
    `Sender: ${params.userName || 'User'}`,
    `Object: ${params.kind === 'redPacket' ? 'red packet' : 'transfer'}`,
    `Amount: ${amount}`,
    `Note: ${params.note?.trim() || '(none)'}`,
    params.recentChat?.length
      ? `Recent chat:\n${activeTextMessages(params.recentChat).slice(-6).map(message => (
          `${message.sender === 'user' ? params.userName || 'User' : characterName}: ${message.text}`
        )).join('\n')}`
      : '',
    params.relationshipTraces?.length
      ? `Recent real relationship context:\n${params.relationshipTraces
          .filter(trace => trace.characterId === params.character?.id && trace.state === 'digested')
          .sort((left, right) => right.occurredAt - left.occurredAt)
          .slice(0, 3)
          .map(trace => trace.summary)
          .join('\n')}`
      : '',
  ].filter(Boolean).join('\n');

  try {
    const raw = await runSinglePrompt({
      apiUrl: params.apiUrl,
      apiKey: params.apiKey,
      selectedModel: params.selectedModel,
      systemInstruction,
      userPrompt,
      temperature: 0.55,
      timeoutMs: params.timeoutMs ?? 20_000,
    });
    try {
      return { ...parsePaymentReaction(raw), source: 'remote' };
    } catch {
      const visibleReply = conciseText(
        raw
          .replace(/```(?:json)?/gi, '')
          .replace(/```/g, '')
          .replace(/\{[\s\S]*\}/g, '')
          .trim(),
      );
      if (visibleReply) {
        return { decision: 'accept', replyText: visibleReply, source: 'remote' };
      }
      throw new Error('The character payment response was empty.');
    }
  } catch {
    // A relationship action must never turn into silence because a provider
    // timed out or ignored the structured-output request. The durable payment
    // still settles through the normal store path with a short in-character
    // local response.
    return localPaymentReaction(params);
  }
}
