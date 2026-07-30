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

type AppLockContextValue = {
  /** True when the privacy gate should cover the app. */
  locked: boolean;
  /** Biometric / passcode prompt in progress. */
  unlocking: boolean;
  /** Attempt unlock (shows system prompt). */
  unlock: () => Promise<boolean>;
  /** Force lock immediately. */
  lockNow: () => void;
};

const AppLockContext = createContext<AppLockContextValue | null>(null);

/**
 * Locks the authenticated app when returning from background if App Lock is on.
 * Web is a no-op (setting stays local but does not gate).
 */
export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { settings, ready: settingsReady } = useChatSettings();
  const enabled = settings.appLockBiometric && Platform.OS !== 'web';

  const [locked, setLocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const bootstrappedRef = useRef(false);
  const autoPromptedRef = useRef(false);

  // Bootstrap once: if lock was already on, require unlock at launch.
  // Enabling mid-session stays unlocked until the next background.
  useEffect(() => {
    if (!settingsReady || authLoading) return;

    if (!bootstrappedRef.current) {
      bootstrappedRef.current = true;
      if (enabled && isAuthenticated) {
        setLocked(true);
        autoPromptedRef.current = false;
      }
      return;
    }

    if (!enabled || !isAuthenticated) {
      setLocked(false);
    }
  }, [settingsReady, authLoading, enabled, isAuthenticated]);

  // Relock when the app goes to background.
  useEffect(() => {
    if (!enabled || !isAuthenticated) return;

    const onChange = (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      if (next === 'background') {
        setLocked(true);
        autoPromptedRef.current = false;
        return;
      }

      if (prev === 'background' && next === 'active') {
        setLocked((was) => {
          if (!was) autoPromptedRef.current = false;
          return true;
        });
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
      const result = await authenticateAppUnlock('Unlock ChatReel');
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
    autoPromptedRef.current = false;
  }, [enabled, isAuthenticated]);

  // Auto-prompt once when the lock screen appears while app is active.
  useEffect(() => {
    if (!locked || !enabled || !isAuthenticated) return;
    if (autoPromptedRef.current) return;
    if (AppState.currentState !== 'active') return;
    autoPromptedRef.current = true;
    const t = setTimeout(() => {
      void unlock();
    }, 350);
    return () => clearTimeout(t);
    // intentionally omit unlock — prompt once per lock session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, enabled, isAuthenticated]);

  const value = useMemo(
    () => ({
      locked: Boolean(enabled && isAuthenticated && locked),
      unlocking,
      unlock,
      lockNow,
    }),
    [enabled, isAuthenticated, locked, unlocking, unlock, lockNow]
  );

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock() {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error('useAppLock must be used within AppLockProvider');
  return ctx;
}
