import { Text, type TextProps } from 'react-native';
import { useApp } from '../context/AppContext';

export function ThemedText({ style, ...props }: TextProps) {
  const { customTextColor } = useApp();
  return (
    <Text
      {...props}
      style={[style, customTextColor ? { color: customTextColor } : undefined]}
    />
  );
}
