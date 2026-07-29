import { Alert, AppState, BackHandler, Keyboard, Platform, Pressable, StyleSheet, View, Text, ScrollView, useWindowDimensions, type AppStateStatus } from 'react-native';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { MotiView } from 'moti';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BookOpen,
  Brain,
  Ban,
  ChevronLeft,
  Image,
  MessageCircleMore,
  MoonStar,
  MoreHorizontal,
  Music,
  Palette,
  Phone,
  Video,
  Plus,
  Settings,
  SlidersHorizontal,
  UserRoundPen,
  Users,
  UserRound,
  Eraser,
  Trash2,
  X,
} from 'lucide-react-native';
import { useApp } from '../../context/AppContext';
import { useNanaStore } from '../../stores/nanaStore';
import { triggerHaptic } from '../../utils/haptics';
import { WeChatRootView } from '../../components/WeChatRootView';
import { CharacterView } from '../../components/CharacterView';
import { SettingsView } from '../../components/SettingsView';
import { ThemeView } from '../../components/ThemeView';
import { UserView } from '../../components/UserView';
import { PresetsView } from '../../components/PresetsView';
import { WorldBookView } from '../../components/WorldBookView';
import { wechatTheme } from '../../components/wechatTheme';
import { PromptModal } from '../../components/PromptModal';
import { AppGridIcon } from '../../components/system/AppGridIcon';
import { BottomDock } from '../../components/system/BottomDock';
import {
  useDynamicIslandExpanded,
  useReduceMotionEnabled,
} from '../../components/system/DynamicIsland';
import { HomeWeatherWidget } from '../../components/system/HomeWeatherWidget';
import { SkyScene } from '../../components/system/SkyScene';
import {
  ThickGlassBackdropProvider,
  ThickGlassBackdropTarget,
} from '../../components/thick-glass-surface';
import { palette } from '../../constants/design';

const APPS = [
  { labelKey: 'wechat', icon: <MessageCircleMore size={22} color="#4B9A82" strokeWidth={2.2} />, colors: ['#FFFFFF', '#D9F0F0'] as [string, string], app: 'wechat', assetPreview: require('../../../assets/generated/nana-neumorphic-icons-v1/wechat.png') },
  { labelKey: 'worldBook', icon: <BookOpen size={21} color="#557FA9" strokeWidth={2.1} />, colors: ['#FFFFFF', '#D9EEFF'] as [string, string], app: 'worldbook', assetPreview: require('../../../assets/generated/nana-neumorphic-icons-v1/worldbook.png') },
  { labelKey: 'presets', icon: <SlidersHorizontal size={21} color="#C06A91" strokeWidth={2.1} />, colors: ['#FFFFFF', '#F4C8D7'] as [string, string], app: 'presets', assetPreview: require('../../../assets/generated/nana-neumorphic-icons-v1/presets.png') },
  { labelKey: 'settings', icon: <Settings size={22} color="#65738F" strokeWidth={2.1} />, colors: ['#FFFFFF', '#EEF5FB'] as [string, string], app: 'settings', assetPreview: require('../../../assets/generated/nana-neumorphic-icons-v1/settings.png') },
  { labelKey: 'characters', icon: <Users size={21} color="#4F8A98" strokeWidth={2.1} />, colors: ['#FFFFFF', '#D9F0F0'] as [string, string], app: 'characters', assetPreview: require('../../../assets/generated/nana-kuromi-v1/characters-kuromi.png') },
  { labelKey: 'user', icon: <UserRoundPen size={21} color="#B36A91" strokeWidth={2.1} />, colors: ['#FFFFFF', '#F6DDE7'] as [string, string], app: 'user', assetPreview: require('../../../assets/generated/nana-neumorphic-icons-v1/user.png') },
  { labelKey: 'theme', icon: <Palette size={21} color="#6674B0" strokeWidth={2.1} />, colors: ['#FFFFFF', '#EBE3FF'] as [string, string], app: 'theme', assetPreview: require('../../../assets/generated/nana-neumorphic-icons-v1/theme.png') },
  { labelKey: 'sounds', icon: <Music size={21} color="#9A3B6E" strokeWidth={2.1} />, colors: ['#FFFFFF', '#EBE3FF'] as [string, string], app: null, assetPreview: require('../../../assets/generated/nana-neumorphic-icons-v1/sounds.png') },
  { labelKey: 'photos', icon: <Image size={21} color="#C06A91" strokeWidth={2.1} />, colors: ['#FFFFFF', '#F4C8D7'] as [string, string], app: null, assetPreview: require('../../../assets/generated/nana-neumorphic-icons-v1/photos.png') },
];

