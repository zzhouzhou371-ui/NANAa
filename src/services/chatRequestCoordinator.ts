export type PendingChatRequests = Record<string, string>;

export const isCurrentChatRequest = (
  pending: PendingChatRequests,
  chatId: string,
  requestId: string,
) => pending[chatId] === requestId;

export const beginChatRequest = (
  pending: PendingChatRequests,
  chatId: string,
  requestId: string,
) => pending[chatId]
  ? { accepted: false, pending }
  : { accepted: true, pending: { ...pending, [chatId]: requestId } };

export const completeChatRequest = (
  pending: PendingChatRequests,
  chatId: string,
  requestId: string,
) => {
  if (!isCurrentChatRequest(pending, chatId, requestId)) {
    return { completed: false, pending };
  }
  const next = { ...pending };
  delete next[chatId];
  return { completed: true, pending: next };
};

export const cancelChatRequest = (
  pending: PendingChatRequests,
  chatId: string,
) => {
  if (!(chatId in pending)) return pending;
  const next = { ...pending };
  delete next[chatId];
  return next;
};
