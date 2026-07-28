import type { ImageSource } from 'expo-image';
import type { ChromeStyle, IconStyle, ThemeConfig, WallpaperId } from '../types';

export interface WallpaperDefinition {
  id: Exclude<WallpaperId, 'custom'>;
  previewSource: ImageSource | number;
  source: ImageSource | number | null;
}

export interface IconPackDefinition {
  id: IconStyle;
  previewSource: ImageSource | number;
}

export interface ChromeStyleDefinition {
  id: ChromeStyle;
}

export const WALLPAPER_OPTIONS: readonly WallpaperDefinition[] = [
  {
    id: 'system',
    previewSource: require('../../assets/backgrounds/time-cycle-v1/current-time-preview.jpg'),
    source: null,
  },
  {
    id: 'lavender-nocturne',
    previewSource: require('../../assets/backgrounds/theme-wallpapers/lavender-nocturne.png'),
    source: require('../../assets/backgrounds/theme-wallpapers/lavender-nocturne.png'),
  },
  {
    id: 'peach-quiet',
    previewSource: require('../../assets/backgrounds/theme-wallpapers/peach-quiet.png'),
    source: require('../../assets/backgrounds/theme-wallpapers/peach-quiet.png'),
  },
  {
    id: 'blue-hour',
    previewSource: require('../../assets/backgrounds/theme-wallpapers/blue-hour.png'),
    source: require('../../assets/backgrounds/theme-wallpapers/blue-hour.png'),
  },
] as const;

export const ICON_PACK_OPTIONS: readonly IconPackDefinition[] = [
  {
    id: 'system',
    previewSource: require('../../assets/generated/nana-app-icons-v3/master.png'),
  },
  {
    id: 'neumorphic-v1',
    previewSource: require('../../assets/generated/nana-neumorphic-icons-v1/master-kuromi.png'),
  },
] as const;

export const CHROME_STYLE_OPTIONS: readonly ChromeStyleDefinition[] = [
  { id: 'system' },
  { id: 'neumorphic-v1' },
] as const;

const WALLPAPER_IDS = new Set<WallpaperId>([
  'system',
  'lavender-nocturne',
  'peach-quiet',
  'blue-hour',
  'custom',
]);

const ICON_STYLES = new Set<IconStyle>(['system', 'neumorphic-v1']);
const CHROME_STYLES = new Set<ChromeStyle>(['system', 'neumorphic-v1']);

export const isWallpaperId = (value: unknown): value is WallpaperId => (
  typeof value === 'string' && WALLPAPER_IDS.has(value as WallpaperId)
);

export const isIconStyle = (value: unknown): value is IconStyle => (
  typeof value === 'string' && ICON_STYLES.has(value as IconStyle)
);

export const isChromeStyle = (value: unknown): value is ChromeStyle => (
  typeof value === 'string' && CHROME_STYLES.has(value as ChromeStyle)
);

export function resolveWallpaperSource(config: ThemeConfig): ImageSource | number | null {
  if (config.wallpaperId === 'custom') {
    return config.backgroundImage ? { uri: config.backgroundImage } : null;
  }
  return WALLPAPER_OPTIONS.find(option => option.id === config.wallpaperId)?.source ?? null;
}
