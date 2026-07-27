import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Gift, SendHorizontal, X } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { parsePaymentAmountToMinor } from '../services/paymentRuntime';
import { useNanaStore } from '../stores/nanaStore';
import { AnimatedPressable } from './primitives';
import { CharacterPortrait } from './CharacterPortrait';
import { NeumorphicSurface, neumorphicPalette, type NeumorphicTone } from './neumorphic-surface';

const formatBalance = (minor: number) => (Math.max(0, minor) / 100).toFixed(2);

export function PaymentModal() {
  const { t } = useApp();
  const paymentModal = useNanaStore(state => state.paymentModal);
  const paymentAmount = useNanaStore(state => state.paymentAmount);
  const paymentNote = useNanaStore(state => state.paymentNote);
  const walletBalanceMinor = useNanaStore(state => state.walletBalanceMinor);
  const activeChatId = useNanaStore(state => state.activeChatId);
  const characters = useNanaStore(state => state.characters);
  const set = useNanaStore.setState;
  const { width, height } = useWindowDimensions();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const keyboardInset = useKeyboardHeight();
  const amountInputRef = useRef<TextInput>(null);
  const noteInputRef = useRef<TextInput>(null);

  const character = characters.find(item => item.id === activeChatId);
  const isTransfer = paymentModal.type === 'transfer';
  const sheetTone: NeumorphicTone = isTransfer ? 'transferSheet' : 'redPacketSheet';
  const actionTone: NeumorphicTone = isTransfer ? 'transfer' : 'redPacket';
  const amountMinor = useMemo(() => parsePaymentAmountToMinor(paymentAmount), [paymentAmount]);
  const sheetWidth = Math.min(width, 430);
  const compact = height < 700;

  const dismissPaymentKeyboard = useCallback(() => {
    amountInputRef.current?.blur();
    noteInputRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  useEffect(() => () => {
    // sendPayment closes this sheet from the store. Dismiss again during
    // unmount so Android cannot retain an IME owned by the removed input.
    dismissPaymentKeyboard();
  }, [dismissPaymentKeyboard]);

  const closeModal = () => {
    if (submitting) return;
    dismissPaymentKeyboard();
    set({ paymentModal: { type: 'none' }, paymentAmount: '', paymentNote: '' });
    setError('');
  };

  const validate = () => {
    if (amountMinor === null || amountMinor < 1) return t.amountInvalid;
    if (!isTransfer && amountMinor > 20_000) return t.redPacketLimit;
    if (amountMinor > walletBalanceMinor) return t.insufficientBalance;
    return '';
  };

  const handlePay = async () => {
    if (!activeChatId || submitting) return;
    const nextError = validate();
    if (nextError) {
      setError(nextError);
      return;
    }

    // Blur before the payment store update unmounts this modal on Android.
    dismissPaymentKeyboard();
    setSubmitting(true);
    setError('');
    try {
      await useNanaStore.getState().sendPayment({
        chatId: activeChatId,
        kind: isTransfer ? 'transfer' : 'redPacket',
        amountMinor: amountMinor!,
        note: paymentNote.trim() || undefined,
      });
      dismissPaymentKeyboard();
      set({ paymentModal: { type: 'none' }, paymentAmount: '', paymentNote: '', chatPanel: 'none' });
      requestAnimationFrame(() => Keyboard.dismiss());
      setTimeout(() => Keyboard.dismiss(), 80);
    } catch (paymentError) {
      const message = paymentError instanceof Error ? paymentError.message : '';
      setError(/insufficient/i.test(message) ? t.insufficientBalance : t.paymentFailedRetry);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 50 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={t.cancel} onPress={closeModal} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(3, 6, 16, 0.12)' }} />
      <KeyboardAvoidingView
        // The Android activity uses adjustResize, so a second height adjustment
        // here would hide the note and submit controls behind the keyboard.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingBottom: Platform.OS === 'android' ? keyboardInset : 0,
        }}
      >
        <NeumorphicSurface
          testID="payment-neumorphic-sheet"
          depth="raised"
          tone={sheetTone}
          radius={26}
          fill={false}
          style={{
            width: sheetWidth,
            maxHeight: Math.min(height * (compact ? 0.9 : 0.78), 590),
            marginBottom: 0,
            borderRadius: 0,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            borderCurve: 'continuous',
          }}
          contentStyle={{
            borderRadius: 0,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            paddingHorizontal: compact ? 18 : 22,
            paddingTop: 10,
            paddingBottom: compact ? 18 : 28,
          }}
        >
          <View style={{ width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: compact ? 12 : 18, backgroundColor: neumorphicPalette.onLightSecondary }} />

          <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 11 }}>
            {character ? (
              <NeumorphicSurface
                depth="raisedSmall"
                tone={sheetTone}
                radius={24}
                style={{ width: 48, height: 48 }}
                contentStyle={{ overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: 2.5 }}
              >
                <View style={{ flex: 1, alignSelf: 'stretch', borderRadius: 21.5, overflow: 'hidden' }}>
                  <CharacterPortrait characterId={character.id} avatar={character.avatar} fallback={character.name[0] || 'N'} fontSize={18} />
                </View>
              </NeumorphicSurface>
            ) : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: neumorphicPalette.onLightPrimary, fontSize: 18, lineHeight: 23, fontWeight: '700' }}>
                {isTransfer ? t.transfer : t.redPacket}
              </Text>
              <Text numberOfLines={1} style={{ color: neumorphicPalette.onLightSecondary, fontSize: 12, lineHeight: 17, marginTop: 1 }}>
                {character?.name || ''}
              </Text>
            </View>
            <AnimatedPressable accessibilityRole="button" accessibilityLabel={t.cancel} onPress={closeModal} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <NeumorphicSurface pointerEvents="none" depth="raisedSmall" tone={sheetTone} radius={22} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
              <X size={20} color={neumorphicPalette.onLightSecondary} strokeWidth={1.7} />
            </AnimatedPressable>
          </View>

          <View style={{ marginTop: compact ? 16 : 24 }}>
            <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 12, lineHeight: 16 }}>{t.amount}</Text>
            <NeumorphicSurface
              depth="inset"
              tone={sheetTone}
              radius={16}
              style={{
                height: 70,
                marginTop: 7,
              }}
              contentStyle={{
                paddingHorizontal: 14,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Text style={{ color: isTransfer ? neumorphicPalette.transfer : neumorphicPalette.redPacket, fontSize: 31, lineHeight: 40, fontWeight: '600', marginRight: 8 }}>{'\u00A5'}</Text>
              <TextInput
                ref={amountInputRef}
                testID="payment-amount-input"
                value={paymentAmount}
                onChangeText={value => {
                  set({ paymentAmount: value.replace(/[^0-9.]/g, '') });
                  if (error) setError('');
                }}
                placeholder="0.00"
                placeholderTextColor={neumorphicPalette.onLightSecondary}
                keyboardType="decimal-pad"
                selectTextOnFocus
                style={{ flex: 1, minWidth: 0, height: 68, paddingVertical: 0, color: neumorphicPalette.onLightPrimary, fontSize: 36, lineHeight: 44, fontWeight: '600', fontVariant: ['tabular-nums'] }}
              />
            </NeumorphicSurface>
            <Text style={{ color: error ? '#742F43' : neumorphicPalette.onLightSecondary, fontSize: 12, lineHeight: 17, minHeight: 21, marginTop: 7 }}>
              {error || t.walletBalance.replace('{amount}', formatBalance(walletBalanceMinor))}
            </Text>
          </View>

          <View style={{ marginTop: compact ? 8 : 14 }}>
            <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 12, lineHeight: 16, marginBottom: 7 }}>{t.noteOptional}</Text>
            <NeumorphicSurface
              depth="inset"
              tone={sheetTone}
              radius={14}
              style={{ height: 48 }}
            >
              <TextInput
                ref={noteInputRef}
                testID="payment-note-input"
                value={paymentNote}
                onChangeText={value => set({ paymentNote: Array.from(value).slice(0, 32).join('') })}
                placeholder={isTransfer ? t.transfer : t.redPacket}
                placeholderTextColor={neumorphicPalette.onLightSecondary}
                maxLength={64}
                style={{ width: '100%', minHeight: 48, paddingHorizontal: 14, color: neumorphicPalette.onLightPrimary, fontSize: 14 }}
              />
            </NeumorphicSurface>
            <Text style={{ alignSelf: 'flex-end', color: neumorphicPalette.onLightSecondary, fontSize: 10, lineHeight: 14, marginTop: 4 }}>
              {Array.from(paymentNote).length}/32
            </Text>
          </View>

          <AnimatedPressable
            testID="payment-submit-button"
            accessibilityRole="button"
            accessibilityLabel={isTransfer ? t.confirmTransfer : t.sendRedPacket}
            accessibilityState={{ disabled: submitting }}
            onPress={() => void handlePay()}
            disabled={submitting}
            style={{
              height: 50,
              borderRadius: 15,
              marginTop: compact ? 12 : 18,
              width: '100%',
              opacity: submitting ? 0.62 : 1,
            }}
          >
            <NeumorphicSurface
              pointerEvents="none"
              depth="raisedSmall"
              tone={actionTone}
              radius={15}
              style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
              contentStyle={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {isTransfer ? <SendHorizontal size={18} color={neumorphicPalette.onDarkPrimary} strokeWidth={1.9} /> : <Gift size={18} color={neumorphicPalette.onDarkPrimary} strokeWidth={1.9} />}
              <Text style={{ color: neumorphicPalette.onDarkPrimary, fontSize: 15, lineHeight: 20, fontWeight: '700' }}>
                {submitting ? t.processing : isTransfer ? t.confirmTransfer : t.sendRedPacket}
              </Text>
            </NeumorphicSurface>
          </AnimatedPressable>
        </NeumorphicSurface>
      </KeyboardAvoidingView>
    </View>
  );
}
