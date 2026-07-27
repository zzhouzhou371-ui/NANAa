import type { CallLog, Payment, PaymentKind } from '../types';

export type RuntimeLanguage = 'en' | 'zh';

export interface RuntimeCopy {
  language: RuntimeLanguage;
  fallbackCharacter: string;
  fallbackUser: string;
  fallbackCall: string;
  transfer: string;
  redPacket: string;
  paymentRecipientMissing: string;
  insufficientBalance: string;
  paymentSubmitFailed: string;
  paymentFailed: string;
  paymentCouldNotComplete: string;
  insufficientBalanceToRetry: string;
  amountInvalid: string;
  transferSent: string;
  redPacketSent: string;
  paymentAccepted: string;
  paymentReturned: string;
  characterResponseFailed: string;
  voiceMessage: string;
  recordingCancelledOrTooShort: string;
  waitingForReply: string;
  transcribingVoiceMessage: string;
  voiceTranscriptionFailed: string;
  photo: string;
  photoSent: string;
  apiKeyRequiredSystem: string;
  apiKeyRequiredShort: string;
  typing: string;
  newVoiceMessage: string;
  newMessage: string;
  apiCallFailed: string;
  chatExchange: string;
  sharedPhoto: string;
  sharedAPhoto: string;
  voiceCall: string;
  videoCall: string;
  calling: string;
  incomingVoiceCall: string;
  incomingVideoCall: string;
  callAnswered: string;
  callEnded: string;
  callCompleted: string;
  callMissed: string;
  callFailed: string;
  callCancelled: string;
  duration: string;
  transcribing: string;
  noSpeechDetected: string;
  thinking: string;
  callSpeechFailed: string;
}

const EN: RuntimeCopy = {
  language: 'en',
  fallbackCharacter: 'Character',
  fallbackUser: 'You',
  fallbackCall: 'Call',
  transfer: 'Transfer',
  redPacket: 'Red packet',
  paymentRecipientMissing: 'The payment recipient could not be found.',
  insufficientBalance: 'Insufficient wallet balance',
  paymentSubmitFailed: 'The payment could not be submitted.',
  paymentFailed: 'Payment failed',
  paymentCouldNotComplete: 'The payment could not be completed.',
  insufficientBalanceToRetry: 'Insufficient wallet balance to retry',
  amountInvalid: 'Enter a valid amount with no more than two decimals',
  transferSent: 'Transfer sent',
  redPacketSent: 'Red packet sent',
  paymentAccepted: 'Payment accepted',
  paymentReturned: 'Payment returned',
  characterResponseFailed: 'Character response failed.',
  voiceMessage: 'Voice message',
  recordingCancelledOrTooShort: 'Recording was cancelled or too short',
  waitingForReply: 'Waiting for the current reply...',
  transcribingVoiceMessage: 'Transcribing voice message...',
  voiceTranscriptionFailed: 'The voice message was sent, but transcription failed',
  photo: 'Photo',
  photoSent: 'Photo sent',
  apiKeyRequiredSystem: 'Please configure your API Key in Settings first.',
  apiKeyRequiredShort: 'API key required',
  typing: 'Typing...',
  newVoiceMessage: 'New voice message received',
  newMessage: 'New message received',
  apiCallFailed: 'API call failed',
  chatExchange: 'Chat exchange',
  sharedPhoto: 'Shared photo',
  sharedAPhoto: 'Shared a photo',
  voiceCall: 'Voice call',
  videoCall: 'Video call',
  calling: 'Calling...',
  incomingVoiceCall: 'Incoming voice call',
  incomingVideoCall: 'Incoming video call',
  callAnswered: 'Call answered.',
  callEnded: 'ended',
  callCompleted: 'completed',
  callMissed: 'missed',
  callFailed: 'failed',
  callCancelled: 'cancelled',
  duration: 'Duration',
  transcribing: 'Transcribing...',
  noSpeechDetected: 'No speech detected.',
  thinking: 'Thinking...',
  callSpeechFailed: 'Call speech failed',
};

const ZH: RuntimeCopy = {
  language: 'zh',
  fallbackCharacter: '角色',
  fallbackUser: '你',
  fallbackCall: '通话',
  transfer: '转账',
  redPacket: '红包',
  paymentRecipientMissing: '找不到收款角色。',
  insufficientBalance: '余额不足',
  paymentSubmitFailed: '款项发送失败。',
  paymentFailed: '款项发送失败',
  paymentCouldNotComplete: '款项未能完成。',
  insufficientBalanceToRetry: '余额不足，无法重试',
  amountInvalid: '请输入最多两位小数的有效金额',
  transferSent: '转账已发送',
  redPacketSent: '红包已发送',
  paymentAccepted: '已收款',
  paymentReturned: '已退回',
  characterResponseFailed: '角色回应失败。',
  voiceMessage: '语音消息',
  recordingCancelledOrTooShort: '录音已取消或时间太短',
  waitingForReply: '正在等待当前回复…',
  transcribingVoiceMessage: '正在转换语音…',
  voiceTranscriptionFailed: '语音已发送，但转文字失败',
  photo: '照片',
  photoSent: '照片已发送',
  apiKeyRequiredSystem: '请先在设置中配置 API Key。',
  apiKeyRequiredShort: '需要配置 API Key',
  typing: '正在输入…',
  newVoiceMessage: '收到一条语音消息',
  newMessage: '收到一条新消息',
  apiCallFailed: '请求失败',
  chatExchange: '聊天片段',
  sharedPhoto: '分享照片',
  sharedAPhoto: '分享了一张照片',
  voiceCall: '语音通话',
  videoCall: '视频通话',
  calling: '正在呼叫…',
  incomingVoiceCall: '语音来电',
  incomingVideoCall: '视频来电',
  callAnswered: '已接听通话。',
  callEnded: '已结束',
  callCompleted: '已完成',
  callMissed: '未接听',
  callFailed: '失败',
  callCancelled: '已取消',
  duration: '时长',
  transcribing: '正在转文字…',
  noSpeechDetected: '没有听清，请再说一次。',
  thinking: '正在回应…',
  callSpeechFailed: '通话语音处理失败',
};

