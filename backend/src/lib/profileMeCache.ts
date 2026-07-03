const CACHE_TTL_MS = 15_000;

type CacheEntry = { profile: unknown; expiresAt: number };

const profileMeCache = new Map<string, CacheEntry>();

export function getCachedProfileMe(authUserId: string): unknown | null {
  const entry = profileMeCache.get(authUserId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    profileMeCache.delete(authUserId);
    return null;
  }
  return entry.profile;
}

export function setCachedProfileMe(authUserId: string, profile: unknown): void {
  profileMeCache.set(authUserId, {
    profile,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

export function invalidateProfileMe(authUserId: string): void {
  profileMeCache.delete(authUserId);
}
