import type { ChatRealtimeRow } from './chatRealtime';
import { subscribeToMessageRows } from './chatRealtime';

export type ChatListMessageEvent = {
  row: ChatRealtimeRow;
  event: 'INSERT' | 'UPDATE';
};

type Listener = (payload: ChatListMessageEvent) => void;

const listeners = new Set<Listener>();
let hubUnsubscribe: (() => void) | null = null;
let activeUserId: string | null = null;

function dispatch(payload: ChatListMessageEvent) {
  listeners.forEach((listener) => {
    try {
      listener(payload);
    } catch (e) {
      console.error('[chatListRealtimeBridge] listener error:', e);
    }
  });
}

/** Keep one global messages subscription alive for the whole app session. */
export function ensureChatListRealtimeBridge(authUserId: string): void {
  if (hubUnsubscribe && activeUserId === authUserId) return;

  hubUnsubscribe?.();
  hubUnsubscribe = null;
  activeUserId = authUserId;

  hubUnsubscribe = subscribeToMessageRows((row, event) => {
    dispatch({ row, event });
  });
}

export function stopChatListRealtimeBridge(): void {
  hubUnsubscribe?.();
  hubUnsubscribe = null;
  activeUserId = null;
}

export function subscribeChatListMessageEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
