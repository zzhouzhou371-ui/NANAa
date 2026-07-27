// Centralized color palette for nana-rn
// All magic color values should reference this file

export const Colors = {
  // Primary text
  text: '#3F4A67',
  textAlt: '#4F5B77',
  textDark: '#34405C',

  // Secondary / muted text
  textMuted: '#71809B',
  textMutedAlt: '#7F8DA7',
  textLabel: '#65738F',

  // Icon default
  icon: '#63728E',

  // WeChat brand
  wechatGreen: '#75C8A9',

  // Background
  bg: '#EAF5FF',

  // Glass
  glassBg: 'rgba(255,255,255,0.5)',
  glassBgLight: 'rgba(255,255,255,0.24)',
  glassBgHeavy: 'rgba(255,255,255,0.72)',

  // Gradient — primary button
  gradientStart: '#FFFFFF',
  gradientEnd: '#F4C8D7',

  // Gradient — character avatar
  avatarGradientStart: '#FFFFFF',
  avatarGradientEnd: '#D9EEFF',

  // Gradient — user avatar / glass card
  glassGradientStart: 'rgba(255,255,255,0.72)',
  glassGradientEnd: 'rgba(217,238,255,0.32)',

  // Gradient — app overlay background
  overlayStart: 'rgba(217,238,255,0.84)',
  overlayMid: 'rgba(248,252,255,0.9)',
  overlayEnd: 'rgba(242,215,230,0.78)',

  // Violet palette
  violet100: 'rgba(243,232,255,0.6)',
  violet200: '#e9d5ff',
  violet500: '#9BA7D8',
  violet700: '#6674B0',
  violet800: '#4D5E91',

  // Status colors
  green100: '#DDF4EE',
  green600: '#3B9B80',
  green800: '#2B6D5E',
  red100: 'rgba(254,226,226,0.6)',
  red400: '#FF3B30',
  red500: '#FF3B30',
  amber50: '#fffbeb',
  amber100: '#fef3c7',
  amber200: '#fde68a',
  amber700: '#b45309',
  amber800: '#92400e',
  amber900: '#78350f',
  blue100: '#dbeafe',
  blue600: '#4E87BE',
  purple100: '#f3e8ff',
  purple600: '#7682C7',

  // Bubble
  userBubbleStart: 'rgba(244,200,215,0.78)',
  userBubbleEnd: 'rgba(217,238,255,0.78)',
  charBubble: 'rgba(255,255,255,0.72)',
  transferBg: '#fa9d3b',
  redpacketBg: '#f05c48',
} as const;

export type ColorKey = keyof typeof Colors;
