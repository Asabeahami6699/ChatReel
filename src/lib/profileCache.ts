/** In-memory profile cache so Settings → Profile opens with data already filled. */

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
const listeners = new Set<() => void>();

export function getCachedProfile(): CachedProfile | null {
  return cache;
}

export function setCachedProfile(
  profile: Omit<CachedProfile, 'fetchedAt'> | null
): void {
  cache = profile
    ? { ...profile, fetchedAt: Date.now() }
    : null;
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore subscriber errors
    }
  });
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
