import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import { Image as ExpoImage, type ImageSource } from 'expo-image';
import { MotiView } from 'moti';
import { NativeGradient } from '../primitives';
import { useNanaStore } from '../../stores/nanaStore';

type SkyPhase = 'dawn' | 'day' | 'dusk' | 'night';
type SkyVariant = 'home' | 'app';

const SKY_IMAGES: Record<SkyPhase, number> = {
  dawn: require('../../../assets/backgrounds/time-cycle-v1/dawn.png'),
  day: require('../../../assets/backgrounds/time-cycle-v1/noon.png'),
  dusk: require('../../../assets/backgrounds/time-cycle-v1/dusk.png'),
  night: require('../../../assets/backgrounds/time-cycle-v1/night.png'),
};

const THEME_WALLPAPERS = {
  'lavender-nocturne': require('../../../assets/backgrounds/theme-wallpapers/lavender-nocturne.png'),
  'peach-quiet': require('../../../assets/backgrounds/theme-wallpapers/peach-quiet.png'),
  'blue-hour': require('../../../assets/backgrounds/theme-wallpapers/blue-hour.png'),
} satisfies Record<string, number>;

type ThemeWallpaperId = keyof typeof THEME_WALLPAPERS;

const SKY_PHASES: SkyPhase[] = ['dawn', 'day', 'dusk', 'night'];
const PHASE_ANCHORS = [5.75, 12.5, 18.25, 23.25];
const SKY_FALLBACK = ['#10192E', '#25304B', '#5B4965', '#1A203A'] as [string, string, string, string];

function readLocalHour() {
  const now = new Date();
  return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
}

function homeWallpaperScrim(wallpaperId: string) {
  if (wallpaperId === 'peach-quiet') return 'rgba(8, 11, 29, 0.14)';
  if (wallpaperId === 'blue-hour') return 'rgba(8, 11, 29, 0.10)';
  if (wallpaperId === 'lavender-nocturne') return 'rgba(8, 11, 29, 0.06)';
  if (wallpaperId === 'custom') return 'rgba(8, 11, 29, 0.12)';
  return null;
}

function useLocalHour(active: boolean) {
  const [hour, setHour] = useState(readLocalHour);

  useEffect(() => {
    if (!active) return undefined;
    setHour(readLocalHour());
    const timer = setInterval(() => setHour(readLocalHour()), 30_000);
    return () => clearInterval(timer);
  }, [active]);

  return hour;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => subscription.remove();
  }, []);

  return reduced;
}

function skyWeights(localHour: number): Record<SkyPhase, number> {
  let hour = localHour;
  if (hour < PHASE_ANCHORS[0]) hour += 24;

  const anchors = [...PHASE_ANCHORS, PHASE_ANCHORS[0] + 24];
  const weights: Record<SkyPhase, number> = { dawn: 0, day: 0, dusk: 0, night: 0 };

  for (let index = 0; index < SKY_PHASES.length; index += 1) {
    const start = anchors[index];
    const end = anchors[index + 1];
    if (hour >= start && hour <= end) {
      const progress = (hour - start) / (end - start);
      weights[SKY_PHASES[index]] = 1 - progress;
      weights[SKY_PHASES[(index + 1) % SKY_PHASES.length]] = progress;
      break;
    }
  }

  return weights;
}

interface SkySceneProps {
  active?: boolean;
  variant?: SkyVariant;
  overrideHour?: number | null;
}

/** One shared sky environment for the desktop and every app surface. */
export function SkyScene({ active = true, variant = 'home', overrideHour = null }: SkySceneProps) {
  const localHour = useLocalHour(active);
  const effectiveHour = overrideHour ?? localHour;
  const reducedMotion = useReducedMotion();
  const wallpaperId = useNanaStore(state => state.themeConfig.wallpaperId);
  const backgroundImage = useNanaStore(state => state.themeConfig.backgroundImage);
  const wallpaperKey = `${wallpaperId}:${backgroundImage}`;
  const [failedWallpaperKey, setFailedWallpaperKey] = useState('');
  // Full-screen ambient transforms are expensive on Android emulators and
  // low/mid-range devices. Preserve the blended sky but keep it static there.
  const staticScene = reducedMotion || Platform.OS === 'android' || !active;
  const weights = useMemo(() => skyWeights(effectiveHour), [effectiveHour]);
  const visiblePhases = useMemo(
    () => SKY_PHASES.filter(skyPhase => weights[skyPhase] > 0.001),
    [weights],
  );
  const selectedWallpaper = useMemo<ImageSource | number | null>(() => {
    const bundledWallpaper = THEME_WALLPAPERS[wallpaperId as ThemeWallpaperId];
    if (bundledWallpaper) return bundledWallpaper;

    const customUri = typeof backgroundImage === 'string' ? backgroundImage.trim() : '';
    if (wallpaperId === 'custom' && customUri) return { uri: customUri };
    return null;
  }, [backgroundImage, wallpaperId]);
  const canShowSelectedWallpaper = !!selectedWallpaper && failedWallpaperKey !== wallpaperKey;
  const homeScrimColor = variant === 'home' && canShowSelectedWallpaper
    ? homeWallpaperScrim(wallpaperId)
    : null;
  const needsPeachReadabilityBoost = canShowSelectedWallpaper && wallpaperId === 'peach-quiet';

  return (
    <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
      <NativeGradient direction="to-b" colors={SKY_FALLBACK} style={StyleSheet.absoluteFill}>
        <View />
      </NativeGradient>

      {visiblePhases.map((skyPhase) => {
        const phaseIndex = SKY_PHASES.indexOf(skyPhase);
        return (
          <MotiView
            key={skyPhase}
            from={{
              opacity: weights[skyPhase],
              scale: staticScene ? 1.01 : 1.045,
              translateX: staticScene ? 0 : phaseIndex % 2 === 0 ? -12 : 10,
              translateY: staticScene ? 0 : 6,
            }}
            animate={{
              opacity: weights[skyPhase],
              scale: staticScene ? 1.01 : 1.075,
              translateX: staticScene ? 0 : phaseIndex % 2 === 0 ? 12 : -10,
              translateY: staticScene ? 0 : -10,
            }}
            transition={{
              opacity: { type: 'timing', duration: staticScene ? 0 : 1400 },
              scale: { type: 'timing', duration: 13_000, loop: !staticScene, repeatReverse: true },
              translateX: { type: 'timing', duration: 17_000, loop: !staticScene, repeatReverse: true },
              translateY: { type: 'timing', duration: 14_000, loop: !staticScene, repeatReverse: true },
            }}
            style={StyleSheet.absoluteFillObject}
          >
            <ExpoImage
              source={SKY_IMAGES[skyPhase]}
              contentFit="cover"
              cachePolicy="memory-disk"
              style={StyleSheet.absoluteFillObject}
            />
          </MotiView>
        );
      })}

      {canShowSelectedWallpaper ? (
        <ExpoImage
          key={wallpaperKey}
          source={selectedWallpaper}
          contentFit="cover"
          contentPosition="center"
          cachePolicy="memory-disk"
          priority="high"
          transition={0}
          onError={() => setFailedWallpaperKey(wallpaperKey)}
          style={StyleSheet.absoluteFillObject}
        />
      ) : null}

      {homeScrimColor ? (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: homeScrimColor }]} />
      ) : null}

      {needsPeachReadabilityBoost ? (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(8, 11, 29, 0.04)' }]} />
      ) : null}

      {variant === 'app' ? (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(7, 12, 29, 0.14)' }]} />
      ) : null}
    </View>
  );
}
