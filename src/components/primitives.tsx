import React, { type ReactNode } from 'react';
import { StyleSheet, View, Text, Pressable, TextInput, type PressableProps, type ViewStyle, type StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { crystalGlass, palette } from '../constants/design';

// ── Types ──

type GradientDirection = 'to-r' | 'to-br' | 'to-b' | 'to-bl' | 'to-l' | 'to-tl' | 'to-t' | 'to-tr';

const directionMap: Record<GradientDirection, { start: { x: number; y: number }; end: { x: number; y: number } }> = {
  'to-r':  { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
  'to-br': { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  'to-b':  { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
  'to-bl': { start: { x: 1, y: 0 }, end: { x: 0, y: 1 } },
  'to-l':  { start: { x: 1, y: 0 }, end: { x: 0, y: 0 } },
  'to-tl': { start: { x: 1, y: 1 }, end: { x: 0, y: 0 } },
  'to-t':  { start: { x: 0, y: 1 }, end: { x: 0, y: 0 } },
  'to-tr': { start: { x: 0, y: 1 }, end: { x: 1, y: 0 } },
};

const PRESS_EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);

// ── AnimatedPressable ──

interface AnimatedPressableProps extends Pick<
  PressableProps,
  'accessible' | 'accessibilityRole' | 'accessibilityLabel' | 'accessibilityHint' | 'accessibilityState' | 'hitSlop'
> {
  onPress?: () => void;
  onLongPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  disabled?: boolean;
  scale?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  className?: string;
  testID?: string;
}

export function AnimatedPressable({
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  disabled = false,
  scale = 0.98,
  children,
  style,
  className,
  testID,
  accessible,
  accessibilityRole,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  hitSlop = 4,
}: AnimatedPressableProps) {
  const reducedMotion = useReducedMotion();
  const pressedScale = Math.max(0.97, Math.min(1, scale));
  const scaleValue = useSharedValue(1);
  const animatedScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleValue.value }],
  }));
  const classes = className?.split(/\s+/) ?? [];
  const flat = StyleSheet.flatten(style) || {};
  const wrapperStyle: StyleProp<ViewStyle> = [
    classes.includes('flex-1') ? { flex: 1 } : null,
    classes.includes('w-full') ? { width: '100%' as const } : null,
    classes.includes('w-1/2') ? { width: '50%' as const } : null,
    classes.includes('w-1/3') ? { width: '33.333333%' as const } : null,
    classes.includes('w-1/4') ? { width: '25%' as const } : null,
    classes.includes('w-1/5') ? { width: '20%' as const } : null,
    {
      flex: flat.flex,
      flexGrow: flat.flexGrow,
      flexShrink: flat.flexShrink,
      flexBasis: flat.flexBasis,
      width: flat.width,
      height: flat.height,
      minWidth: flat.minWidth,
      maxWidth: flat.maxWidth,
      minHeight: flat.minHeight,
      maxHeight: flat.maxHeight,
      alignSelf: flat.alignSelf,
      position: flat.position,
      top: flat.top,
      right: flat.right,
      bottom: flat.bottom,
      left: flat.left,
      zIndex: flat.zIndex,
      margin: flat.margin,
      marginHorizontal: flat.marginHorizontal,
      marginVertical: flat.marginVertical,
      marginTop: flat.marginTop,
      marginRight: flat.marginRight,
      marginBottom: flat.marginBottom,
      marginLeft: flat.marginLeft,
    },
  ];

  const pressableStyle = [
    style as any,
    {
      // Only fill the wrapper when the caller explicitly requested flex.
      // Making every height-less pressable flex: 1 stretches compact buttons
      // into full-height columns on Android (for example the Preset delete pill).
      flex: classes.includes('flex-1') || flat.flex != null ? 1 : undefined,
      width: flat.width != null || classes.some(item => item.startsWith('w-')) ? '100%' : undefined,
      height: flat.height != null ? '100%' : undefined,
      position: 'relative' as const,
      top: undefined,
      right: undefined,
      bottom: undefined,
      left: undefined,
      margin: 0,
      marginHorizontal: 0,
      marginVertical: 0,
      marginTop: 0,
      marginRight: 0,
      marginBottom: 0,
      marginLeft: 0,
    },
  ];

  return (
    <Animated.View
      style={[wrapperStyle, animatedScaleStyle]}
    >
      <Pressable
        testID={testID}
        accessible={accessible}
        accessibilityRole={accessibilityRole ?? (onPress || onLongPress || onPressIn ? 'button' : undefined)}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={accessibilityState ?? (disabled ? { disabled: true } : undefined)}
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={() => {
          scaleValue.value = withTiming(
            disabled || reducedMotion ? 1 : pressedScale,
            { duration: reducedMotion ? 0 : 80, easing: PRESS_EASE_OUT },
          );
          onPressIn?.();
        }}
        onPressOut={() => {
          scaleValue.value = withTiming(1, {
            duration: reducedMotion ? 0 : 140,
            easing: PRESS_EASE_OUT,
          });
          onPressOut?.();
        }}
        disabled={disabled}
        style={pressableStyle}
        className={className}
        hitSlop={hitSlop}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

// ── GradientButton ──

type GradientButtonVariant = 'primary' | 'ghost' | 'danger' | 'green';

const variantColors: Record<GradientButtonVariant, [string, string]> = {
  primary: [palette.accentSoft, palette.crystalBlue],
  ghost: ['rgba(255,255,255,0.64)', 'rgba(217,238,255,0.28)'],
  danger: ['#FF3B30', '#e02d25'],
  green: [palette.green, '#52A990'],
};

interface GradientButtonProps {
  onPress?: () => void;
  disabled?: boolean;
  variant?: GradientButtonVariant;
  borderRadius?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function GradientButton({
  onPress,
  disabled = false,
  variant = 'primary',
  borderRadius = 18,
  children,
  style,
}: GradientButtonProps) {
  const colors = variantColors[variant];
  const reducedMotion = useReducedMotion();
  const scaleValue = useSharedValue(1);
  const animatedScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleValue.value }],
  }));
  const flattenedStyle = style as ViewStyle | undefined;

  return (
    <Animated.View
      style={[{
        flex: flattenedStyle?.flex,
        width: flattenedStyle?.width,
        alignSelf: flattenedStyle?.alignSelf,
      }, animatedScaleStyle]}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[{ borderRadius, overflow: 'hidden', opacity: disabled ? 0.5 : 1, minHeight: 42 }, style as any]}
      >
        <Pressable
          onPress={onPress}
          disabled={disabled}
          onPressIn={() => {
            scaleValue.value = withTiming(
              disabled || reducedMotion ? 1 : 0.98,
              { duration: reducedMotion ? 0 : 80, easing: PRESS_EASE_OUT },
            );
          }}
          onPressOut={() => {
            scaleValue.value = withTiming(1, {
              duration: reducedMotion ? 0 : 140,
              easing: PRESS_EASE_OUT,
            });
          }}
          style={{
            flex: 1,
            paddingHorizontal: 20,
            paddingVertical: 10,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {children}
        </Pressable>
      </LinearGradient>
    </Animated.View>
  );
}

