/**
 * Client-side "which chat is open" for foreground notification suppression.
 * Mirrored to the API so server can skip Expo push while you are in that room.
 */

type Focus = {
  chatId: string;
  chatType: 'individual' | 'group';
};

let current: Focus | null = null;
const listeners = new Set<(f: Focus | null) => void>();

export function getActiveChatFocus(): Focus | null {
  return current;
}

export function setLocalActiveChatFocus(focus: Focus | null): void {
  current = focus;
  listeners.forEach((l) => l(current));
}

export function subscribeActiveChatFocus(listener: (f: Focus | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True if a message push is for the chat currently on screen. */
export function isPushForActiveChat(data: {
  type?: string;
  chat_id?: string;
  chat_type?: string;
}): boolean {
  if (data.type !== 'message' || !data.chat_id || !current) return false;
  const pushType = data.chat_type === 'group' ? 'group' : 'individual';
  return current.chatId === data.chat_id && current.chatType === pushType;
}
