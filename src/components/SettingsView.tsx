import { useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { useNanaStore } from '../stores/nanaStore';
import { exportData, importData, clearAllData } from '../services/storage';
import { clearApiKey, saveApiKey, usesNativeSecretStorage } from '../services/secretStore';
import { AnimatedPressable } from './primitives';
import { NeumorphicSurface, neumorphicPalette } from './neumorphic-surface';

function SettingsField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, fontWeight: '800', marginBottom: 8, paddingHorizontal: 4 }}>{label}</Text>
      <NeumorphicSurface depth="inset" tone="lavender" radius={16} style={{ minHeight: 48 }} contentStyle={{ paddingHorizontal: 15 }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={neumorphicPalette.onLightSecondary}
          secureTextEntry={secureTextEntry}
          autoCapitalize={secureTextEntry ? 'none' : undefined}
          autoCorrect={secureTextEntry ? false : undefined}
          autoComplete={secureTextEntry ? 'off' : undefined}
          textContentType={secureTextEntry ? 'none' : undefined}
          importantForAutofill={secureTextEntry ? 'no' : undefined}
          style={{ minHeight: 48, paddingVertical: 0, color: neumorphicPalette.onLightPrimary, fontSize: 15 }}
        />
      </NeumorphicSurface>
    </View>
  );
}

function SettingsButton({
  label,
  onPress,
  tone = 'champagnePink',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  tone?: 'champagnePink' | 'pinkGold' | 'berry' | 'lavender';
  disabled?: boolean;
}) {
  const danger = tone === 'berry';
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={{ minHeight: 46, borderRadius: 999, opacity: disabled ? 0.55 : 1 }}
    >
      <NeumorphicSurface
        pointerEvents="none"
        depth="raisedSmall"
        tone={tone}
        radius={999}
        style={{ position: 'absolute', inset: 0 }}
        contentStyle={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 }}
      >
        <Text style={{ color: danger ? neumorphicPalette.onBerry : neumorphicPalette.onLightPrimary, fontSize: 14, fontWeight: '800' }}>{label}</Text>
      </NeumorphicSurface>
    </AnimatedPressable>
  );
}