// ── GlassView ──

type GlassIntensity = 'light' | 'medium' | 'heavy';

const glassBg: Record<GlassIntensity, string> = {
  light: 'rgba(255,249,245,0.52)',
  medium: 'rgba(255,249,245,0.74)',
  heavy: 'rgba(255,249,245,0.9)',
};

const glassColors: Record<GlassIntensity, [string, string, string, string]> = {
  light: ['rgba(255,252,248,0.68)', 'rgba(238,218,222,0.32)', 'rgba(198,207,226,0.2)', glassBg.light],
  medium: ['rgba(255,252,248,0.9)', 'rgba(240,220,221,0.62)', 'rgba(209,215,231,0.38)', glassBg.medium],
  heavy: ['rgba(255,253,250,0.96)', 'rgba(242,220,221,0.76)', 'rgba(218,222,234,0.5)', glassBg.heavy],
};

interface GlassViewProps {
  children: ReactNode;
  intensity?: GlassIntensity;
  style?: StyleProp<ViewStyle>;
  className?: string;
  noShadow?: boolean;
}

export function GlassView({
  children,
  intensity = 'medium',
  style,
  className,
  noShadow = true,
}: GlassViewProps) {
  return (
    <NativeGradient
      direction="to-br"
      colors={glassColors[intensity]}
      borderRadius={18}
      className={className}
      style={[
        {
          borderRadius: 18,
          padding: 16,
          borderWidth: 0.75,
          borderColor: crystalGlass.edge,
          overflow: 'hidden',
        },
        !noShadow && {
          shadowColor: crystalGlass.shadow,
          shadowOffset: { width: 0, height: 5 },
          shadowOpacity: 0.1,
          shadowRadius: 7,
          elevation: 2,
        },
        style as any,
      ]}
    >
      {children}
    </NativeGradient>
  );
}

// ── NativeGradient ──

interface NativeGradientProps {
  direction?: GradientDirection;
  colors: [string, string, ...string[]];
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
  className?: string;
}

export function NativeGradient({
  direction = 'to-br',
  colors,
  children,
  style,
  borderRadius = 0,
  className,
}: NativeGradientProps) {
  const { start, end } = directionMap[direction];

  return (
    <LinearGradient
      className={className}
      colors={colors}
      start={start}
      end={end}
      style={[{ borderRadius, overflow: 'hidden' }, style as any]}
    >
      {children}
    </LinearGradient>
  );
}

// ── Input ──

interface InputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  type?: string;
  secureTextEntry?: boolean;
}

export function Input({ label, placeholder, value, onChange, multiline, secureTextEntry = false }: InputProps) {
  return (
    <View style={{ marginBottom: 16 }}>
      {label ? <Text style={{ color: palette.inkMuted, fontSize: 12, fontWeight: '700', marginBottom: 8, paddingHorizontal: 4 }}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={palette.inkSoft}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        autoCapitalize={secureTextEntry ? 'none' : undefined}
        autoCorrect={secureTextEntry ? false : undefined}
        autoComplete={secureTextEntry ? 'off' : undefined}
        textContentType={secureTextEntry ? 'none' : undefined}
        importantForAutofill={secureTextEntry ? 'no' : undefined}
        style={{
          width: '100%',
          minHeight: multiline ? 104 : 46,
          borderRadius: 14,
          paddingHorizontal: 16,
          paddingVertical: multiline ? 12 : 10,
          backgroundColor: palette.whiteGlassStrong,
          borderWidth: 0.75,
          borderColor: crystalGlass.edge,
          color: palette.ink,
          fontSize: 15,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}
