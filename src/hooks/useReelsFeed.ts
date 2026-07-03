import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, type ReelDTO } from '../lib/api';
import { useRealtimeTopic } from './useRealtimeTopic';

type FeedSource = 'feed' | 'following' | 'me' | { user: string };

type State = {
  reels: ReelDTO[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  cursor: string | null;
  hasMore: boolean;
  error: string | null;
};

const PAGE_SIZE = 15;

/**
 * Backing source for the vertical reels feed. Handles initial load,
 * pull-to-refresh, infinite scroll, and live updates via the realtime hub.
 *
 * Realtime strategy: when reels / reel_likes / reel_comments change, we
 * incrementally refresh the *first page* (cheap) and merge so the user's
 * scroll position isn't lost. Likes/comments fired from outside still reflect.
 */
export function useReelsFeed(source: FeedSource = 'feed') {
  const [state, setState] = useState<State>({
    reels: [],
    loading: true,
    refreshing: false,
    loadingMore: false,
    cursor: null,
    hasMore: true,
    error: null,
  });

  const reelsRef = useRef<ReelDTO[]>([]);
  reelsRef.current = state.reels;
  const syncingRef = useRef(false);

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      if (source === 'feed') {
        return api.reels.feed({ cursor: cursor ?? undefined, limit: PAGE_SIZE });
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
    // serialise object-form source for stable identity
    [typeof source === 'object' ? source.user : source]
  );

  const loadInitial = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
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
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : (err as Error).message ?? 'Failed to load reels';
      setState((s) => ({ ...s, loading: false, error: message }));
    }
  }, [fetchPage]);

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
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : (err as Error).message ?? 'Failed to refresh';
      setState((s) => ({ ...s, refreshing: false, error: message }));
    }
  }, [fetchPage]);

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

  /** Merge first-page results into existing list, preserving scroll order. */
  const reconcileFirstPage = useCallback(async () => {
    try {
      const { reels: latest } = await fetchPage(null);
      setState((s) => {
        const byId = new Map(s.reels.map((r) => [r.id, r]));
        for (const r of latest) byId.set(r.id, r);
        // Re-order: new items go to the front (latest first), then keep
        // any older items in their existing relative order.
        const latestIds = new Set(latest.map((r) => r.id));
        const tail = s.reels.filter((r) => !latestIds.has(r.id));
        const head = latest.map((r) => byId.get(r.id) as ReelDTO);
        return { ...s, reels: [...head, ...tail] };
      });
    } catch {
      /* silent */
    }
  }, [fetchPage]);

  /**
   * Realtime counts sync for visible reels only (debounced, capped batch size).
   */
  const syncLoadedReels = useCallback(async () => {
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
        reels: s.reels.map((r) => freshById.get(r.id) ?? r),
      }));
    } catch {
      /* ignore */
    } finally {
      syncingRef.current = false;
    }
  }, []);

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
    void loadInitial();
  }, [loadInitial]);

  // New/deleted reels: reconcile ordering with first page.
  useRealtimeTopic('reels', reconcileFirstPage);
  // Likes/comments: sync already-loaded reels in place (no pull-to-refresh needed).
  useRealtimeTopic('reelLikes', scheduleSyncLoadedReels);
  useRealtimeTopic('reelComments', scheduleSyncLoadedReels);

  return {
    ...state,
    refresh,
    loadMore,
    reload: loadInitial,
    applyLocalLikeChange,
    applyLocalCommentChange,
    removeReelLocally,
  };
}
