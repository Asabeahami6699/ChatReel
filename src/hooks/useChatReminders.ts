import { useCallback, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { api } from '../lib/api';
import type { ChatReminder } from '../lib/chatReminders';
import {
  emitChatRemindersChanged,
  subscribeChatRemindersChanged,
} from '../lib/chatReminderEvents';
import { useAuth } from './useAuth';

let memoryCache: ChatReminder[] = [];

export function getCachedChatReminders(): ChatReminder[] {
  return memoryCache;
}

export function setCachedChatReminders(next: ChatReminder[]): void {
  memoryCache = next;
  emitChatRemindersChanged();
}

export async function refreshChatReminders(): Promise<ChatReminder[]> {
  const { reminders } = await api.chatReminders.list('active');
  memoryCache = reminders as ChatReminder[];
  emitChatRemindersChanged();
  return memoryCache;
}

export function useChatReminders() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<ChatReminder[]>(memoryCache);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!user?.id) {
      memoryCache = [];
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
      memoryCache = [];
      setReminders([]);
      return;
    }
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
