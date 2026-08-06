import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { chatThemePresets, isChatThemeId, type ChatThemeId, type ChatThemeTokens } from '../lib/chatThemes';
import { api, type UserRingtoneDTO } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { setPushNotificationsEnabled } from '../lib/pushPrefs';
import { onChatSocketEvent } from '../lib/chatSocket';

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
  /** `all` = entire Chats tab; `selected` = only listed conversations. */
  chatLockScope: 'all' | 'selected';
  /** Keys like `individual:uuid` / `group:uuid` when scope is selected. */
  chatLockedKeys: string[];
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
  chatLockScope: 'all',
  chatLockedKeys: [],
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
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const syncingPrivacyRef = useRef(false);

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
        const chatLockScope: ChatAppSettings['chatLockScope'] =
          parsed.chatLockScope === 'selected' ? 'selected' : 'all';
        const chatLockedKeys = Array.isArray(parsed.chatLockedKeys)
          ? parsed.chatLockedKeys.filter((k): k is string => typeof k === 'string')
          : [];
        const next: ChatAppSettings = {
          ...DEFAULT_SETTINGS,
          ...parsed,
          themeId,
          chatLockScope,
          chatLockedKeys,
        };
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

  const applyPrivacyLockRemote = useCallback(
    (remote: { app_lock_enabled: boolean; chat_lock_enabled: boolean }) => {
      setSettings((prev) => {
        if (
          prev.appLockBiometric === remote.app_lock_enabled &&
          prev.chatLockEnabled === remote.chat_lock_enabled
        ) {
          return prev;
        }
        const next = {
          ...prev,
          appLockBiometric: remote.app_lock_enabled,
          chatLockEnabled: remote.chat_lock_enabled,
        };
        void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const pullPrivacyLock = useCallback(async () => {
    if (!user?.id) return;
    try {
      const remote = await api.privacyLock.get();
      applyPrivacyLockRemote(remote);
    } catch (err) {
      console.warn('[privacy-lock] pull failed', err);
    }
  }, [applyPrivacyLockRemote, user?.id]);

  const pushPrivacyLock = useCallback(
    async (patch: { appLockBiometric?: boolean; chatLockEnabled?: boolean }) => {
      if (!user?.id) return;
      if (
        typeof patch.appLockBiometric !== 'boolean' &&
        typeof patch.chatLockEnabled !== 'boolean'
      ) {
        return;
      }
      syncingPrivacyRef.current = true;
      try {
        const remote = await api.privacyLock.update({
          ...(typeof patch.appLockBiometric === 'boolean'
            ? { app_lock_enabled: patch.appLockBiometric }
            : {}),
          ...(typeof patch.chatLockEnabled === 'boolean'
            ? { chat_lock_enabled: patch.chatLockEnabled }
            : {}),
        });
        applyPrivacyLockRemote(remote);
      } catch (err) {
        console.warn('[privacy-lock] push failed', err);
      } finally {
        // Ignore echo of our own WS event briefly.
        setTimeout(() => {
          syncingPrivacyRef.current = false;
        }, 800);
      }
    },
    [applyPrivacyLockRemote, user?.id]
  );

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
      if (
        typeof patch.appLockBiometric === 'boolean' ||
        typeof patch.chatLockEnabled === 'boolean'
      ) {
        void pushPrivacyLock({
          appLockBiometric: patch.appLockBiometric,
          chatLockEnabled: patch.chatLockEnabled,
        });
      }
    },
    [pushPrivacyLock, user?.id]
  );

  // Pull account privacy lock after login / hydrate.
  useEffect(() => {
    if (!ready || !user?.id) return;
    void pullPrivacyLock();
  }, [ready, user?.id, pullPrivacyLock]);

  // Live sync when another device toggles lock.
  useEffect(() => {
    if (!user?.id) return;
    return onChatSocketEvent((ev) => {
      if (ev.type !== 'privacy_lock.updated') return;
      if (syncingPrivacyRef.current) return;
      applyPrivacyLockRemote({
        app_lock_enabled: Boolean(ev.app_lock_enabled),
        chat_lock_enabled: Boolean(ev.chat_lock_enabled),
      });
    });
  }, [applyPrivacyLockRemote, user?.id]);

  // Refresh when returning to the foreground (covers missed WS events).
  useEffect(() => {
    if (!user?.id) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void pullPrivacyLock();
    });
    return () => sub.remove();
  }, [pullPrivacyLock, user?.id]);

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
