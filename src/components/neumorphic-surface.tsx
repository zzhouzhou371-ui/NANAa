import { forwardRef, type ReactNode } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

export type NeumorphicDepth = 'flat' | 'raised' | 'raisedSmall' | 'inset';
export type NeumorphicShadowProfile = 'dark' | 'light';
export type NeumorphicTone =
  | 'mist'
  | 'soft'
  | 'accent'
  | 'base'
  | 'composer'
  | 'lavender'
  | 'pinkGold'
  | 'champagnePink'
  | 'berry'
  | 'searchBlush'
  | 'incoming'
  | 'outgoing'
  | 'redPacketSheet'
  | 'transferSheet'
  | 'redPacket'
  | 'transfer';

export const neumorphicPalette = {
  mist: '#C8BED8',
  soft: '#B6ACC9',
  accent: '#D9AABA',
  base: '#C0B7D2',
  composer: '#C8BED8',
  lavender: '#C0B7D2',
  pinkGold: '#D9AABA',
  champagnePink: '#DDB9C5',
  berry: '#96516A',
  onBerry: '#FFF9FF',
  searchBlush: '#D1B8C7',
  incoming: '#B2A8B8',
  outgoing: '#C9A7B7',
  redPacketSheet: '#D0A2AA',
  transferSheet: '#C5A98E',
  redPacket: '#8C596B',
  transfer: '#806254',
  onDarkPrimary: '#FFF9FF',
  onDarkSecondary: '#FCF5FE',
  onLightPrimary: '#302537',
  onLightSecondary: '#372E3F',
  ink: '#FFF9FF',
  inkMuted: '#FCF5FE',
  inkSoft: '#FCF5FE',
  relationship: '#F0B3AE',
  hairline: 'rgba(245, 238, 248, 0.18)',
} as const;

interface NeumorphicToneSpec {
  color: string;
  shadowProfile: NeumorphicShadowProfile;
}

export const neumorphicToneSpecs: Record<NeumorphicTone, NeumorphicToneSpec> = {
  mist: { color: neumorphicPalette.mist, shadowProfile: 'light' },
  soft: { color: neumorphicPalette.soft, shadowProfile: 'light' },
  accent: { color: neumorphicPalette.accent, shadowProfile: 'light' },
  base: { color: neumorphicPalette.base, shadowProfile: 'light' },
  composer: { color: neumorphicPalette.composer, shadowProfile: 'light' },
  lavender: { color: neumorphicPalette.lavender, shadowProfile: 'light' },
  pinkGold: { color: neumorphicPalette.pinkGold, shadowProfile: 'light' },
  champagnePink: { color: neumorphicPalette.champagnePink, shadowProfile: 'light' },
  berry: { color: neumorphicPalette.berry, shadowProfile: 'dark' },
  searchBlush: { color: neumorphicPalette.searchBlush, shadowProfile: 'light' },
  incoming: { color: neumorphicPalette.incoming, shadowProfile: 'light' },
  outgoing: { color: neumorphicPalette.outgoing, shadowProfile: 'light' },
  redPacketSheet: { color: neumorphicPalette.redPacketSheet, shadowProfile: 'light' },
  transferSheet: { color: neumorphicPalette.transferSheet, shadowProfile: 'light' },
  redPacket: { color: neumorphicPalette.redPacket, shadowProfile: 'dark' },
  transfer: { color: neumorphicPalette.transfer, shadowProfile: 'dark' },
};

const depthShadows: Record<NeumorphicShadowProfile, Record<NeumorphicDepth, string | undefined>> = {
  dark: {
    flat: undefined,
    raised:
      '-5px -5px 9px rgba(255,229,241,0.20), 8px 10px 16px rgba(11,6,17,0.48), 2px 3px 5px rgba(6,4,12,0.46)',
    raisedSmall:
      '-3px -3px 6px rgba(255,229,241,0.18), 4px 5px 8px rgba(11,6,17,0.40), 1px 2px 3px rgba(6,4,12,0.40)',
    inset:
      'inset 4px 4px 8px rgba(5,3,10,0.48), inset -3px -3px 7px rgba(255,230,241,0.20), inset 1px 1px 2px rgba(0,0,0,0.28)',
  },
  light: {
    flat: undefined,
    raised:
      '-5px -5px 9px rgba(255,252,255,0.38), 8px 10px 16px rgba(31,23,49,0.34), 2px 3px 5px rgba(31,23,49,0.38)',
    raisedSmall:
      '-3px -3px 6px rgba(255,252,255,0.31), 4px 5px 8px rgba(31,23,49,0.26), 1px 2px 3px rgba(31,23,49,0.32)',
    inset:
      'inset 4px 4px 8px rgba(42,31,54,0.28), inset -3px -3px 7px rgba(255,252,255,0.38), inset 1px 1px 2px rgba(31,23,42,0.20)',
  },
};

const surfaceGradients: Record<
  NeumorphicShadowProfile,
  Record<NeumorphicDepth, [string, string, string]>
