import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from '../hooks/useAuth';
import { useChatSettings } from './ChatSettingsContext';
import { authenticateAppUnlock } from '../lib/appLock';
import {
  chatListKey,
  type ChatListEntryKind,
} from '../lib/chatListHidden';

export type ChatLockScope = 'all' | 'selected';

type ChatLockContextValue = {
  /** True when the full Chats-tab gate should cover list + rooms (scope = all). */
  locked: boolean;
  unlocking: boolean;
  scope: ChatLockScope;
  lockedKeys: string[];
  /** Unlock the all-chats gate for this Chats-tab visit. */
  unlock: (pin?: string) => Promise<boolean>;
  /** Unlock one chat (selected scope) for this Chats-tab visit. */
  unlockChat: (kind: ChatListEntryKind, id: string, pin?: string) => Promise<boolean>;
  /** Whether this conversation needs a PIN before content is shown. */
  requiresRoomUnlock: (kind: ChatListEntryKind, id: string) => boolean;
  /** Whether this chat is in the locked set (or all-chats mode). */
  isChatProtected: (kind: ChatListEntryKind, id: string) => boolean;
  lockNow: () => void;
  /** Leaving the Chats tab re-locks (chat-scoped — not app background). */
  onChatsBlur: () => void;
};

const ChatLockContext = createContext<ChatLockContextValue | null>(null);

/**
 * Locks conversations only — never the whole app on background/return.
 * That duty belongs to App Lock.
 *
 * - scope `all`: gate covers the Chats tab until unlocked; re-locks when leaving Chats.
 * - scope `selected`: only listed chats need unlock when opened.
 */
export function ChatLockProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { settings, ready: settingsReady } = useChatSettings();
  const enabled = settings.chatLockEnabled;
  const scope: ChatLockScope = settings.chatLockScope === 'selected' ? 'selected' : 'all';
  const lockedKeys = settings.chatLockedKeys ?? [];

  const [gateLocked, setGateLocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [sessionUnlocked, setSessionUnlocked] = useState<Set<string>>(() => new Set());
  const bootstrappedRef = useRef(false);
  const lockedKeysRef = useRef(lockedKeys);
  lockedKeysRef.current = lockedKeys;

  useEffect(() => {
    if (!settingsReady || authLoading) return;

    if (!bootstrappedRef.current) {
      bootstrappedRef.current = true;
      if (enabled && isAuthenticated && scope === 'all') {
        setGateLocked(true);
      }
      return;
    }

    if (!enabled || !isAuthenticated) {
      setGateLocked(false);
      setSessionUnlocked(new Set());
      return;
    }

    if (scope === 'all') {
      setGateLocked(true);
      setSessionUnlocked(new Set());
    } else {
      setGateLocked(false);
    }
  }, [settingsReady, authLoading, enabled, isAuthenticated, scope]);

  const unlock = useCallback(
    async (pin?: string) => {
      if (!enabled || scope !== 'all') return true;
      if (!gateLocked) return true;
      if (unlocking) return false;
      setUnlocking(true);
      try {
        const result = await authenticateAppUnlock('Unlock Chats', pin);
        if (result.success) {
          setGateLocked(false);
          return true;
        }
        return false;
      } finally {
        setUnlocking(false);
      }
    },
    [enabled, scope, gateLocked, unlocking]
  );

  const unlockChat = useCallback(
    async (kind: ChatListEntryKind, id: string, pin?: string) => {
      if (!enabled) return true;
      const key = chatListKey(kind, id);
      if (sessionUnlocked.has(key)) return true;
      if (unlocking) return false;
      setUnlocking(true);
      try {
        const result = await authenticateAppUnlock('Unlock chat', pin);
        if (result.success) {
          setSessionUnlocked((prev) => {
            const next = new Set(prev);
            next.add(key);
            return next;
          });
          return true;
        }
        return false;
      } finally {
        setUnlocking(false);
      }
    },
    [enabled, sessionUnlocked, unlocking]
  );

  const requiresRoomUnlock = useCallback(
    (kind: ChatListEntryKind, id: string) => {
      if (!enabled || !isAuthenticated) return false;
      if (scope !== 'selected') return false;
      const key = chatListKey(kind, id);
      if (!lockedKeysRef.current.includes(key)) return false;
      return !sessionUnlocked.has(key);
    },
    [enabled, isAuthenticated, scope, sessionUnlocked]
  );

  const isChatProtected = useCallback(
    (kind: ChatListEntryKind, id: string) => {
      if (!enabled || !isAuthenticated) return false;
      if (scope === 'all') return true;
      return lockedKeys.includes(chatListKey(kind, id));
    },
    [enabled, isAuthenticated, scope, lockedKeys]
  );

  const lockNow = useCallback(() => {
    if (!enabled || !isAuthenticated) return;
    if (scope === 'all') setGateLocked(true);
    setSessionUnlocked(new Set());
  }, [enabled, isAuthenticated, scope]);

  const onChatsBlur = useCallback(() => {
    if (!enabled || !isAuthenticated) return;
    // Re-lock chats when leaving the Chats tab — not when backgrounding the app.
    if (scope === 'all') setGateLocked(true);
    setSessionUnlocked(new Set());
  }, [enabled, isAuthenticated, scope]);

  const value = useMemo(
    () => ({
      locked: Boolean(enabled && isAuthenticated && scope === 'all' && gateLocked),
      unlocking,
      scope,
      lockedKeys,
      unlock,
      unlockChat,
      requiresRoomUnlock,
      isChatProtected,
      lockNow,
      onChatsBlur,
    }),
    [
      enabled,
      isAuthenticated,
      scope,
      gateLocked,
      unlocking,
      lockedKeys,
      unlock,
      unlockChat,
      requiresRoomUnlock,
      isChatProtected,
      lockNow,
      onChatsBlur,
    ]
  );

  return <ChatLockContext.Provider value={value}>{children}</ChatLockContext.Provider>;
}

export function useChatLock() {
  const ctx = useContext(ChatLockContext);
  if (!ctx) throw new Error('useChatLock must be used within ChatLockProvider');
  return ctx;
}
