import { useCallback, useEffect } from 'react';
import { useReelCommentsStore } from '../stores/reelCommentsStore';
import { useRealtimeTopic } from './useRealtimeTopic';

export function useReelComments(reelId: string | null) {
  const slice = useReelCommentsStore((s) =>
    reelId ? (s.reels[reelId] ?? null) : null
  );

  const load = useReelCommentsStore((s) => s.load);
  const loadMore = useReelCommentsStore((s) => s.loadMore);
  const postComment = useReelCommentsStore((s) => s.post);
  const removeComment = useReelCommentsStore((s) => s.remove);
  const setDraft = useReelCommentsStore((s) => s.setDraft);
  const setReplyToId = useReelCommentsStore((s) => s.setReplyTo);
  const resetReel = useReelCommentsStore((s) => s.resetReel);

  const reload = useCallback(
    (showSpinner = true) => {
      if (reelId) return load(reelId, showSpinner);
    },
    [reelId, load]
  );

  const loadMoreForReel = useCallback(() => {
    if (reelId) return loadMore(reelId);
  }, [reelId, loadMore]);

  const post = useCallback(
    (content: string, parentId?: string) => {
      if (!reelId) return Promise.resolve({ comment: null, error: null });
      return postComment(reelId, content, parentId);
    },
    [reelId, postComment]
  );

  const remove = useCallback(
    (commentId: string) => {
      if (!reelId) return Promise.resolve();
      return removeComment(reelId, commentId);
    },
    [reelId, removeComment]
  );

  const setReplyTo = useCallback(
    (commentId: string | null) => {
      if (reelId) setReplyToId(reelId, commentId);
    },
    [reelId, setReplyToId]
  );

  const updateDraft = useCallback(
    (draft: string) => {
      if (reelId) setDraft(reelId, draft);
    },
    [reelId, setDraft]
  );

  useEffect(() => {
    if (reelId) void load(reelId, true);
    return () => {
      if (reelId) resetReel(reelId);
    };
  }, [reelId, load, resetReel]);

  useRealtimeTopic('reelComments', () => void reload(false), Boolean(reelId));

  const empty = {
    comments: [],
    loading: false,
    loadingMore: false,
    cursor: null,
    hasMore: false,
    error: null,
    postError: null,
    posting: false,
    draft: '',
    replyToId: null,
  };

  const state = slice ?? empty;

  return {
    comments: state.comments,
    loading: state.loading,
    loadingMore: state.loadingMore,
    hasMore: state.hasMore,
    error: state.error,
    postError: state.postError,
    posting: state.posting,
    draft: state.draft,
    replyToId: state.replyToId,
    reload,
    loadMore: loadMoreForReel,
    post,
    remove,
    setDraft: updateDraft,
    setReplyTo,
  };
}