> = {
  light: {
    raised: [
      'rgba(255,255,255,0.18)',
      'rgba(255,255,255,0.025)',
      'rgba(54,43,67,0.08)',
    ],
    raisedSmall: [
      'rgba(255,255,255,0.14)',
      'rgba(255,255,255,0.02)',
      'rgba(54,43,67,0.07)',
    ],
    flat: [
      'rgba(255,255,255,0.10)',
      'rgba(255,255,255,0.02)',
      'rgba(54,43,67,0.06)',
    ],
    inset: [
      'rgba(54,43,67,0.08)',
      'rgba(54,43,67,0.02)',
      'rgba(255,255,255,0.10)',
    ],
  },
  dark: {
    raised: [
      'rgba(255,255,255,0.10)',
      'rgba(255,255,255,0.02)',
      'rgba(10,5,14,0.20)',
    ],
    raisedSmall: [
      'rgba(255,255,255,0.08)',
      'rgba(255,255,255,0.015)',
      'rgba(10,5,14,0.16)',
    ],
    flat: [
      'rgba(255,255,255,0.05)',
      'rgba(255,255,255,0.01)',
      'rgba(10,5,14,0.10)',
    ],
    inset: [
      'rgba(3,2,8,0.18)',
      'rgba(3,2,8,0.04)',
      'rgba(255,255,255,0.07)',
    ],
  },
};

interface DirectionalRimAlpha {
  top: number;
  left: number;
  bottom: number;
  right: number;
  topIsHighlight: boolean;
}

const rimAlphas: Record<
  NeumorphicShadowProfile,
  Record<NeumorphicDepth, DirectionalRimAlpha>
> = {
  light: {
    raised: { top: 0.46, left: 0.29, bottom: 0.17, right: 0.14, topIsHighlight: true },
    raisedSmall: { top: 0.38, left: 0.25, bottom: 0.14, right: 0.12, topIsHighlight: true },
    flat: { top: 0.20, left: 0.14, bottom: 0.10, right: 0.09, topIsHighlight: true },
    inset: { top: 0.23, left: 0.18, bottom: 0.32, right: 0.24, topIsHighlight: false },
  },
  dark: {
    raised: { top: 0.24, left: 0.16, bottom: 0.42, right: 0.34, topIsHighlight: true },
    raisedSmall: { top: 0.20, left: 0.14, bottom: 0.36, right: 0.28, topIsHighlight: true },
    flat: { top: 0.12, left: 0.08, bottom: 0.22, right: 0.17, topIsHighlight: true },
    inset: { top: 0.44, left: 0.36, bottom: 0.18, right: 0.14, topIsHighlight: false },
  },
};

function rgba(rgb: string, alpha: number) {
  return `rgba(${rgb},${alpha})`;
}

function createDirectionalRimStyle(
  profile: NeumorphicShadowProfile,
  depth: NeumorphicDepth,
  multiplier: number,
): ViewStyle {
  const rim = rimAlphas[profile][depth];
  const highlightRgb = profile === 'light' ? '255,252,255' : '255,229,241';
  const shadowRgb = profile === 'light' ? '54,43,67' : '3,2,8';
  const topRgb = rim.topIsHighlight ? highlightRgb : shadowRgb;
  const bottomRgb = rim.topIsHighlight ? shadowRgb : highlightRgb;

  return {
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderTopColor: rgba(topRgb, rim.top * multiplier),
    borderLeftColor: rgba(topRgb, rim.left * multiplier),
    borderBottomColor: rgba(bottomRgb, rim.bottom * multiplier),
    borderRightColor: rgba(bottomRgb, rim.right * multiplier),
  };
}

export interface NeumorphicSurfaceProps extends Omit<ViewProps, 'children'> {
  children?: ReactNode;
  depth?: NeumorphicDepth;
  tone?: NeumorphicTone;
  shadowProfile?: NeumorphicShadowProfile;
  radius?: number;
  fill?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * Opaque soft material with directional depth. The shadow establishes
 * elevation, while the surface slope and two bevel rims keep the material
 * readable over detailed imagery on Android without blur, noise, or glass.
 */
export const NeumorphicSurface = forwardRef<View, NeumorphicSurfaceProps>(
  function NeumorphicSurface(
    {
      children,
      depth = 'raised',
      tone = 'mist',
      shadowProfile,
      radius = 18,
      fill = true,
      style,
      contentStyle,
      ...viewProps
    },
    ref,
  ) {
    const toneSpec = neumorphicToneSpecs[tone];
    const resolvedShadowProfile = shadowProfile ?? toneSpec.shadowProfile;
    const gradientColors = surfaceGradients[resolvedShadowProfile][depth];
    const outerRimStyle = createDirectionalRimStyle(resolvedShadowProfile, depth, 1);
    const innerRimStyle = createDirectionalRimStyle(resolvedShadowProfile, depth, 0.28);
    const innerRadius = Math.max(0, radius - 1);

    return (
      <View
        ref={ref}
        {...viewProps}
        style={[
          {
            position: 'relative',
            borderRadius: radius,
            borderCurve: 'continuous',
            backgroundColor: toneSpec.color,
            boxShadow: depthShadows[resolvedShadowProfile][depth],
          },
          style,
        ]}
      >
        <LinearGradient
          pointerEvents="none"
          colors={gradientColors}
          locations={[0, 0.48, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            StyleSheet.absoluteFillObject,
            {
              borderRadius: radius,
              borderCurve: 'continuous',
            },
          ]}
        />
        <View
          style={[
            {
              flex: fill ? 1 : undefined,
              minWidth: 0,
              borderRadius: radius,
              borderCurve: 'continuous',
            },
            contentStyle,
          ]}
        >
          {children}
        </View>
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            {
              borderRadius: radius,
              borderCurve: 'continuous',
            },
            outerRimStyle,
          ]}
        />
        <View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: 1,
              right: 1,
              bottom: 1,
              left: 1,
              borderRadius: innerRadius,
              borderCurve: 'continuous',
            },
            innerRimStyle,
          ]}
        />
      </View>
    );
  },
);
