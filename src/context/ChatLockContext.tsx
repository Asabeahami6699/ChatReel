import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { useChatSettings } from './ChatSettingsContext';
import { authenticateAppUnlock } from '../lib/appLock';
import { isPrivacyLockPaused } from '../lib/privacyLockPause';

type ChatLockContextValue = {
  /** True when Chats should be covered by the lock gate. */
  locked: boolean;
  unlocking: boolean;
  unlock: () => Promise<boolean>;
  lockNow: () => void;
  /** Call when the Chats tab / stack loses focus so chat lock re-engages. */
  onChatsBlur: () => void;
};

const ChatLockContext = createContext<ChatLockContextValue | null>(null);

/**
 * Locks only the Chats experience (list + conversations), separate from App Lock.
 * Leaving the Chats tab or backgrounding the app re-locks when enabled.
 */
export function ChatLockProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { settings, ready: settingsReady } = useChatSettings();
  const enabled = settings.chatLockEnabled && Platform.OS !== 'web';

  const [locked, setLocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    if (!settingsReady || authLoading) return;

    if (!bootstrappedRef.current) {
      bootstrappedRef.current = true;
      if (enabled && isAuthenticated) {
        setLocked(true);
      }
      return;
    }

    if (!enabled || !isAuthenticated) {
      setLocked(false);
    }
  }, [settingsReady, authLoading, enabled, isAuthenticated]);

  useEffect(() => {
    if (!enabled || !isAuthenticated) return;

    const onChange = (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      if (isPrivacyLockPaused()) return;

      if (next === 'background') {
        setLocked(true);
        return;
      }

      if (prev === 'background' && next === 'active') {
        if (isPrivacyLockPaused()) return;
        setLocked(true);
      }
    };

    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [enabled, isAuthenticated]);

  const unlock = useCallback(async () => {
    if (!enabled) return true;
    if (!locked) return true;
    if (unlocking) return false;
    setUnlocking(true);
    try {
      const result = await authenticateAppUnlock('Unlock Chats');
      if (result.success) {
        setLocked(false);
        return true;
      }
      return false;
    } finally {
      setUnlocking(false);
    }
  }, [enabled, locked, unlocking]);

  const lockNow = useCallback(() => {
    if (!enabled || !isAuthenticated) return;
    setLocked(true);
  }, [enabled, isAuthenticated]);

  const onChatsBlur = useCallback(() => {
    if (!enabled || !isAuthenticated) return;
    setLocked(true);
  }, [enabled, isAuthenticated]);

  const value = useMemo(
    () => ({
      locked: Boolean(enabled && isAuthenticated && locked),
      unlocking,
      unlock,
      lockNow,
      onChatsBlur,
    }),
    [enabled, isAuthenticated, locked, unlocking, unlock, lockNow, onChatsBlur]
  );

  return <ChatLockContext.Provider value={value}>{children}</ChatLockContext.Provider>;
}

export function useChatLock() {
  const ctx = useContext(ChatLockContext);
  if (!ctx) throw new Error('useChatLock must be used within ChatLockProvider');
  return ctx;
}
