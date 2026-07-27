import { ScrollView, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { useNanaStore } from '../stores/nanaStore';
import { AnimatedPressable } from './primitives';
import { NeumorphicSurface, neumorphicPalette } from './neumorphic-surface';

export function PresetList() {
  const { t } = useApp();
  const presetView = useNanaStore(s => s.presetView);
  const presetMode = useNanaStore(s => s.presetMode);
  const onlinePresets = useNanaStore(s => s.onlinePresets);
  const offlinePresets = useNanaStore(s => s.offlinePresets);
  const activeOnlinePresetId = useNanaStore(s => s.activeOnlinePresetId);
  const activeOfflinePresetId = useNanaStore(s => s.activeOfflinePresetId);
  const set = useNanaStore.setState;

  if (presetView !== 'list') return null;

  const presets = presetMode === 'online' ? onlinePresets : offlinePresets;
  const activeId = presetMode === 'online' ? activeOnlinePresetId : activeOfflinePresetId;

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <NeumorphicSurface
        testID="preset-mode-toggle"
        depth="inset"
        tone="lavender"
        radius={18}
        style={{ marginHorizontal: 3, marginBottom: 18, minHeight: 46 }}
        contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 }}
      >
        {(['online', 'offline'] as const).map(mode => {
          const selected = presetMode === mode;
          const label = mode === 'online' ? t.onlinePresets : t.offlinePresets;
          return (
            <AnimatedPressable
              key={mode}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              onPress={() => set({ presetMode: mode })}
              style={{ flex: 1, minHeight: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}
            >
              {selected ? (
                <NeumorphicSurface
                  pointerEvents="none"
                  depth="raisedSmall"
                  tone="pinkGold"
                  radius={14}
                  style={{ position: 'absolute', inset: 0 }}
                />
              ) : null}
              <Text numberOfLines={1} style={{ color: neumorphicPalette.onLightPrimary, fontSize: 13, fontWeight: '800' }}>
                {label}
              </Text>
            </AnimatedPressable>
          );
        })}
      </NeumorphicSurface>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 3, paddingBottom: 28, gap: 14 }}
      >
        {presets.map(preset => {
          const preview = preset.sceneDescription?.trim()
            || preset.main.filter(Boolean).join(' ').trim()
            || preset.authorsNote.filter(Boolean).join(' ').trim();
          const isActive = preset.id === activeId;
          const modeLabel = preset.sceneMode === 'offline' ? t.offlinePresets : t.onlinePresets;

          return (
            <AnimatedPressable
              key={preset.id}
              accessibilityRole="button"
              accessibilityLabel={preset.name}
              onPress={() => set({ editingPreset: preset, presetView: 'edit' })}
              style={{ borderRadius: 20 }}
            >
              <NeumorphicSurface
                depth="raised"
                tone="lavender"
                radius={20}
                fill={false}
                contentStyle={{ minHeight: 96, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15, paddingVertical: 14 }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text numberOfLines={1} style={{ color: neumorphicPalette.onLightPrimary, fontSize: 16, fontWeight: '800', flexShrink: 1 }}>
                      {preset.name}
                    </Text>
                    <NeumorphicSurface
                      depth="inset"
                      tone="champagnePink"
                      radius={999}
                      fill={false}
                      contentStyle={{ paddingHorizontal: 8, paddingVertical: 3 }}
                    >
                      <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 10, fontWeight: '800' }}>{modeLabel}</Text>
                    </NeumorphicSurface>
                  </View>
                  <Text numberOfLines={2} style={{ color: neumorphicPalette.onLightSecondary, fontSize: 13, lineHeight: 18, marginTop: 5 }}>
                    {preview}
                  </Text>
                </View>
                {isActive ? (
                  <NeumorphicSurface
                    depth="raisedSmall"
                    tone="pinkGold"
                    radius={999}
                    fill={false}
                    contentStyle={{ minWidth: 70, alignItems: 'center', paddingHorizontal: 11, paddingVertical: 8 }}
                  >
                    <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, fontWeight: '800' }}>{t.active}</Text>
                  </NeumorphicSurface>
                ) : (
                  <AnimatedPressable
                    accessibilityRole="button"
                    accessibilityLabel={t.usePreset}
                    onPress={() => {
                      if (presetMode === 'online') set({ activeOnlinePresetId: preset.id });
                      else set({ activeOfflinePresetId: preset.id });
                    }}
                    style={{ minWidth: 72, minHeight: 38, borderRadius: 999 }}
                  >
                    <NeumorphicSurface
                      pointerEvents="none"
                      depth="raisedSmall"
                      tone="champagnePink"
                      radius={999}
                      style={{ position: 'absolute', inset: 0 }}
                      contentStyle={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 }}
                    >
                      <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, fontWeight: '800' }}>{t.usePreset}</Text>
                    </NeumorphicSurface>
                  </AnimatedPressable>
                )}
              </NeumorphicSurface>
            </AnimatedPressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
