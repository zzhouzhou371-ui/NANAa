import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import {
  BlurTargetView,
  BlurView,
  type BlurTint,
} from 'expo-blur';
import {
  GlassContainer,
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
  type GlassStyle,
} from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';

export type ThickGlassVariant = 'row' | 'sheet' | 'input' | 'nav' | 'action';
export type ThickGlassTint = 'pearl' | 'peach' | 'apricot';
export type ThickGlassSharedMaterial = ThickGlassTint;

export interface ThickGlassSurfaceProps extends Omit<ViewProps, 'children'> {
  children?: ReactNode;
  variant?: ThickGlassVariant;
  tint?: ThickGlassTint;
  contentStyle?: StyleProp<ViewStyle>;
  nativeInteractive?: boolean;
  /**
   * Inherits the single fallback material painted by a ThickGlassContainer.
   * On iOS each GlassView remains intact so GlassContainer can merge them.
   */
  inheritMaterial?: boolean;
  /** Compatibility alias for inheritMaterial. */
  sharedMaterial?: boolean;
  /** @deprecated The material is continuous and no longer varies per item. */
  opticalSeed?: number;
}

export interface ThickGlassContainerProps extends Omit<ViewProps, 'children'> {
  children?: ReactNode;
  spacing?: number;
  /** Paints one fallback material behind inheriting descendants. */
  sharedMaterial?: ThickGlassSharedMaterial;
}

export interface ThickGlassBackdropProviderProps {
  children?: ReactNode;
}

export interface ThickGlassBackdropTargetProps
  extends Omit<ViewProps, 'children'> {
  children?: ReactNode;
}

type Rgb = readonly [number, number, number];
type GradientColors = [string, string, string];

interface ThickGlassVariantSpec {
  radius: number;
  surface: ViewStyle;
  content: ViewStyle;
  glassEffectStyle: GlassStyle;
  nativeInteractive: boolean;
  blurIntensity: number;
  blurReductionFactor: number;
  blurTint: BlurTint;
  tintOpacity: number;
  lightOpacity: number;
  depthOpacity: number;
  outlineOpacity: number;
  shadow: ViewStyle;
  webShadow?: ViewStyle;
  webBackdrop?: ViewStyle;
}

interface ThickGlassToneSpec {
  tint: Rgb;
  highlight: Rgb;
  depth: Rgb;
  reduced: Rgb;
  strength: number;
  nativeTint?: string;
}

interface ResolvedGlassMaterial {
  base: string;
  reducedBase: string;
  lighting: GradientColors;
  depth: GradientColors;
  outline: string;
  nativeTint?: string;
}

interface MediaQueryListLike {
  matches: boolean;
  addEventListener?: (
    type: 'change',
    listener: (event: { matches: boolean }) => void,
  ) => void;
  removeEventListener?: (
    type: 'change',
    listener: (event: { matches: boolean }) => void,
  ) => void;
}

const AndroidBlurTargetContext = createContext<RefObject<View | null> | null>(
  null,
);

const webStyle = (style: Record<string, string>): ViewStyle | undefined =>
  Platform.OS === 'web' ? (style as unknown as ViewStyle) : undefined;

