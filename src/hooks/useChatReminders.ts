import { useCallback, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { api } from '../lib/api';
import { reminderUrgency, type ChatReminder } from '../lib/chatReminders';
import {
  emitChatRemindersChanged,
  subscribeChatRemindersChanged,
} from '../lib/chatReminderEvents';
import { useAuth } from './useAuth';

let memoryCache: ChatReminder[] = [];
let prefetchPromise: Promise<ChatReminder[]> | null = null;
let prefetchTimer: ReturnType<typeof setTimeout> | null = null;

export function getCachedChatReminders(): ChatReminder[] {
  return memoryCache;
}

export function setCachedChatReminders(next: ChatReminder[]): void {
  memoryCache = next;
  emitChatRemindersChanged();
}

export function clearCachedChatReminders(): void {
  memoryCache = [];
  prefetchPromise = null;
  if (prefetchTimer) {
    clearTimeout(prefetchTimer);
    prefetchTimer = null;
  }
  emitChatRemindersChanged();
}

export async function refreshChatReminders(): Promise<ChatReminder[]> {
  const { reminders } = await api.chatReminders.list('active');
  memoryCache = reminders as ChatReminder[];
  emitChatRemindersChanged();
  return memoryCache;
}

/** Warm active reminders after login so chat list + Reminders screen open live. */
export async function prefetchChatReminders(): Promise<ChatReminder[]> {
  if (prefetchPromise) return prefetchPromise;
  prefetchPromise = refreshChatReminders()
    .catch(() => memoryCache)
    .finally(() => {
      prefetchPromise = null;
    });
  return prefetchPromise;
}

export function scheduleChatRemindersPrefetch(delayMs = 0): void {
  if (prefetchTimer) clearTimeout(prefetchTimer);
  prefetchTimer = setTimeout(() => {
    prefetchTimer = null;
    void prefetchChatReminders();
  }, delayMs);
}

function isDueReminder(r: ChatReminder, now = Date.now()): boolean {
  return r.status === 'fired' || reminderUrgency(r.remind_at, now) === 'due';
}

/** Mark a single reminder done (optimistic cache update). */
export async function completeReminderOnView(id: string): Promise<void> {
  const prev = memoryCache;
  memoryCache = memoryCache.filter((r) => r.id !== id);
  emitChatRemindersChanged();
  try {
    await api.chatReminders.update(id, { status: 'done' });
    await refreshChatReminders();
  } catch {
    memoryCache = prev;
    emitChatRemindersChanged();
  }
}

/**
 * After a due reminder fires, opening the chat (or the reminder itself)
 * clears matching due/fired reminders so badges don't linger.
 */
export async function clearDueRemindersForChat(
  chatType: 'individual' | 'group',
  chatId: string
): Promise<void> {
  if (!chatId) return;
  const due = memoryCache.filter(
    (r) => r.chat_type === chatType && r.chat_id === chatId && isDueReminder(r)
  );
  if (!due.length) return;
  const ids = new Set(due.map((r) => r.id));
  const prev = memoryCache;
  memoryCache = memoryCache.filter((r) => !ids.has(r.id));
  emitChatRemindersChanged();
  try {
    await Promise.all(
      due.map((r) => api.chatReminders.update(r.id, { status: 'done' }).catch(() => null))
    );
    await refreshChatReminders();
  } catch {
    memoryCache = prev;
    emitChatRemindersChanged();
  }
}

export function useChatReminders() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<ChatReminder[]>(memoryCache);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!user?.id) {
      clearCachedChatReminders();
      setReminders([]);
      return;
    }
    setLoading(true);
    try {
      const next = await refreshChatReminders();
      setReminders(next);
    } catch {
      setReminders(memoryCache);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      clearCachedChatReminders();
      setReminders([]);
      return;
    }
    // Paint from cache immediately; refresh in background if already warm.
    setReminders([...memoryCache]);
    void reload();
    const unsub = subscribeChatRemindersChanged(() => {
      setReminders([...memoryCache]);
    });
    const onApp = (state: AppStateStatus) => {
      if (state === 'active') void reload();
    };
    const sub = AppState.addEventListener('change', onApp);
    const tick = setInterval(() => {
      setReminders((prev) => [...prev]);
    }, 60_000);
    return () => {
      unsub();
      sub.remove();
      clearInterval(tick);
    };
  }, [user?.id, reload]);

  return { reminders, loading, reload };
}