export function SettingsView() {
  const { t } = useApp();
  const tempApiUrl = useNanaStore(s => s.tempApiUrl);
  const tempApiKey = useNanaStore(s => s.tempApiKey);
  const selectedModel = useNanaStore(s => s.selectedModel);
  const models = useNanaStore(s => s.models);
  const isLoadingModels = useNanaStore(s => s.isLoadingModels);
  const set = useNanaStore.setState;
  const [isSavingApi, setIsSavingApi] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState('');

  const handleSaveApiConfig = async () => {
    setIsSavingApi(true);
    setApiKeyStatus('');
    try {
      const apiKey = await saveApiKey(tempApiKey);
      set({ apiUrl: tempApiUrl.trim(), apiKey, tempApiKey: apiKey });
      const status = apiKey
        ? (usesNativeSecretStorage()
            ? 'API Key saved in this device\'s secure storage.'
            : 'API Key is available for this browser session only and will not be stored locally.')
        : 'API Key cleared.';
      setApiKeyStatus(status);
      Alert.alert('API Settings', status);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nana could not save the API settings.';
      setApiKeyStatus(message);
      Alert.alert('API Settings Error', message);
    } finally {
      setIsSavingApi(false);
    }
  };

  const handleClearApiConfig = async () => {
    setIsSavingApi(true);
    setApiKeyStatus('');
    try {
      await clearApiKey();
      set({ apiUrl: '', apiKey: '', tempApiUrl: '', tempApiKey: '' });
      setApiKeyStatus('API URL and API Key cleared.');
      Alert.alert('API Settings', 'API URL and API Key cleared.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nana could not clear the API Key.';
      setApiKeyStatus(message);
      Alert.alert('API Settings Error', message);
    } finally {
      setIsSavingApi(false);
    }
  };

  const handleClearAllData = async () => {
    try {
      await clearAllData();
      Alert.alert('Data Cleared', 'Nana was reset on this device, including the securely stored API Key.');
    } catch (error) {
      Alert.alert('Clear Data Error', error instanceof Error ? error.message : 'Nana could not clear all local data.');
    }
  };

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 3, paddingBottom: 32, gap: 18 }}
      >
        <NeumorphicSurface
          testID="settings-neumorphic-api"
          depth="raised"
          tone="lavender"
          radius={22}
          fill={false}
          contentStyle={{ padding: 16 }}
        >
          <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 16, fontWeight: '800', marginBottom: 16 }}>{(t as any).apiConfig}</Text>
          <SettingsField label={(t as any).apiUrl} value={tempApiUrl} onChangeText={(value) => set({ tempApiUrl: value })} placeholder="https://..." />
          <SettingsField label={(t as any).apiKey} value={tempApiKey} onChangeText={(value) => set({ tempApiKey: value })} placeholder="sk-..." secureTextEntry />
          <SettingsField label="Model" value={selectedModel} onChangeText={(value) => set({ selectedModel: value })} placeholder="gpt-4o-mini / gemini-2.5-flash" />

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 2 }}>
              <SettingsButton label={isSavingApi ? 'Saving...' : t.save} onPress={() => { void handleSaveApiConfig(); }} tone="pinkGold" disabled={isSavingApi} />
            </View>
            <View style={{ flex: 1 }}>
              <SettingsButton label={t.clear || 'Clear'} onPress={() => { void handleClearApiConfig(); }} tone="berry" disabled={isSavingApi} />
            </View>
          </View>

          {apiKeyStatus ? (
            <Text selectable style={{ color: neumorphicPalette.onLightSecondary, fontSize: 12, lineHeight: 17, marginTop: 12 }}>{apiKeyStatus}</Text>
          ) : null}

          <View style={{ marginTop: 13, marginBottom: 10 }}>
            <SettingsButton
              label={isLoadingModels ? t.loadingModels : t.selectModel}
              onPress={() => useNanaStore.getState().doFetchModels(tempApiUrl, tempApiKey)}
              tone="champagnePink"
              disabled={!tempApiUrl || !tempApiKey || isLoadingModels}
            />
          </View>

          {models.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
              {models.map(model => {
                const selected = selectedModel === model;
                return (
                  <AnimatedPressable
                    key={model}
                    accessibilityRole="button"
                    accessibilityLabel={model}
                    accessibilityState={{ selected }}
                    onPress={() => set({ selectedModel: model })}
                    style={{ minHeight: 36, borderRadius: 999 }}
                  >
                    <NeumorphicSurface
                      pointerEvents="none"
                      depth={selected ? 'raisedSmall' : 'inset'}
                      tone={selected ? 'pinkGold' : 'lavender'}
                      radius={999}
                      fill={false}
                      contentStyle={{ minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}
                    >
                      <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, fontWeight: selected ? '800' : '600' }}>{model}</Text>
                    </NeumorphicSurface>
                  </AnimatedPressable>
                );
              })}
            </View>
          ) : null}
        </NeumorphicSurface>

        <NeumorphicSurface
          testID="settings-neumorphic-data"
          depth="raised"
          tone="lavender"
          radius={22}
          fill={false}
          contentStyle={{ padding: 16, gap: 10 }}
        >
          <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 16, fontWeight: '800', marginBottom: 6 }}>{(t as any).dbManagement}</Text>
          <SettingsButton label={t.exportData} onPress={() => { void exportData(); }} />
          <SettingsButton label={t.importData} onPress={importData} />
          <SettingsButton
            label={t.clearData}
            tone="berry"
            onPress={() => Alert.alert(t.clearData, 'This cannot be undone.', [
              { text: t.cancel, style: 'cancel' },
              { text: t.delete, style: 'destructive', onPress: () => { void handleClearAllData(); } },
            ])}
          />
        </NeumorphicSurface>
      </ScrollView>
    </View>
  );
}
