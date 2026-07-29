/** Profile cache so Settings / Profile open with data already filled. */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

const STORAGE_KEY = '@profile_cache_v1';

export type CachedProfile = {
  display_name?: string;
  email?: string;
  avatar_url?: string;
  bio?: string;
  country?: string;
  region?: string;
  language?: string;
  status?: string;
  fetchedAt: number;
};

let cache: CachedProfile | null = null;
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
let prefetchPromise: Promise<CachedProfile | null> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore subscriber errors
    }
  });
}

function persist(next: CachedProfile | null) {
  void (async () => {
    try {
      if (!next) await AsyncStorage.removeItem(STORAGE_KEY);
      else await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* best-effort */
    }
  })();
}

/** Load disk cache into memory (once). Call early so Settings never flashes placeholders. */
export function hydrateProfileCache(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw && !cache) {
        const parsed = JSON.parse(raw) as CachedProfile;
        if (parsed && typeof parsed === 'object') {
          cache = parsed;
          notify();
        }
      }
    } catch {
      /* ignore */
    } finally {
      hydrated = true;
    }
  })();
  return hydratePromise;
}

export function getCachedProfile(): CachedProfile | null {
  return cache;
}

export function setCachedProfile(
  profile: Omit<CachedProfile, 'fetchedAt'> | null
): void {
  cache = profile ? { ...profile, fetchedAt: Date.now() } : null;
  persist(cache);
  notify();
}

export function patchCachedProfile(
  patch: Partial<Omit<CachedProfile, 'fetchedAt'>>
): void {
  if (!cache) {
    setCachedProfile(patch);
    return;
  }
  setCachedProfile({ ...cache, ...patch });
}

export function subscribeCachedProfile(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Network refresh; coalesces concurrent calls. */
export async function prefetchMyProfile(
  fallbackEmail?: string | null
): Promise<CachedProfile | null> {
  await hydrateProfileCache();
  if (prefetchPromise) return prefetchPromise;
  prefetchPromise = (async () => {
    try {
      const { profile: me } = await api.profiles.me();
      if (!me) return cache;
      const next = {
        display_name: (me.display_name as string) || undefined,
        email: (me.email as string) || fallbackEmail || undefined,
        avatar_url: (me.avatar_url as string) || undefined,
        bio: (me.bio as string) || undefined,
        country: (me.country as string) || undefined,
        region: (me.region as string) || undefined,
        language: (me.language as string) || undefined,
        status: me.status === 'Online' ? 'Online' : 'Offline',
      };
      setCachedProfile(next);
      return getCachedProfile();
    } catch {
      return cache;
    } finally {
      prefetchPromise = null;
    }
  })();
  return prefetchPromise;
}

void hydrateProfileCache();
