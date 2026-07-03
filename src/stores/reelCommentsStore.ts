import { create } from 'zustand';
import { ApiError, api, type ReelCommentDTO } from '../lib/api';

const PAGE_SIZE = 30;

export type ReelCommentSlice = {
  comments: ReelCommentDTO[];
  loading: boolean;
  loadingMore: boolean;
  cursor: string | null;
  hasMore: boolean;
  error: string | null;
  postError: string | null;
  posting: boolean;
  draft: string;
  replyToId: string | null;
};

const emptySlice = (): ReelCommentSlice => ({
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
});

type ReelCommentsStore = {
  reels: Record<string, ReelCommentSlice>;
  getSlice: (reelId: string) => ReelCommentSlice;
  patchSlice: (reelId: string, patch: Partial<ReelCommentSlice>) => void;
  resetReel: (reelId: string) => void;
  load: (reelId: string, showSpinner?: boolean) => Promise<void>;
  loadMore: (reelId: string) => Promise<void>;
  post: (
    reelId: string,
    content: string,
    parentId?: string
  ) => Promise<{ comment: ReelCommentDTO | null; error: string | null }>;
  remove: (reelId: string, commentId: string) => Promise<void>;
  setDraft: (reelId: string, draft: string) => void;
  setReplyTo: (reelId: string, commentId: string | null) => void;
};

export const useReelCommentsStore = create<ReelCommentsStore>((set, get) => ({
  reels: {},

  getSlice: (reelId) => get().reels[reelId] ?? emptySlice(),

  patchSlice: (reelId, patch) =>
    set((state) => ({
      reels: {
        ...state.reels,
        [reelId]: { ...(state.reels[reelId] ?? emptySlice()), ...patch },
      },
    })),

  resetReel: (reelId) =>
    set((state) => {
      const next = { ...state.reels };
      delete next[reelId];
      return { reels: next };
    }),

  load: async (reelId, showSpinner = true) => {
    if (showSpinner) {
      get().patchSlice(reelId, { loading: true, error: null });
    }
    try {
      const { comments, next_cursor } = await api.reels.comments(reelId, { limit: PAGE_SIZE });
      get().patchSlice(reelId, {
        comments,
        loading: false,
        loadingMore: false,
        cursor: next_cursor,
        hasMore: Boolean(next_cursor),
        error: null,
        postError: null,
        posting: false,
      });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : (err as Error).message ?? 'Failed to load';
      get().patchSlice(reelId, { loading: false, error: message });
    }
  },

  loadMore: async (reelId) => {
    const slice = get().getSlice(reelId);
    if (slice.loadingMore || !slice.hasMore || !slice.cursor) return;

    get().patchSlice(reelId, { loadingMore: true });
    try {
      const { comments: more, next_cursor } = await api.reels.comments(reelId, {
        cursor: slice.cursor,
        limit: PAGE_SIZE,
      });
      const seen = new Set(slice.comments.map((c) => c.id));
      get().patchSlice(reelId, {
        comments: [...slice.comments, ...more.filter((c) => !seen.has(c.id))],
        loadingMore: false,
        cursor: next_cursor,
        hasMore: Boolean(next_cursor),
      });
    } catch {
      get().patchSlice(reelId, { loadingMore: false });
    }
  },

  post: async (reelId, content, parentId) => {
    if (!content.trim()) return { comment: null, error: null };

    get().patchSlice(reelId, { posting: true, postError: null });
    try {
      const { comment } = await api.reels.postComment(reelId, content.trim(), parentId);
      const slice = get().getSlice(reelId);
      get().patchSlice(reelId, {
        comments: parentId
          ? [...slice.comments, comment]
          : [comment, ...slice.comments.filter((c) => c.id !== comment.id)],
        posting: false,
        postError: null,
        draft: '',
        replyToId: null,
      });
      return { comment, error: null };
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to post comment';
      get().patchSlice(reelId, { posting: false, postError: message });
      return { comment: null, error: message };
    }
  },

  remove: async (reelId, commentId) => {
    const slice = get().getSlice(reelId);
    const prev = slice.comments;
    get().patchSlice(reelId, {
      comments: prev.filter((c) => c.id !== commentId),
    });
    try {
      await api.reels.deleteComment(commentId);
    } catch {
      get().patchSlice(reelId, { comments: prev });
    }
  },

  setDraft: (reelId, draft) => get().patchSlice(reelId, { draft }),

  setReplyTo: (reelId, replyToId) => get().patchSlice(reelId, { replyToId }),
}));

/** Selector helper: subscribe to one reel's comment slice. */
export function selectReelComments(reelId: string | null) {
  return (state: ReelCommentsStore) =>
    reelId ? (state.reels[reelId] ?? emptySlice()) : emptySlice();
}