const variantSpecs: Record<ThickGlassVariant, ThickGlassVariantSpec> = {
  row: {
    radius: 18,
    surface: {
      minHeight: 58,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    content: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
    },
    glassEffectStyle: 'clear',
    nativeInteractive: true,
    blurIntensity: 4,
    blurReductionFactor: 2,
    blurTint: 'default',
    tintOpacity: 0.018,
    lightOpacity: 0.055,
    depthOpacity: 0.055,
    outlineOpacity: 0.2,
    shadow: {
      boxShadow: '0 4px 8px rgba(2,6,18,0.12)',
    },
    webShadow: webStyle({ boxShadow: '0 6px 18px rgba(19,15,32,0.16)' }),
    webBackdrop: webStyle({
      backdropFilter: 'blur(8px) saturate(1.2) contrast(1.03)',
      WebkitBackdropFilter: 'blur(8px) saturate(1.2) contrast(1.03)',
    }),
  },
  sheet: {
    radius: 28,
    surface: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 24,
    },
    content: { width: '100%' },
    glassEffectStyle: 'regular',
    nativeInteractive: false,
    blurIntensity: 12,
    blurReductionFactor: 2,
    blurTint: 'default',
    tintOpacity: 0.026,
    lightOpacity: 0.075,
    depthOpacity: 0.085,
    outlineOpacity: 0.24,
    shadow: {
      boxShadow: '0 10px 20px rgba(2,6,18,0.16)',
    },
    webShadow: webStyle({ boxShadow: '0 18px 44px rgba(16,12,28,0.24)' }),
    webBackdrop: webStyle({
      backdropFilter: 'blur(16px) saturate(1.3) contrast(1.05)',
      WebkitBackdropFilter: 'blur(16px) saturate(1.3) contrast(1.05)',
    }),
  },
  input: {
    radius: 16,
    surface: {
      minHeight: 48,
      paddingHorizontal: 16,
      paddingVertical: 11,
    },
    content: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
    },
    glassEffectStyle: 'clear',
    nativeInteractive: false,
    blurIntensity: 5,
    blurReductionFactor: 2,
    blurTint: 'default',
    tintOpacity: 0.02,
    lightOpacity: 0.04,
    depthOpacity: 0.045,
    outlineOpacity: 0.16,
    shadow: {
      boxShadow: '0 2px 5px rgba(2,6,18,0.09)',
    },
    webShadow: webStyle({ boxShadow: '0 4px 14px rgba(19,15,32,0.12)' }),
    webBackdrop: webStyle({
      backdropFilter: 'blur(7px) saturate(1.18) contrast(1.03)',
      WebkitBackdropFilter: 'blur(7px) saturate(1.18) contrast(1.03)',
    }),
  },
  nav: {
    radius: 24,
    surface: {
      minHeight: 56,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    content: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    glassEffectStyle: 'clear',
    nativeInteractive: true,
    blurIntensity: 8,
    blurReductionFactor: 2,
    blurTint: 'default',
    tintOpacity: 0.02,
    lightOpacity: 0.06,
    depthOpacity: 0.065,
    outlineOpacity: 0.22,
    shadow: {
      boxShadow: '0 6px 12px rgba(2,6,18,0.14)',
    },
    webShadow: webStyle({ boxShadow: '0 10px 28px rgba(17,13,30,0.2)' }),
    webBackdrop: webStyle({
      backdropFilter: 'blur(11px) saturate(1.24) contrast(1.04)',
      WebkitBackdropFilter: 'blur(11px) saturate(1.24) contrast(1.04)',
    }),
  },
  action: {
    radius: 18,
    surface: {
      minHeight: 48,
      paddingHorizontal: 18,
      paddingVertical: 13,
    },
    content: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    glassEffectStyle: 'clear',
    nativeInteractive: true,
    blurIntensity: 6,
    blurReductionFactor: 2,
    blurTint: 'default',
    tintOpacity: 0.024,
    lightOpacity: 0.065,
    depthOpacity: 0.07,
    outlineOpacity: 0.22,
    shadow: {
      boxShadow: '0 4px 9px rgba(2,6,18,0.13)',
    },
    webShadow: webStyle({ boxShadow: '0 7px 20px rgba(19,13,29,0.2)' }),
    webBackdrop: webStyle({
      backdropFilter: 'blur(9px) saturate(1.25) contrast(1.04)',
      WebkitBackdropFilter: 'blur(9px) saturate(1.25) contrast(1.04)',
    }),
  },
};

const toneSpecs: Record<ThickGlassTint, ThickGlassToneSpec> = {
  pearl: {
    tint: [226, 222, 242],
    highlight: [255, 255, 255],
    depth: [31, 25, 49],
    reduced: [61, 55, 76],
    strength: 0.78,
    nativeTint: undefined,
  },
  peach: {
    tint: [221, 128, 157],
    highlight: [255, 235, 242],
    depth: [65, 25, 46],
    reduced: [91, 44, 64],
    strength: 1,
    nativeTint: 'rgba(221, 128, 157, 0.2)',
  },
  apricot: {
    tint: [230, 151, 91],
    highlight: [255, 239, 220],
    depth: [71, 32, 20],
    reduced: [101, 57, 34],
    strength: 1.04,
    nativeTint: 'rgba(230, 151, 91, 0.21)',
  },
};

