import { useCallback, useEffect, useRef, useState } from 'react';
import { Stack } from 'expo-router';
import { ActivityIndicator, AppState, View, BackHandler, LogBox, Platform, Pressable, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AppContext } from '../context/AppContext';
import { i18n } from '../i18n';
import { useNanaStore } from '../stores/nanaStore';
import { useThemeFont } from '../hooks/useThemeFont';
import { PhoneStatusBar } from '../components/system/PhoneStatusBar';
import { PhonePreviewFrame } from '../components/system/PhonePreviewFrame';
import { DynamicIsland } from '../components/system/DynamicIsland';
import { VoiceGestureOverlay } from '../components/voice-gesture-overlay';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { prepareApiKeyForHydration } from '../services/secretStore';
import {
  avatarUrisReferencedByState,
  cleanupReplacedWallpaper,
  cleanupReplacedAvatar,
  createCharacterAvatarStatePatch,
  discardPickedAvatar,
  recoverPendingImagePickerSelection,
} from '../services/nativeImagePickerRuntime';
import { pruneUnreferencedAvatarFiles } from '../services/localMediaRepository';
import {
  hydrateDurableChatHistory,
  startDurableChatHistoryPersistence,
} from '../services/chatHistoryPersistence';
import '../global.css';

if (Platform.OS === 'web') {
  LogBox.ignoreLogs(['Unknown event handler property']);
  const originalConsoleError = console.error;
  console.error = (...args: Parameters<typeof console.error>) => {
    if (typeof args[0] === 'string' && args[0].includes('Unknown event handler property')) return;
    originalConsoleError(...args);
  };
}
function renderAvatar(avatar: string | any): any {
  if (!avatar) return 'U';
  if (typeof avatar === 'string' && avatar.startsWith('http')) return avatar;
  if (typeof avatar === 'string') return avatar;
  return avatar;
}

