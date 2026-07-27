import { View, Text } from 'react-native';
import { GradientButton } from './primitives';
import { palette } from '../constants/design';

interface EmptyStateProps {
  icon: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, subtitle, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center py-16 px-8">
      <Text className="text-5xl mb-4">{icon}</Text>
      <Text style={{ color: palette.ink, fontSize: 17, fontWeight: '800', textAlign: 'center', marginBottom: 8 }}>{title}</Text>
      {subtitle ? (
        <Text style={{ color: palette.inkMuted, fontSize: 15, textAlign: 'center', marginBottom: 24, maxWidth: 220 }}>{subtitle}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <GradientButton variant="primary" borderRadius={9999} onPress={onAction}>
          <Text className="text-[#5E5672] font-semibold">{actionLabel}</Text>
        </GradientButton>
      ) : null}
    </View>
  );
}
