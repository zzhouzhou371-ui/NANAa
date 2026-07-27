import { useCallback, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { MotiView } from 'moti';
import {
  ArrowDownLeft,
  ArrowUpRight,
  AudioLines,
  Brain,
  Check,
  CircleAlert,
  Clock3,
  Gift,
  LoaderCircle,
  Pause,
  Phone,
  Play,
  RefreshCw,
  RotateCcw,
  Video,
  X,
} from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { useNativeVoicePlayback } from '../services/nativeAudioPlaybackRuntime';
import { useNanaStore } from '../stores/nanaStore';
import type { Character, Message, Payment } from '../types';
import { triggerHaptic } from '../utils/haptics';
import { AnimatedPressable } from './primitives';
import { CharacterPortrait } from './CharacterPortrait';
import {
  CHAT_BUBBLE_INCOMING_INK,
  CHAT_BUBBLE_OUTGOING_INK,
  ChatBubbleSurface,
  type ChatBubbleMaterialVariant,
  type ChatBubbleTone,
} from './chat-bubble-surface';
import { NeumorphicSurface, neumorphicPalette, type NeumorphicTone } from './neumorphic-surface';
import { wechatTheme } from './wechatTheme';

interface Props {
  msg: Message;
  activeChatId: string | null;
  characters: Character[];
  renderAvatar: (avatar: string | ReactNode) => ReactNode;
  myAvatar: string;
  onRetry: () => void;
  onAvatarClick: () => void;
  isGenerating: boolean;
  showTime?: boolean;
  bubbleVariant: ChatBubbleMaterialVariant;
}

function AvatarContent({
  avatar,
  renderAvatar,
  characterId,
}: {
  avatar: string | ReactNode;
  renderAvatar: Props['renderAvatar'];
  characterId?: string | null;
}) {
  if (characterId) {
    return <CharacterPortrait characterId={characterId} avatar={avatar} fontSize={14} color={wechatTheme.ink} />;
  }
  const rendered = renderAvatar(avatar);
  if (typeof rendered === 'string' && /^(https?:|data:|file:)/.test(rendered)) {
    return <Image source={{ uri: rendered }} contentFit="cover" style={{ width: '100%', height: '100%' }} />;
  }
  return typeof rendered === 'string'
    ? <Text style={{ color: wechatTheme.ink, fontSize: 14, fontWeight: '700' }}>{rendered}</Text>
    : rendered;
}

function MessageAvatar({
  avatar,
  renderAvatar,
  characterId,
  outgoing = false,
}: {
  avatar: string | ReactNode;
  renderAvatar: Props['renderAvatar'];
  characterId?: string | null;
  outgoing?: boolean;
}) {
  return (
    <View
      style={{
        width: 38,
        height: 38,
        borderRadius: 8,
        borderCurve: 'continuous',
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: outgoing ? wechatTheme.outgoing : wechatTheme.incoming,
      }}
    >
      <AvatarContent avatar={avatar} renderAvatar={renderAvatar} characterId={characterId} />
    </View>
  );
}

const legacyPayment = (message: Message): Payment | undefined => {
  const isTransfer = message.type === 'transfer' || message.type === 'transfer_received';
  const isRedPacket = message.type === 'redpacket' || message.type === 'redpacket_received';
  if (!isTransfer && !isRedPacket) return undefined;
  const completed = message.type === 'transfer_received' || message.type === 'redpacket_received';
  const amountMinor = Math.round(Number.parseFloat(message.amount || '0') * 100);
  return {
    schemaVersion: 1,
    id: `legacy:${message.id}`,
    chatId: '',
    kind: isTransfer ? 'transfer' : 'redPacket',
    direction: message.sender === 'user' ? 'outgoing' : 'incoming',
    senderId: message.sender,
    recipientId: '',
    amountMinor: Number.isFinite(amountMinor) ? amountMinor : 0,
    currency: 'CNY',
    note: message.note,
    status: completed ? 'completed' : 'pending',
    fundsState: completed ? 'captured' : 'held',
    createdAt: message.id,
    updatedAt: message.id,
    expiresAt: message.id + 86_400_000,
    reactionState: completed ? 'resolved' : 'scheduled',
    reactionAttempts: 0,
  };
};

const formatPaymentAmount = (amountMinor: number) => `\u00A5${(Math.max(0, amountMinor) / 100).toFixed(2)}`;

const lightBubbleInk = neumorphicPalette.onLightPrimary;
const lightBubbleSecondary = neumorphicPalette.onLightSecondary;
const lightBubbleAccent = '#653D55';
const lightBubbleMemory = '#48506B';

function paymentStatusLabel(payment: Payment, characterName: string, t: Record<string, string>) {
  if (payment.status === 'sending') return t.processing;
  if (payment.status === 'pending') {
    if (payment.reactionState === 'failed') return t.paymentAwaitingRetry;
    const key = payment.kind === 'transfer' ? t.waitingToReceive : t.waitingToCollect;
    return key.replace('{name}', characterName);
  }
  if (payment.status === 'completed') return t.paymentCompleted;
  if (payment.status === 'declined' || payment.status === 'refunded') return t.paymentRefunded;
  if (payment.status === 'expired') return t.paymentExpired;
  return t.paymentFailedRetry;
}

function PaymentCard({
  payment,
  characterName,
  bubbleVariant,
}: {
  payment: Payment;
  characterName: string;
  bubbleVariant: ChatBubbleMaterialVariant;
}) {
  const { t } = useApp();
  const transfer = payment.kind === 'transfer';
  const completed = payment.status === 'completed';
  const returned = payment.status === 'declined' || payment.status === 'refunded' || payment.status === 'expired';
  const failed = payment.status === 'failed';
  const Icon = failed ? CircleAlert : returned ? RotateCcw : transfer ? (completed ? ArrowDownLeft : ArrowUpRight) : Gift;
  const StatusIcon = payment.status === 'sending'
    ? LoaderCircle
    : payment.status === 'pending'
      ? Clock3
      : completed
        ? Check
        : returned ? RotateCcw : CircleAlert;
  const statusColor = payment.status === 'sending'
    ? neumorphicPalette.onDarkSecondary
    : payment.status === 'pending'
      ? '#FFF4E8'
      : completed
        ? '#F2FFF5'
        : returned ? '#F4F8FF' : '#FFF2F5';
  const statusTone = payment.status === 'sending'
    ? 'rgba(255, 243, 238, 0.04)'
    : payment.status === 'pending'
      ? 'rgba(215, 168, 120, 0.10)'
      : completed
        ? 'rgba(156, 213, 173, 0.10)'
        : returned ? 'rgba(168, 187, 209, 0.10)' : 'rgba(232, 160, 143, 0.10)';
  return (
    <View style={{ minHeight: 102 }}>
      <View style={{ minHeight: 76, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: bubbleVariant === 'legacy'
              ? 'rgba(255, 243, 238, 0.11)'
              : 'rgba(255, 243, 238, 0.08)',
            borderWidth: bubbleVariant === 'legacy' ? 0.5 : 0,
            borderColor: 'rgba(255, 243, 238, 0.12)',
          }}
        >
          <Icon size={21} color={neumorphicPalette.onDarkPrimary} strokeWidth={1.7} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: neumorphicPalette.onDarkPrimary, fontSize: 19, lineHeight: 23, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
            {formatPaymentAmount(payment.amountMinor)}
          </Text>
          {payment.note ? (
            <Text numberOfLines={1} style={{ color: neumorphicPalette.onDarkSecondary, fontSize: 12, lineHeight: 16, marginTop: 2 }}>
              {payment.note}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={{ minHeight: 34, paddingHorizontal: 14, paddingVertical: 7, borderTopWidth: bubbleVariant === 'legacy' ? 0.5 : 0, borderTopColor: 'rgba(255, 243, 238, 0.12)', backgroundColor: bubbleVariant === 'legacy' ? statusTone : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <StatusIcon size={13} color={statusColor} strokeWidth={1.9} />
        <Text numberOfLines={2} style={{ flex: 1, minWidth: 0, color: statusColor, fontSize: 12, lineHeight: 16, fontWeight: '600' }}>
          {paymentStatusLabel(payment, characterName, t)}
        </Text>
      </View>
    </View>
  );
}

function PaymentDetailSheet({
  payment,
  characterName,
  visible,
  onClose,
}: {
  payment?: Payment;
  characterName: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useApp();
  if (!payment) return null;
  const canRetry = (payment.status === 'failed' || (payment.status === 'pending' && payment.reactionState === 'failed'))
    && !payment.id.startsWith('legacy:');
  const detailTone: NeumorphicTone = payment.kind === 'transfer' ? 'transferSheet' : 'redPacketSheet';
  const actionTone: NeumorphicTone = payment.kind === 'transfer' ? 'transfer' : 'redPacket';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.close} onPress={onClose} style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(3, 6, 16, 0.44)' }} />
        <NeumorphicSurface
          depth="raised"
          tone={detailTone}
          radius={22}
          fill={false}
          style={{
            borderRadius: 0,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
          }}
          contentStyle={{
            borderRadius: 0,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            paddingHorizontal: 20,
            paddingTop: 10,
            paddingBottom: 28,
          }}
        >
          <View style={{ width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16, backgroundColor: lightBubbleSecondary }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ color: lightBubbleInk, fontSize: 18, lineHeight: 24, fontWeight: '700' }}>{t.paymentDetails}</Text>
            <AnimatedPressable accessibilityRole="button" accessibilityLabel={t.close} onPress={onClose} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <NeumorphicSurface pointerEvents="none" depth="raisedSmall" tone={detailTone} radius={22} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
              <X size={20} color={lightBubbleSecondary} strokeWidth={1.7} />
            </AnimatedPressable>
          </View>
          <Text style={{ color: lightBubbleInk, fontSize: 34, lineHeight: 42, fontWeight: '700', marginTop: 10, fontVariant: ['tabular-nums'] }}>
            {formatPaymentAmount(payment.amountMinor)}
          </Text>
          <Text style={{ color: lightBubbleSecondary, fontSize: 14, lineHeight: 20, marginTop: 4 }}>
            {paymentStatusLabel(payment, characterName, t)}
          </Text>
          {payment.note ? <Text style={{ color: lightBubbleSecondary, fontSize: 13, lineHeight: 19, marginTop: 12 }}>{payment.note}</Text> : null}
          {canRetry ? (
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel={t.retryPayment}
              onPress={() => {
                onClose();
                void useNanaStore.getState().retryPayment(payment.id);
              }}
              style={{ height: 48, borderRadius: 15, marginTop: 20, alignItems: 'center', justifyContent: 'center' }}
            >
              <NeumorphicSurface pointerEvents="none" depth="raisedSmall" tone={actionTone} radius={15} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
              <Text style={{ color: neumorphicPalette.onDarkPrimary, fontSize: 15, fontWeight: '700' }}>{t.retryPayment}</Text>
            </AnimatedPressable>
          ) : null}
        </NeumorphicSurface>
      </View>
    </Modal>
  );
}

export function ChatMessageBubble({
  msg,
  activeChatId,
  characters,
  renderAvatar,
  myAvatar,
  onRetry,
  onAvatarClick,
  isGenerating,
  showTime = true,
  bubbleVariant,
}: Props) {
  const { t } = useApp();
  const { width } = useWindowDimensions();
  const selectMode = useNanaStore(state => state.selectMode);
  const selectedMsgIds = useNanaStore(state => state.selectedMsgIds);
  const neumorphic = useNanaStore(state => state.themeConfig.chromeStyle === 'neumorphic-v1');
  const payment = useNanaStore(state => msg.paymentId ? state.paymentsById[msg.paymentId] : undefined) || legacyPayment(msg);
  const [paymentDetailsVisible, setPaymentDetailsVisible] = useState(false);
  const isSelected = selectedMsgIds.includes(msg.id);
  const availableWidth = Math.max(250, Math.min(width, 390) - 32);

  const toggleSelect = useCallback(() => {
    useNanaStore.setState(state => ({
      selectedMsgIds: state.selectedMsgIds.includes(msg.id)
        ? state.selectedMsgIds.filter(id => id !== msg.id)
        : [...state.selectedMsgIds, msg.id],
    }));
  }, [msg.id]);

  const isPayment = !!payment;
  const isImage = msg.type === 'image' && !!msg.imageUri;
  const isVoice = msg.type === 'voice';
  const isVideoCallEvent = msg.sender === 'system' && (/\bvideo call\b/i.test(msg.text) || /视频通话/.test(msg.text));
  const isCallEvent = msg.sender === 'system' && (/\b(voice|video) call\b/i.test(msg.text) || /(语音通话|视频通话|通话)/.test(msg.text));
  const isMemoryEvent = msg.sender === 'system' && (/\b(memory|remembered|timeline)\b/i.test(msg.text) || /(记忆|记住|回忆)/.test(msg.text));
  const isRetryableError = msg.sender === 'system' && (/^Error:/i.test(msg.text) || /^(错误|失败)[:：]/.test(msg.text));
  const characterName = characters.find(character => character.id === activeChatId)?.name || '';
  const characterMaxWidth = Math.min(274, Math.max(184, availableWidth * 0.76));
  const userMaxWidth = Math.min(248, Math.max(168, availableWidth * 0.7));
  const maxBubbleWidth = msg.sender === 'user' ? userMaxWidth : characterMaxWidth;
  const specialBubbleWidth = Math.min(260, Math.max(210, availableWidth * 0.76));
  const imageBubbleWidth = Math.min(236, Math.max(188, availableWidth * 0.7));
  const voiceBubbleWidth = Math.min(254, Math.max(204, availableWidth * 0.74));
  const imageAspectRatio = msg.imageWidth && msg.imageHeight ? msg.imageWidth / msg.imageHeight : 4 / 3;
  const imageBubbleHeight = Math.min(282, Math.max(132, imageBubbleWidth / imageAspectRatio));

  if (msg.sender === 'system') {
    const EventIcon = isVideoCallEvent ? Video : isCallEvent ? Phone : isMemoryEvent ? Brain : null;
    return (
      <View style={{ alignItems: 'center', paddingVertical: showTime ? 7 : 3 }}>
        {showTime ? <Text style={{ color: wechatTheme.inkSoft, fontSize: 11, lineHeight: 15, marginBottom: 5, fontVariant: ['tabular-nums'] }}>{msg.time}</Text> : null}
        {EventIcon ? (
          <View
            accessible
            accessibilityLabel={msg.text}
            style={{
              maxWidth: '88%',
              minHeight: 32,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 10,
              borderCurve: 'continuous',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 7,
              backgroundColor: 'rgba(7, 7, 13, 0.46)',
              borderWidth: 0.5,
              borderColor: 'rgba(255, 232, 230, 0.1)',
            }}
          >
            <EventIcon size={14} color={isMemoryEvent ? wechatTheme.memory : wechatTheme.peach} strokeWidth={1.7} />
            <Text selectable style={{ color: wechatTheme.inkMuted, fontSize: 11, lineHeight: 16, flexShrink: 1 }}>{msg.text}</Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Text
              selectable
              style={{
                overflow: 'hidden',
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 9,
                fontSize: 11,
                lineHeight: 15,
                color: wechatTheme.inkMuted,
                backgroundColor: 'rgba(7, 7, 13, 0.42)',
              }}
            >
              {msg.text}
            </Text>
            {isRetryableError ? (
              <AnimatedPressable accessibilityRole="button" accessibilityLabel={t.retryMessage} onPress={isGenerating ? undefined : onRetry} disabled={isGenerating} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <RefreshCw size={15} color={isGenerating ? wechatTheme.inkSoft : wechatTheme.peach} />
              </AnimatedPressable>
            ) : null}
          </View>
        )}
      </View>
    );
  }

  const bubbleWidth = isPayment ? specialBubbleWidth : isImage ? imageBubbleWidth : isVoice ? voiceBubbleWidth : undefined;
  const backgroundColor = payment?.kind === 'transfer'
    ? neumorphicPalette.transfer
    : payment?.kind === 'redPacket'
      ? neumorphicPalette.redPacket
      : msg.sender === 'user'
        ? neumorphicPalette.outgoing
        : neumorphicPalette.incoming;
  const bubbleTone: ChatBubbleTone = payment?.kind === 'transfer'
    ? 'transfer'
    : payment?.kind === 'redPacket'
      ? 'redPacket'
      : msg.sender === 'user'
        ? 'outgoing'
        : 'incoming';
  const messageInk = neumorphic
    ? msg.sender === 'user'
      ? CHAT_BUBBLE_OUTGOING_INK
      : CHAT_BUBBLE_INCOMING_INK
    : lightBubbleInk;
  const bubbleRadius = msg.sender === 'user'
    ? { borderTopLeftRadius: 17, borderTopRightRadius: 17, borderBottomRightRadius: 8, borderBottomLeftRadius: 17 }
    : { borderTopLeftRadius: 17, borderTopRightRadius: 17, borderBottomLeftRadius: 8, borderBottomRightRadius: 17 };
  const bubbleFrameStyle = {
    width: bubbleWidth,
    maxWidth: isPayment ? specialBubbleWidth : isImage ? imageBubbleWidth : isVoice ? voiceBubbleWidth : maxBubbleWidth,
    minWidth: isPayment ? specialBubbleWidth : undefined,
  };
  const bubbleContent = (
    <ChatBubbleSurface
      variant={bubbleVariant}
      side={msg.sender === 'user' ? 'outgoing' : 'incoming'}
      tone={bubbleTone}
      legacyColor={backgroundColor}
      legacyRadius={bubbleRadius}
      contentStyle={{
        paddingHorizontal: isPayment || isImage ? 0 : 14,
        paddingVertical: isPayment || isImage ? 0 : 10,
      }}
    >
      {isPayment && payment ? (
        <PaymentCard payment={payment} characterName={characterName} bubbleVariant={bubbleVariant} />
      ) : isVoice ? (
        <VoiceBubbleContent
          msg={msg}
          selectMode={selectMode}
          isSelected={isSelected}
          onSelect={toggleSelect}
          ink={messageInk}
        />
      ) : isImage && msg.imageUri ? (
        <Image source={{ uri: msg.imageUri }} contentFit="cover" transition={140} accessible accessibilityLabel={t.photo} style={{ width: imageBubbleWidth, height: imageBubbleHeight, backgroundColor: neumorphicPalette.incoming }} />
      ) : (
        <Text selectable style={{ color: messageInk, fontSize: 15, lineHeight: 22, flexShrink: 1, includeFontPadding: false, textAlign: 'left' }}>{msg.text}</Text>
      )}
    </ChatBubbleSurface>
  );

  return (
    <View style={{ borderRadius: 14, backgroundColor: isSelected ? 'rgba(168, 187, 209, 0.1)' : 'transparent', paddingHorizontal: isSelected ? 4 : 0, marginBottom: 5 }}>
      {showTime ? (
        <Text
          style={{
            alignSelf: 'center',
            marginTop: 4,
            marginBottom: 9,
            color: wechatTheme.inkSoft,
            fontSize: 11,
            lineHeight: 15,
            fontVariant: ['tabular-nums'],
          }}
        >
          {msg.time}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {selectMode ? (
          <AnimatedPressable accessibilityRole="checkbox" accessibilityLabel={isSelected ? t.deselectMessage : t.selectMessage} accessibilityState={{ checked: isSelected }} onPress={toggleSelect} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 23, height: 23, borderRadius: 12, borderWidth: 1.5, borderColor: isSelected ? wechatTheme.memory : 'rgba(210, 195, 202, 0.5)', backgroundColor: isSelected ? 'rgba(168, 187, 209, 0.3)' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {isSelected ? <Check size={13} strokeWidth={3} color={wechatTheme.ink} /> : null}
            </View>
          </AnimatedPressable>
        ) : null}

        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start', gap: 6 }}>
          {msg.sender === 'char' ? (
            <AnimatedPressable accessibilityRole="button" accessibilityLabel={t.characterProfile} onPress={selectMode ? toggleSelect : onAvatarClick} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <MessageAvatar avatar={characters.find(character => character.id === activeChatId)?.avatar || msg.avatar || ''} renderAvatar={renderAvatar} characterId={activeChatId} />
            </AnimatedPressable>
          ) : null}

          {isVoice ? (
            <View testID={`chat-bubble-${msg.id}`} style={bubbleFrameStyle}>
              {bubbleContent}
            </View>
          ) : selectMode || isPayment ? (
            <AnimatedPressable
              testID={`chat-bubble-${msg.id}`}
              accessibilityRole="button"
              accessibilityLabel={isImage ? t.photo : isPayment ? (payment?.kind === 'transfer' ? t.transfer : t.redPacket) : msg.text}
              accessibilityHint={isPayment ? t.paymentDetails : undefined}
              onPress={selectMode ? toggleSelect : () => setPaymentDetailsVisible(true)}
              style={bubbleFrameStyle}
            >
              {bubbleContent}
            </AnimatedPressable>
          ) : (
            <View testID={`chat-bubble-${msg.id}`} style={bubbleFrameStyle}>
              {bubbleContent}
            </View>
          )}

          {msg.sender === 'user' ? (
            <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <MessageAvatar avatar={msg.avatar || myAvatar} renderAvatar={renderAvatar} outgoing />
            </View>
          ) : null}
        </View>
      </View>

      <PaymentDetailSheet payment={payment} characterName={characterName} visible={paymentDetailsVisible} onClose={() => setPaymentDetailsVisible(false)} />
    </View>
  );
}

function VoiceBubbleContent({
  msg,
  selectMode,
  isSelected,
  onSelect,
  ink,
}: {
  msg: Message;
  selectMode: boolean;
  isSelected: boolean;
  onSelect: () => void;
  ink: string;
}) {
  const { t } = useApp();
  const playback = useNativeVoicePlayback(msg.audioUri);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const handlePlayback = useCallback(() => {
    if (!playback.canPlay) return;
    triggerHaptic('light');
    void playback.toggle();
  }, [playback]);
  const duration = Math.max(0, Math.round(msg.audioDurationSec || playback.durationSec || 0));
  const durationLabel = formatVoiceDuration(duration);
  const bars = [8, 13, 18, 11, 16, 22, 14, 9, 19, 13, 17, 10, 21, 15, 8, 13];

  return (
    <View style={{ width: '100%' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={selectMode ? (isSelected ? t.deselectMessage : t.selectMessage) : playback.canPlay ? (playback.isPlaying ? t.pauseVoice : t.playVoice) : t.voiceMessage}
        accessibilityState={selectMode ? { selected: isSelected } : { disabled: !playback.canPlay }}
        onPress={selectMode ? onSelect : playback.canPlay ? handlePlayback : undefined}
        disabled={!selectMode && !playback.canPlay}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}
      >
        <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: `${ink}1F` }}>
          {playback.canPlay
            ? playback.isPlaying
              ? <Pause size={14} color={ink} fill={ink} />
              : <Play size={14} color={ink} fill={ink} />
            : <AudioLines size={16} color={`${ink}C7`} strokeWidth={1.7} />}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ height: 22, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            {bars.map((barHeight, index) => {
              const played = playback.progress > 0 && index / bars.length <= playback.progress;
              return (
                <View
                  key={`${barHeight}-${index}`}
                  style={{
                    flex: 1,
                    maxWidth: 3,
                    height: playback.isPlaying && index % 3 === 0 ? Math.min(22, barHeight + 3) : barHeight,
                    borderRadius: 2,
                    backgroundColor: played ? ink : `${ink}94`,
                  }}
                />
              );
            })}
          </View>
          <Text style={{ color: `${ink}C7`, fontSize: 11, lineHeight: 15, marginTop: 2, fontVariant: ['tabular-nums'] }}>{durationLabel}</Text>
        </View>
      </Pressable>

      {msg.transcript?.trim() ? (
        <View style={{ marginTop: 6, borderTopWidth: 0.5, borderTopColor: `${ink}2E`, paddingTop: 7 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={transcriptOpen ? t.hideTranscript : t.showTranscript} onPress={() => setTranscriptOpen(value => !value)} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: lightBubbleMemory, fontSize: 11, lineHeight: 15, fontWeight: '600' }}>{transcriptOpen ? t.hideTranscript : t.showTranscript}</Text>
          </Pressable>
          {transcriptOpen ? <Text selectable style={{ color: `${ink}D6`, fontSize: 13, lineHeight: 19, paddingBottom: 2 }}>{msg.transcript}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const formatVoiceDuration = (seconds: number) => (
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
);

export function TypingIndicator({
  activeChatId,
  characters,
  renderAvatar,
  bubbleVariant,
}: {
  activeChatId: string | null;
  characters: Character[];
  renderAvatar: (avatar: string | ReactNode) => ReactNode;
  bubbleVariant: ChatBubbleMaterialVariant;
}) {
  const avatar = characters.find(character => character.id === activeChatId)?.avatar || '';
  const neumorphic = useNanaStore(state => state.themeConfig.chromeStyle === 'neumorphic-v1');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 7, marginBottom: 7, paddingTop: 3 }}>
      <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <MessageAvatar avatar={avatar} renderAvatar={renderAvatar} characterId={activeChatId} />
      </View>
      <ChatBubbleSurface
        variant={bubbleVariant}
        side="incoming"
        tone="incoming"
        legacyColor={neumorphicPalette.incoming}
        legacyRadius={{ borderRadius: 17, borderBottomLeftRadius: 8 }}
        contentStyle={{ minHeight: 42, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}
      >
        <View style={{ flexDirection: 'row', gap: 5 }}>
          {[0, 1, 2].map(index => (
            <MotiView key={index} from={{ opacity: 0.35, translateY: 0 }} animate={{ opacity: 1, translateY: -3 }} transition={{ type: 'timing', duration: 500, delay: index * 120, loop: true, repeatReverse: true }} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: neumorphic ? CHAT_BUBBLE_INCOMING_INK : lightBubbleAccent }} />
          ))}
        </View>
      </ChatBubbleSurface>
    </View>
  );
}
