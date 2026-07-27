import { View, Text, TextInput } from 'react-native';
import { palette, crystalGlass } from '../constants/design';

interface Props {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  type?: string;
}

export function Input({ label, placeholder, value, onChange, multiline }: Props) {
  return (
    <View className="mb-4">
      {label ? <Text style={{ color: palette.inkMuted, fontSize: 12, marginBottom: 8, paddingHorizontal: 4, fontWeight: '700' }}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={palette.inkSoft}
        multiline={multiline}
        style={{ width: '100%', minHeight: multiline ? 100 : 46, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: palette.whiteGlassStrong, borderWidth: 0.75, borderColor: crystalGlass.edge, color: palette.ink, fontSize: 15, textAlignVertical: multiline ? 'top' : 'center' }}
      />
    </View>
  );
}
