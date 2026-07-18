/**
 * Soft "viewer is in this chat" map for skipping redundant message pushes.
 * In-memory is enough for a single API instance (Phase 1).
 */

type FocusEntry = {
  chatId: string;
  chatType: 'individual' | 'group';
  at: number;
};

const FOCUS_TTL_MS = 2 * 60_000;
const byUser = new Map<string, FocusEntry>();

export function setActiveChatFocus(
  userId: string,
  chatId: string,
  chatType: 'individual' | 'group'
): void {
  byUser.set(userId, { chatId, chatType, at: Date.now() });
}

export function clearActiveChatFocus(userId: string, chatId?: string): void {
  if (!chatId) {
    byUser.delete(userId);
    return;
  }
  const cur = byUser.get(userId);
  if (cur?.chatId === chatId) byUser.delete(userId);
}

/** True when the user is focused on this conversation and recently reported it. */
export function isUserFocusedOnChat(
  userId: string,
  chatId: string,
  chatType: 'individual' | 'group'
): boolean {
  const cur = byUser.get(userId);
  if (!cur) return false;
  if (Date.now() - cur.at > FOCUS_TTL_MS) {
    byUser.delete(userId);
    return false;
  }
  return cur.chatId === chatId && cur.chatType === chatType;
}

/** Drop users who currently have this chat open (Realtime will deliver). */
export function filterUsersNeedingMessagePush(
  userIds: string[],
  chatId: string,
  chatType: 'individual' | 'group'
): string[] {
  return userIds.filter((uid) => !isUserFocusedOnChat(uid, chatId, chatType));
}
