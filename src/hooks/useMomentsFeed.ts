import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, type MomentAuthorFeedDTO } from '../lib/api';
import {
  awaitExplorePrefetch,
  getMomentsFeedCache,
  upsertMomentsFeedCache,
} from '../lib/momentsFeedPrefetch';
import { dedupeMomentSlides } from '../lib/momentSlides';
import { useRealtimeTopic } from './useRealtimeTopic';
import { useAuth } from './useAuth';

function dedupeAuthors(authors: MomentAuthorFeedDTO[]): MomentAuthorFeedDTO[] {
  const byId = new Map<string, MomentAuthorFeedDTO>();
  for (const entry of authors) {
    const existing = byId.get(entry.author.id);
    if (!existing) {
      byId.set(entry.author.id, {
        ...entry,
        slides: dedupeMomentSlides(entry.slides),
      });
      continue;
    }
    const mergedSlides = [...existing.slides];
    const seenSlideIds = new Set(existing.slides.map((s) => s.id));
    for (const slide of entry.slides) {
      if (seenSlideIds.has(slide.id)) continue;
      seenSlideIds.add(slide.id);
      mergedSlides.push(slide);
    }
    mergedSlides.sort((a, b) => {
      const groupA = a.group_id ?? a.id;
      const groupB = b.group_id ?? b.id;
      if (groupA !== groupB) {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return (a.position ?? 0) - (b.position ?? 0);
    });
    byId.set(entry.author.id, {
      author: entry.author,
      slides: mergedSlides,
      has_unseen: mergedSlides.some((s) => !s.viewed_by_me),
      latest_at: mergedSlides[mergedSlides.length - 1]?.created_at ?? existing.latest_at,
    });
  }
  return Array.from(byId.values());
}

export function useMomentsFeed() {
  const { isAuthenticated } = useAuth();
  const cached = isAuthenticated ? getMomentsFeedCache() : null;
  const [authors, setAuthors] = useState<MomentAuthorFeedDTO[]>(() => cached?.authors ?? []);
  const [loading, setLoading] = useState(() => (isAuthenticated ? cached == null : false));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!isAuthenticated) {
      setAuthors([]);
      setLoading(false);
      setRefreshing(false);
      setError(null);
      return;
    }
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const { authors: data } = await api.moments.feed();
      const next = dedupeAuthors(data);
      setAuthors(next);
      upsertMomentsFeedCache(next);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to load feed';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAuthenticated]);

  const silentRefresh = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const { authors: data } = await api.moments.feed();
      const next = dedupeAuthors(data);
      setAuthors(next);
      upsertMomentsFeedCache(next);
    } catch {
      /* ignore background refresh errors */
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setAuthors([]);
      setLoading(false);
      setRefreshing(false);
      setError(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      await awaitExplorePrefetch();
      if (cancelled) return;

      const entry = getMomentsFeedCache();
      if (entry) {
        setAuthors(dedupeAuthors(entry.authors));
        setLoading(false);
        void silentRefresh();
        return;
      }

      void load();
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, load, silentRefresh]);

  useRealtimeTopic('moments', () => void silentRefresh(), isAuthenticated);
  useRealtimeTopic('momentViews', () => void silentRefresh(), isAuthenticated);

  const refresh = useCallback(() => load(true), [load]);

  const markSlideViewed = useCallback((authorId: string, slideId: string) => {
    setAuthors((prev) =>
      prev.map((a) => {
        if (a.author.id !== authorId) return a;
        const slides = a.slides.map((s) =>
          s.id === slideId ? { ...s, viewed_by_me: true } : s
        );
        return {
          ...a,
          slides,
          has_unseen: slides.some((s) => !s.viewed_by_me),
        };
      })
    );
  }, []);

  const removeSlide = useCallback((authorId: string, slideId: string) => {
    setAuthors((prev) => {
      const next = prev
        .map((a) => {
          if (a.author.id !== authorId) return a;
          const slides = a.slides.filter((s) => s.id !== slideId);
          if (slides.length === 0) return null;
          return {
            ...a,
            slides,
            has_unseen: slides.some((s) => !s.viewed_by_me),
            latest_at: slides[slides.length - 1]?.created_at ?? a.latest_at,
          };
        })
        .filter((a): a is MomentAuthorFeedDTO => a != null);
      upsertMomentsFeedCache(next);
      return next;
    });
  }, []);

  return {
    authors,
    loading,
    refreshing,
    error,
    refresh,
    reload: load,
    markSlideViewed,
    removeSlide,
  };
}
