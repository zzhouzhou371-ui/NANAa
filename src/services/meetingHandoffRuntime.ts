import type { ConversationMeetingHandoff, Message } from '../types';
import type { MeetingHandoffDraft } from '../features/meeting/ui/meeting-ui-types';
import { generateStructuredText } from './ai';

const handoffCopyFor = (language?: string) => language !== 'en' ? {
  locale: 'zh-CN',
  parseMissing: '没有整理出可确认的赴约信息。',
  parseInvalid: '赴约信息格式无效。',
  onlinePremise: (name: string) => `你和${name}从线上聊天来到线下，准备继续刚才的话题。`,
  title: (name: string) => `和${name}见面`,
  source: (name: string) => `来自与${name}的线上聊天`,
  user: '你',
} : {
  locale: 'en-US',
  parseMissing: 'The meeting details could not be prepared for review.',
  parseInvalid: 'The meeting details are invalid.',
  onlinePremise: (name: string) => `You and ${name} move from your online chat into an in-person scene, ready to continue the conversation.`,
  title: (name: string) => `Meeting ${name}`,
  source: (name: string) => `From your online chat with ${name}`,
  user: 'You',
};

const compact = (value: string, maxLength: number) => Array.from(
  value.replace(/\s+/gu, ' ').trim(),
).slice(0, maxLength).join('');

const messageText = (message: Message) => {
  if (message.sender !== 'user' && message.sender !== 'char') return '';
  if (message.type === 'voice') return compact(message.transcript || message.text || '', 600);
  if (message.type && message.type !== 'text') return '';
  return compact(message.text || '', 600);
};

export const selectMeetingHandoffMessages = (messages: readonly Message[], limit = 12) => (
  messages.flatMap(message => {
    const text = messageText(message);
    return text ? [{ id: message.id, sender: message.sender as 'user' | 'char', text, turnId: message.turnId }] : [];
  }).slice(-Math.max(1, Math.min(12, limit)))
);

const extractJsonObject = (rawText: string, language?: string): Record<string, unknown> => {
  const copy = handoffCopyFor(language);
  const cleaned = rawText.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(copy.parseMissing);
  const value = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(copy.parseInvalid);
  return value as Record<string, unknown>;
};

export const createLocalMeetingHandoffDraft = ({
  chatId,
  characterId,
  characterName,
  messages,
  presetId,
  existingHandoff,
  language,
}: {
  chatId: string;
  characterId: string;
  characterName: string;
  messages: readonly Message[];
  presetId: string;
  existingHandoff?: ConversationMeetingHandoff;
  language?: string;
}): MeetingHandoffDraft => {
  const copy = handoffCopyFor(language);
  const selected = selectMeetingHandoffMessages(messages);
  const recentText = selected.slice(-4).map(item => item.text).join(' ');
  const premise = existingHandoff?.premise
    || compact(recentText, 520)
    || copy.onlinePremise(characterName);
  return {
    chatId,
    castIds: [characterId],
    title: existingHandoff?.title || copy.title(characterName),
    premise,
    presetId,
    sourceMessageIds: existingHandoff?.sourceMessageIds.length
      ? [...existingHandoff.sourceMessageIds]
      : selected.map(item => item.id),
    sourceTurnId: existingHandoff?.sourceTurnId || selected.at(-1)?.turnId,
    sourceLabel: copy.source(characterName),
  };
};

export const prepareMeetingHandoffDraft = async ({
  fallback,
  messages,
  characterName,
  userName,
  apiUrl,
  apiKey,
  selectedModel,
  language,
}: {
  fallback: MeetingHandoffDraft;
  messages: readonly Message[];
  characterName: string;
  userName: string;
  apiUrl: string;
  apiKey: string;
  selectedModel: string;
  language?: string;
}): Promise<MeetingHandoffDraft> => {
  const copy = handoffCopyFor(language);
  if (!apiKey.trim()) return fallback;
  const selected = selectMeetingHandoffMessages(messages);
  if (!selected.length) return fallback;
  try {
    const raw = await generateStructuredText({
      apiUrl,
      apiKey,
      selectedModel,
      systemPrompt: [
        'Turn the recent online chat into a concise, editable premise for an offline role-play meeting.',
        'Use only facts and plans explicitly present in the supplied chat. Do not invent a location, time, relationship event, or agreement.',
        `Write the title and premise in ${copy.locale === 'zh-CN' ? 'Simplified Chinese' : 'English'}.`,
        'Return JSON only: {"title":"short title","premise":"2-4 sentence scene premise"}.',
      ].join('\n'),
      context: [
        `User: ${userName || copy.user}`,
        `Character: ${characterName}`,
        'Recent chat:',
        ...selected.map(item => `${item.sender === 'user' ? userName || copy.user : characterName}: ${item.text}`),
      ].join('\n'),
      maxOutputCharacters: 2_000,
    });
    const parsed = extractJsonObject(raw, language);
    const title = typeof parsed.title === 'string' ? compact(parsed.title, 80) : '';
    const premise = typeof parsed.premise === 'string' ? compact(parsed.premise, 700) : '';
    if (!premise) return fallback;
    return { ...fallback, title: title || fallback.title, premise };
  } catch {
    return fallback;
  }
};