function rgba(rgb: Rgb, alpha: number) {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function resolveMaterial(
  variant: ThickGlassVariant,
  tint: ThickGlassTint,
): ResolvedGlassMaterial {
  const variantSpec = variantSpecs[variant];
  const tone = toneSpecs[tint];

  return {
    base: rgba(tone.tint, variantSpec.tintOpacity * tone.strength),
    reducedBase: rgba(tone.reduced, 0.98),
    lighting: [
      rgba(tone.highlight, variantSpec.lightOpacity),
      rgba(tone.highlight, variantSpec.lightOpacity * 0.28),
      rgba(tone.highlight, 0),
    ],
    depth: [
      rgba(tone.depth, 0),
      rgba(tone.depth, variantSpec.depthOpacity * 0.24),
      rgba(tone.depth, variantSpec.depthOpacity),
    ],
    outline: rgba(tone.highlight, variantSpec.outlineOpacity),
    nativeTint: tone.nativeTint,
  };
}

function getWebTransparencyQuery(): MediaQueryListLike | null {
  if (Platform.OS !== 'web') return null;

  const matchMedia = (
    globalThis as typeof globalThis & {
      matchMedia?: (query: string) => MediaQueryListLike;
    }
  ).matchMedia;

  return matchMedia?.('(prefers-reduced-transparency: reduce)') ?? null;
}

function useReduceTransparency() {
  const [reduceTransparency, setReduceTransparency] = useState<boolean | null>(
    () => {
      if (Platform.OS === 'ios') return null;
      if (Platform.OS === 'web') {
        return getWebTransparencyQuery()?.matches ?? false;
      }
      // Android does not expose the iOS reduce-transparency setting. Keeping
      // this false enables the SDK 55 BlurView path when a target is present.
      return Platform.OS !== 'android';
    },
  );

  useEffect(() => {
    if (Platform.OS === 'web') {
      const query = getWebTransparencyQuery();
      if (!query) return undefined;

      const handleChange = (event: { matches: boolean }) => {
        setReduceTransparency(event.matches);
      };
      query.addEventListener?.('change', handleChange);

      return () => query.removeEventListener?.('change', handleChange);
    }

    if (Platform.OS !== 'ios') return undefined;

    let mounted = true;
    void AccessibilityInfo.isReduceTransparencyEnabled()
      .then(value => {
        if (mounted) setReduceTransparency(value);
      })
      .catch(() => {
        if (mounted) setReduceTransparency(true);
      });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      setReduceTransparency,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceTransparency;
}

function canRenderNativeGlass(reduceTransparency: boolean | null) {
  if (Platform.OS !== 'ios' || reduceTransparency !== false) return false;

  try {
    return isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

function resolveRadius(style: StyleProp<ViewStyle>, fallback: number) {
  const flattened = StyleSheet.flatten(style);
  return typeof flattened?.borderRadius === 'number'
    ? flattened.borderRadius
    : fallback;
}

function MaterialLayers({
  variant,
  tint,
  radius,
  reduced,
  hidden = false,
}: {
  variant: ThickGlassVariant;
  tint: ThickGlassTint;
  radius: number;
  reduced: boolean;
  hidden?: boolean;
}) {
  const blurTarget = useContext(AndroidBlurTargetContext);

  if (hidden) return null;

  const variantSpec = variantSpecs[variant];
  const material = resolveMaterial(variant, tint);
  const canBlurAndroid =
    Platform.OS === 'android' && !reduced && blurTarget !== null;

  return (
    <View
      pointerEvents="none"
      accessible={false}
      style={[StyleSheet.absoluteFill, styles.materialClip, { borderRadius: radius }]}
    >
      {canBlurAndroid ? (
        <BlurView
          blurTarget={blurTarget}
          blurMethod="dimezisBlurViewSdk31Plus"
          blurReductionFactor={variantSpec.blurReductionFactor}
          intensity={variantSpec.blurIntensity}
          tint={variantSpec.blurTint}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: reduced
              ? material.reducedBase
              : material.base,
          },
        ]}
      />

      {!reduced ? (
        <>
          <LinearGradient
            colors={material.lighting}
            locations={[0, 0.36, 1]}
            start={{ x: 0.06, y: 0 }}
            end={{ x: 0.9, y: 0.92 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={material.depth}
            locations={[0, 0.62, 1]}
            start={{ x: 0.5, y: 0.12 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['transparent', material.outline, 'transparent']}
            locations={[0, 0.48, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.topHighlight}
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              styles.outline,
              { borderColor: material.outline, borderRadius: radius },
            ]}
          />
        </>
      ) : null}
    </View>
  );
}

/**
 * Owns the one shared Android BlurTargetView ref used by every glass surface
 * in its subtree. Pair it with exactly one ThickGlassBackdropTarget.
 */
export function ThickGlassBackdropProvider({
  children,
}: ThickGlassBackdropProviderProps) {
  const blurTarget = useRef<View | null>(null);

  return (
    <AndroidBlurTargetContext.Provider value={blurTarget}>
      {children}
    </AndroidBlurTargetContext.Provider>
  );
}

/**
 * Marks the visual backdrop that Android BlurViews sample. It is a normal View
 * on iOS and web, so the app shell can use one cross-platform composition.
 */
export function ThickGlassBackdropTarget({
  children,
  ...viewProps
}: ThickGlassBackdropTargetProps) {
  const blurTarget = useContext(AndroidBlurTargetContext);

  if (Platform.OS === 'android' && blurTarget) {
    return (
      <BlurTargetView ref={blurTarget} {...viewProps}>
        {children}
      </BlurTargetView>
    );
  }

  return <View {...viewProps}>{children}</View>;
}

export const ThickGlassContainer = forwardRef<View, ThickGlassContainerProps>(
  function ThickGlassContainer(
    { children, spacing, sharedMaterial, style, ...viewProps },
    ref,
  ) {
    const reduceTransparency = useReduceTransparency();
    const native = canRenderNativeGlass(reduceTransparency);
    const reduced = reduceTransparency === true;

    if (native) {
      return (
        <GlassContainer
          ref={ref}
          spacing={spacing}
          {...viewProps}
          style={style}
        >
          {children}
        </GlassContainer>
      );
    }

    const radius = resolveRadius(style, variantSpecs.sheet.radius);
    const sharedVariant: ThickGlassVariant = 'row';
    const variantSpec = variantSpecs[sharedVariant];

    return (
      <View
        ref={ref}
        {...viewProps}
        style={[
          styles.surfaceHost,
          sharedMaterial ? variantSpec.shadow : null,
          sharedMaterial ? variantSpec.webShadow : null,
          Platform.OS === 'web' && sharedMaterial && !reduced
            ? variantSpec.webBackdrop
            : null,
          Platform.OS === 'web' && sharedMaterial
            ? styles.webMaterialClip
            : null,
          style,
        ]}
      >
        {sharedMaterial ? (
          <MaterialLayers
            variant={sharedVariant}
            tint={sharedMaterial}
            radius={radius}
            reduced={reduced}
          />
        ) : null}
        {children}
      </View>
    );
  },
);

export const ThickGlassSurface = forwardRef<View, ThickGlassSurfaceProps>(
  function ThickGlassSurface(
    {
      children,
      variant = 'row',
      tint = 'pearl',
      contentStyle,
      nativeInteractive,
      inheritMaterial = false,
      sharedMaterial = false,
      opticalSeed,
      style,
      ...viewProps
    },
    ref,
  ) {
    void opticalSeed;

    const reduceTransparency = useReduceTransparency();
    const native = canRenderNativeGlass(reduceTransparency);
    const reduced = reduceTransparency === true;
    const variantSpec = variantSpecs[variant];
    const material = resolveMaterial(variant, tint);
    const inheritsFallbackMaterial =
      !native && (inheritMaterial || sharedMaterial);
    const radius = resolveRadius(style, variantSpec.radius);
    const surfaceStyle: StyleProp<ViewStyle> = [
      styles.surfaceHost,
      variantSpec.surface,
      { borderRadius: radius },
      !inheritsFallbackMaterial ? variantSpec.shadow : null,
      !inheritsFallbackMaterial ? variantSpec.webShadow : null,
      Platform.OS === 'web' && !reduced && !inheritsFallbackMaterial
        ? variantSpec.webBackdrop
        : null,
      Platform.OS === 'web' && !inheritsFallbackMaterial
        ? styles.webMaterialClip
        : null,
      style,
    ];
    const content =
      children === undefined || children === null ? null : (
        <View style={[styles.content, variantSpec.content, contentStyle]}>
          {children}
        </View>
      );

    if (native) {
      return (
        <GlassView
          ref={ref}
          {...viewProps}
          colorScheme="auto"
          glassEffectStyle={variantSpec.glassEffectStyle}
          isInteractive={
            nativeInteractive ?? variantSpec.nativeInteractive
          }
          tintColor={material.nativeTint}
          style={surfaceStyle}
        >
          {content}
        </GlassView>
      );
    }

    return (
      <View ref={ref} {...viewProps} style={surfaceStyle}>
        <MaterialLayers
          variant={variant}
          tint={tint}
          radius={radius}
          reduced={reduced}
          hidden={inheritsFallbackMaterial}
        />
        {content}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  surfaceHost: {
    position: 'relative',
    borderWidth: 0,
    borderCurve: 'continuous',
  },
  materialClip: {
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  content: {
    position: 'relative',
    zIndex: 1,
    flexShrink: 1,
  },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: '10%',
    width: '48%',
    height: StyleSheet.hairlineWidth,
  },
  outline: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  webMaterialClip: {
    overflow: 'hidden',
  },
});
