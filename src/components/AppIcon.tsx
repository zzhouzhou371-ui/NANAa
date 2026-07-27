import { type ReactNode } from 'react';
import { View, Text } from 'react-native';
import { AnimatedPressable, NativeGradient } from './primitives';

interface Props {
  label: string;
  icon: ReactNode;
  gradient: [string, string, ...string[]];
  onPress: () => void;
}

export function AppIcon({ label, icon, gradient, onPress }: Props) {
  return (
    <AnimatedPressable onPress={onPress} scale={0.92} className="items-center gap-2.5">
      <NativeGradient
        direction="to-br"
        colors={['rgba(255,255,255,0.75)', 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0.1)']}
        borderRadius={22}
        style={{
          width: 70,
          height: 70,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.7)',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.07,
          shadowRadius: 24,
          elevation: 5,
        }}
      >
        <NativeGradient
          direction="to-br"
          colors={gradient}
          borderRadius={18}
          style={{
            width: 60,
            height: 60,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 2,
          }}
        >
          <View className="items-center justify-center">
            {icon}
          </View>
        </NativeGradient>
      </NativeGradient>
      <Text
        className="text-[12px] font-semibold text-[#5A506C]"
        style={{
          textShadowColor: 'rgba(255,255,255,0.6)',
          textShadowOffset: { width: 0, height: 0.5 },
          textShadowRadius: 0,
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}
