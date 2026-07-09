import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, type MomentAuthorFeedDTO } from '../lib/api';
import {
  awaitExplorePrefetch,
  getMomentsFeedCache,
  upsertMomentsFeedCache,
} from '../lib/momentsFeedPrefetch';
import { dedupeMomentSlides } from '../lib/momentSlides';
import { useRealtimeTopic } from './useRealtimeTopic';

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
  const cached = getMomentsFeedCache();
  const [authors, setAuthors] = useState<MomentAuthorFeedDTO[]>(() => cached?.authors ?? []);
  const [loading, setLoading] = useState(() => cached == null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
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
  }, []);

  const silentRefresh = useCallback(async () => {
    try {
      const { authors: data } = await api.moments.feed();
      const next = dedupeAuthors(data);
      setAuthors(next);
      upsertMomentsFeedCache(next);
    } catch {
      /* ignore background refresh errors */
    }
  }, []);

  useEffect(() => {
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
  }, [load, silentRefresh]);

  useRealtimeTopic('moments', () => void silentRefresh());
  useRealtimeTopic('momentViews', () => void silentRefresh());

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

  return { authors, loading, refreshing, error, refresh, reload: load, markSlideViewed };
}
