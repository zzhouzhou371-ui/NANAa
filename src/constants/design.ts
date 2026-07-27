/**
 * Nana's reusable visual language. The screen environment changes in SkyScene;
 * these tokens are the steady, readable materials that sit within that sky.
 */
export const palette = {
  canvas: '#1D1B32',
  canvasAlt: '#F9F1EC',
  ink: '#352B40',
  inkMuted: '#776A7A',
  inkSoft: '#A598A6',
  brown: '#584355',
  green: '#6F9C89',
  mint: '#E2EEE8',
  pink: '#E6B6B9',
  blue: '#B8C7DC',
  coral: '#C96F73',
  yellow: '#E7BE86',
  purple: '#B8A6C6',
  whiteGlass: 'rgba(255, 249, 245, 0.72)',
  whiteGlassStrong: 'rgba(255, 249, 245, 0.92)',
  line: 'rgba(81, 58, 79, 0.12)',
  crystalTop: '#F6DDD2',
  crystalMid: '#EAD4D5',
  crystalBottom: '#B9B4D0',
  crystalBlue: '#839ABF',
  crystalPink: '#CD8997',
  cloud: '#FFF9F4',
  cloudShade: '#E9DFE0',
  cloudShadow: 'rgba(36, 28, 52, 0.18)',
  accent: '#A95770',
  accentSoft: '#E7B8BA',
  callNight: '#10182D',
  callDusk: '#423657',
  surface: '#FFF9F5',
  surfaceMuted: '#F2E8E7',
  skyLine: 'rgba(74, 50, 77, 0.16)',
};

export const crystalGlass = {
  panel: ['rgba(255, 250, 246, 0.88)', 'rgba(246, 225, 220, 0.7)'] as [string, string],
  panelBlue: ['rgba(254, 250, 247, 0.9)', 'rgba(218, 225, 238, 0.72)'] as [string, string],
  panelRose: ['rgba(255, 250, 247, 0.9)', 'rgba(244, 216, 213, 0.72)'] as [string, string],
  dock: ['rgba(255, 248, 243, 0.88)', 'rgba(231, 209, 217, 0.78)'] as [string, string],
  control: ['rgba(255, 250, 247, 0.94)', 'rgba(235, 219, 222, 0.82)'] as [string, string],
  edge: 'rgba(74, 50, 77, 0.12)',
  edgeStrong: 'rgba(255, 255, 255, 0.78)',
  blushEdge: 'rgba(180, 103, 123, 0.22)',
  blueEdge: 'rgba(101, 127, 165, 0.18)',
  track: 'rgba(104, 77, 99, 0.1)',
  shadow: '#49384E',
};

export const radius = {
  sm: 12,
  md: 18,
  lg: 22,
  xl: 28,
};

export const shadow = {
  soft: {
    shadowColor: palette.cloudShadow,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  tight: {
    shadowColor: palette.cloudShadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 1,
  },
  inset: {
    shadowColor: '#765B74',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 0,
  },
};
