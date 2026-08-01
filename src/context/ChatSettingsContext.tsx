import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { chatThemePresets, isChatThemeId, type ChatThemeId, type ChatThemeTokens } from '../lib/chatThemes';
import { api, type UserRingtoneDTO } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { setPushNotificationsEnabled } from '../lib/pushPrefs';

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
  /** Show when you are typing in chats. */
  showTypingIndicator: boolean;
  /** Show online / last-active presence to others. */
  showOnlineStatus: boolean;
  /** Generate link previews in chat. */
  linkPreviews: boolean;
  /** Auto-save received media to the device gallery. */
  saveMediaToGallery: boolean;
  /** Prefer unlocking the app with device biometrics when available. */
  appLockBiometric: boolean;
  /** Lock only the Chats tab (separate from full App lock). */
  chatLockEnabled: boolean;
  /** Hide call video / show privacy cover when leaving the app mid-call. */
  callPrivacyOnBackground: boolean;
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
  showTypingIndicator: true,
  showOnlineStatus: true,
  linkPreviews: true,
  saveMediaToGallery: false,
  appLockBiometric: false,
  chatLockEnabled: false,
  callPrivacyOnBackground: true,
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

export const ChatSettingsContext = createContext<ChatSettingsContextValue | null>(null);

export function ChatSettingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<ChatAppSettings>(DEFAULT_SETTINGS);
  const [ringtoneLibrary, setRingtoneLibrary] = useState<UserRingtoneDTO[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!alive) return;
        if (!raw) {
          setPushNotificationsEnabled(DEFAULT_SETTINGS.pushNotifications);
          return;
        }
        const parsed = JSON.parse(raw) as Partial<ChatAppSettings>;
        const themeId = isChatThemeId(parsed.themeId) ? parsed.themeId : DEFAULT_SETTINGS.themeId;
        const next = { ...DEFAULT_SETTINGS, ...parsed, themeId };
        setSettings(next);
        setPushNotificationsEnabled(next.pushNotifications);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Keep module-level push flag in sync after hydrate.
  useEffect(() => {
    if (!ready) return;
    setPushNotificationsEnabled(settings.pushNotifications);
  }, [ready, settings.pushNotifications]);

  const updateSettings = useCallback(
    async (patch: Partial<ChatAppSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
      if (typeof patch.pushNotifications === 'boolean') {
        setPushNotificationsEnabled(patch.pushNotifications);
        try {
          const { syncPushRegistrationForSetting } = await import(
            '../hooks/usePushNotifications'
          );
          await syncPushRegistrationForSetting(user?.id, patch.pushNotifications);
        } catch (err) {
          console.warn('[settings] push toggle sync failed:', err);
        }
      }
    },
    [user?.id]
  );

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
