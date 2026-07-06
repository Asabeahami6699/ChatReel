import { create } from 'zustand';
import { api, ApiError, type ReelDTO } from '../lib/api';
import { generateReelGridThumbnails } from '../lib/generateReelGridThumbnails';

const STALE_MS = 30_000;
const CACHE_TTL_MS = 5 * 60_000;

export type ProfileReelsEntry = {
  posts: ReelDTO[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  fetchedAt: number;
};

const emptyEntry = (): ProfileReelsEntry => ({
  posts: [],
  loading: false,
  refreshing: false,
  error: null,
  fetchedAt: 0,
});

type FetchOpts = { silent?: boolean; pull?: boolean };

type ReelProfileStore = {
  byProfile: Record<string, ProfileReelsEntry>;
  thumbs: Record<string, string>;
  getEntry: (profileId: string) => ProfileReelsEntry;
  ensureLoaded: (profileId: string, limit?: number) => Promise<void>;
  refresh: (profileId: string, limit?: number) => Promise<void>;
  fetchPosts: (profileId: string, limit: number, opts?: FetchOpts) => Promise<void>;
  setPosts: (
    profileId: string,
    posts: ReelDTO[] | ((prev: ReelDTO[]) => ReelDTO[])
  ) => void;
  removeReels: (profileId: string, reelIds: string[]) => void;
  ensureThumbnails: (reels: ReelDTO[]) => void;
  getThumb: (reelId: string) => string | undefined;
};

const inflight = new Map<string, Promise<void>>();
const thumbJobs = new Set<string>();

function cacheKey(profileId: string, limit: number) {
  return `${profileId}:${limit}`;
}

function isFresh(entry: ProfileReelsEntry): boolean {
  if (!entry.fetchedAt) return false;
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

export const useReelProfileStore = create<ReelProfileStore>((set, get) => ({
  byProfile: {},
  thumbs: {},

  getEntry: (profileId) => get().byProfile[profileId] ?? emptyEntry(),

  getThumb: (reelId) => get().thumbs[reelId],

  setPosts: (profileId, posts) => {
    set((state) => {
      const prev = state.byProfile[profileId]?.posts ?? [];
      const nextPosts = typeof posts === 'function' ? posts(prev) : posts;
      return {
        byProfile: {
          ...state.byProfile,
          [profileId]: {
            ...(state.byProfile[profileId] ?? emptyEntry()),
            posts: nextPosts,
          },
        },
      };
    });
  },

  removeReels: (profileId, reelIds) => {
    if (!profileId || reelIds.length === 0) return;
    const idSet = new Set(reelIds);
    set((state) => {
      const entry = state.byProfile[profileId] ?? emptyEntry();
      const nextThumbs = { ...state.thumbs };
      for (const id of reelIds) delete nextThumbs[id];
      return {
        byProfile: {
          ...state.byProfile,
          [profileId]: {
            ...entry,
            posts: entry.posts.filter((r) => !idSet.has(r.id)),
          },
        },
        thumbs: nextThumbs,
      };
    });
  },

  ensureThumbnails: (reels) => {
    const { thumbs } = get();
    const pending = reels.filter((r) => !thumbs[r.id]);
    if (pending.length === 0) return;

    const batch = pending.filter((r) => !thumbJobs.has(r.id));
    if (batch.length === 0) return;
    for (const r of batch) thumbJobs.add(r.id);

    void generateReelGridThumbnails(batch, thumbs, (id, uri) => {
      thumbJobs.delete(id);
      set((state) => ({
        thumbs: state.thumbs[id] === uri ? state.thumbs : { ...state.thumbs, [id]: uri },
      }));
    }).finally(() => {
      for (const r of batch) thumbJobs.delete(r.id);
    });
  },

  fetchPosts: async (profileId, limit, opts = {}) => {
    const silent = opts.silent ?? false;
    const pull = opts.pull ?? false;
    const key = cacheKey(profileId, limit);

    const existing = inflight.get(key);
    if (existing) {
      await existing;
      return;
    }

    const entry = get().byProfile[profileId];
    const hasCache = Boolean(entry?.fetchedAt);

    if (!silent && !pull && !hasCache) {
      set((state) => ({
        byProfile: {
          ...state.byProfile,
          [profileId]: { ...(state.byProfile[profileId] ?? emptyEntry()), loading: true, error: null },
        },
      }));
    }
    if (pull) {
      set((state) => ({
        byProfile: {
          ...state.byProfile,
          [profileId]: { ...(state.byProfile[profileId] ?? emptyEntry()), refreshing: true },
        },
      }));
    }

    const job = (async () => {
      try {
        const res = await api.reels.byUser(profileId, limit);
        set((state) => ({
          byProfile: {
            ...state.byProfile,
            [profileId]: {
              posts: res.reels,
              loading: false,
              refreshing: false,
              error: null,
              fetchedAt: Date.now(),
            },
          },
        }));
        get().ensureThumbnails(res.reels);
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Failed to load reels';
        set((state) => ({
          byProfile: {
            ...state.byProfile,
            [profileId]: {
              ...(state.byProfile[profileId] ?? emptyEntry()),
              loading: false,
              refreshing: false,
              error: message,
            },
          },
        }));
      }
    })();

    inflight.set(key, job);
    try {
      await job;
    } finally {
      inflight.delete(key);
    }
  },

  ensureLoaded: async (profileId, limit = 48) => {
    const entry = get().byProfile[profileId] ?? emptyEntry();
    const hasCache = entry.fetchedAt > 0;

    if (hasCache && entry.posts.length > 0) {
      get().ensureThumbnails(entry.posts);
      const stale = Date.now() - entry.fetchedAt > STALE_MS;
      if (stale) {
        void get().fetchPosts(profileId, limit, { silent: true });
      }
      return;
    }

    if (hasCache && entry.posts.length === 0 && isFresh(entry)) {
      return;
    }

    await get().fetchPosts(profileId, limit);
  },

  refresh: async (profileId, limit = 48) => {
    await get().fetchPosts(profileId, limit, { pull: true });
  },
}));
