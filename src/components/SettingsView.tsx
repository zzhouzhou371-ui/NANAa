import { useState } from 'react';
import { Alert, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { AudioLines, BellRing } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { useNanaStore } from '../stores/nanaStore';
import { exportData, importData, clearAllData } from '../services/storage';
import {
  clearApiKey,
  clearVoiceApiKey,
  saveApiKey,
  saveVoiceApiKey,
  usesNativeSecretStorage,
} from '../services/secretStore';
import { requestProactiveNotificationPermission } from '../services/proactiveNotificationRuntime';
import {
  MOSSLAND_API_URL,
  MOSSLAND_STT_MODEL,
  MOSSLAND_TTS_MODEL,
  resolveVoiceProvider,
} from '../services/voiceProviderRuntime';
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
  const proactiveNotificationsEnabled = useNanaStore(s => s.proactiveNotificationsEnabled);
  const voiceProviderEnabled = useNanaStore(s => s.voiceProviderEnabled);
  const tempVoiceApiUrl = useNanaStore(s => s.tempVoiceApiUrl);
  const tempVoiceApiKey = useNanaStore(s => s.tempVoiceApiKey);
  const tempVoiceSttModel = useNanaStore(s => s.tempVoiceSttModel);
  const tempVoiceTtsModel = useNanaStore(s => s.tempVoiceTtsModel);
  const autoTTS = useNanaStore(s => s.autoTTS);
  const speechLanguage = useNanaStore(s => s.speechLanguage);
  const language = useNanaStore(s => s.themeConfig.language);
  const set = useNanaStore.setState;
  const [isSavingApi, setIsSavingApi] = useState(false);
  const [isChangingNotifications, setIsChangingNotifications] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState('');
  const [isSavingVoice, setIsSavingVoice] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const voiceProvider = resolveVoiceProvider({
    voiceProviderEnabled,
    voiceApiUrl: tempVoiceApiUrl,
    voiceApiKey: tempVoiceApiKey,
    voiceSttModel: tempVoiceSttModel,
    voiceTtsModel: tempVoiceTtsModel,
    chatApiUrl: tempApiUrl,
    chatApiKey: tempApiKey,
    chatModel: selectedModel,
  });
  const mosslandVoiceSelected = voiceProvider.stt.provider === 'officialMossland';

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

  const persistVoiceSettings = async (showAlert: boolean) => {
    const voiceApiKey = await saveVoiceApiKey(tempVoiceApiKey);
    const sttModel = mosslandVoiceSelected
      ? MOSSLAND_STT_MODEL
      : tempVoiceSttModel.trim() || 'gpt-4o-mini-transcribe';
    const ttsModel = mosslandVoiceSelected
      ? MOSSLAND_TTS_MODEL
      : tempVoiceTtsModel.trim() || 'tts-1';
    set({
      voiceProviderEnabled,
      voiceApiUrl: tempVoiceApiUrl.trim(),
      voiceApiKey,
      voiceSttModel: sttModel,
      voiceTtsModel: ttsModel,
      tempVoiceApiKey: voiceApiKey,
      tempVoiceSttModel: sttModel,
      tempVoiceTtsModel: ttsModel,
    });
    setVoiceStatus(t.voiceSettingsSaved);
    if (showAlert) Alert.alert(t.voiceService, t.voiceSettingsSaved);
  };

  const handleSaveVoiceConfig = async () => {
    setIsSavingVoice(true);
    setVoiceStatus('');
    try {
      await persistVoiceSettings(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : t.voiceNotConfigured;
      setVoiceStatus(message);
      Alert.alert(t.voiceService, message);
    } finally {
      setIsSavingVoice(false);
    }
  };

  const handleClearVoiceConfig = async () => {
    setIsSavingVoice(true);
    setVoiceStatus('');
    try {
      await clearVoiceApiKey();
      set({
        voiceProviderEnabled: false,
        voiceApiUrl: '',
        voiceApiKey: '',
        voiceSttModel: 'gpt-4o-mini-transcribe',
        voiceTtsModel: 'tts-1',
        tempVoiceApiUrl: '',
        tempVoiceApiKey: '',
        tempVoiceSttModel: 'gpt-4o-mini-transcribe',
        tempVoiceTtsModel: 'tts-1',
      });
      setVoiceStatus(t.voiceSettingsCleared);
    } catch (error) {
      const message = error instanceof Error ? error.message : t.voiceNotConfigured;
      setVoiceStatus(message);
      Alert.alert(t.voiceService, message);
    } finally {
      setIsSavingVoice(false);
    }
  };

  const handleTestVoice = async () => {
    setIsSavingVoice(true);
    setVoiceStatus('');
    try {
      await persistVoiceSettings(false);
      await useNanaStore.getState().previewCharacterVoice();
    } catch (error) {
      const message = error instanceof Error ? error.message : t.voiceNotConfigured;
      setVoiceStatus(message);
    } finally {
      setIsSavingVoice(false);
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

  const handleProactiveNotificationsChange = async (enabled: boolean) => {
    if (!enabled) {
      set({ proactiveNotificationsEnabled: false });
      return;
    }
    setIsChangingNotifications(true);
    try {
      const permission = await requestProactiveNotificationPermission();
      if (permission === 'granted') {
        set({ proactiveNotificationsEnabled: true });
        return;
      }
      set({ proactiveNotificationsEnabled: false });
      Alert.alert(
        t.proactiveNotifications,
        permission === 'unavailable'
          ? t.proactiveNotificationsUnavailable
          : t.proactiveNotificationsPermissionDenied,
      );
    } catch (error) {
      set({ proactiveNotificationsEnabled: false });
      Alert.alert(
        t.proactiveNotifications,
        error instanceof Error
          ? error.message
          : t.proactiveNotificationsPermissionDenied,
      );
    } finally {
      setIsChangingNotifications(false);
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
            <NeumorphicSurface
              depth="inset"
              tone="base"
              radius={15}
              fill={false}
              style={{ maxHeight: 164 }}
              contentStyle={{ maxHeight: 164, overflow: 'hidden' }}
            >
              <ScrollView
                nestedScrollEnabled
                showsVerticalScrollIndicator={models.length > 6}
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: 164 }}
                contentContainerStyle={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 9,
                  padding: 11,
                }}
              >
                {models.map(model => {
                  const selected = selectedModel === model;
                  return (
                    <AnimatedPressable
                      key={model}
                      accessibilityRole="button"
                      accessibilityLabel={model}
                      accessibilityState={{ selected }}
                      onPress={() => set({ selectedModel: model })}
                      style={{ minHeight: 36, maxWidth: '100%', borderRadius: 999 }}
                    >
                      <NeumorphicSurface
                        pointerEvents="none"
                        depth={selected ? 'raisedSmall' : 'flat'}
                        tone={selected ? 'pinkGold' : 'lavender'}
                        radius={999}
                        fill={false}
                        contentStyle={{ minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}
                      >
                        <Text
                          numberOfLines={1}
                          ellipsizeMode="tail"
                          style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, fontWeight: selected ? '800' : '600', maxWidth: '100%' }}
                        >
                          {model}
                        </Text>
                      </NeumorphicSurface>
                    </AnimatedPressable>
                  );
                })}
              </ScrollView>
            </NeumorphicSurface>
          ) : null}
        </NeumorphicSurface>

        <NeumorphicSurface
          testID="settings-voice-service"
          depth="raised"
          tone="lavender"
          radius={22}
          fill={false}
          contentStyle={{ padding: 16, gap: 12 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <AudioLines size={18} color={neumorphicPalette.onLightPrimary} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 16, fontWeight: '800' }}>
                {t.voiceService}
              </Text>
              <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 12, lineHeight: 17, marginTop: 3 }}>
                {t.voiceServiceDesc}
              </Text>
            </View>
          </View>

          <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 14, fontWeight: '800' }}>
                {t.separateVoiceService}
              </Text>
              <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11.5, lineHeight: 16, marginTop: 3 }}>
                {voiceProviderEnabled ? t.separateVoiceServiceHint : t.voiceUsingChatService}
              </Text>
            </View>
            <Switch
              testID="separate-voice-provider-switch"
              accessibilityLabel={t.separateVoiceService}
              value={voiceProviderEnabled}
              onValueChange={enabled => {
                set({ voiceProviderEnabled: enabled });
              }}
              trackColor={{ false: '#C8BDD0', true: '#E8A7BA' }}
              thumbColor="#3A293D"
            />
          </View>

          {voiceProviderEnabled ? (
            <View>
              <View style={{ marginBottom: 14 }}>
                <SettingsButton
                  label={language === 'zh' ? '使用 Mossland 语音服务' : 'Use Mossland voice service'}
                  onPress={() => {
                    set({
                      tempVoiceApiUrl: MOSSLAND_API_URL,
                      tempVoiceSttModel: MOSSLAND_STT_MODEL,
                      tempVoiceTtsModel: MOSSLAND_TTS_MODEL,
                    });
                  }}
                  tone={mosslandVoiceSelected ? 'pinkGold' : 'lavender'}
                  disabled={isSavingVoice}
                />
              </View>
              <SettingsField
                label={t.voiceApiUrl}
                value={tempVoiceApiUrl}
                onChangeText={value => set({ tempVoiceApiUrl: value })}
                placeholder={mosslandVoiceSelected ? MOSSLAND_API_URL : 'https://api.openai.com'}
              />
              <SettingsField
                label={t.voiceApiKey}
                value={tempVoiceApiKey}
                onChangeText={value => set({ tempVoiceApiKey: value })}
                placeholder="sk-..."
                secureTextEntry
              />
              <SettingsField
                label={t.voiceSttModel}
                value={tempVoiceSttModel}
                onChangeText={value => set({ tempVoiceSttModel: value })}
                placeholder={mosslandVoiceSelected ? MOSSLAND_STT_MODEL : 'gpt-4o-mini-transcribe'}
              />
              <SettingsField
                label={t.voiceTtsModel}
                value={tempVoiceTtsModel}
                onChangeText={value => set({ tempVoiceTtsModel: value })}
                placeholder={mosslandVoiceSelected ? MOSSLAND_TTS_MODEL : 'tts-1'}
              />
              {mosslandVoiceSelected ? (
                <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11.5, lineHeight: 17, marginBottom: 14 }}>
                  {language === 'zh'
                    ? '聊天语音使用普通合成；角色音色请在角色资料里填写 Mossland voice_id。流式语音会留给实时通话。'
                    : 'Chat voice uses standard synthesis. Set each character’s Mossland voice_id in their profile; streaming is reserved for live calls.'}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 14, fontWeight: '800' }}>
                {t.autoPlayVoiceReplies}
              </Text>
              <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11.5, lineHeight: 16, marginTop: 3 }}>
                {voiceProvider.ttsDiagnostic.status === 'ready'
                  ? t.voiceRemoteReady
                  : t.voiceDeviceFallback}
              </Text>
            </View>
            <Switch
              testID="auto-tts-switch"
              accessibilityLabel={t.autoPlayVoiceReplies}
              value={autoTTS}
              onValueChange={enabled => {
                set({ autoTTS: enabled });
              }}
              trackColor={{ false: '#C8BDD0', true: '#E8A7BA' }}
              thumbColor="#3A293D"
            />
          </View>

          <SettingsField
            label={t.speechLanguage}
            value={speechLanguage}
            onChangeText={value => set({ speechLanguage: value })}
            placeholder="zh-CN / en-US"
          />

          <Text
            selectable
            style={{
              color: voiceProvider.sttDiagnostic.status === 'ready'
                ? neumorphicPalette.onLightSecondary
                : neumorphicPalette.berry,
              fontSize: 11.5,
              lineHeight: 17,
            }}
          >
            {voiceProvider.sttDiagnostic.status === 'ready'
              ? `${t.voiceSttModel}: ${voiceProvider.stt.model}`
              : t.voiceNotConfigured}
          </Text>

          <SettingsButton
            label={t.testVoice}
            onPress={() => { void handleTestVoice(); }}
            disabled={isSavingVoice}
          />
          <View style={{ flexDirection: 'row', gap: 9 }}>
            <View style={{ flex: 1 }}>
              <SettingsButton
                label={isSavingVoice ? t.processing : t.save}
                onPress={() => { void handleSaveVoiceConfig(); }}
                tone="pinkGold"
                disabled={isSavingVoice}
              />
            </View>
            {voiceProviderEnabled ? (
              <View style={{ flex: 1 }}>
                <SettingsButton
                  label={t.clear}
                  onPress={() => { void handleClearVoiceConfig(); }}
                  tone="berry"
                  disabled={isSavingVoice}
                />
              </View>
            ) : null}
          </View>

          {voiceStatus ? (
            <Text selectable style={{ color: neumorphicPalette.onLightSecondary, fontSize: 12, lineHeight: 17 }}>
              {voiceStatus}
            </Text>
          ) : null}
        </NeumorphicSurface>

        <NeumorphicSurface
          testID="settings-proactive-notifications"
          depth="raised"
          tone="lavender"
          radius={22}
          fill={false}
          contentStyle={{ padding: 16, gap: 10 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <BellRing size={17} color={neumorphicPalette.onLightPrimary} />
                <Text style={{ flex: 1, color: neumorphicPalette.onLightPrimary, fontSize: 15, fontWeight: '800' }}>
                  {t.proactiveNotifications}
                </Text>
              </View>
              <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 12, lineHeight: 17 }}>
                {t.proactiveNotificationsDesc}
              </Text>
            </View>
            <Switch
              testID="proactive-notifications-switch"
              accessibilityLabel={t.proactiveNotifications}
              accessibilityHint={t.proactiveNotificationsCostPolicy}
              value={proactiveNotificationsEnabled}
              disabled={isChangingNotifications}
              onValueChange={enabled => {
                void handleProactiveNotificationsChange(enabled);
              }}
              trackColor={{ false: '#C8BDD0', true: '#E8A7BA' }}
              thumbColor="#3A293D"
            />
          </View>
          <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11.5, lineHeight: 17 }}>
            {t.proactiveNotificationsCostPolicy}
          </Text>
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
