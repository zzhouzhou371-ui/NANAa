import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

const targets = [
  {
    file: 'src/i18n/index.ts',
    label: 'localized UI copy',
    required: ['中文', '聊天', '发送', '记忆', '语音通话', '视频通话'],
  },
  {
    file: 'src/services/ai.ts',
    label: 'AI prompt copy',
    required: ['你是一个记忆压缩助手', '聊天记录', '摘要'],
  },
  {
    file: 'src/components/EmojiPanel.tsx',
    label: 'emoji picker data',
    required: ['😀', '👍', '❤️', '🎁'],
  },
];

const mojibakePatterns = [
  /鈹/g,
  /馃/g,
  /锛/g,
  /绯/g,
  /瑙/g,
  /涓/g,
  /鐨/g,
  /鎬/g,
  /浣/g,
  /璁/g,
  /鍦/g,
  /寮/g,
  /鉁/g,
];

const errors = [];

for (const target of targets) {
  const path = resolve(root, target.file);
  const text = readFileSync(path, 'utf8');

  for (const pattern of mojibakePatterns) {
    const matches = text.match(pattern);
    if (matches?.length) {
      errors.push(`${target.file}: ${target.label} contains mojibake pattern ${pattern} (${matches.length})`);
    }
  }

  for (const required of target.required) {
    if (!text.includes(required)) {
      errors.push(`${target.file}: missing expected text "${required}"`);
    }
  }
}

if (errors.length > 0) {
  console.error('Text integrity check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Text integrity check passed.');
}
