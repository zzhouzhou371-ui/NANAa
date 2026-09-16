import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useApp } from '../context/AppContext';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { useStableViewportMetrics } from '../hooks/useStableViewportMetrics';
import { useNanaStore } from '../stores/nanaStore';
import type { Message, Payment, PaymentStatus } from '../types';
import { forwardMessagesToMemory } from '../utils/memory';
import { ChatInputBar } from './ChatInputBar';
import { ChatMessageBubble, TypingIndicator } from './ChatMessageBubble';
import type { ChatBubbleMaterialVariant } from './chat-bubble-surface';
import { NativeGradient } from './primitives';
import { SelectModeBar } from './SelectModeBar';
import { MeetingHandoffCard } from './meeting-handoff-card';

const SMOKE_PAYMENT_ID = 'smoke:payment:visual-state';
const SMOKE_PAYMENT_MESSAGE_ID = 9_900_001;
const SMOKE_VOICE_MESSAGE_ID = 9_900_002;
const SMOKE_TRANSCRIPT_ANCHOR_MESSAGE_ID = 9_900_100;
const SMOKE_TRANSCRIPT_ANCHOR_MESSAGE_COUNT = 30;
const SMOKE_VOICE_URI = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
const SMOKE_ORIGINAL_AVATARS = new Map<string, string>();
const CHAT_READABILITY_SCRIM = 'rgba(11, 8, 17, 0.58)';
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
  __NANA_SMOKE_SCROLL_TO_VOICE_SAMPLE__?: () => boolean;
  __NANA_SMOKE_SEED_LONG_CHAT__?: (count?: number) => void;
  __NANA_SMOKE_SET_LANGUAGE__?: (language: 'en' | 'zh') => void;
  __NANA_SMOKE_SEED_MEETING_HANDOFF__?: () => void;
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

