import { type ReactNode } from 'react';
import { View, Text } from 'react-native';
import { Image as ExpoImage, type ImageSource } from 'expo-image';
import { AnimatedPressable, NativeGradient } from '../primitives';
import { palette, shadow } from '../../constants/design';

const DISABLED_LABEL_OPACITY = 0.72;

interface AppGridIconProps {
  label: string;
  icon: ReactNode;
  colors: [string, string, ...string[]];
  onPress: () => void;
  disabled?: boolean;
  assetPreview?: ImageSource | number;
  compact?: boolean;
  comingSoonLabel: string;
}

export function AppGridIcon({ label, icon, colors, onPress, disabled = false, assetPreview, compact = false, comingSoonLabel }: AppGridIconProps) {
  const fallbackOpacity = disabled ? 0.6 : 1;
  const labelOpacity = disabled ? DISABLED_LABEL_OPACITY : 1;

  return (
    <AnimatedPressable
      accessibilityLabel={`${label}${disabled ? `, ${comingSoonLabel}` : ''}`}
      accessibilityState={{ disabled }}
      onPress={onPress}
      scale={0.9}
      style={{ width: compact ? 78 : 90, height: compact ? 82 : 104, alignItems: 'center' }}
    >
      <View style={{ width: compact ? 78 : 90, height: compact ? 60 : 78, alignItems: 'center', justifyContent: 'center' }}>
        {assetPreview ? (
          <ExpoImage
            source={assetPreview}
            contentFit="contain"
            contentPosition="center"
            cachePolicy="memory-disk"
            priority="high"
            transition={140}
            style={{ width: compact ? 88 : 112, height: compact ? 76 : 96 }}
          />
        ) : (
          <View style={{ width: 84, height: 72, alignItems: 'center', justifyContent: 'center', opacity: fallbackOpacity }}>
            <View style={[{ width: 70, height: 56, position: 'relative' }, shadow.tight]}>
              <NativeGradient
                direction="to-br"
                colors={[palette.cloud, palette.cloudShade]}
                borderRadius={999}
                style={{ position: 'absolute', left: 6, bottom: 9, width: 58, height: 32 }}
              >
                <View />
              </NativeGradient>
              <NativeGradient
                direction="to-br"
                colors={[palette.cloud, palette.cloudShade]}
                borderRadius={999}
                style={{ position: 'absolute', left: 2, bottom: 13, width: 30, height: 30 }}
              >
                <View />
              </NativeGradient>
              <NativeGradient
                direction="to-br"
                colors={[palette.cloud, '#F1E5E2']}
                borderRadius={999}
                style={{ position: 'absolute', left: 20, bottom: 19, width: 34, height: 34 }}
              >
                <View />
              </NativeGradient>
              <NativeGradient
                direction="to-br"
                colors={[palette.cloud, palette.cloudShade]}
                borderRadius={999}
                style={{ position: 'absolute', right: 2, bottom: 14, width: 28, height: 28 }}
              >
                <View />
              </NativeGradient>
              <View
                style={{
                  position: 'absolute',
                  left: 5,
                  right: 5,
                  bottom: 3,
                  height: 16,
                  borderRadius: 16,
                  backgroundColor: 'rgba(233,188,192,0.24)',
                }}
              />
            </View>
            <NativeGradient
              direction="to-br"
              colors={colors}
              borderRadius={18}
              style={{
                position: 'absolute',
                top: 18,
                width: 34,
                height: 34,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0.92,
              }}
            >
              <View style={{ alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
            </NativeGradient>
          </View>
        )}
      </View>
      <Text
        numberOfLines={2}
        style={{
          marginTop: compact ? 2 : 4,
          color: '#F8E9E4',
          fontSize: compact ? 10 : 11,
          fontWeight: '700',
          textAlign: 'center',
          lineHeight: compact ? 12 : 14,
          opacity: labelOpacity,
          textShadowColor: 'rgba(5, 10, 27, 0.88)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 4,
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}
