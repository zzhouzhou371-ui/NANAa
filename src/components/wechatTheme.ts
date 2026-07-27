export const wechatTheme = {
  ink: '#F8EDF1',
  inkMuted: '#D9C8CF',
  inkSoft: '#B7A4AD',
  peach: '#E7A0AF',
  rose: '#CA7F96',
  memory: '#BEA9C1',
  money: '#D7A878',
  navy: '#171018',
  navyRaised: '#2A1B24',
  line: 'rgba(255, 224, 233, 0.15)',
  specular: 'rgba(255, 240, 245, 0.09)',
  surface: 'rgba(21, 13, 21, 0.82)',
  surfaceRaised: 'rgba(40, 25, 35, 0.90)',
  surfaceWarm: 'rgba(86, 45, 62, 0.84)',
  composer: 'rgba(13, 8, 14, 0.88)',
  incoming: 'rgba(23, 15, 25, 0.84)',
  outgoing: 'rgba(87, 46, 63, 0.86)',
  redPacket: 'rgba(133, 55, 76, 0.92)',
  transfer: 'rgba(132, 77, 64, 0.92)',
  lightSurface: 'rgba(244, 234, 238, 0.78)',
  lightInk: '#3F405C',
  lightMuted: '#74738D',
  success: '#9CD5AD',
};

export const wechatLayout = {
  screenGutter: 16,
  sectionGap: 18,
  heroRadius: 20,
  heroMinHeight: 188,
  rowRadius: 18,
  rowMinHeight: 82,
  avatarSize: 52,
} as const;

export const wechatSurface = {
  borderWidth: 0.75,
  borderColor: wechatTheme.line,
  backgroundColor: wechatTheme.surface,
};
