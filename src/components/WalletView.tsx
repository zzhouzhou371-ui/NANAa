import { View, Text, TextInput } from 'react-native';
import { useApp } from '../context/AppContext';
import { useNanaStore } from '../stores/nanaStore';
import { NeumorphicSurface, neumorphicPalette } from './neumorphic-surface';
import { AnimatedPressable, NativeGradient } from './primitives';

export function WalletView() {
  const { t } = useApp();
  const walletBalance = useNanaStore(s => s.walletBalance);
  const isEditingBalance = useNanaStore(s => s.isEditingBalance);
  const tempBalance = useNanaStore(s => s.tempBalance);
  const setWalletBalance = useNanaStore(s => s.setWalletBalance);
  const set = useNanaStore.setState;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16 }}>
        <NeumorphicSurface
          tone="lavender"
          depth="raised"
          radius={18}
          fill={false}
          style={{ minHeight: 132 }}
          contentStyle={{ overflow: 'hidden' }}
        >
          <NativeGradient
            direction="to-br"
            colors={[neumorphicPalette.lavender, neumorphicPalette.pinkGold]}
            borderRadius={18}
            style={{ minHeight: 132, padding: 24, overflow: 'hidden' }}
          >
            <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 14, lineHeight: 19, marginBottom: 8 }}>{t.balance}</Text>
            {isEditingBalance ? (
              <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <NeumorphicSurface
                  depth="inset"
                  tone="lavender"
                  radius={14}
                  style={{ width: 160, height: 44 }}
                  contentStyle={{ paddingHorizontal: 12 }}
                >
                  <TextInput
                    value={tempBalance}
                    onChangeText={value => set({ tempBalance: value })}
                    inputMode="decimal"
                    selectTextOnFocus
                    style={{ flex: 1, paddingVertical: 0, color: neumorphicPalette.onLightPrimary, fontSize: 24, fontWeight: '700', textAlign: 'center' }}
                  />
                </NeumorphicSurface>
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityLabel={t.save}
                  onPress={() => {
                    if (setWalletBalance(tempBalance)) return;
                    set({
                      islandNotification: {
                        title: t.wallet,
                        desc: t.amountInvalid,
                        status: 'error',
                      },
                    });
                  }}
                  style={{ height: 40, borderRadius: 14 }}
                >
                  <NeumorphicSurface
                    pointerEvents="none"
                    depth="raisedSmall"
                    tone="pinkGold"
                    radius={14}
                    contentStyle={{ paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 14, lineHeight: 19, fontWeight: '700' }}>{t.save}</Text>
                  </NeumorphicSurface>
                </AnimatedPressable>
              </View>
            ) : (
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel={t.balance}
                onPress={() => set({ isEditingBalance: true, tempBalance: walletBalance })}
                style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }}
              >
                <Text numberOfLines={1} style={{ color: neumorphicPalette.onLightPrimary, fontSize: 30, lineHeight: 38, fontWeight: '700', fontVariant: ['tabular-nums'], includeFontPadding: false }}>
                  {'\u00A5'}{walletBalance}
                </Text>
              </AnimatedPressable>
            )}
          </NativeGradient>
        </NeumorphicSurface>
      </View>
    </View>
  );
}
