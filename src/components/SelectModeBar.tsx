import { Text, View } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { useNanaStore } from '../stores/nanaStore';
import { AnimatedPressable } from './primitives';
import { wechatTheme } from './wechatTheme';

export function SelectModeBar({ onForward }: { onForward: () => void }) {
  const { t } = useApp();
  const selectedCount = useNanaStore(state => state.selectedMsgIds).length;

  return (
    <View
      style={{
        minHeight: 56,
        marginBottom: 4,
        paddingHorizontal: 4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderBottomWidth: 0.5,
        borderBottomColor: wechatTheme.line,
      }}
    >
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={t.cancel}
        onPress={() => useNanaStore.setState({ selectMode: false, selectedMsgIds: [] })}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <X size={20} color={wechatTheme.inkMuted} strokeWidth={1.7} />
      </AnimatedPressable>

      <Text
        numberOfLines={1}
        style={{ flex: 1, color: wechatTheme.inkMuted, fontSize: 13, lineHeight: 18 }}
      >
        {selectedCount > 0
          ? t.pickedCount.replace('{n}', String(selectedCount))
          : t.pickMsgs}
      </Text>

      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={t.rememberMessages}
        accessibilityState={{ disabled: selectedCount === 0 }}
        onPress={selectedCount > 0 ? onForward : undefined}
        disabled={selectedCount === 0}
        style={{
          minWidth: 82,
          height: 44,
          borderRadius: 14,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          backgroundColor: selectedCount > 0 ? 'rgba(168, 187, 209, 0.2)' : 'rgba(255, 243, 238, 0.05)',
          borderWidth: 0.5,
          borderColor: selectedCount > 0 ? 'rgba(168, 187, 209, 0.38)' : wechatTheme.line,
          opacity: selectedCount > 0 ? 1 : 0.62,
        }}
      >
        <Check size={16} color={selectedCount > 0 ? wechatTheme.memory : wechatTheme.inkSoft} strokeWidth={2} />
        <Text style={{ color: selectedCount > 0 ? wechatTheme.ink : wechatTheme.inkSoft, fontSize: 13, fontWeight: '700' }}>
          {t.remember}
        </Text>
      </AnimatedPressable>
    </View>
  );
}
