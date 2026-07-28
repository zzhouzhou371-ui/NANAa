import type {
  Message,
  Character,
  Preset,
  WorldBookEntry,
  MemoryRecord,
  RelationshipTrace,
  PaymentKind,
  PaymentReactionDecision,
} from '../types';
import {
  fetchWithTimeout,
  isOfficialGeminiBaseUrl,
  readResponsePayload,
  responseErrorMessage,
} from './network';
import { resolveRuntimeLanguage, runtimeLocalPaymentReply } from './runtimeCopy';

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
}): Promise<string> {
  const response = await fetchWithTimeout(`${params.baseUrl}/v1beta/models/${params.model}:generateContent?key=${params.apiKey.trim()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: params.text }] }],
      generationConfig: { temperature: params.temperature },
    }),
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
  }, params.timeoutMs);
  const payload = await readResponsePayload(response);
  if (!response.ok) throw new Error(responseErrorMessage(response, payload));
  const data = payload.data;
  if (!data) throw new Error('AI service returned an unreadable response.');
  return data.choices?.[0]?.message?.content || '';
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
  memoryWindowSize?: number;
  activeChatId: string;
  apiUrl: string;
  apiKey: string;
  selectedModel: string;
  replaceMacros: (text: string, userName: string, charName: string, persona: string) => string;
}

export function buildAiContext(params: Omit<GenerateParams, 'apiUrl' | 'apiKey' | 'selectedModel'>): AiContextBuildResult {
  const {
    userText, userName, userDesc, activeChar, activePreset,
    worldBookEntries, relationshipTraces = [], memoryWindowSize = 12,
    activeChatId, replaceMacros,
  } = params;
  const charName = activeChar?.name || 'Character';
  const sections: AiContextSection[] = [];
  const recallWindowSize = Number.isFinite(memoryWindowSize)
    ? Math.max(1, Math.min(50, Math.floor(memoryWindowSize)))
    : 12;

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

export async function generateReply(params: GenerateParams): Promise<{ text: string; loreCount: number }> {
  const {
    userText, userName, activeChar, activePreset,
    chatHistory, worldBookEntries, relationshipTraces, memoryWindowSize, activeChatId,
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
    memoryWindowSize,
    activeChatId,
    replaceMacros,
  });

  const baseUrl = normalizeBaseUrl(apiUrl);
  const modelName = selectedModel || 'gemini-1.5-flash';

  if (isOfficialGeminiBaseUrl(baseUrl)) {
    const text = await postGeminiText({
      baseUrl,
      model: modelName,
      apiKey,
      text: buildPrompt(context.systemInstruction, chatHistory, userText, userName, charName),
      temperature: 0.8,
    });
    return { text: text || '(No response)', loreCount: context.loreCount };
  }

  const text = await postOpenAICompatible({
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
  });
  return { text: text || '(No response)', loreCount: context.loreCount };
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
  timeoutMs?: number;
}

const conciseText = (value: unknown, maxLength = 280) => (
  typeof value === 'string' ? Array.from(value.trim()).slice(0, maxLength).join('') : ''
);

function localPaymentReaction(params: GeneratePaymentReactionParams): PaymentReactionResult {
  const name = params.character?.name || 'Character';
  const description = `${params.character?.desc || ''} ${params.character?.gender || ''}`.toLowerCase();
  const tone = /stoic|quiet|disciplined|reserved|cold/.test(description)
    ? 'reserved'
    : /witty|free-spirited|bard|playful|cheerful/.test(description)
      ? 'playful'
      : /gentle|caring|soft|kind|loyal/.test(description)
        ? 'gentle'
        : 'default';
  const replyText = runtimeLocalPaymentReply(params.language, tone, params.kind, name);

  return { decision: 'accept', replyText, source: 'local' };
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
  ].join('\n');

  const raw = await runSinglePrompt({
    apiUrl: params.apiUrl,
    apiKey: params.apiKey,
    selectedModel: params.selectedModel,
    systemInstruction,
    userPrompt,
    temperature: 0.55,
    timeoutMs: params.timeoutMs ?? 8_000,
  });
  return { ...parsePaymentReaction(raw), source: 'remote' };
}
