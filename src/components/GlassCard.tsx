import type { ReactNode } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { NativeGradient } from './primitives';
import type { ViewStyle, StyleProp } from 'react-native';
import { crystalGlass, palette } from '../constants/design';
import { ThickGlassSurface } from './thick-glass-surface';

interface Props {
  title?: string;
  children: ReactNode;
  noShadow?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function GlassCard({ title, children, noShadow, style }: Props) {
  return (
    <ThickGlassSurface
      variant="sheet"
      tint="pearl"
      style={[styles.card, noShadow ? styles.noShadow : null, style]}
    >
      {title ? (
        <View>
          <Text style={{ color: palette.ink, fontSize: 14, fontWeight: '700', marginBottom: 8 }}>{title}</Text>
          <NativeGradient direction="to-r" colors={[crystalGlass.blushEdge, 'rgba(231,190,177,0.62)', crystalGlass.blueEdge]} borderRadius={9999} style={{ width: 36, height: 2, opacity: 0.9, marginBottom: 12 }}><View /></NativeGradient>
        </View>
      ) : null}
      {children}
    </ThickGlassSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
  },
  noShadow: {
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
});
