import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const sourcePath = resolve(root, 'src/services/callConversationRuntime.ts');
const source = readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath,
});
const module = { exports: {} };
vm.runInContext(compiled.outputText, vm.createContext({
  exports: module.exports,
  module,
  Math,
  Number,
}), { filename: sourcePath });

const {
  CALL_CONVERSATION_TRANSCRIPT_LIMIT,
  buildCallConversationChatHistory,
} = module.exports;
const errors = [];
const expect = (condition, message) => { if (!condition) errors.push(message); };

const baseHistory = [{
  id: 1,
  sender: 'user',
  text: 'A message before the call',
  time: '10:00',
  type: 'text',
}];
const transcript = [
  { id: 10, speaker: 'user', text: 'Tell me about the garden', mode: 'speech' },
  { id: 11, speaker: 'char', text: 'The roses opened today', mode: 'speech' },
  { id: 12, speaker: 'user', text: 'Tell me about the garden', mode: 'speech' },
];
const history = buildCallConversationChatHistory({
  chatHistory: baseHistory,
  transcript,
  currentUserText: '  Tell me about the garden  ',
});

expect(
  history.map(message => `${message.sender}:${message.text}`).join('|')
    === 'user:A message before the call|user:Tell me about the garden|char:The roses opened today',
  'prior chat and call speech must retain speaker order while excluding the current user line',
);
expect(
  history.filter(message => message.text === 'Tell me about the garden').length === 1,
  'only the trailing current turn may be removed; an earlier identical utterance must remain',
);
expect(
  baseHistory.length === 1 && transcript.length === 3,
  'building model context must not mutate stored chat or call transcripts',
);

const longTranscript = Array.from(
  { length: CALL_CONVERSATION_TRANSCRIPT_LIMIT + 5 },
  (_, index) => ({
    id: 100 + index,
    speaker: index % 2 === 0 ? 'user' : 'char',
    text: `line-${index}`,
    mode: 'speech',
  }),
);
const bounded = buildCallConversationChatHistory({
  chatHistory: [],
  transcript: longTranscript,
  currentUserText: 'not-present',
});
expect(
  bounded.length === CALL_CONVERSATION_TRANSCRIPT_LIMIT,
  'call conversation context must have a fixed upper bound',
);
expect(
  bounded[0]?.text === 'line-5'
    && bounded.at(-1)?.text === `line-${CALL_CONVERSATION_TRANSCRIPT_LIMIT + 4}`,
  'the bound must retain the newest call lines in their original order',
);

const noFalseRemoval = buildCallConversationChatHistory({
  chatHistory: [],
  transcript: [{ id: 99, speaker: 'char', text: 'same words', mode: 'text' }],
  currentUserText: 'same words',
});
expect(
  noFalseRemoval.length === 1 && noFalseRemoval[0]?.sender === 'char',
  'matching character speech must never be mistaken for the current user turn',
);

const storeSource = readFileSync(resolve(root, 'src/stores/nanaStore.ts'), 'utf8');
expect(
  storeSource.includes('transcript: currentCallOverlay.transcript'),
  'call reply generation must use the live session transcript after transcription commits',
);
expect(
  storeSource.includes('chatHistory: callConversationHistory'),
  'the generated bounded call history must be passed to generateReply',
);
expect(
  storeSource.includes('if (!isCurrentCallSession(currentCallOverlay)) return;'),
  'session guards must run before call history is prepared for the model',
);
expect(
  storeSource.includes('signal: requestController.signal'),
  'call generation must retain abort-signal cancellation',
);

if (errors.length > 0) {
  console.error('Call conversation contract check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Call conversation contract check passed.');
}
