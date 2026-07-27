import { type ReactNode } from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';
import { palette } from '../../constants/design';

interface PhonePreviewFrameProps {
  children: ReactNode;
}

export function PhonePreviewFrame({ children }: PhonePreviewFrameProps) {
  const { width, height } = useWindowDimensions();
  const shouldFrame = Platform.OS === 'web' && width >= 560;

  if (!shouldFrame) {
    return (
      <View style={{ flex: 1, overflow: 'hidden', backgroundColor: palette.canvas }}>
        {children}
      </View>
    );
  }

  const frameWidth = Math.min(430, width - 48);
  const frameHeight = Math.min(height, 932);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#EFECE4',
      }}
    >
      <View
        style={{
          width: frameWidth,
          height: frameHeight,
          overflow: 'hidden',
          backgroundColor: palette.canvas,
          borderRadius: 38,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.72)',
          boxShadow: '0 24px 70px rgba(70, 58, 94, 0.22)',
        }}
      >
        {children}
      </View>
    </View>
  );
}
