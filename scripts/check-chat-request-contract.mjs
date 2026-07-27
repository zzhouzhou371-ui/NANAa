import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const sourcePath = resolve(root, 'src/services/chatRequestCoordinator.ts');
const source = readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName: sourcePath,
});
const module = { exports: {} };
vm.runInContext(compiled.outputText, vm.createContext({ exports: module.exports, module }), { filename: sourcePath });

const { beginChatRequest, cancelChatRequest, completeChatRequest, isCurrentChatRequest } = module.exports;
const errors = [];
const expect = (condition, message) => { if (!condition) errors.push(message); };

const lunaStart = beginChatRequest({}, 'luna-id', 'request-luna-1');
expect(lunaStart.accepted, 'the first request for a chat should start');
const duplicate = beginChatRequest(lunaStart.pending, 'luna-id', 'request-luna-2');
expect(!duplicate.accepted, 'a second in-flight request for the same chat should be rejected');

const kaiStart = beginChatRequest(lunaStart.pending, 'kai-id', 'request-kai-1');
expect(kaiStart.accepted, 'a different chat may have its own in-flight request');
expect(isCurrentChatRequest(kaiStart.pending, 'luna-id', 'request-luna-1'), 'switching chat must not replace the original request token');

const staleFinish = completeChatRequest(kaiStart.pending, 'luna-id', 'request-luna-stale');
expect(!staleFinish.completed, 'a stale response token must not complete the chat request');
expect(staleFinish.pending === kaiStart.pending, 'a stale response must leave pending state unchanged');

const lunaFinish = completeChatRequest(kaiStart.pending, 'luna-id', 'request-luna-1');
expect(lunaFinish.completed, 'the matching response token should complete');
expect(!('luna-id' in lunaFinish.pending), 'the completed chat token should be removed');
expect(lunaFinish.pending['kai-id'] === 'request-kai-1', 'completing one chat must not disturb another chat');
const clearedLuna = cancelChatRequest(kaiStart.pending, 'luna-id');
expect(!('luna-id' in clearedLuna), 'clearing a chat must invalidate its in-flight request token');
expect(clearedLuna['kai-id'] === 'request-kai-1', 'clearing one chat must not cancel another chat request');
expect(cancelChatRequest(clearedLuna, 'luna-id') === clearedLuna, 'replaying chat-request cancellation must be idempotent');

const storeSource = readFileSync(resolve(root, 'src/stores/nanaStore.ts'), 'utf8');
const sendChatStart = storeSource.indexOf("sendChatMessage: async");
const sendChatEnd = storeSource.indexOf("retryChatMessage: async", sendChatStart);
const sendChatSource = storeSource.slice(sendChatStart, sendChatEnd);
const clearChatStart = storeSource.indexOf('clearChat: (chatId) =>');
const clearChatEnd = storeSource.indexOf('sendPayment: async', clearChatStart);
const clearChatSource = storeSource.slice(clearChatStart, clearChatEnd);
expect(storeSource.includes("type: 'payment'"), 'new payment messages must reference canonical payment entities');
expect(!storeSource.includes("type: 'transfer_received'"), 'the store must not create legacy transfer-received cards');
expect(sendChatSource.indexOf('finalizeVoiceCapture(mediaCapture)') >= 0, 'voice send must finalize cache media before committing');
expect(sendChatSource.indexOf('finalizeVoiceCapture(mediaCapture)') < sendChatSource.indexOf('const newMsg: Message'), 'voice finalization must happen before message construction');
expect(sendChatSource.indexOf('state.pendingChatRequests[chatId]') < sendChatSource.indexOf('finalizeVoiceCapture(mediaCapture)'), 'rejectable in-flight reply checks must run before voice media is promoted');
expect(sendChatSource.includes('discardVoiceCapture(mediaCapture)'), 'rejected or invalid voice sends must safely discard app-owned temporary audio');
expect(!sendChatSource.includes('mediaUris: mediaCapture?.localUri'), 'voice relationship traces must never retain the temporary capture URI');
expect(sendChatSource.includes("finalizedMediaCapture?.phase !== 'processing'"), 'native processing captures with a durable URI must be accepted');
expect(!sendChatSource.includes("'Voice Message'"), 'voice sends must not invent a placeholder transcript');
expect(sendChatSource.indexOf('const newMsg: Message') < sendChatSource.indexOf('await transcribeAudioCapture'), 'the playable voice message must commit before background transcription');
expect(sendChatSource.includes('message.id === messageId'), 'successful background transcription must patch the original message in place');
expect(sendChatSource.includes('sourceMessageStillExists'), 'async voice/no-key work must verify that its source message survived chat clearing');
expect(sendChatSource.indexOf('await transcribeAudioCapture') < sendChatSource.indexOf('if (!sourceMessageStillExists()) return;'), 'voice transcription must check for a concurrent clear before writing back');
expect(clearChatSource.includes('cancelChatRequest(state.pendingChatRequests, chatId)'), 'clearChat must invalidate in-flight AI replies centrally');
expect(clearChatSource.includes('paymentMustRemainVisibleDuringChatClear'), 'clearChat must retain actionable payment cards and their retry/refund entry point');
expect(clearChatSource.includes('createPaymentChatMessage'), 'clearChat must reconstruct a missing actionable payment card instead of hiding held funds');
const appSource = readFileSync(resolve(root, 'src/screens/home/index.tsx'), 'utf8');
expect(appSource.includes('useNanaStore.getState().clearChat(activeChatId)'), 'the manage-chat action must call the centralized clearChat transaction');
expect(!appSource.includes("chatHistory: { ...state.chatHistory, [activeChatId]: [] }"), 'the manage-chat action must not bypass payment/request cleanup');
for (const englishRuntimeCopy of [
  'Please configure your API Key in Settings first.',
  'Calling...',
  'Incoming voice call',
  'Incoming video call',
  'Call answered.',
  'Transcribing...',
  'Thinking...',
  'No speech detected.',
  'Photo sent',
  'Typing...',
]) {
  expect(!storeSource.includes(`'${englishRuntimeCopy}'`), `store runtime UI must source localized copy instead of hardcoding: ${englishRuntimeCopy}`);
}
expect(storeSource.includes('runtimeCopyFor(state.themeConfig.language)'), 'store runtime UI must derive copy from the persisted theme language');

if (errors.length > 0) {
  console.error('Chat request contract check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Chat request contract check passed.');
}