const DesktopRuntimeActivityContext = createContext(true);

function useAppStateActive() {
  const [appState, setAppState] = useState<AppStateStatus>(() => AppState.currentState ?? 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  return appState === 'active';
}

function AppContent({ activeApp }: { activeApp: string | null }) {
  if (activeApp === 'wechat') return <WeChatRootView />;
  if (activeApp === 'characters') return <CharacterView />;
  if (activeApp === 'settings') return <SettingsView />;
  if (activeApp === 'worldbook') return <WorldBookView />;
  if (activeApp === 'theme') return <ThemeView />;
  if (activeApp === 'user') return <UserView />;
  if (activeApp === 'presets') return <PresetsView />;
  return null;
}
function ShellGlassButton({ onPress, label, children, testID }: { onPress: () => void; label: string; children: ReactNode; testID?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        borderCurve: 'continuous',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? 'rgba(255, 226, 235, 0.14)' : 'rgba(16, 9, 16, 0.42)',
        borderWidth: 0.5,
        borderColor: wechatTheme.line,
      })}
    >
      {children}
    </Pressable>
  );
}

type ChatHeaderMenu = 'none' | 'call' | 'more' | 'manage';

function ChatHeaderPopover({
  top,
  right,
  items,
  onDismiss,
  closeLabel,
}: {
  top: number;
  right: number;
  items: { label: string; icon: ReactNode; onPress: () => void; destructive?: boolean; testID?: string }[];
  onDismiss: () => void;
  closeLabel: string;
}) {
  return (
    <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 70 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onDismiss} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
      <View
        style={{
          position: 'absolute',
          top,
          right,
          width: 208,
          borderRadius: 16,
          paddingVertical: 4,
          overflow: 'hidden',
          backgroundColor: 'rgba(20, 11, 18, 0.97)',
          borderWidth: 0.5,
          borderColor: wechatTheme.line,
        }}
      >
        {items.map((item, index) => (
          <Pressable
            key={item.label}
            testID={item.testID}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            onPress={item.onPress}
            style={({ pressed }) => ({
              minHeight: 48,
              backgroundColor: pressed ? 'rgba(255, 243, 238, 0.08)' : 'transparent',
              borderTopWidth: index === 0 ? 0 : 0.5,
              borderTopColor: wechatTheme.line,
            })}
          >
            <View
              pointerEvents="none"
              style={{
                width: '100%',
                minHeight: 48,
                paddingHorizontal: 13,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <View style={{ width: 28, height: 28, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}>{item.icon}</View>
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  minWidth: 0,
                  color: item.destructive ? wechatTheme.peach : wechatTheme.ink,
                  fontSize: 14,
                  lineHeight: 18,
                  fontWeight: '600',
                  includeFontPadding: false,
                }}
              >
                {item.label}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function AppOverlay() {
  const { t } = useApp();
  const storeActiveApp = useNanaStore(s => s.activeApp);
  const [renderedApp, setRenderedApp] = useState(storeActiveApp);
  const callOverlay = useNanaStore(s => s.callOverlay);
  const chromeStyle = useNanaStore(s => s.themeConfig.chromeStyle);
  const weChatPage = useNanaStore(s => s.weChatPage);
  const weChatTab = useNanaStore(s => s.weChatTab);
  const activeChatId = useNanaStore(s => s.activeChatId);
  const characters = useNanaStore(s => s.characters);
  const activeMessages = useNanaStore(s => activeChatId ? s.chatHistory[activeChatId] : undefined);
  const pendingChatRequests = useNanaStore(s => s.pendingChatRequests);
  const worldBookView = useNanaStore(s => s.worldBookView);
  const worldBookCharId = useNanaStore(s => s.worldBookCharId);
  const presetView = useNanaStore(s => s.presetView);
  const editingPreset = useNanaStore(s => s.editingPreset);
  const characterEditorOpen = useNanaStore(s => s.characterEditorOpen);
  const editingCharId = useNanaStore(s => s.editingCharId);
  const set = useNanaStore.setState;
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const compactHeight = height < 700;
  const compactWidth = width <= 340;
  const islandExpanded = useDynamicIslandExpanded();
  const reduceMotionEnabled = useReduceMotionEnabled();
  const [chatHeaderMenu, setChatHeaderMenu] = useState<ChatHeaderMenu>('none');
  const activeApp = storeActiveApp ?? renderedApp;
  const isCallActive = activeApp === 'wechat' && callOverlay.show;
  const shellInk = wechatTheme.ink;
  const shellMuted = wechatTheme.inkMuted;
  const dismissChatKeyboard = () => {
    Keyboard.dismiss();
    set({ chatPanel: 'none' });
  };

  const activeCharacter = activeChatId ? characters.find(c => c.id === activeChatId) : undefined;
  const charName = activeCharacter?.name || '';
  const latestConversationTime = useMemo(() => {
    if (!activeMessages) return undefined;
    for (let index = activeMessages.length - 1; index >= 0; index -= 1) {
      const message = activeMessages[index];
      if (message.sender !== 'system') return message.time;
    }
    return undefined;
  }, [activeMessages]);
  const headerActivity = activeChatId && pendingChatRequests[activeChatId]
    ? t.composingReply
    : latestConversationTime
      ? t.lastExchange.replace('{time}', latestConversationTime)
      : t.newConversation;
  const worldBookCharName = worldBookCharId ? characters.find(c => c.id === worldBookCharId)?.name : '';
  const isWeChatChat = activeApp === 'wechat' && weChatPage === 'chat' && !!activeChatId;
  const isWeChatRoot = activeApp === 'wechat' && weChatPage === 'root';
  const islandTopOffset = chromeStyle === 'neumorphic-v1' ? 5 : compactHeight ? 4 : 10;
  const islandSafeHeight = islandExpanded ? (compactHeight ? 60 : 66) : 44;
  const shellTopPadding = Math.max(
    insets.top + islandTopOffset + islandSafeHeight + 8,
    compactHeight ? 64 : 70,
  );

  useEffect(() => {
    setChatHeaderMenu('none');
  }, [activeChatId, weChatPage]);

  useEffect(() => {
    if (storeActiveApp) {
      setRenderedApp(storeActiveApp);
      return undefined;
    }
    if (!renderedApp) return undefined;
    const timer = setTimeout(
      () => setRenderedApp(null),
      reduceMotionEnabled ? 100 : 220,
    );
    return () => clearTimeout(timer);
  }, [reduceMotionEnabled, renderedApp, storeActiveApp]);

  useEffect(() => {
    if (chatHeaderMenu === 'none' || Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setChatHeaderMenu('none');
      return true;
    });
    return () => subscription.remove();
  }, [chatHeaderMenu]);

  const startHeaderCall = (type: 'voice' | 'video') => {
    if (!activeChatId) return;
    setChatHeaderMenu('none');
    useNanaStore.getState().startOutgoingCall(type);
    set({
      islandNotification: {
        title: activeCharacter?.name || t.wechat,
        desc: type === 'voice' ? t.voiceCall : t.videoCall,
        icon: activeCharacter?.avatar,
        status: 'processing',
      },
    });
    setTimeout(() => useNanaStore.setState({ islandNotification: null }), 1800);
  };

  const openSharedMemories = () => {
    if (!activeChatId) return;
    setChatHeaderMenu('none');
    useNanaStore.getState().setActiveApp('worldbook');
    set({ activeApp: 'worldbook', worldBookView: 'chardetail', worldBookCharId: activeChatId });
  };

  const openCharacterProfile = () => {
    setChatHeaderMenu('none');
    set({ activeProfileId: activeChatId, weChatPage: 'profile' });
  };

  const toggleBlocked = () => {
    if (!activeChatId) return;
    const state = useNanaStore.getState();
    const blocked = state.blockedUsers.includes(activeChatId);
    set({ blockedUsers: blocked ? state.blockedUsers.filter(id => id !== activeChatId) : [...state.blockedUsers, activeChatId] });
    setChatHeaderMenu('none');
  };

  const clearCurrentChat = () => {
    if (!activeChatId) return;
    setChatHeaderMenu('none');
    Alert.alert(t.clearMessages, t.clearChatConfirm, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.clear,
        style: 'destructive',
        onPress: () => useNanaStore.getState().clearChat(activeChatId),
      },
    ]);
  };

  const deleteCurrentContact = () => {
    if (!activeChatId) return;
    setChatHeaderMenu('none');
    Alert.alert(t.delete, t.deleteContactConfirm, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete,
        style: 'destructive',
        onPress: () => {
          const state = useNanaStore.getState();
          set({ friends: state.friends.filter(id => id !== activeChatId), activeChatId: null, weChatPage: 'root' });
        },
      },
    ]);
  };

  const getTitle = () => {
    if (activeApp === 'wechat' && weChatPage === 'chat' && activeChatId) return charName;
    if (activeApp === 'wechat' && weChatPage === 'profile') return t.profile;
    if (activeApp === 'wechat' && weChatPage === 'context') return t.aiContext;
    if (activeApp === 'wechat' && weChatPage === 'moments') return t.moments;
    if (activeApp === 'wechat' && weChatPage === 'stickers') return t.stickers;
    if (activeApp === 'wechat' && weChatPage === 'wallet') return t.wallet;
    if (activeApp === 'wechat') {
      if (weChatTab === 'contacts') return t.contacts;
      if (weChatTab === 'discover') return t.discover;
      if (weChatTab === 'me') return t.me;
      return t.chats;
    }
    if (activeApp === 'worldbook' && worldBookView === 'edit') return t.entryDetails;
    if (activeApp === 'worldbook' && worldBookView === 'chardetail') return worldBookCharName || t.worldBook;
    if (activeApp === 'worldbook') return t.worldBook;
    if (activeApp === 'presets' && presetView === 'edit') return editingPreset?.id ? t.edit : t.newPreset;
    if (activeApp === 'characters' && characterEditorOpen) return editingCharId ? t.edit : t.addCharacter;
    return (t as any)[activeApp as string] || activeApp;
  };

  const canGoBack =
    (activeApp === 'wechat' && (weChatPage !== 'root' || !!activeChatId)) ||
    (activeApp === 'worldbook' && worldBookView !== 'list') ||
    (activeApp === 'presets' && presetView !== 'list') ||
    (activeApp === 'characters' && characterEditorOpen);

  const showPrimaryAction =
    (activeApp === 'wechat' && weChatPage === 'moments') ||
    (activeApp === 'worldbook' && worldBookView !== 'edit') ||
    (activeApp === 'presets' && presetView === 'list') ||
    activeApp === 'characters';

  const handlePrimaryAction = () => {
    if (activeApp === 'wechat' && weChatPage === 'moments') {
      set({ showComposeMoment: true });
      return;
    }
    if (activeApp === 'worldbook') {
      set({
        editKeys: '',
        editContent: '',
        editCharId: worldBookView === 'chardetail' ? (worldBookCharId || '') : '',
        editAlwaysActive: false,
        editingEntryId: null,
        worldBookView: 'edit',
      });
      return;
    }
    if (activeApp === 'presets') {
      set({ editingPreset: null, presetView: 'edit' });
      return;
    }
    if (activeApp === 'characters') {
      set({
        characterEditorOpen: true,
        editingCharId: null,
        newCharName: '',
        newCharAvatar: '',
        newCharDesc: '',
        newCharGender: '',
        newCharAge: '',
        newCharPreferredReplyMode: 'auto',
        newCharSupportsVoiceReply: false,
        newCharVoiceProfileId: '',
        newCharSupportsVideoPersona: false,
        newCharVideoPersonaAsset: '',
      });
    }
  };

  const activeChatBlocked = !!(activeChatId && useNanaStore.getState().blockedUsers.includes(activeChatId));
  const headerMenuItems = chatHeaderMenu === 'call'
    ? [
        {
          label: t.voiceCall,
          testID: 'header-voice-call-button',
          icon: <Phone size={19} color={wechatTheme.peach} strokeWidth={1.7} />,
          onPress: () => startHeaderCall('voice'),
        },
        {
          label: t.videoCall,
          testID: 'header-video-call-button',
          icon: <Video size={19} color={wechatTheme.memory} strokeWidth={1.7} />,
          onPress: () => startHeaderCall('video'),
        },
      ]
    : chatHeaderMenu === 'more'
      ? [
          {
            label: t.sharedMemories,
            testID: 'header-shared-memories-button',
            icon: <Brain size={19} color={wechatTheme.memory} strokeWidth={1.7} />,
            onPress: openSharedMemories,
          },
          {
            label: t.characterProfile,
            testID: 'header-character-profile-button',
            icon: <UserRound size={19} color={wechatTheme.peach} strokeWidth={1.7} />,
            onPress: openCharacterProfile,
          },
          {
            label: t.manageChat,
            testID: 'header-manage-chat-button',
            icon: <Settings size={19} color={wechatTheme.inkMuted} strokeWidth={1.7} />,
            onPress: () => setChatHeaderMenu('manage'),
          },
        ]
      : chatHeaderMenu === 'manage'
        ? [
            {
              label: activeChatBlocked ? t.unblock : t.block,
              testID: 'header-block-button',
              icon: <Ban size={19} color={wechatTheme.inkMuted} strokeWidth={1.7} />,
              onPress: toggleBlocked,
            },
            {
              label: t.clearMessages,
              testID: 'header-clear-chat-button',
              icon: <Eraser size={19} color={wechatTheme.money} strokeWidth={1.7} />,
              onPress: clearCurrentChat,
            },
            {
              label: t.delete,
              testID: 'header-delete-contact-button',
              destructive: true,
              icon: <Trash2 size={19} color={wechatTheme.peach} strokeWidth={1.7} />,
              onPress: deleteCurrentContact,
            },
          ]
        : [];

  const content = (
    <MotiView
      from={{ paddingTop: isCallActive ? 0 : shellTopPadding }}
      animate={{ paddingTop: isCallActive ? 0 : shellTopPadding }}
      transition={reduceMotionEnabled
        ? { type: 'timing', duration: 100 }
        : { type: 'spring', damping: 24, stiffness: 245, mass: 0.8 }}
      style={{
        flex: 1,
        paddingHorizontal: isCallActive ? 0 : (isWeChatChat ? 0 : (activeApp === 'wechat' ? (compactHeight ? 12 : 16) : 20)),
        paddingBottom: isCallActive ? 0 : 8,
      }}
    >
      {!isCallActive && <View style={{ marginBottom: compactHeight ? 8 : 14, paddingHorizontal: isWeChatChat ? (compactHeight ? 12 : 16) : 0 }}>
        {isWeChatChat ? (
          <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: compactHeight ? 8 : 10 }}>
            <ShellGlassButton label={t.chats} onPress={() => { dismissChatKeyboard(); useNanaStore.getState().goBack(); }}>
              <ChevronLeft size={21} color={shellInk} />
            </ShellGlassButton>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.characterProfile}
              onPress={() => { dismissChatKeyboard(); set({ activeProfileId: activeChatId, weChatPage: 'profile' }); }}
              style={{
                position: 'absolute',
                left: compactWidth ? 54 : 92,
                right: compactWidth ? 98 : 104,
                top: 1,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 4,
              }}
            >
              <View style={{ maxWidth: '100%', alignItems: 'center', minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: shellInk, fontSize: compactHeight ? 17 : 18, lineHeight: 21, fontWeight: '700' }}>
                  {charName}
                </Text>
                <Text numberOfLines={1} style={{ maxWidth: '100%', color: shellMuted, fontSize: 11, lineHeight: 14, marginTop: 1 }}>
                  {compactWidth && latestConversationTime ? latestConversationTime : headerActivity}
                </Text>
              </View>
            </Pressable>

            <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: compactHeight ? 6 : 8 }}>
              <ShellGlassButton testID="header-call-button" label={`${t.voiceCall} / ${t.videoCall}`} onPress={() => { dismissChatKeyboard(); setChatHeaderMenu(current => current === 'call' ? 'none' : 'call'); }}>
                <Phone size={19} color={shellInk} />
              </ShellGlassButton>
              <ShellGlassButton testID="header-more-button" label={t.manageChat} onPress={() => { dismissChatKeyboard(); setChatHeaderMenu(current => current === 'more' ? 'none' : 'more'); }}>
                <MoreHorizontal size={20} color={shellInk} />
              </ShellGlassButton>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
              {canGoBack && (
                <ShellGlassButton label={t.goBack} onPress={() => useNanaStore.getState().goBack()}>
                  <ChevronLeft size={21} color={shellInk} />
                </ShellGlassButton>
              )}
              <View style={{ flexShrink: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    color: shellInk,
                    fontSize: isWeChatRoot ? 29 : 30,
                    lineHeight: 36,
                    fontWeight: isWeChatRoot ? '700' : '800',
                    fontFamily: isWeChatRoot ? 'PlayfairDisplay_700Bold' : undefined,
                    textTransform: 'capitalize',
                  }}
                >
                  {getTitle()}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {showPrimaryAction && (
                <ShellGlassButton label={t.add} onPress={handlePrimaryAction}>
                  <Plus size={20} color={shellInk} />
                </ShellGlassButton>
              )}
              <ShellGlassButton label={t.returnHome} onPress={() => useNanaStore.getState().setActiveApp(null)}>
                {isWeChatRoot ? <MoonStar size={19} color={shellInk} /> : <X size={20} color={shellInk} />}
              </ShellGlassButton>
            </View>
          </View>
        )}
      </View>}

      <View style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <AppContent activeApp={activeApp} />
        <PromptModal />
      </View>

      {isWeChatChat && chatHeaderMenu !== 'none' ? (
        <ChatHeaderPopover
          top={shellTopPadding + 50}
          right={compactHeight ? 12 : 16}
          items={headerMenuItems}
          closeLabel={t.closeMenu}
          onDismiss={() => setChatHeaderMenu('none')}
        />
      ) : null}
    </MotiView>
  );

  if (!activeApp) return null;

  return (
    <MotiView
      from={{ opacity: 0 }}
      animate={{ opacity: storeActiveApp ? 1 : 0 }}
      transition={{
        type: 'timing',
        duration: reduceMotionEnabled ? 100 : 220,
      }}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }}
    >
      <View style={{ flex: 1 }}>
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: 'rgba(7, 12, 29, 0.14)' },
          ]}
        />
        {content}
      </View>
    </MotiView>
  );
}

