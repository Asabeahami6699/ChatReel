/**
 * Prefetch Add Friend suggestions + friendship statuses so the screen opens live.
 */
import { api } from './api';
import { sessionStorage } from './sessionStorage';

export type AddFriendProfile = {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  avatar_url?: string;
  region?: string;
  country?: string;
  mutual_friends_count?: number;
  reason?: string;
};

export type AddFriendFriendship = {
  id: string;
  user_id: string;
  friend_id: string;
  status: 'pending' | 'accepted' | 'blocked';
};

export type SuggestionType = 'mutual_friends' | 'location' | 'new_users';

export type SuggestionSection = {
  type: SuggestionType;
  data: AddFriendProfile[];
  title: string;
};

export type AddFriendPrefetchCache = {
  suggestions: SuggestionSection[];
  friendships: AddFriendFriendship[];
  fetchedAt: number;
};

let cache: AddFriendPrefetchCache | null = null;
let prefetchPromise: Promise<AddFriendPrefetchCache | null> | null = null;
let prefetchTimer: ReturnType<typeof setTimeout> | null = null;

const MEMORY_TTL_MS = 5 * 60_000;

function asProfiles(rows: Record<string, unknown>[] | undefined): AddFriendProfile[] {
  return ((rows ?? []) as AddFriendProfile[]).filter((p) => p?.id);
}

function buildSections(payload: {
  mutual?: Record<string, unknown>[];
  location?: Record<string, unknown>[];
  new_users?: Record<string, unknown>[];
}): SuggestionSection[] {
  return [
    {
      type: 'mutual_friends' as const,
      data: asProfiles(payload.mutual),
      title: 'People you may know',
    },
    {
      type: 'location' as const,
      data: asProfiles(payload.location),
      title: 'Near you',
    },
    {
      type: 'new_users' as const,
      data: asProfiles(payload.new_users),
      title: 'New on ChatReel',
    },
  ].filter((s) => s.data.length > 0);
}

export function getAddFriendPrefetchCache(opts?: {
  allowStale?: boolean;
}): AddFriendPrefetchCache | null {
  if (!cache) return null;
  const age = Date.now() - cache.fetchedAt;
  if (age <= MEMORY_TTL_MS) return cache;
  return opts?.allowStale ? cache : null;
}

export function upsertAddFriendFriendships(friendships: AddFriendFriendship[]) {
  if (!cache) {
    cache = { suggestions: [], friendships, fetchedAt: Date.now() };
    return;
  }
  cache = { ...cache, friendships, fetchedAt: Date.now() };
}

export function clearAddFriendPrefetchCache() {
  cache = null;
  prefetchPromise = null;
  if (prefetchTimer) {
    clearTimeout(prefetchTimer);
    prefetchTimer = null;
  }
}

export async function refreshAddFriendPrefetch(): Promise<AddFriendPrefetchCache | null> {
  const session = await sessionStorage.load();
  if (!session?.access_token) return cache;

  const [suggestionsRes, friendshipsRes] = await Promise.all([
    api.profiles.suggestions(),
    api.friendships.list().catch(() => ({ friendships: [] as Record<string, unknown>[] })),
  ]);

  const next: AddFriendPrefetchCache = {
    suggestions: buildSections(suggestionsRes),
    friendships: (friendshipsRes.friendships ?? []) as AddFriendFriendship[],
    fetchedAt: Date.now(),
  };
  cache = next;
  return next;
}

export function prefetchAddFriend(): Promise<AddFriendPrefetchCache | null> {
  if (prefetchPromise) return prefetchPromise;
  prefetchPromise = refreshAddFriendPrefetch()
    .catch(() => cache)
    .finally(() => {
      prefetchPromise = null;
    });
  return prefetchPromise;
}

export function scheduleAddFriendPrefetch(delayMs = 0): void {
  if (prefetchTimer) clearTimeout(prefetchTimer);
  prefetchTimer = setTimeout(() => {
    prefetchTimer = null;
    void prefetchAddFriend();
  }, delayMs);
}
