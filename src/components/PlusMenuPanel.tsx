import { Alert, Keyboard, Platform, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { Banknote, BookmarkCheck, Gift, Image as ImageIcon } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import {
  consumePendingPhotoChat,
  pickPhotoFromLibrary,
  rememberPendingPhotoChat,
  takePhotoWithSystemCamera,
  type PhotoPickerSource,
} from '../services/nativeImagePickerRuntime';
import { useNanaStore } from '../stores/nanaStore';
import { NeumorphicSurface, neumorphicPalette } from './neumorphic-surface';
import { AnimatedPressable } from './primitives';

type MenuItem = {
  testID: string;
  label: string;
  icon: ReactNode;
  onPress: () => void;
};

export function PlusMenuPanel() {
  const { t } = useApp();
  const activeChatId = useNanaStore(state => state.activeChatId);
  const characters = useNanaStore(state => state.characters);
  const set = useNanaStore.setState;

  const sendPhoto = async (source: PhotoPickerSource) => {
    if (!activeChatId) return;
    const activeCharacter = characters.find(character => character.id === activeChatId);
    set({
      chatPanel: 'none',
      islandNotification: {
        title: t.photo,
        desc: source === 'camera' ? `${t.camera}...` : `${t.photoLibrary}...`,
        icon: activeCharacter?.avatar,
        status: 'processing',
      },
    });

    await rememberPendingPhotoChat(activeChatId);
    const capture = source === 'camera'
      ? await takePhotoWithSystemCamera()
      : await pickPhotoFromLibrary();
    await consumePendingPhotoChat();

    if (capture.canceled) {
      set({ islandNotification: null });
      return;
    }
    if (capture.phase !== 'ready' || !capture.localUri) {
      set({
        islandNotification: {
          title: t.photo,
          desc: capture.errorMessage || t.photoAttachFailed,
          icon: activeCharacter?.avatar,
          status: 'error',
        },
      });
      setTimeout(() => useNanaStore.setState({ islandNotification: null }), 2600);
      return;
    }

    await useNanaStore.getState().sendChatMessage('image', undefined, t.photo, capture);
  };

  const openPhotoSource = () => {
    if (Platform.OS === 'web') {
      void sendPhoto('library');
      return;
    }
    Alert.alert(t.photo, t.choosePhotoSource, [
      { text: t.cancel, style: 'cancel' },
      { text: t.photoLibrary, onPress: () => void sendPhoto('library') },
      { text: t.camera, onPress: () => void sendPhoto('camera') },
    ]);
  };

  const openPayment = (type: 'transfer' | 'redpacket') => {
    Keyboard.dismiss();
    set({ paymentModal: { type }, chatPanel: 'none', paymentAmount: '', paymentNote: '' });
  };

  const beginRemembering = () => {
    set({ selectMode: true, selectedMsgIds: [], chatPanel: 'none' });
  };

  const items: MenuItem[] = [
    {
      testID: 'plus-photo-button',
      label: t.photo,
      icon: <ImageIcon size={22} color={neumorphicPalette.onLightPrimary} strokeWidth={1.7} />,
      onPress: openPhotoSource,
    },
    {
      testID: 'plus-red-packet-button',
      label: t.redPacket,
      icon: <Gift size={22} color={neumorphicPalette.onLightPrimary} strokeWidth={1.7} />,
      onPress: () => openPayment('redpacket'),
    },
    {
      testID: 'plus-transfer-button',
      label: t.transfer,
      icon: <Banknote size={22} color={neumorphicPalette.onLightPrimary} strokeWidth={1.7} />,
      onPress: () => openPayment('transfer'),
    },
    {
      testID: 'plus-memory-button',
      label: t.rememberMessages,
      icon: <BookmarkCheck size={22} color={neumorphicPalette.onLightPrimary} strokeWidth={1.7} />,
      onPress: beginRemembering,
    },
  ];

  return (
    <View style={{ flex: 1, justifyContent: 'flex-start', paddingHorizontal: 4, paddingTop: 12, paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 6 }}>
        {items.map(item => (
          <AnimatedPressable
            key={item.testID}
            testID={item.testID}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            onPress={item.onPress}
            scale={0.96}
            style={{ flex: 1, minWidth: 0, height: 100 }}
          >
            <NeumorphicSurface
              pointerEvents="none"
              depth="raisedSmall"
              tone="base"
              radius={16}
              style={{ width: '100%', height: 94 }}
              contentStyle={{ alignItems: 'center', paddingTop: 7 }}
            >
              <NeumorphicSurface
                depth="inset"
                tone="accent"
                radius={16}
                style={{ width: 46, height: 46 }}
                contentStyle={{ alignItems: 'center', justifyContent: 'center' }}
              >
                {item.icon}
              </NeumorphicSurface>
              <View style={{ height: 32, marginTop: 6, paddingHorizontal: 2, alignItems: 'center' }}>
                <Text
                  numberOfLines={2}
                  style={{
                    color: neumorphicPalette.onLightSecondary,
                    fontSize: 11.5,
                    lineHeight: 15,
                    fontWeight: '600',
                    textAlign: 'center',
                    includeFontPadding: false,
                  }}
                >
                  {item.label}
                </Text>
              </View>
            </NeumorphicSurface>
          </AnimatedPressable>
        ))}
      </View>
    </View>
  );
}