function AmbientBackground({
  overrideHour,
}: {
  overrideHour?: number | null;
}) {
  const active = useContext(DesktopRuntimeActivityContext);
  return <SkyScene active={active} overrideHour={overrideHour} />;
}

export default function HomeScreen() {
  const { t } = useApp();
  const activeApp = useNanaStore(s => s.activeApp);
  const chromeStyle = useNanaStore(s => s.themeConfig.chromeStyle);
  const set = useNanaStore.setState;
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const compactHeight = height < 700;
  const compactGrid = compactHeight || width <= 360;
  const contentWidth = Math.min(width - (compactGrid ? 22 : 36), 390);
  const islandExpanded = useDynamicIslandExpanded();
  const reduceMotionEnabled = useReduceMotionEnabled();
  const appStateActive = useAppStateActive();
  const desktopRuntimeActive = appStateActive && !activeApp;
  const islandTopOffset = chromeStyle === 'neumorphic-v1' ? 5 : compactHeight ? 4 : 10;
  const islandSafeHeight = islandExpanded ? (compactHeight ? 60 : 66) : 44;
  const homeTopPadding = insets.top + islandTopOffset + islandSafeHeight + 8;

  return (
    <DesktopRuntimeActivityContext.Provider value={desktopRuntimeActive}>
      <ThickGlassBackdropProvider>
        <View style={{ flex: 1, backgroundColor: palette.canvas }}>
          <ThickGlassBackdropTarget
            pointerEvents="none"
            style={StyleSheet.absoluteFillObject}
          >
            <AmbientBackground />
          </ThickGlassBackdropTarget>
        <View
          pointerEvents={activeApp ? 'none' : 'auto'}
          accessibilityElementsHidden={Boolean(activeApp)}
          importantForAccessibility={activeApp ? 'no-hide-descendants' : 'auto'}
          style={{ flex: 1, opacity: activeApp ? 0 : 1 }}
        >
          <MotiView
            animate={{ paddingTop: homeTopPadding }}
            transition={reduceMotionEnabled
              ? { type: 'timing', duration: 100 }
              : { type: 'timing', duration: 180 }}
            style={{ flex: 1, alignItems: 'center', paddingBottom: insets.bottom + 12 }}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ width: contentWidth, flexGrow: 1, paddingBottom: compactHeight ? 6 : 18 }}
            >
              <View style={{ marginTop: 2 }}>
                <HomeWeatherWidget active={desktopRuntimeActive} compact={compactGrid} />
              </View>

              <View
                style={{
                  marginTop: compactGrid ? 8 : 20,
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  rowGap: compactGrid ? 7 : 26,
                  columnGap: compactGrid ? 10 : 28,
                  alignSelf: 'center',
                  width: '100%',
                }}
              >
                {APPS.map((app) => {
                  const label = t[app.labelKey as keyof typeof t];
                  return <AppGridIcon
                    key={`${app.app}-${app.labelKey}`}
                    label={label}
                    icon={app.icon}
                    colors={app.colors}
                    assetPreview={app.assetPreview}
                    compact={compactGrid}
                    disabled={!app.app}
                    comingSoonLabel={t.comingSoon}
                    onPress={() => {
                      triggerHaptic('light');
                      if (!app.app) {
                        set({
                          islandNotification: {
                            title: label,
                            desc: t.comingSoon,
                            status: 'processing',
                          },
                        });
                        setTimeout(() => useNanaStore.setState({ islandNotification: null }), 1600);
                        return;
                      }
                      useNanaStore.getState().setActiveApp(app.app);
                    }}
                  />;
                })}
              </View>

              <View style={{ flex: 1, minHeight: compactGrid ? 8 : 70 }} />
            </ScrollView>

            <View style={{ width: Math.min(contentWidth, 316), marginBottom: 2 }}>
              <BottomDock compact={compactHeight} />
            </View>
          </MotiView>
        </View>

          <AppOverlay />
        </View>
      </ThickGlassBackdropProvider>
    </DesktopRuntimeActivityContext.Provider>
  );
}
