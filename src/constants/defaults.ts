import type { Preset, ThemeConfig } from '../types';
import { DEFAULT_MEETING_CONFIG } from '../features/meeting/domain/meeting-config';

export const DEFAULT_MOMENT_IMAGES = [
  'https://images.unsplash.com/photo-1707343843437-caacff5cfa74?q=80&w=600',
];

export const DEFAULT_AVATARS = [
  'U',
  'L',
  'K',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop',
];

export const DEFAULT_MOMENT_LIST = [
  {
    id: '1',
    authorId: 'demo-friend-1',
    authorName: 'Alice',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150',
    text: 'Beautiful day outside!',
    images: ['https://images.unsplash.com/photo-1506744626753-eda814194b15?w=500'],
    timestamp: Date.now() - 3600000,
  },
];

export const DEFAULT_WORLD_BOOK = [
  {
    id: '1',
    keys: 'Luna,maid',
    content: 'Luna is a gentle and considerate maid who usually wears a black-and-white maid outfit.',
  },
];

export const DEFAULT_ONLINE_PRESET: Preset = {
  id: 'default_online',
  name: 'Default WeChat',
  sceneMode: 'online',
  sceneDescription: 'Online chat roleplay inside a WeChat-like messaging app. Keep replies natural, concise, and message-like.',
  main: ['You are roleplaying on WeChat. Reply concisely and naturally. Use short sentences.'],
  jailbreak: [],
  authorsNote: [],
  authorsNoteDepth: 0,
};

export const DEFAULT_OFFLINE_PRESET: Preset = {
  id: 'default_offline',
  name: 'Default IRL',
  sceneMode: 'offline',
  sceneDescription: 'In-person roleplay with spatial awareness, physical presence, gestures, and sensory details.',
  main: ['You are roleplaying in real life. Use spatial descriptions.'],
  jailbreak: [],
  authorsNote: [],
  authorsNoteDepth: 0,
  meetingConfig: DEFAULT_MEETING_CONFIG,
};

export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  themeName: 'liquid',
  wallpaperId: 'system',
  backgroundImage: '',
  fontFamily: 'font-sans',
  primaryColor: 'violet',
  customThemeColor: '',
  customTextColor: '',
  language: 'en',
  iconStyle: 'neumorphic-v1',
  chromeStyle: 'neumorphic-v1',
};
