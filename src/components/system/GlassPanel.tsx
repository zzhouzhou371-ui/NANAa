import { type ReactNode } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { NativeGradient } from '../primitives';
import { crystalGlass, radius } from '../../constants/design';

interface GlassPanelProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
  colors?: [string, string, ...string[]];
}

export function GlassPanel({
  children,
  style,
  borderRadius = radius.lg,
  colors = crystalGlass.panel,
}: GlassPanelProps) {
  return (
    <NativeGradient
      direction="to-br"
      colors={colors}
      borderRadius={borderRadius}
      style={[
        {
          position: 'relative',
          borderWidth: 0.75,
          borderColor: crystalGlass.edge,
          overflow: 'hidden',
          shadowColor: crystalGlass.shadow,
          shadowOffset: { width: 0, height: 5 },
          shadowOpacity: 0.1,
          shadowRadius: 7,
          elevation: 2,
        },
        style as ViewStyle,
      ]}
    >
      {children}
    </NativeGradient>
  );
}
