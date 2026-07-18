export type ChatRealtimeRow = Record<string, unknown> & {
  id?: string;
  sender_id?: string;
  receiver_id?: string;
  group_id?: string;
};

type MessageRowListener = (row: ChatRealtimeRow, event: 'INSERT' | 'UPDATE') => void;
const messageRowListeners = new Set<MessageRowListener>();

/** Subscribe to message row events from the global realtime hub (one WS binding). */
export function subscribeToMessageRows(listener: MessageRowListener): () => void {
  messageRowListeners.add(listener);
  return () => messageRowListeners.delete(listener);
}

// INSERT dedupe: the same row can arrive from the Supabase hub AND the custom
// chat WebSocket (which also emits per-chat and per-user copies). Bounded set
// so memory stays flat over long sessions.
const seenInsertIds = new Set<string>();
const seenInsertOrder: string[] = [];
const MAX_SEEN_INSERTS = 500;

function markInsertSeen(id: string) {
  seenInsertIds.add(id);
  seenInsertOrder.push(id);
  if (seenInsertOrder.length > MAX_SEEN_INSERTS) {
    const oldest = seenInsertOrder.shift();
    if (oldest) seenInsertIds.delete(oldest);
  }
}

/** Called by realtimeHub / chat WebSocket when a messages row changes. */
export function dispatchMessageRow(row: ChatRealtimeRow, event: 'INSERT' | 'UPDATE') {
  if (event === 'INSERT' && typeof row.id === 'string') {
    if (seenInsertIds.has(row.id)) return;
    markInsertSeen(row.id);
  }
  messageRowListeners.forEach((listener) => {
    try {
      listener(row, event);
    } catch (e) {
      console.error('[chatRealtime] listener error:', e);
    }
  });
}

// NOTE: The former per-room `subscribeToChatMessages` channel was removed.
// It duplicated the global realtime hub's broad `messages` binding (one extra
// unfiltered postgres_changes subscription per open room). Rooms now rely on
// the hub dispatch above plus the custom chat WebSocket and HTTP reconciliation.
