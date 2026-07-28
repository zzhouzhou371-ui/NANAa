import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, View, useWindowDimensions } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useApp } from '../context/AppContext';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { useNanaStore } from '../stores/nanaStore';
import type { Message, Payment, PaymentStatus } from '../types';
import { forwardMessagesToMemory } from '../utils/memory';
import { ChatInputBar } from './ChatInputBar';
import { ChatMessageBubble, TypingIndicator } from './ChatMessageBubble';
import type { ChatBubbleMaterialVariant } from './chat-bubble-surface';
import { NativeGradient } from './primitives';
import { SelectModeBar } from './SelectModeBar';

const SMOKE_PAYMENT_ID = 'smoke:payment:visual-state';
const SMOKE_PAYMENT_MESSAGE_ID = 9_900_001;
const SMOKE_VOICE_MESSAGE_ID = 9_900_002;
const SMOKE_VOICE_URI = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
const SMOKE_ORIGINAL_AVATARS = new Map<string, string>();
const DEFAULT_CHAT_BUBBLE_VARIANT: ChatBubbleMaterialVariant = (
  process.env.EXPO_PUBLIC_NANA_CHAT_BUBBLE_VARIANT === 'legacy'
    ? 'legacy'
    : 'borderlessGlass'
);
const SMOKE_CUSTOM_AVATAR = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
    <defs><linearGradient id="sky" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#203052"/><stop offset="1" stop-color="#A86879"/></linearGradient></defs>
    <rect width="256" height="256" rx="128" fill="url(#sky)"/>
    <circle cx="128" cy="98" r="48" fill="#E7B7A9"/>
    <path d="M67 224c8-52 31-76 61-76s53 24 61 76" fill="#171D35"/>
    <path d="M79 96c3-55 31-70 53-70 39 0 60 35 50 84-11-27-35-49-72-42-7 15-16 24-31 28z" fill="#21192B"/>
  </svg>
`)}`;

type SmokePaymentVisualStatus = Extract<PaymentStatus, 'sending' | 'pending' | 'completed' | 'refunded' | 'failed'>;
type NanaSmokeScope = typeof globalThis & {
  __NANA_SMOKE_SET_PAYMENT_STATE__?: (status: SmokePaymentVisualStatus) => void;
  __NANA_SMOKE_SET_CUSTOM_AVATAR__?: (enabled: boolean) => void;
  __NANA_SMOKE_SET_BUBBLE_VARIANT__?: (variant: 'a' | 'b') => void;
  __NANA_SMOKE_ADD_VOICE_SAMPLE__?: () => void;
  __NANA_SMOKE_SEED_LONG_CHAT__?: (count?: number) => void;
  __NANA_SMOKE_SET_LANGUAGE__?: (language: 'en' | 'zh') => void;
};

const clockMinutes = (value: string) => {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'AM') hours = hours % 12;
  if (meridiem === 'PM') hours = (hours % 12) + 12;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const shouldShowTimeSeparator = (messages: Message[], index: number) => {
  if (index === 0) return true;
  const current = clockMinutes(messages[index]?.time || '');
  const previous = clockMinutes(messages[index - 1]?.time || '');
  if (current === null || previous === null) return messages[index]?.time !== messages[index - 1]?.time;
  const elapsed = (current - previous + 24 * 60) % (24 * 60);
  return elapsed >= 5;
};