export function ChatView({ chatId }: { chatId?: string | null } = {}) {
  const { t, renderAvatar } = useApp();
  const scrollRef = useRef<FlashListRef<Message>>(null);
  const initialScrollChatId = useRef<string | null>(null);
  const lastMessageCount = useRef(0);
  const historyLoadChatId = useRef<string | null>(null);
  const historyCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kbHeight = useKeyboardHeight();
  const { compact, stableHeight } = useStableViewportMetrics();
  const [bubbleVariant, setBubbleVariant] = useState<ChatBubbleMaterialVariant>(DEFAULT_CHAT_BUBBLE_VARIANT);
  const [preparedHistoryChatId, setPreparedHistoryChatId] = useState<string | null>(null);

  const storeActiveChatId = useNanaStore(state => state.activeChatId);
  const activeChatId = chatId === undefined ? storeActiveChatId : chatId;
  const characters = useNanaStore(state => state.characters);
  const chatHistory = useNanaStore(state => state.chatHistory);
  const pendingChatRequests = useNanaStore(state => state.pendingChatRequests);
  const myAvatar = useNanaStore(state => state.myAvatar);
  const selectMode = useNanaStore(state => state.selectMode);
  const chatPanel = useNanaStore(state => state.chatPanel);
  const paymentModal = useNanaStore(state => state.paymentModal);
  const meetingHandoff = useNanaStore(state => activeChatId
    ? state.conversationContinuityByCharacter[activeChatId]?.meetingHandoff
    : undefined);

  const messages = useMemo(
    () => activeChatId ? chatHistory[activeChatId] || [] : [],
    [activeChatId, chatHistory],
  );
  const messageCount = messages.length;
  const historyFrameReady = !activeChatId
    || messageCount === 0
    || preparedHistoryChatId === activeChatId;
  const isGenerating = activeChatId ? !!pendingChatRequests[activeChatId] : false;
  const paymentModalOpen =
    paymentModal.type === 'transfer' || paymentModal.type === 'redpacket';
  const visibleMeetingHandoff = meetingHandoff
    && meetingHandoff.expiresAt > Date.now()
    && meetingHandoff.state !== 'dismissed'
    ? meetingHandoff
    : undefined;

  useEffect(() => {
    if (!visibleMeetingHandoff) return undefined;
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 60);
    return () => clearTimeout(timer);
  }, [visibleMeetingHandoff]);

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
    scope.__NANA_SMOKE_SEED_MEETING_HANDOFF__ = () => {
      const now = Date.now();
      useNanaStore.setState(current => {
        const existing = current.conversationContinuityByCharacter[activeChatId];
        return {
          conversationContinuityByCharacter: {
            ...current.conversationContinuityByCharacter,
            [activeChatId]: {
              schemaVersion: 1,
              characterId: activeChatId,
              emotion: existing?.emotion || 'warm',
              emotionReason: existing?.emotionReason,
              emotionUpdatedAt: existing?.emotionUpdatedAt || now,
              emotionExpiresAt: Math.max(existing?.emotionExpiresAt || 0, now + 36 * 60 * 60 * 1_000),
              topics: existing?.topics || [],
              openLoops: existing?.openLoops || [],
              meetingHandoff: {
                id: `smoke-handoff:${activeChatId}`,
                state: 'available',
                title: '雨停后的咖啡馆',
                premise: '你和 Luna 已在线上约好，雨停后在街角咖啡馆见面，继续刚才没说完的话。',
                sourceTurnId: 'smoke-chat-turn',
                sourceMessageIds: [9_901_001, 9_901_002],
                createdAt: now,
                updatedAt: now,
                expiresAt: now + 14 * 24 * 60 * 60 * 1_000,
              },
              lastTurnId: existing?.lastTurnId,
              updatedAt: now,
              expiresAt: now + 14 * 24 * 60 * 60 * 1_000,
            },
          },
        };
      });
    };
    scope.__NANA_SMOKE_ADD_VOICE_SAMPLE__ = () => {
      useNanaStore.setState(current => {
        const character = current.characters.find(item => item.id === activeChatId);
        const currentMessages = (current.chatHistory[activeChatId] || []).filter(message => (
          message.id !== SMOKE_VOICE_MESSAGE_ID
          && (
            message.id < SMOKE_TRANSCRIPT_ANCHOR_MESSAGE_ID
            || message.id >= SMOKE_TRANSCRIPT_ANCHOR_MESSAGE_ID + SMOKE_TRANSCRIPT_ANCHOR_MESSAGE_COUNT
          )
        ));
        const transcriptAnchorMessages: Message[] = Array.from(
          { length: SMOKE_TRANSCRIPT_ANCHOR_MESSAGE_COUNT },
          (_, index) => ({
            id: SMOKE_TRANSCRIPT_ANCHOR_MESSAGE_ID + index,
            sender: index % 2 === 0 ? 'user' : 'char',
            text: `Transcript anchor message ${index + 1}`,
            time: '09:33 AM',
            type: 'text',
          }),
        );
        return {
          chatHistory: {
            ...current.chatHistory,
            [activeChatId]: [
              ...currentMessages,
              {
                id: SMOKE_VOICE_MESSAGE_ID,
                sender: 'char',
                text: '',
                time: '09:32 AM',
                avatar: character?.avatar || '',
                type: 'voice',
                audioUri: SMOKE_VOICE_URI,
                audioDurationSec: 15,
                transcript: 'I saved this little voice note for you. The library is quiet today, so I can hear the rain against every window. Tell me when you are free.',
              },
              ...transcriptAnchorMessages,
            ],
          },
        };
      });
    };
    scope.__NANA_SMOKE_SCROLL_TO_VOICE_SAMPLE__ = () => {
      const index = (useNanaStore.getState().chatHistory[activeChatId] || [])
        .findIndex(message => message.id === SMOKE_VOICE_MESSAGE_ID);
      if (index < 0) return false;
      scrollRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.35 });
      return true;
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
      delete scope.__NANA_SMOKE_SCROLL_TO_VOICE_SAMPLE__;
      delete scope.__NANA_SMOKE_SEED_LONG_CHAT__;
      delete scope.__NANA_SMOKE_SET_LANGUAGE__;
      delete scope.__NANA_SMOKE_SEED_MEETING_HANDOFF__;
    };
  }, [activeChatId]);

  useEffect(() => {
    if (historyCommitTimer.current) {
      clearTimeout(historyCommitTimer.current);
      historyCommitTimer.current = null;
    }
    historyLoadChatId.current = null;
    initialScrollChatId.current = null;
    const state = useNanaStore.getState();
    lastMessageCount.current = activeChatId ? (state.chatHistory[activeChatId] || []).length : 0;
    return () => {
      if (historyCommitTimer.current) {
        clearTimeout(historyCommitTimer.current);
        historyCommitTimer.current = null;
      }
    };
  }, [activeChatId]);

  useEffect(() => {
    if (activeChatId && messageCount === 0) {
      setPreparedHistoryChatId(activeChatId);
    }
  }, [activeChatId, messageCount]);

  useEffect(() => {
    if (!activeChatId || initialScrollChatId.current !== activeChatId) return;
    if (messageCount !== lastMessageCount.current || kbHeight > 0) {
      // FlashList needs an explicit correction when a hydrated or stress-test
      // history replaces the current data. Keep it instantaneous: page entry
      // and keyboard changes must never animate the whole history.
      const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 40);
      lastMessageCount.current = messageCount;
      return () => clearTimeout(timer);
    }
    lastMessageCount.current = messageCount;
    return undefined;
  }, [activeChatId, kbHeight, messageCount]);

  const commitStableHistoryFrame = useCallback(() => {
    if (
      !activeChatId
      || historyLoadChatId.current !== activeChatId
      || initialScrollChatId.current === activeChatId
    ) return;
    if (historyCommitTimer.current) clearTimeout(historyCommitTimer.current);
    const chatIdAtSchedule = activeChatId;
    historyCommitTimer.current = setTimeout(() => {
      historyCommitTimer.current = null;
      if (historyLoadChatId.current !== chatIdAtSchedule) return;
      scrollRef.current?.scrollToEnd({ animated: false });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (historyLoadChatId.current !== chatIdAtSchedule) return;
          initialScrollChatId.current = chatIdAtSchedule;
          lastMessageCount.current = messageCount;
          setPreparedHistoryChatId(chatIdAtSchedule);
        });
      });
    }, 72);
  }, [activeChatId, messageCount]);

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
        position: 'relative',
        // useKeyboardHeight returns only the IME portion not already handled by
        // Android adjustResize, so this works for edge-to-edge and resized apps.
        paddingBottom: chatPanel === 'none' ? kbHeight : 0,
      }}
    >
      <View
        testID="chat-readability-scrim"
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: CHAT_READABILITY_SCRIM },
        ]}
      />

      {selectMode ? <SelectModeBar onForward={rememberSelectedMessages} /> : null}

      <View style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <View
          testID={historyFrameReady ? 'chat-history-frame-ready' : 'chat-history-frame-preparing'}
          pointerEvents={historyFrameReady ? 'auto' : 'none'}
          accessibilityElementsHidden={!historyFrameReady}
          importantForAccessibility={historyFrameReady ? 'auto' : 'no-hide-descendants'}
          style={{
            flex: 1,
            minHeight: 0,
            opacity: historyFrameReady ? 1 : 0,
          }}
        >
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
            drawDistance={Math.max(stableHeight, 900)}
            style={{ flex: 1, flexShrink: 1, minHeight: 0 }}
            contentContainerStyle={{
              paddingHorizontal: compact ? 4 : 9,
              paddingTop: compact ? 3 : 7,
              paddingBottom: 12,
            }}
            maintainVisibleContentPosition={{
              // FlashList only needs its anchor while preparing the initial
              // bottom-aligned frame. Afterwards, transcript layout changes
              // should be handled once by Yoga/Reanimated without scroll-anchor
              // bookkeeping on every frame.
              disabled: historyFrameReady,
              startRenderingFromBottom: true,
              // The first frame should already be the newest message. Animating
              // FlashList's initial correction makes long chats visibly sweep
              // down from older messages on Android.
              animateAutoScrollToBottom: false,
            }}
            onLoad={() => {
              if (!activeChatId) return;
              historyLoadChatId.current = activeChatId;
              // onLoad fires after FlashList's first measured cells, but Android
              // can still commit more visible rows and correct the bottom offset
              // immediately afterwards. Debounce those content-size commits,
              // snap to the end, then expose the fully prepared viewport at once.
              commitStableHistoryFrame();
            }}
            onContentSizeChange={() => {
              // Transcript expansion and collapse also change the content size.
              // Only the initial chat entry may correct the list to the bottom;
              // later row-height changes must preserve the reader's position.
              if (initialScrollChatId.current !== activeChatId) {
                commitStableHistoryFrame();
              }
            }}
            ListFooterComponent={(visibleMeetingHandoff || isGenerating) ? (
              <View>
                {visibleMeetingHandoff && activeChatId ? (
                  <MeetingHandoffCard
                    handoff={visibleMeetingHandoff}
                    characterName={characters.find(character => character.id === activeChatId)?.name || '对方'}
                    onOpen={() => void useNanaStore.getState().openMeetingHandoff(activeChatId, 'automatic')}
                    onDismiss={() => useNanaStore.getState().dismissMeetingHandoff(activeChatId)}
                  />
                ) : null}
                {isGenerating ? (
                  <TypingIndicator
                    activeChatId={activeChatId}
                    characters={characters}
                    renderAvatar={renderAvatar}
                    bubbleVariant={bubbleVariant}
                  />
                ) : null}
              </View>
            ) : null}
          />
        </View>

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
