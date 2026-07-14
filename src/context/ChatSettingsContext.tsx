import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { chatThemePresets, type ChatThemeId, type ChatThemeTokens } from '../lib/chatThemes';
import { api, type UserRingtoneDTO } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

export type ChatAppSettings = {
  themeId: ChatThemeId;
  pushNotifications: boolean;
  messageSounds: boolean;
  /** Selected custom ring public URL; null = bundled default. */
  incomingRingtoneUri: string | null;
  incomingRingtoneLabel: string | null;
  incomingRingtoneId: string | null;
  /** Kept for local trim preview before save; not used for playback of DB clips. */
  incomingRingtoneStartSec: number;
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
  incomingRingtoneId: null,
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
  ringtoneLibrary: UserRingtoneDTO[];
  refreshRingtoneLibrary: () => Promise<void>;
  selectRingtone: (ringtone: UserRingtoneDTO | null) => Promise<void>;
  ready: boolean;
};

const ChatSettingsContext = createContext<ChatSettingsContextValue | null>(null);

export function ChatSettingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<ChatAppSettings>(DEFAULT_SETTINGS);
  const [ringtoneLibrary, setRingtoneLibrary] = useState<UserRingtoneDTO[]>([]);
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

  const refreshRingtoneLibrary = useCallback(async () => {
    if (!user?.id) {
      setRingtoneLibrary([]);
      return;
    }
    try {
      const { ringtones, selected_id } = await api.ringtones.list();
      setRingtoneLibrary(ringtones);
      const selected = selected_id
        ? ringtones.find((r) => r.id === selected_id) ?? null
        : null;
      await updateSettings({
        incomingRingtoneId: selected?.id ?? null,
        incomingRingtoneUri: selected?.audio_url ?? null,
        incomingRingtoneLabel: selected?.label ?? null,
        // DB clips are already trimmed — play from 0.
        incomingRingtoneStartSec: selected ? 0 : 0,
        incomingRingtoneEndSec: selected ? selected.duration_sec : null,
      });
    } catch (err) {
      console.warn('[ringtones] list failed', err);
    }
  }, [updateSettings, user?.id]);

  useEffect(() => {
    if (!ready || !user?.id) return;
    void refreshRingtoneLibrary();
  }, [ready, user?.id, refreshRingtoneLibrary]);

  const selectRingtone = useCallback(
    async (ringtone: UserRingtoneDTO | null) => {
      const { ringtone: selected } = await api.ringtones.select(ringtone?.id ?? null);
      await updateSettings({
        incomingRingtoneId: selected?.id ?? null,
        incomingRingtoneUri: selected?.audio_url ?? null,
        incomingRingtoneLabel: selected?.label ?? null,
        incomingRingtoneStartSec: 0,
        incomingRingtoneEndSec: selected?.duration_sec ?? null,
      });
      await refreshRingtoneLibrary();
    },
    [refreshRingtoneLibrary, updateSettings]
  );

  const theme = useMemo(
    () => chatThemePresets[settings.themeId] ?? chatThemePresets.blue,
    [settings.themeId]
  );

  const value = useMemo(
    () => ({
      settings,
      theme,
      updateSettings,
      ringtoneLibrary,
      refreshRingtoneLibrary,
      selectRingtone,
      ready,
    }),
    [
      settings,
      theme,
      updateSettings,
      ringtoneLibrary,
      refreshRingtoneLibrary,
      selectRingtone,
      ready,
    ]
  );

  return <ChatSettingsContext.Provider value={value}>{children}</ChatSettingsContext.Provider>;
}

export function useChatSettings() {
  const ctx = useContext(ChatSettingsContext);
  if (!ctx) throw new Error('useChatSettings must be used within ChatSettingsProvider');
  return ctx;
}
