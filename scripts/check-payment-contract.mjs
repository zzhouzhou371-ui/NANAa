import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const sourcePath = resolve(root, relativePath);
  const source = readFileSync(sourcePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: sourcePath,
  });
  const module = { exports: {} };
  const context = vm.createContext({
    exports: module.exports,
    module,
    require: (id) => {
      if (id in mocks) return mocks[id];
      throw new Error(`Unexpected payment-contract module: ${id}`);
    },
    console,
    Date,
    Math,
    JSON,
    Promise,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(compiled.outputText, context, { filename: sourcePath });
  return module.exports;
}

const payment = loadTypeScriptModule('src/services/paymentRuntime.ts');
const runtimeCopy = loadTypeScriptModule('src/services/runtimeCopy.ts');
const errors = [];
const expect = (condition, message) => { if (!condition) errors.push(message); };
const expectThrows = (fn, message) => {
  try {
    fn();
    errors.push(message);
  } catch {
    // Expected.
  }
};
const zhRuntimeCopy = runtimeCopy.runtimeCopyFor('zh-CN');
const zhCallRecord = runtimeCopy.runtimeCallRecord(zhRuntimeCopy, 'video', 'completed', '01:08');
expect(zhCallRecord.includes('视频通话') && zhCallRecord.includes('时长 01:08'), 'Chinese runtime copy must localize call records and duration');
expect(!/Video call|Duration|completed/i.test(zhCallRecord), 'Chinese call records must not leak English status copy');

expect(payment.parsePaymentAmountToMinor('0.01') === 1, 'CNY 0.01 must map to one minor unit');
expect(payment.parsePaymentAmountToMinor('200') === 20000, 'whole CNY amounts must map without floating-point arithmetic');
expect(payment.parsePaymentAmountToMinor('２００．０１') === 20001, 'full-width decimal input must normalize safely');
expect(payment.parsePaymentAmountToMinor('1,234.56') === 123456, 'display commas must be accepted');
expect(payment.parsePaymentAmountToMinor('0') === null, 'zero-value payments must be rejected');
expect(payment.parsePaymentAmountToMinor('-1') === null, 'negative payments must be rejected');
expect(payment.parsePaymentAmountToMinor('1e2') === null, 'scientific notation must be rejected');
expect(payment.parsePaymentAmountToMinor('1.001') === null, 'more than two decimals must be rejected');
expect(payment.reservePaymentFunds(2000, 1888) === 112, 'fund reservation must use canonical minor units');
expectThrows(() => payment.reservePaymentFunds(100, 101), 'insufficient balance must reject before a payment card is created');

const baseInput = {
  id: 'payment:contract',
  chatId: 'luna-id',
  kind: 'transfer',
  senderId: 'user',
  recipientId: 'luna-id',
  amountMinor: 1888,
  now: 100,
};
const created = payment.createPayment(baseInput);
expect(created.status === 'sending' && created.fundsState === 'held', 'a submitted payment must begin with held funds');
expect(created.expiresAt - created.createdAt === 24 * 60 * 60 * 1000, 'payment expiry must be persisted at exactly 24 hours');
const recoveredSending = payment.reconcileInterruptedSendingPaymentEntity(created, 105);
expect(recoveredSending.payment.status === 'pending', 'a crash-persisted sending payment must resume as pending');
expect(recoveredSending.payment.reactionState === 'scheduled', 'a resumed sending payment must schedule its character reaction');
expect(recoveredSending.walletDeltaMinor === 0, 'resuming a held sending payment must not reserve funds twice');
expect(!payment.reconcileInterruptedSendingPaymentEntity(recoveredSending.payment, 106).changed, 'replaying sending recovery must be idempotent');
const inconsistentSending = payment.reconcileInterruptedSendingPaymentEntity({ ...created, fundsState: 'released' }, 107);
expect(inconsistentSending.payment.status === 'failed' && inconsistentSending.payment.fundsState === 'released', 'a released sending snapshot must become safely retryable');
expect(inconsistentSending.walletDeltaMinor === 0, 'a released sending snapshot must not refund twice');
const capturedSending = payment.reconcileInterruptedSendingPaymentEntity({ ...created, fundsState: 'captured' }, 108);
expect(capturedSending.payment.status === 'failed' && capturedSending.walletDeltaMinor === created.amountMinor, 'an impossible captured sending snapshot must release its debit once');
expect(payment.paymentMustRemainVisibleDuringChatClear(created), 'sending cards must survive chat clearing');
expect(payment.paymentMustRemainVisibleDuringChatClear({ ...created, status: 'failed', fundsState: 'released' }), 'retryable failed cards must survive chat clearing');
expect(!payment.paymentMustRemainVisibleDuringChatClear({ ...created, status: 'completed', fundsState: 'captured' }), 'settled cards may be removed by chat clearing');
expect(payment.paymentFundsStateIsValid(created), 'sending payments must require held funds');
expect(!payment.paymentFundsStateIsValid({ ...created, status: 'pending', fundsState: 'released' }), 'pending payments with released funds must be rejected as inconsistent');
const repairedReleasedPending = payment.reconcilePaymentIntegrityEntity({ ...created, status: 'pending', fundsState: 'released' }, 109);
expect(repairedReleasedPending.payment.status === 'failed' && repairedReleasedPending.walletDeltaMinor === 0, 'released pending payments must become retryable without a duplicate refund');
const repairedCapturedPending = payment.reconcilePaymentIntegrityEntity({ ...created, status: 'pending', fundsState: 'captured' }, 109);
expect(repairedCapturedPending.payment.status === 'failed' && repairedCapturedPending.walletDeltaMinor === created.amountMinor, 'captured pending payments must release the invalid debit exactly once');
const pending = payment.transitionPaymentEntity(created, 'pending', 110);
expect(pending.changed && pending.walletDeltaMinor === 0, 'sending to pending must not debit twice');
const duplicatePending = payment.transitionPaymentEntity(pending.payment, 'pending', 120);
expect(!duplicatePending.changed && duplicatePending.walletDeltaMinor === 0, 'replaying pending must be idempotent');
const completed = payment.transitionPaymentEntity(pending.payment, 'completed', 130);
expect(completed.payment.fundsState === 'captured', 'accepted funds must become captured');
expect(completed.walletDeltaMinor === 0, 'acceptance must not debit twice');
expect(payment.transitionPaymentEntity(completed.payment, 'completed', 140).walletDeltaMinor === 0, 'replaying completion must not alter wallet balance');

const acceptedReaction = payment.resolvePaymentReactionEntity(pending.payment, 'accept', 'Thank you.', 701, 130);
expect(acceptedReaction.payment.id === created.id, 'accepting must update the original payment card in place');
expect(acceptedReaction.payment.status === 'completed' && acceptedReaction.payment.reactionMessageId === 701, 'accept provider result must settle the card and link one reply');
expect(acceptedReaction.walletDeltaMinor === 0, 'accept provider result must not debit a held payment again');

const declined = payment.transitionPaymentEntity(pending.payment, 'declined', 130);
expect(declined.walletDeltaMinor === 1888 && declined.payment.fundsState === 'released', 'declining must release held funds exactly once');
const refunded = payment.transitionPaymentEntity(declined.payment, 'refunded', 140);
expect(refunded.walletDeltaMinor === 0, 'the refunded marker must not credit already released funds again');
expect(payment.transitionPaymentEntity(refunded.payment, 'refunded', 150).walletDeltaMinor === 0, 'replaying a refund must be idempotent');
const declinedReaction = payment.resolvePaymentReactionEntity(pending.payment, 'decline', 'I cannot accept this.', 702, 130);
expect(declinedReaction.payment.id === created.id, 'declining must update the original payment card in place');
expect(declinedReaction.payment.status === 'refunded' && declinedReaction.payment.fundsState === 'released', 'decline provider result must settle the card as refunded');
expect(declinedReaction.walletDeltaMinor === 1888, 'decline provider result must restore held funds exactly once');

const failed = payment.transitionPaymentEntity(pending.payment, 'failed', 130);
const retried = payment.transitionPaymentEntity(failed.payment, 'sending', 140);
expect(failed.walletDeltaMinor === 1888, 'a failed submit must release its hold');
expect(retried.walletDeltaMinor === -1888 && retried.payment.fundsState === 'held', 'retrying must establish exactly one new hold');
expectThrows(() => payment.transitionPaymentEntity(completed.payment, 'refunded', 150), 'invalid terminal transitions must be rejected');

const processingReaction = { ...pending.payment, reactionState: 'processing', reactionAttempts: 1 };
const providerFailure = payment.failPaymentReactionEntity(processingReaction, 'provider unavailable', 500);
expect(providerFailure.status === 'pending' && providerFailure.fundsState === 'held', 'provider failure must leave the payment pending and preserve its hold');
expect(providerFailure.reactionState === 'failed' && providerFailure.reactionDueAt > 500, 'provider failure must schedule a bounded reaction retry');

const expiredOnce = payment.reconcileExpiredPaymentEntity(pending.payment, pending.payment.expiresAt);
expect(expiredOnce.payment.status === 'refunded' && expiredOnce.walletDeltaMinor === 1888, '24-hour expiry must refund once');
expect(payment.reconcileExpiredPaymentEntity(expiredOnce.payment, pending.payment.expiresAt + 1).walletDeltaMinor === 0, 'replaying expiry must not refund twice');
let reconciledPayments = { [pending.payment.id]: pending.payment };
let reconciledWallet = 8112;
let totalExpiryDelta = 0;
for (let index = 0; index < 10; index += 1) {
  const result = payment.reconcileExpiredPayments(reconciledPayments, reconciledWallet, pending.payment.expiresAt + index);
  totalExpiryDelta += result.walletBalanceMinor - reconciledWallet;
  reconciledPayments = result.paymentsById;
  reconciledWallet = result.walletBalanceMinor;
}
expect(totalExpiryDelta === 1888 && reconciledWallet === 10000, 'ten consecutive reconciliations must still issue exactly one refund');

expectThrows(() => payment.createPayment({ ...baseInput, kind: 'redPacket', amountMinor: 20001 }), 'red packets over CNY 200 must be rejected');
expect(payment.createPayment({ ...baseInput, kind: 'redPacket', amountMinor: 20000 }).amountMinor === 20000, 'CNY 200 red packets must be accepted');
const delayA = payment.paymentReactionDelayMs('payment:contract', 'luna-id');
const delayB = payment.paymentReactionDelayMs('payment:contract', 'luna-id');
expect(delayA === delayB, 'reaction delay must be deterministic for a persisted payment');
expect(delayA >= payment.PAYMENT_REACTION_MIN_MS && delayA <= payment.PAYMENT_REACTION_MAX_MS, 'reaction delay must stay inside the product range');
const scheduled = payment.schedulePaymentReaction(pending.payment, 200);
expect(!payment.paymentReactionIsDue(scheduled, scheduled.reactionDueAt - 1), 'a reaction must not run before its due time');
expect(payment.paymentReactionIsDue(scheduled, scheduled.reactionDueAt), 'a reaction must become due at its persisted due time');
expect(payment.paymentNeedsExpiry(scheduled, scheduled.expiresAt), 'a pending payment must expire at its persisted deadline');

let remoteContent = '{"decision":"pending","replyText":"wait"}';
const ai = loadTypeScriptModule('src/services/ai.ts', {
  './network': {
    fetchWithTimeout: async () => ({ ok: true, status: 200 }),
    isOfficialGeminiBaseUrl: () => false,
    readResponsePayload: async () => ({
      data: { choices: [{ message: { content: remoteContent } }] },
    }),
    responseErrorMessage: () => 'remote error',
  },
  './runtimeCopy': runtimeCopy,
  './conversationContinuityRuntime': {
    CONTINUITY_ENVELOPE_INSTRUCTION: '',
    formatConversationContinuityContext: () => '',
    parseConversationContinuityEnvelope: text => ({ displayText: text }),
  },
});
const localReaction = await ai.generatePaymentReaction({
  kind: 'transfer',
  amountMinor: 1888,
  userName: 'User',
  character: { id: 'luna-id', name: 'Luna', avatar: 'L', desc: 'gentle and caring' },
  apiUrl: '',
  apiKey: '',
  selectedModel: '',
});
expect(localReaction.source === 'local' && localReaction.decision === 'accept', 'no-key fallback must make a characterized local accept decision');
expect(localReaction.replyText.toLowerCase().includes('kindness'), 'local fallback must use character description rather than a generic receipt');
const localDeclineReaction = await ai.generatePaymentReaction({
  kind: 'transfer',
  amountMinor: 100000,
  userName: 'User',
  character: { id: 'kai-id', name: 'Kai', avatar: 'K', desc: 'proud, independent and reserved' },
  apiUrl: '',
  apiKey: '',
  selectedModel: '',
});
expect(localDeclineReaction.source === 'local' && localDeclineReaction.decision === 'decline', 'no-key fallback must allow an in-character decline');
expect(/won't take|keep it/i.test(localDeclineReaction.replyText), 'local decline must include an in-character explanation');
const localizedReaction = await ai.generatePaymentReaction({
  kind: 'redPacket',
  amountMinor: 888,
  userName: '用户',
  character: { id: 'luna-id', name: '露娜', avatar: 'L', desc: 'gentle and caring' },
  apiUrl: '',
  apiKey: '',
  selectedModel: '',
  language: 'zh',
});
expect(localizedReaction.replyText.includes('红包'), 'Chinese no-key payment reactions must use localized object language');
expect(!/Thank|accept|kindness/i.test(localizedReaction.replyText), 'Chinese no-key payment reactions must not leak the English fallback copy');

const malformedRemoteFallback = await ai.generatePaymentReaction({
  kind: 'transfer',
  amountMinor: 1888,
  userName: 'User',
  character: { id: 'luna-id', name: 'Luna', avatar: 'L', desc: 'gentle' },
  apiUrl: 'https://example.com',
  apiKey: 'test-key',
  selectedModel: 'test-model',
});
expect(
  malformedRemoteFallback.source === 'local' && malformedRemoteFallback.decision === 'accept',
  'malformed remote payment reactions must fall back locally instead of leaving the character silent',
);

remoteContent = '{"decision":"decline","replyText":"I cannot accept this."}';
const remoteReaction = await ai.generatePaymentReaction({
  kind: 'redPacket',
  amountMinor: 888,
  userName: 'User',
  character: { id: 'kai-id', name: 'Kai', avatar: 'K', desc: 'stoic' },
  apiUrl: 'https://example.com',
  apiKey: 'test-key',
  selectedModel: 'test-model',
});
expect(remoteReaction.source === 'remote' && remoteReaction.decision === 'decline', 'valid structured remote reactions must be parsed');

const walletViewSource = readFileSync(resolve(root, 'src/components/WalletView.tsx'), 'utf8');
const storeSource = readFileSync(resolve(root, 'src/stores/nanaStore.ts'), 'utf8');
const paymentMessageStart = storeSource.indexOf('const createPaymentChatMessage');
const paymentMessageEnd = storeSource.indexOf('const paymentWakeupTimers', paymentMessageStart);
const paymentMessageSource = storeSource.slice(paymentMessageStart, paymentMessageEnd);
expect(paymentMessageSource.includes('paymentId: payment.id'), 'new payment messages must reference the canonical payment entity');
expect(!paymentMessageSource.includes('amount:'), 'new payment messages must not duplicate canonical payment amounts');
expect(!paymentMessageSource.includes('note:'), 'new payment messages must not duplicate canonical payment notes');
expect(walletViewSource.includes('setWalletBalance(tempBalance)'), 'wallet editing must use the canonical minor-unit action');
expect(!walletViewSource.includes("set({ walletBalance: tempBalance"), 'wallet UI must not write the legacy display balance alone');
expect(storeSource.includes('walletBalanceMinor,\n          walletBalance,'), 'wallet edits must update minor units and their derived display string together');

if (errors.length > 0) {
  console.error('Payment contract check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Payment contract check passed.');
}
