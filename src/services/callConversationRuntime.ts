import type { CallTranscriptLine, Message } from '../types';

export const CALL_CONVERSATION_TRANSCRIPT_LIMIT = 12;

const normalizedSpeechText = (value: string) => value.trim();

export const buildCallConversationChatHistory = (params: {
  chatHistory: Message[];
  transcript: CallTranscriptLine[];
  currentUserText: string;
  transcriptLimit?: number;
}): Message[] => {
  const currentUserText = normalizedSpeechText(params.currentUserText);
  const requestedLimit = params.transcriptLimit;
  const transcriptLimit = typeof requestedLimit === 'number' && Number.isFinite(requestedLimit)
    ? Math.max(0, Math.floor(requestedLimit))
    : CALL_CONVERSATION_TRANSCRIPT_LIMIT;
  const transcript = params.transcript
    .map(line => ({
      ...line,
      text: normalizedSpeechText(line.text),
    }))
    .filter(line => line.text.length > 0);

  const latestLine = transcript.at(-1);
  const previousTranscript = latestLine?.speaker === 'user'
    && latestLine.text === currentUserText
    ? transcript.slice(0, -1)
    : transcript;
  const boundedTranscript = transcriptLimit > 0
    ? previousTranscript.slice(-transcriptLimit)
    : [];

  return [
    ...params.chatHistory,
    ...boundedTranscript.map(line => ({
      id: line.id,
      sender: line.speaker,
      text: line.text,
      time: '',
      type: 'text' as const,
    })),
  ];
};
