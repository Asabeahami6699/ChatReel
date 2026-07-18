import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { ApiError, api, type ReelDTO } from '../lib/api';
import {
  getReelsFeedCache,
  upsertReelsFeedCache,
  type ReelsFeedCacheKey,
} from '../lib/reelsFeedPrefetch';
import { useRealtimeTopic } from './useRealtimeTopic';

type FeedSource = 'feed' | 'public' | 'following' | 'me' | { user: string };

type UseReelsFeedOptions = {
  /** When true, soft-poll for newly approved reels (realtime is unreliable on web). */
  active?: boolean;
  /** Insert new reels after this index so the active video does not jump. */
  insertAfterIndexRef?: MutableRefObject<number>;
};

type State = {
  reels: ReelDTO[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  cursor: string | null;
  hasMore: boolean;
  error: string | null;
};

// Load enough reels up front so the user isn't blocked waiting for the next page.
// Backend caps at 30; keep request aligned so pagination cursors stay consistent.
const PAGE_SIZE = 30;
/** Soft poll so approved posts appear without hard refresh when realtime is down. */
const FEED_POLL_MS = 8_000;

function cacheKeyForSource(source: FeedSource): ReelsFeedCacheKey | null {
  if (source === 'feed') return 'feed';
  if (source === 'public') return 'public';
  if (source === 'following') return 'following';
  return null;
}

function initialStateForSource(source: FeedSource): State {
  const key = cacheKeyForSource(source);
  const cached = key ? getReelsFeedCache(key) : null;
  if (cached && cached.reels.length > 0) {
    return {
      reels: cached.reels,
      loading: false,
      refreshing: false,
      loadingMore: false,
      cursor: cached.next_cursor,
      hasMore: Boolean(cached.next_cursor),
      error: null,
    };
  }
  return {
    reels: [],
    loading: true,
    refreshing: false,
    loadingMore: false,
    cursor: null,
    hasMore: true,
    error: null,
  };
}

/**
 * Backing source for the vertical reels feed. Handles initial load,
 * pull-to-refresh, infinite scroll, and live updates via the realtime hub.
 *
 * Live strategy: soft-inject newly approved reels (poll + realtime) without
 * reshuffling the current playlist, so viewers don't need a hard refresh.
 */
export function useReelsFeed(source: FeedSource = 'feed', options: UseReelsFeedOptions = {}) {
  const { active = true, insertAfterIndexRef } = options;
  const sourceKey = typeof source === 'object' ? source.user : source;
  const [state, setState] = useState<State>(() => initialStateForSource(source));

  const reelsRef = useRef<ReelDTO[]>([]);
  reelsRef.current = state.reels;
  const syncingRef = useRef(false);
  const softSyncingRef = useRef(false);
  const insertAfterRef = insertAfterIndexRef;

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      if (source === 'feed') {
        return api.reels.feed({ cursor: cursor ?? undefined, limit: PAGE_SIZE });
      }
      if (source === 'public') {
        return api.reels.publicFeed({ cursor: cursor ?? undefined, limit: PAGE_SIZE });
      }
      if (source === 'following') {
        return api.reels.followingFeed({ cursor: cursor ?? undefined, limit: PAGE_SIZE });
      }
      if (source === 'me') {
        const { reels } = await api.reels.me(PAGE_SIZE);
        return { reels, next_cursor: null };
      }
      const { reels } = await api.reels.byUser(source.user, PAGE_SIZE);
      return { reels, next_cursor: null };
    },
    [sourceKey]
  );

  const loadInitial = useCallback(async () => {
    setState((s) => {
      if (s.reels.length > 0) return s;
      return { ...s, loading: true, error: null };
    });
    try {
      const { reels, next_cursor } = await fetchPage(null);
      setState({
        reels,
        loading: false,
        refreshing: false,
        loadingMore: false,
        cursor: next_cursor,
        hasMore: Boolean(next_cursor),
        error: null,
      });
      const key = cacheKeyForSource(source);
      if (key && reels.length > 0) {
        upsertReelsFeedCache(key, reels, next_cursor ?? null);
      }
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : (err as Error).message ?? 'Failed to load reels';
      setState((s) => ({
        ...s,
        loading: false,
        error: s.reels.length > 0 ? s.error : message,
      }));
    }
  }, [fetchPage, source]);

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, refreshing: true, error: null }));
    try {
      const { reels, next_cursor } = await fetchPage(null);
      setState({
        reels,
        loading: false,
        refreshing: false,
        loadingMore: false,
        cursor: next_cursor,
        hasMore: Boolean(next_cursor),
        error: null,
      });
      const key = cacheKeyForSource(source);
      if (key && reels.length > 0) {
        upsertReelsFeedCache(key, reels, next_cursor ?? null);
      }
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : (err as Error).message ?? 'Failed to refresh';
      setState((s) => ({ ...s, refreshing: false, error: message }));
    }
  }, [fetchPage, source]);

  const loadMore = useCallback(async () => {
    setState((current) => {
      if (current.loadingMore || !current.hasMore || !current.cursor) return current;
      return { ...current, loadingMore: true };
    });

    const cur = reelsRef.current;
    const lastCursor = state.cursor;
    if (!lastCursor) return;

    try {
      const { reels, next_cursor } = await fetchPage(lastCursor);
      setState((s) => {
        const seen = new Set(s.reels.map((r) => r.id));
        const merged = [...s.reels, ...reels.filter((r) => !seen.has(r.id))];
        return {
          ...s,
          reels: merged,
          loadingMore: false,
          cursor: next_cursor,
          hasMore: Boolean(next_cursor),
        };
      });
    } catch {
      setState((s) => ({ ...s, loadingMore: false }));
    }
    // intentional dependency: state.cursor is read for snapshot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPage, state.cursor]);

  /**
   * Soft live update: prepend only *new* approved reels and patch counts.
   * Does not reshuffle the playlist (avoids jumpiness with random ranking).
   */
  const softInjectNewReels = useCallback(async () => {
    if (softSyncingRef.current) return;
    softSyncingRef.current = true;
    try {
      const { reels: latest } = await fetchPage(null);
      setState((s) => {
        if (s.reels.length === 0) {
          const key = cacheKeyForSource(source);
          if (key && latest.length > 0) {
            upsertReelsFeedCache(key, latest, s.cursor);
          }
          return { ...s, reels: latest, loading: false, error: null };
        }

        const byId = new Map(s.reels.map((r) => [r.id, r]));
        const newcomers = latest.filter((r) => !byId.has(r.id));
        let changed = newcomers.length > 0;

        const patched = s.reels.map((r) => {
          const fresh = latest.find((x) => x.id === r.id);
          if (!fresh) return r;
          if (
            r.like_count === fresh.like_count &&
            r.comment_count === fresh.comment_count &&
            r.view_count === fresh.view_count &&
            r.liked_by_me === fresh.liked_by_me &&
            r.moderation_status === fresh.moderation_status &&
            r.caption === fresh.caption
          ) {
            return r;
          }
          changed = true;
          return { ...r, ...fresh };
        });

        if (!changed) return s;

        // Insert after the reel currently on screen so playback index stays valid.
        const after = Math.max(
          0,
          Math.min(insertAfterRef?.current ?? 0, Math.max(0, patched.length - 1))
        );
        const nextReels =
          newcomers.length > 0
            ? [
                ...patched.slice(0, after + 1),
                ...newcomers,
                ...patched.slice(after + 1),
              ].filter((r, idx, arr) => arr.findIndex((x) => x.id === r.id) === idx)
            : patched;

        const key = cacheKeyForSource(source);
        if (key) {
          upsertReelsFeedCache(key, nextReels, s.cursor);
        }
        return { ...s, reels: nextReels };
      });
    } catch {
      /* silent — next poll / focus will retry */
    } finally {
      softSyncingRef.current = false;
    }
  }, [fetchPage, source, insertAfterRef]);

  /**
   * Realtime counts sync for visible reels only (debounced, capped batch size).
   */
  const syncLoadedReels = useCallback(async () => {
    if (source === 'public') return;
    if (syncingRef.current) return;
    const current = reelsRef.current;
    if (current.length === 0) return;
    syncingRef.current = true;
    try {
      const ids = current.slice(0, 8).map((r) => r.id);
      const settled = await Promise.allSettled(ids.map((id) => api.reels.get(id)));
      const freshById = new Map<string, ReelDTO>();
      for (const r of settled) {
        if (r.status === 'fulfilled' && r.value?.reel) {
          freshById.set(r.value.reel.id, r.value.reel);
        }
      }
      if (freshById.size === 0) return;
      setState((s) => ({
        ...s,
        reels: s.reels.map((r) => {
          const fresh = freshById.get(r.id);
          if (!fresh) return r;
          if (
            r.like_count === fresh.like_count &&
            r.comment_count === fresh.comment_count &&
            r.view_count === fresh.view_count &&
            r.liked_by_me === fresh.liked_by_me
          ) {
            return r;
          }
          return { ...r, ...fresh };
        }),
      }));
    } catch {
      /* ignore */
    } finally {
      syncingRef.current = false;
    }
  }, [sourceKey]);

  const debouncedSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSyncLoadedReels = useCallback(() => {
    if (debouncedSyncRef.current) clearTimeout(debouncedSyncRef.current);
    debouncedSyncRef.current = setTimeout(() => {
      debouncedSyncRef.current = null;
      void syncLoadedReels();
    }, 2000);
  }, [syncLoadedReels]);

  // Local optimistic helpers (used by ReelsScreen to update like state instantly)
  const applyLocalLikeChange = useCallback((reelId: string, liked: boolean) => {
    setState((s) => ({
      ...s,
      reels: s.reels.map((r) =>
        r.id === reelId
          ? {
              ...r,
              liked_by_me: liked,
              like_count: Math.max(0, r.like_count + (liked ? 1 : -1)),
            }
          : r
      ),
    }));
  }, []);

  const applyLocalCommentChange = useCallback((reelId: string, delta: number) => {
    setState((s) => ({
      ...s,
      reels: s.reels.map((r) =>
        r.id === reelId
          ? { ...r, comment_count: Math.max(0, r.comment_count + delta) }
          : r
      ),
    }));
  }, []);

  const removeReelLocally = useCallback((reelId: string) => {
    setState((s) => ({ ...s, reels: s.reels.filter((r) => r.id !== reelId) }));
  }, []);

  useEffect(() => {
    const next = initialStateForSource(source);
    reelsRef.current = next.reels;
    setState(next);
    void loadInitial();
  }, [sourceKey, loadInitial, source]);

  // Realtime when available; soft poll covers CHANNEL_ERROR / web gaps.
  useRealtimeTopic('reels', () => void softInjectNewReels(), active);
  useRealtimeTopic('reelLikes', scheduleSyncLoadedReels, active);
  useRealtimeTopic('reelComments', scheduleSyncLoadedReels, active);

  useEffect(() => {
    if (!active) return;
    if (source !== 'feed' && source !== 'following' && source !== 'public') return;

    void softInjectNewReels();

    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (interval) return;
      interval = setInterval(() => {
        void softInjectNewReels();
      }, FEED_POLL_MS);
    };
    const stop = () => {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    };

    const onAppState = (next: AppStateStatus) => {
      if (next === 'active') {
        void softInjectNewReels();
        start();
      } else {
        stop();
      }
    };

    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', onAppState);
    return () => {
      stop();
      sub.remove();
    };
  }, [active, softInjectNewReels, source]);

  return {
    ...state,
    refresh,
    loadMore,
    reload: loadInitial,
    softInjectNewReels,
    applyLocalLikeChange,
    applyLocalCommentChange,
    removeReelLocally,
  };
}
