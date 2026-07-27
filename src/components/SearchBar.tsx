import { TextInput } from 'react-native';
import { Search } from 'lucide-react-native';
import { wechatTheme } from './wechatTheme';
import { ThickGlassSurface } from './thick-glass-surface';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChange, placeholder = 'Search' }: Props) {
  return (
    <ThickGlassSurface
      variant="nav"
      tint="pearl"
      nativeInteractive={false}
      style={{
        height: 42,
        minHeight: 42,
        marginHorizontal: 16,
        paddingHorizontal: 14,
        paddingVertical: 0,
        borderRadius: 14,
      }}
      contentStyle={{ gap: 8, justifyContent: 'flex-start' }}
    >
      <Search size={16} color={wechatTheme.inkSoft} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={wechatTheme.inkSoft}
        style={{ flex: 1, color: wechatTheme.ink, fontSize: 14 }}
      />
    </ThickGlassSurface>
  );
}
