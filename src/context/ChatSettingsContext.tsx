import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { chatThemePresets, type ChatThemeId, type ChatThemeTokens } from '../lib/chatThemes';

export type ChatAppSettings = {
  themeId: ChatThemeId;
  pushNotifications: boolean;
  messageSounds: boolean;
  /** Custom incoming ring file URI; null/empty = bundled default ringtone. */
  incomingRingtoneUri: string | null;
  incomingRingtoneLabel: string | null;
  /** Favourite clip start (seconds) within the custom ringtone file. */
  incomingRingtoneStartSec: number;
  /** Favourite clip end (seconds); null = start + up to 60s / file end. */
  incomingRingtoneEndSec: number | null;
  readReceipts: boolean;
  showLastSeen: boolean;
  mediaAutoDownload: boolean;
  enterToSend: boolean;
  compactChatList: boolean;
};

const STORAGE_KEY = 'chat_app_settings_v1';

const DEFAULT_SETTINGS: ChatAppSettings = {
  themeId: 'blue',
  pushNotifications: true,
  messageSounds: true,
  incomingRingtoneUri: null,
  incomingRingtoneLabel: null,
  incomingRingtoneStartSec: 0,
  incomingRingtoneEndSec: null,
  readReceipts: true,
  showLastSeen: true,
  mediaAutoDownload: true,
  enterToSend: false,
  compactChatList: false,
};

type ChatSettingsContextValue = {
  settings: ChatAppSettings;
  theme: ChatThemeTokens;
  updateSettings: (patch: Partial<ChatAppSettings>) => Promise<void>;
  ready: boolean;
};

const ChatSettingsContext = createContext<ChatSettingsContextValue | null>(null);

export function ChatSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<ChatAppSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        const parsed = JSON.parse(raw) as Partial<ChatAppSettings>;
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const updateSettings = useCallback(async (patch: Partial<ChatAppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const theme = useMemo(
    () => chatThemePresets[settings.themeId] ?? chatThemePresets.blue,
    [settings.themeId]
  );

  const value = useMemo(
    () => ({ settings, theme, updateSettings, ready }),
    [settings, theme, updateSettings, ready]
  );

  return <ChatSettingsContext.Provider value={value}>{children}</ChatSettingsContext.Provider>;
}

export function useChatSettings() {
  const ctx = useContext(ChatSettingsContext);
  if (!ctx) throw new Error('useChatSettings must be used within ChatSettingsProvider');
  return ctx;
}