export default function RootLayout() {
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const appStateRef = useRef(AppState.currentState);
  const language = useNanaStore(s => s.themeConfig.language);
  const customTextColor = useNanaStore(s => s.themeConfig.customTextColor);
  const t = language === 'zh' ? i18n.zh : i18n.en;
  const themeFont = useThemeFont();

  const hydrateStorage = useCallback(async () => {
    setStorageReady(false);
    setStorageError('');
    try {
      const secret = await prepareApiKeyForHydration();
      await useNanaStore.persist.rehydrate();
      if (!useNanaStore.persist.hasHydrated()) {
        throw new Error('Nana could not load the local data store.');
      }
      const durableChatHistory = await hydrateDurableChatHistory(
        useNanaStore.getState().chatHistory,
      );
      useNanaStore.setState({ chatHistory: durableChatHistory });
      startDurableChatHistoryPersistence();
      useNanaStore.setState({ apiKey: secret.apiKey, tempApiKey: secret.apiKey });
      const recoveredSelection = await recoverPendingImagePickerSelection();
      if (recoveredSelection) {
        const { intent, result } = recoveredSelection;
        const recoveredUri = result.phase === 'ready' ? result.localUri : undefined;

        if (intent.kind === 'chat-photo' && recoveredUri) {
          await useNanaStore.getState().sendChatMessage(
            'image',
            undefined,
            'Recovered photo',
            result,
            { targetChatId: intent.chatId },
          );
        } else if (intent.kind === 'theme-wallpaper') {
          const previousUri = useNanaStore.getState().themeConfig.backgroundImage;
          if (recoveredUri) {
            useNanaStore.setState(state => ({
              activeApp: 'theme',
              themeConfig: {
                ...state.themeConfig,
                wallpaperId: 'custom',
                backgroundImage: recoveredUri,
              },
            }));
            cleanupReplacedWallpaper(previousUri, recoveredUri);
          } else {
            useNanaStore.setState({ activeApp: 'theme' });
          }
        } else if (intent.kind === 'character-avatar') {
          const state = useNanaStore.getState();
          const character = state.characters.find(item => item.id === intent.characterId);
          if (recoveredUri && character) {
            useNanaStore.setState(createCharacterAvatarStatePatch(state, character.id, recoveredUri));
            cleanupReplacedAvatar(character.avatar, useNanaStore.getState());
          } else if (recoveredUri) {
            discardPickedAvatar(recoveredUri);
          }
        } else if (intent.kind === 'character-avatar-draft') {
          const previousDraftAvatar = intent.draft.newCharAvatar;
          useNanaStore.setState({
            ...intent.draft,
            newCharAvatar: recoveredUri || previousDraftAvatar,
            activeApp: 'characters',
            characterEditorOpen: true,
          });
          if (recoveredUri && previousDraftAvatar !== recoveredUri) {
            cleanupReplacedAvatar(previousDraftAvatar, useNanaStore.getState());
          }
        } else if (intent.kind === 'user-avatar-draft') {
          const previousDraftAvatar = intent.draft.tempMyAvatar;
          useNanaStore.setState({
            ...intent.draft,
            tempMyAvatar: recoveredUri || previousDraftAvatar,
            activeApp: 'user',
          });
          if (recoveredUri && previousDraftAvatar !== recoveredUri) {
            cleanupReplacedAvatar(previousDraftAvatar, useNanaStore.getState());
          }
        }

        if (result.phase === 'failed') {
          const recoveryTranslations = useNanaStore.getState().themeConfig.language === 'zh' ? i18n.zh : i18n.en;
          useNanaStore.setState({
            islandNotification: {
              title: intent.kind === 'theme-wallpaper'
                ? recoveryTranslations.wallpaper
                : recoveryTranslations.photoLibrary,
              desc: intent.kind === 'theme-wallpaper'
                ? recoveryTranslations.wallpaperPickerError
                : recoveryTranslations.portraitPickerError,
              status: 'error',
            },
          });
        }
      }

      const hydratedState = useNanaStore.getState();
      const referencedAvatars = avatarUrisReferencedByState(hydratedState);
      if (hydratedState.newCharAvatar) referencedAvatars.add(hydratedState.newCharAvatar);
      if (hydratedState.tempMyAvatar) referencedAvatars.add(hydratedState.tempMyAvatar);
      pruneUnreferencedAvatarFiles(referencedAvatars);
      useNanaStore.getState().reconcileChatDeliveryStates();
      void useNanaStore.getState().reconcilePayments();
      void useNanaStore.getState().runProactiveChatHeartbeat();
      setStorageReady(true);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Nana could not load local data safely.');
    }
  }, []);

  useEffect(() => {
    void hydrateStorage();
  }, [hydrateStorage]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      return useNanaStore.getState().goBack();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      if (storageReady && previousState !== 'active' && nextState === 'active') {
        useNanaStore.getState().reconcileChatDeliveryStates();
        void useNanaStore.getState().reconcilePayments();
        void useNanaStore.getState().runProactiveChatHeartbeat();
      }
    });
    return () => subscription.remove();
  }, [storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    const timer = setInterval(() => {
      if (appStateRef.current === 'active') {
        void useNanaStore.getState().runProactiveChatHeartbeat();
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, [storageReady]);

  if (!storageReady) {
    return (
      <SafeAreaProvider>
        <StatusBar hidden />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: '#EFECE4' }}>
          {storageError ? (
            <>
              <Text style={{ color: '#3F4A67', fontSize: 18, fontWeight: '800', textAlign: 'center' }}>{t.localDataNeedsAttention}</Text>
              <Text style={{ color: '#63728E', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 10 }}>
                {storageError} {t.localDataUnchanged}
              </Text>
              <Pressable
                onPress={() => { void hydrateStorage(); }}
                style={{ minHeight: 44, marginTop: 18, paddingHorizontal: 22, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4C8D7' }}
              >
                <Text style={{ color: '#5E5672', fontSize: 14, fontWeight: '800' }}>{t.retrySafely}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator color="#A95770" />
              <Text style={{ color: '#63728E', fontSize: 13, marginTop: 12 }}>{t.loadingSecurely}</Text>
            </>
          )}
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar hidden />
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppContext.Provider value={{ t: t as any, renderAvatar, themeFont, customTextColor }}>
          <ErrorBoundary>
            <View style={{ flex: 1, backgroundColor: '#EFECE4' }}>
              <PhonePreviewFrame>
                <PhoneStatusBar />
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="index" />
                </Stack>
                <DynamicIsland />
                <VoiceGestureOverlay />
              </PhonePreviewFrame>
            </View>
          </ErrorBoundary>
        </AppContext.Provider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
