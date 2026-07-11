import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, type ReelInboxItemDTO } from './api';
import { sessionStorage } from './sessionStorage';

const CACHE_TTL_MS = 2 * 60 * 1000;
const LAST_READ_KEY = '@chatapp_reel_inbox_last_read';

type InboxCache = {
  items: ReelInboxItemDTO[];
  fetchedAt: number;
};

let cache: InboxCache | null = null;
let prefetchPromise: Promise<ReelInboxItemDTO[]> | null = null;
let lastReadAt: string | null = null;
let lastReadLoaded = false;

const listeners = new Set<() => void>();

function notifyInboxListeners() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

/** Subscribe to inbox cache / unread changes (for tab badge). */
export function subscribeReelInbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function loadLastReadAt(): Promise<string | null> {
  if (lastReadLoaded) return lastReadAt;
  try {
    lastReadAt = await AsyncStorage.getItem(LAST_READ_KEY);
  } catch {
    lastReadAt = null;
  }
  lastReadLoaded = true;
  return lastReadAt;
}

async function persistLastReadAt(iso: string): Promise<void> {
  lastReadAt = iso;
  lastReadLoaded = true;
  try {
    await AsyncStorage.setItem(LAST_READ_KEY, iso);
  } catch {
    /* ignore */
  }
}

export function getCachedReelInbox(): ReelInboxItemDTO[] | null {
  if (!cache) return null;
  if (Date.now() - cache.fetchedAt > CACHE_TTL_MS) return null;
  return cache.items;
}

export function getReelInboxUnreadCount(): number {
  const items = cache?.items ?? [];
  if (!items.length) return 0;
  const readAt = lastReadAt ? new Date(lastReadAt).getTime() : 0;
  if (!readAt) return Math.min(items.length, 99);
  return Math.min(
    items.filter((i) => new Date(i.created_at).getTime() > readAt).length,
    99
  );
}

export function setReelInboxCache(items: ReelInboxItemDTO[]): void {
  cache = { items, fetchedAt: Date.now() };
  notifyInboxListeners();
}

/** Mark inbox as read (clears floating badge). */
export async function markReelInboxRead(): Promise<void> {
  await persistLastReadAt(new Date().toISOString());
  notifyInboxListeners();
}

export function scheduleReelInboxPrefetch(delayMs = 0): Promise<ReelInboxItemDTO[]> {
  const hit = getCachedReelInbox();
  if (hit) return Promise.resolve(hit);
  if (prefetchPromise) return prefetchPromise;

  prefetchPromise = new Promise<ReelInboxItemDTO[]>((resolve) => {
    const run = () => {
      void (async () => {
        try {
          await loadLastReadAt();
          const session = await sessionStorage.load();
          if (!session?.access_token) {
            resolve([]);
            return;
          }
          const { items } = await api.reels.inbox();
          setReelInboxCache(items);
          resolve(items);
        } catch {
          resolve(cache?.items ?? []);
        } finally {
          prefetchPromise = null;
        }
      })();
    };

    if (delayMs > 0) setTimeout(run, delayMs);
    else if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => run(), { timeout: 2500 });
    } else {
      setTimeout(run, 0);
    }
  });

  return prefetchPromise;
}

/** Always hit the network and update cache (used by realtime). */
export function refreshReelInbox(): Promise<ReelInboxItemDTO[]> {
  if (prefetchPromise) {
    // Allow a parallel refresh by clearing the in-flight guard after.
  }
  return new Promise<ReelInboxItemDTO[]>((resolve) => {
    void (async () => {
      try {
        await loadLastReadAt();
        const session = await sessionStorage.load();
        if (!session?.access_token) {
          resolve(cache?.items ?? []);
          return;
        }
        const { items } = await api.reels.inbox();
        setReelInboxCache(items);
        resolve(items);
      } catch {
        resolve(cache?.items ?? []);
      }
    })();
  });
}

export async function loadReelInbox(opts?: { force?: boolean }): Promise<ReelInboxItemDTO[]> {
  await loadLastReadAt();
  if (opts?.force) return refreshReelInbox();
  const hit = getCachedReelInbox();
  if (hit) {
    void scheduleReelInboxPrefetch(0);
    return hit;
  }
  return scheduleReelInboxPrefetch(0);
}
