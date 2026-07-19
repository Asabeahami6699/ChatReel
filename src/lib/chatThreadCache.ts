/**
 * In-memory last-known thread per chat so reopening a room paints instantly
 * (before SQLite / network catch-up).
 */

type ThreadEntry = {
  messages: unknown[];
  updatedAt: number;
};

const cache = new Map<string, ThreadEntry>();
const MAX_CHATS = 40;

export function rememberChatThread(chatId: string, messages: unknown[]) {
  if (!chatId) return;
  cache.set(chatId, { messages, updatedAt: Date.now() });
  if (cache.size <= MAX_CHATS) return;
  const oldest = [...cache.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt)[0];
  if (oldest) cache.delete(oldest[0]);
}

export function recallChatThread<T = unknown>(chatId: string): T[] | null {
  const entry = cache.get(chatId);
  if (!entry) return null;
  return entry.messages as T[];
}

export function clearChatThread(chatId: string) {
  cache.delete(chatId);
}