export function ChatView() {
  const { t, renderAvatar } = useApp();
  const scrollRef = useRef<FlashListRef<Message>>(null);
  const initialScrollChatId = useRef<string | null>(null);
  const lastMessageCount = useRef(0);
  const kbHeight = useKeyboardHeight();
  const { width, height } = useWindowDimensions();
  const compact = width <= 360 || height < 700;
  const [bubbleVariant, setBubbleVariant] = useState<ChatBubbleMaterialVariant>(DEFAULT_CHAT_BUBBLE_VARIANT);

  const activeChatId = useNanaStore(state => state.activeChatId);
  const characters = useNanaStore(state => state.characters);
  const chatHistory = useNanaStore(state => state.chatHistory);
  const pendingChatRequests = useNanaStore(state => state.pendingChatRequests);
  const myAvatar = useNanaStore(state => state.myAvatar);
  const selectMode = useNanaStore(state => state.selectMode);
  const chatPanel = useNanaStore(state => state.chatPanel);
  const paymentModal = useNanaStore(state => state.paymentModal);

  const messages = useMemo(
    () => activeChatId ? chatHistory[activeChatId] || [] : [],
    [activeChatId, chatHistory],
  );
  const messageCount = messages.length;
  const isGenerating = activeChatId ? !!pendingChatRequests[activeChatId] : false;
  const paymentModalOpen =
    paymentModal.type === 'transfer' || paymentModal.type === 'redpacket';

  useEffect(() => {
    if (process.env.EXPO_PUBLIC_NANA_SMOKE !== '1' || process.env.EXPO_OS !== 'web' || !activeChatId) return undefined;
    const scope = globalThis as NanaSmokeScope;
    const currentAvatar = useNanaStore.getState().characters.find(character => character.id === activeChatId)?.avatar;
    if (!SMOKE_ORIGINAL_AVATARS.has(activeChatId) && currentAvatar !== SMOKE_CUSTOM_AVATAR) {
      SMOKE_ORIGINAL_AVATARS.set(activeChatId, currentAvatar || '');
    }

    scope.__NANA_SMOKE_SET_PAYMENT_STATE__ = (status) => {
      const now = Date.now();
      useNanaStore.setState(current => {
        const paymentStatus: PaymentStatus = status === 'failed' ? 'pending' : status;
        const payment: Payment = {
          schemaVersion: 1,
          id: SMOKE_PAYMENT_ID,
          chatId: activeChatId,
          kind: 'redPacket',
          direction: 'outgoing',
          senderId: 'user',
          recipientId: activeChatId,
          amountMinor: 8_800,
          currency: 'CNY',
          note: 'For our next sunset',
          status: paymentStatus,
          fundsState: status === 'completed' ? 'captured' : status === 'refunded' ? 'released' : 'held',
          createdAt: now - 4_000,
          updatedAt: now,
          pendingAt: now - 3_000,
          completedAt: status === 'completed' ? now : undefined,
          expiresAt: now + 86_400_000,
          reactionState: status === 'failed' ? 'failed' : status === 'pending' ? 'scheduled' : status === 'sending' ? 'idle' : 'resolved',
          reactionAttempts: status === 'failed' ? 1 : 0,
          reactionError: status === 'failed' ? 'Smoke-test retry state' : undefined,
        };
        const currentMessages = (current.chatHistory[activeChatId] || []).filter(message => message.id !== SMOKE_PAYMENT_MESSAGE_ID);
        return {
          paymentsById: { ...current.paymentsById, [SMOKE_PAYMENT_ID]: payment },
          chatHistory: {
            ...current.chatHistory,
            [activeChatId]: [...currentMessages, {
              id: SMOKE_PAYMENT_MESSAGE_ID,
              sender: 'user',
              text: '',
              time: '09:33 AM',
              avatar: current.myAvatar,
              type: 'payment',
              paymentId: SMOKE_PAYMENT_ID,
            }],
          },
        };
      });
    };

    scope.__NANA_SMOKE_SET_CUSTOM_AVATAR__ = (enabled) => {
      useNanaStore.setState(current => ({
        characters: current.characters.map(character => (
          character.id === activeChatId
            ? { ...character, avatar: enabled ? SMOKE_CUSTOM_AVATAR : SMOKE_ORIGINAL_AVATARS.get(activeChatId) ?? character.avatar }
            : character
        )),
      }));
    };
    scope.__NANA_SMOKE_SET_BUBBLE_VARIANT__ = (variant) => {
      setBubbleVariant(variant === 'a' ? 'legacy' : 'borderlessGlass');
    };
    scope.__NANA_SMOKE_SET_LANGUAGE__ = (language) => {
      useNanaStore.setState(current => ({
        themeConfig: { ...current.themeConfig, language },
      }));
    };
    scope.__NANA_SMOKE_ADD_VOICE_SAMPLE__ = () => {
      useNanaStore.setState(current => {
        const character = current.characters.find(item => item.id === activeChatId);
        const currentMessages = (current.chatHistory[activeChatId] || []).filter(message => message.id !== SMOKE_VOICE_MESSAGE_ID);
        return {
          chatHistory: {
            ...current.chatHistory,
            [activeChatId]: [...currentMessages, {
              id: SMOKE_VOICE_MESSAGE_ID,
              sender: 'char',
              text: '',
              time: '09:32 AM',
              avatar: character?.avatar || '',
              type: 'voice',
              audioUri: SMOKE_VOICE_URI,
              audioDurationSec: 15,
            }],
          },
        };
      });
    };
    scope.__NANA_SMOKE_SEED_LONG_CHAT__ = (requestedCount = 2_000) => {
      const count = Math.max(1, Math.min(5_000, Math.floor(requestedCount)));
      useNanaStore.setState(current => ({
        chatHistory: {
          ...current.chatHistory,
          [activeChatId]: Array.from({ length: count }, (_, index) => ({
            id: 8_000_000 + index,
            sender: index % 2 === 0 ? 'char' : 'user',
            text: `Long history message ${index + 1}`,
            time: `09:${String(index % 60).padStart(2, '0')} AM`,
            type: 'text' as const,
          })),
        },
      }));
    };

    return () => {
      delete scope.__NANA_SMOKE_SET_PAYMENT_STATE__;
      delete scope.__NANA_SMOKE_SET_CUSTOM_AVATAR__;
      delete scope.__NANA_SMOKE_SET_BUBBLE_VARIANT__;
      delete scope.__NANA_SMOKE_ADD_VOICE_SAMPLE__;
      delete scope.__NANA_SMOKE_SEED_LONG_CHAT__;
      delete scope.__NANA_SMOKE_SET_LANGUAGE__;
    };
  }, [activeChatId]);

  useEffect(() => {
    initialScrollChatId.current = null;
    const state = useNanaStore.getState();
    lastMessageCount.current = activeChatId ? (state.chatHistory[activeChatId] || []).length : 0;
  }, [activeChatId]);

  useEffect(() => {
    if (!activeChatId || initialScrollChatId.current !== activeChatId) return;
    if (messageCount !== lastMessageCount.current || kbHeight > 0) {
      const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 40);
      lastMessageCount.current = messageCount;
      return () => clearTimeout(timer);
    }
    lastMessageCount.current = messageCount;
    return undefined;
  }, [activeChatId, kbHeight, messageCount]);

  const handleAvatarClick = useCallback(() => {
    useNanaStore.setState({ activeProfileId: activeChatId, weChatPage: 'profile' });
  }, [activeChatId]);

  const notifyMemory = (description: string, status: 'memory' | 'processing' | 'success' | 'error' = 'memory') => {
    const character = activeChatId ? characters.find(item => item.id === activeChatId) : undefined;
    useNanaStore.setState({
      islandNotification: {
        title: character?.name || t.memory,
        desc: description,
        icon: character?.avatar,
        status,
      },
    });
    if (status !== 'processing') {
      setTimeout(() => useNanaStore.setState({ islandNotification: null }), 2600);
    }
  };

  const rememberSelectedMessages = () => {
    if (!activeChatId) return;
    const state = useNanaStore.getState();
    const selected = messages.filter(message => (
      message.sender !== 'system' && state.selectedMsgIds.includes(message.id)
    ));
    if (selected.length === 0) return;

    const character = characters.find(item => item.id === activeChatId);
    const result = forwardMessagesToMemory({
      entries: state.worldBookEntries,
      messages: selected,
      character,
      characterId: activeChatId,
    });
    if (result.count === 0 || !result.lastForwardedId) return;

    notifyMemory(t.processing, 'processing');
    useNanaStore.setState(current => ({
      worldBookEntries: result.entries,
      selectMode: false,
      selectedMsgIds: [],
      lastForwardedMsgId: {
        ...current.lastForwardedMsgId,
        [activeChatId]: result.lastForwardedId!,
      },
    }));

    setTimeout(() => {
      notifyMemory(t.forwardedToMemory.replace('{n}', String(result.count)), 'success');
    }, 220);
  };

  const renderMessage = useCallback(({ item: message, index }: { item: Message; index: number }) => (
    <ChatMessageBubble
      msg={message}
      activeChatId={activeChatId}
      characters={characters}
      renderAvatar={renderAvatar}
      myAvatar={myAvatar}
      onRetry={() => void useNanaStore.getState().retryChatMessage(message.id)}
      onAvatarClick={handleAvatarClick}
      isGenerating={isGenerating}
      showTime={shouldShowTimeSeparator(messages, index)}
      bubbleVariant={bubbleVariant}
    />
  ), [
    activeChatId,
    bubbleVariant,
    characters,
    handleAvatarClick,
    isGenerating,
    messages,
    myAvatar,
    renderAvatar,
  ]);

  return (
    <View
      style={{
        flex: 1,
        minHeight: 0,
        // useKeyboardHeight returns only the IME portion not already handled by
        // Android adjustResize, so this works for edge-to-edge and resized apps.
        paddingBottom: chatPanel === 'none' ? kbHeight : 0,
      }}
    >
      {selectMode ? <SelectModeBar onForward={rememberSelectedMessages} /> : null}

      <View style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <FlashList
          key={activeChatId}
          ref={scrollRef}
          data={messages}
          keyExtractor={message => String(message.id)}
          renderItem={renderMessage}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          onTouchStart={() => {
            if (kbHeight > 0) Keyboard.dismiss();
          }}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1, flexShrink: 1, minHeight: 0 }}
          contentContainerStyle={{
            paddingHorizontal: compact ? 4 : 9,
            paddingTop: compact ? 3 : 7,
            paddingBottom: 12,
          }}
          maintainVisibleContentPosition={{
            startRenderingFromBottom: true,
            autoscrollToBottomThreshold: 0.2,
            animateAutoScrollToBottom: true,
          }}
          onLoad={() => {
            if (!activeChatId) return;
            initialScrollChatId.current = activeChatId;
            lastMessageCount.current = messageCount;
          }}
          ListFooterComponent={isGenerating ? (
            <TypingIndicator
              activeChatId={activeChatId}
              characters={characters}
              renderAvatar={renderAvatar}
              bubbleVariant={bubbleVariant}
            />
          ) : null}
        />

        {compact ? (
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, left: 0, height: 12 }}>
            <NativeGradient
              direction="to-b"
              colors={['rgba(7, 5, 10, 0.5)', 'rgba(7, 5, 10, 0)']}
              borderRadius={0}
              style={{ flex: 1 }}
            >
              <View />
            </NativeGradient>
          </View>
        ) : null}
      </View>

      {!selectMode && !paymentModalOpen ? <ChatInputBar /> : null}
    </View>
  );
}
