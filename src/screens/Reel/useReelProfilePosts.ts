import { useCallback, useEffect, useRef } from 'react';
import { useReelProfileStore } from '../../stores/reelProfileStore';
import { useRealtimeTopic } from '../../hooks/useRealtimeTopic';
import type { ReelDTO } from '../../lib/api';
import { prefetchProfileFeed } from './reelProfilePrefetch';

const emptyEntry = {
  posts: [] as ReelDTO[],
  loading: false,
  refreshing: false,
  error: null as string | null,
  fetchedAt: 0,
};

export function useReelProfilePosts(profileId: string | undefined, limit = 48) {
  const entry = useReelProfileStore((s) =>
    profileId ? (s.byProfile[profileId] ?? emptyEntry) : emptyEntry
  );
  const thumbs = useReelProfileStore((s) => s.thumbs);
  const ensureLoaded = useReelProfileStore((s) => s.ensureLoaded);
  const refreshStore = useReelProfileStore((s) => s.refresh);
  const setPostsStore = useReelProfileStore((s) => s.setPosts);
  const fetchPosts = useReelProfileStore((s) => s.fetchPosts);

  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!profileId) return;
    void ensureLoaded(profileId, limit);
  }, [profileId, limit, ensureLoaded]);

  // While the grid is on screen, warm the top of the feed like TikTok.
  useEffect(() => {
    if (!entry.posts.length || entry.loading) return;
    prefetchProfileFeed(entry.posts, 0);
  }, [entry.posts, entry.loading]);

  useEffect(() => {
    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    };
  }, []);

  useRealtimeTopic(
    'reels',
    useCallback(() => {
      if (!profileId) return;
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = setTimeout(() => {
        void fetchPosts(profileId, limit, { silent: true });
      }, 600);
    }, [profileId, limit, fetchPosts]),
    Boolean(profileId)
  );

  const setPosts = useCallback(
    (posts: ReelDTO[] | ((prev: ReelDTO[]) => ReelDTO[])) => {
      if (!profileId) return;
      setPostsStore(profileId, posts);
    },
    [profileId, setPostsStore]
  );

  const refresh = useCallback(() => {
    if (!profileId) return Promise.resolve();
    return refreshStore(profileId, limit);
  }, [profileId, limit, refreshStore]);

  const setError = useCallback(
    (error: string | null) => {
      if (!profileId) return;
      useReelProfileStore.setState((state) => ({
        byProfile: {
          ...state.byProfile,
          [profileId]: {
            ...(state.byProfile[profileId] ?? emptyEntry),
            error,
          },
        },
      }));
    },
    [profileId]
  );

  return {
    posts: entry.posts,
    setPosts,
    loading: entry.loading,
    refreshing: entry.refreshing,
    error: entry.error,
    setError,
    refresh,
    thumbs,
    reload: () => (profileId ? fetchPosts(profileId, limit) : Promise.resolve()),
  };
}
