import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const sourcePath = resolve(root, 'src/services/meetingHandoffRuntime.ts');
const source = readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath,
});
let nextStructuredText = '{"title":"雨停后","premise":"用户与 Luna 在线上约好，雨停后在咖啡馆见面，继续刚才的话题。"}';
const module = { exports: {} };
vm.runInContext(compiled.outputText, vm.createContext({
  exports: module.exports,
  module,
  require: id => {
    if (id === './ai') return { generateStructuredText: async () => {
      if (nextStructuredText instanceof Error) throw nextStructuredText;
      return nextStructuredText;
    } };
    throw new Error(`Unexpected dependency: ${id}`);
  },
  JSON,
  Array,
  Object,
  Set,
}), { filename: sourcePath });

const {
  createLocalMeetingHandoffDraft,
  prepareMeetingHandoffDraft,
  selectMeetingHandoffMessages,
} = module.exports;
const errors = [];
const expect = (condition, message) => { if (!condition) errors.push(message); };

const messages = Array.from({ length: 14 }, (_, index) => ({
  id: index + 1,
  sender: index % 2 ? 'char' : 'user',
  text: `chat-${index + 1}`,
  time: '20:00',
  type: 'text',
  turnId: `turn-${index + 1}`,
}));
messages.push({ id: 20, sender: 'user', text: '', transcript: 'voice agreement transcript', time: '20:01', type: 'voice', turnId: 'voice-turn' });
messages.push({ id: 21, sender: 'user', text: 'image caption must not leak', time: '20:02', type: 'image' });
const selected = selectMeetingHandoffMessages(messages);
expect(selected.length === 12, 'manual handoff preparation must use at most twelve eligible messages');
expect(selected.at(-1).text === 'voice agreement transcript', 'voice messages must use their transcript');
expect(!selected.some(item => item.id === 21), 'non-text media captions must not enter handoff preparation');

const fallback = createLocalMeetingHandoffDraft({
  chatId: 'luna',
  characterId: 'luna',
  characterName: 'Luna',
  messages,
  presetId: 'offline-1',
});
expect(fallback.castIds.join(',') === 'luna', 'the current chat character must be selected by default');
expect(fallback.sourceMessageIds.length === 12, 'fallback drafts must retain only bounded source ids');
expect(!fallback.premise.includes('image caption must not leak'), 'local fallback must exclude unsupported message content');

const englishFallback = createLocalMeetingHandoffDraft({
  chatId: 'luna',
  characterId: 'luna',
  characterName: 'Luna',
  messages: [],
  presetId: 'offline-1',
  language: 'en',
});
expect(englishFallback.title === 'Meeting Luna', 'English handoff titles must follow the active app language');
expect(englishFallback.premise.startsWith('You and Luna'), 'English handoff fallback premises must not leak Chinese UI copy');
expect(englishFallback.sourceLabel === 'From your online chat with Luna', 'English handoff source labels must follow the active app language');

const prepared = await prepareMeetingHandoffDraft({
  fallback,
  messages,
  characterName: 'Luna',
  userName: 'Nana',
  apiUrl: 'https://example.invalid',
  apiKey: 'configured',
  selectedModel: 'model',
});
expect(prepared.title === '雨停后' && prepared.premise.includes('咖啡馆'), 'remote preparation may refine title and premise while preserving draft metadata');
expect(prepared.sourceMessageIds.join(',') === fallback.sourceMessageIds.join(','), 'remote preparation must never replace app-owned source ids');

nextStructuredText = new Error('offline');
const offline = await prepareMeetingHandoffDraft({
  fallback,
  messages,
  characterName: 'Luna',
  userName: 'Nana',
  apiUrl: 'https://example.invalid',
  apiKey: 'configured',
  selectedModel: 'model',
});
expect(offline.premise === fallback.premise, 'remote failure must return the local handoff fallback');

const chatViewSource = readFileSync(resolve(root, 'src/components/ChatView.tsx'), 'utf8');
const homeSource = readFileSync(resolve(root, 'src/screens/home/index.tsx'), 'utf8');
const meetingViewSource = readFileSync(resolve(root, 'src/features/meeting/ui/meeting-view.tsx'), 'utf8');
expect(chatViewSource.includes('MeetingHandoffCard'), 'chat must render the automatic handoff card outside message rows');
expect(homeSource.includes('header-go-to-meeting-button'), 'chat header more menu must always expose the manual meeting entry');
expect(meetingViewSource.includes("resolvedPage === 'handoff'"), 'Meeting navigation must include the lightweight handoff confirmation page');

if (errors.length) {
  console.error('Meeting handoff contract check failed:');
  errors.forEach(error => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log('Meeting handoff contract check passed.');
}