export const resolveRuntimeLanguage = (language?: string): RuntimeLanguage => (
  language?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
);

export const runtimeCopyFor = (language?: string): RuntimeCopy => (
  resolveRuntimeLanguage(language) === 'zh' ? ZH : EN
);

export const runtimePaymentLabel = (copy: RuntimeCopy, kind: PaymentKind) => (
  kind === 'transfer' ? copy.transfer : copy.redPacket
);

export const runtimeCallTypeLabel = (copy: RuntimeCopy, type: 'voice' | 'video') => (
  type === 'video' ? copy.videoCall : copy.voiceCall
);

const runtimeCallStatusLabel = (copy: RuntimeCopy, status: CallLog['status']) => ({
  completed: copy.callCompleted,
  missed: copy.callMissed,
  failed: copy.callFailed,
  cancelled: copy.callCancelled,
})[status];

export const runtimeCallRecord = (
  copy: RuntimeCopy,
  type: 'voice' | 'video',
  status: CallLog['status'],
  duration: string,
) => copy.language === 'zh'
  ? `${runtimeCallTypeLabel(copy, type)}${runtimeCallStatusLabel(copy, status)}。${copy.duration} ${duration}。`
  : `${runtimeCallTypeLabel(copy, type)} ${runtimeCallStatusLabel(copy, status)}. ${copy.duration} ${duration}.`;

export const runtimeCallEnded = (copy: RuntimeCopy, type: 'voice' | 'video') => (
  copy.language === 'zh'
    ? `${runtimeCallTypeLabel(copy, type)}${copy.callEnded}。`
    : `${runtimeCallTypeLabel(copy, type)} ${copy.callEnded}.`
);

export const runtimeCharacterAnsweredCall = (
  copy: RuntimeCopy,
  name: string,
  type: 'voice' | 'video',
) => copy.language === 'zh'
  ? `${name} 已接听${runtimeCallTypeLabel(copy, type)}。`
  : `${name} answered the ${runtimeCallTypeLabel(copy, type).toLowerCase()}.`;

export const runtimeIncomingCallFrom = (copy: RuntimeCopy, name: string) => (
  copy.language === 'zh'
    ? `${name} 正在呼叫你。`
    : `${name} is calling you.`
);

export const runtimeCallSummaryFallback = (
  copy: RuntimeCopy,
  name: string,
  type: 'voice' | 'video',
  duration: string,
) => copy.language === 'zh'
  ? `${name} 的${runtimeCallTypeLabel(copy, type)}，${copy.duration} ${duration}`
  : `${name} ${runtimeCallTypeLabel(copy, type).toLowerCase()}, ${duration}`;

export const runtimeLocalPaymentReply = (
  language: string | undefined,
  tone: 'reserved' | 'playful' | 'gentle' | 'default',
  kind: PaymentKind,
  name: string,
) => {
  if (resolveRuntimeLanguage(language) === 'zh') {
    const object = kind === 'redPacket' ? '这个红包' : '这笔转账';
    if (tone === 'reserved') return `我收下${object}了。谢谢，这份心意我会记得。`;
    if (tone === 'playful') return `那我就开心收下${object}啦。你总能给我惊喜。`;
    if (tone === 'gentle') return `谢谢你，我收下${object}了。这份心意我会好好珍惜。`;
    return `谢谢，我收下${object}了，也记住你的心意了。`;
  }

  const object = kind === 'redPacket' ? 'red packet' : 'transfer';
  if (tone === 'reserved') return `I'll accept the ${object}. Thank you · I won't forget the thought behind it.`;
  if (tone === 'playful') return `Then I'll gladly accept the ${object}. You really know how to surprise me.`;
  if (tone === 'gentle') return `Thank you. I'll accept the ${object} and keep this kindness close.`;
  return `Thank you. ${name} accepts the ${object} and appreciates the thought behind it.`;
};

export const runtimePaymentSummary = (
  copy: RuntimeCopy,
  payment: Payment,
  characterName: string,
) => {
  const amount = copy.language === 'zh'
    ? `¥${(payment.amountMinor / 100).toFixed(2)}`
    : `CNY ${(payment.amountMinor / 100).toFixed(2)}`;
  const note = payment.note ? (copy.language === 'zh' ? `，备注“${payment.note}”` : ` · ${payment.note}`) : '';
  const object = runtimePaymentLabel(copy, payment.kind);
  if (copy.language === 'zh') {
    if (payment.status === 'completed') return `${characterName} 已收下${object} ${amount}${note}。`;
    if (payment.status === 'declined' || payment.status === 'refunded' || payment.status === 'expired') {
      return `${characterName} 未收下${object} ${amount}${note}，款项已退回。`;
    }
    if (payment.status === 'failed') return `${object} ${amount}${note}发送失败。`;
    return `你向${characterName}发送了${object} ${amount}${note}。`;
  }
  if (payment.status === 'completed') return `${characterName} accepted the ${object.toLowerCase()} of ${amount}${note}.`;
  if (payment.status === 'declined' || payment.status === 'refunded' || payment.status === 'expired') {
    return `${characterName} did not accept the ${object.toLowerCase()} of ${amount}${note}; the funds were returned.`;
  }
  if (payment.status === 'failed') return `The ${object.toLowerCase()} of ${amount}${note} failed.`;
  return `You sent ${characterName} a ${object.toLowerCase()} of ${amount}${note}.`;
};
