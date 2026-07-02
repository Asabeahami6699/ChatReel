-- =============================================================================
-- Reels: short-video feed (TikTok-style)
--
-- Tables:
--   reels          - the videos themselves, owned by a profile
--   reel_likes     - per-(reel,user) like (unique)
--   reel_comments  - threaded-style comments on a reel
--   reel_views     - per-(reel,user) view counter (unique → 1 unique view per
--                    viewer; total view_count maintained on reels)
--
-- Counts (like_count, comment_count, view_count) are denormalised on `reels`
-- and kept in sync via triggers so the feed query stays cheap.
--
-- Authorship uses profiles(id), matching friendships.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.reels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  caption TEXT,
  duration NUMERIC,                 -- seconds
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'friends', 'private')),
  width INTEGER,
  height INTEGER,
  view_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reels_author_id ON public.reels(author_id);
CREATE INDEX IF NOT EXISTS idx_reels_created_at ON public.reels(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_reels_visibility ON public.reels(visibility);
CREATE INDEX IF NOT EXISTS idx_reels_visibility_created ON public.reels(visibility, created_at DESC)
  WHERE visibility = 'public';

CREATE TABLE IF NOT EXISTS public.reel_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_reel_likes_reel_id ON public.reel_likes(reel_id);
CREATE INDEX IF NOT EXISTS idx_reel_likes_user_id ON public.reel_likes(user_id);

CREATE TABLE IF NOT EXISTS public.reel_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reel_comments_reel_id ON public.reel_comments(reel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reel_comments_user_id ON public.reel_comments(user_id);

CREATE TABLE IF NOT EXISTS public.reel_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_reel_views_reel_id ON public.reel_views(reel_id);

-- ---------------------------------------------------------------------------
-- Counter triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bump_reel_like_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reels SET like_count = like_count + 1, updated_at = now() WHERE id = NEW.reel_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.reels SET like_count = GREATEST(like_count - 1, 0), updated_at = now()
      WHERE id = OLD.reel_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_reel_likes_count ON public.reel_likes;
CREATE TRIGGER trg_reel_likes_count
  AFTER INSERT OR DELETE ON public.reel_likes
  FOR EACH ROW EXECUTE FUNCTION public.bump_reel_like_count();

CREATE OR REPLACE FUNCTION public.bump_reel_comment_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reels SET comment_count = comment_count + 1, updated_at = now() WHERE id = NEW.reel_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.reels SET comment_count = GREATEST(comment_count - 1, 0), updated_at = now()
      WHERE id = OLD.reel_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_reel_comments_count ON public.reel_comments;
CREATE TRIGGER trg_reel_comments_count
  AFTER INSERT OR DELETE ON public.reel_comments
  FOR EACH ROW EXECUTE FUNCTION public.bump_reel_comment_count();

CREATE OR REPLACE FUNCTION public.bump_reel_view_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Only increments on INSERT (UNIQUE constraint guarantees idempotency)
  UPDATE public.reels SET view_count = view_count + 1 WHERE id = NEW.reel_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reel_views_count ON public.reel_views;
CREATE TRIGGER trg_reel_views_count
  AFTER INSERT ON public.reel_views
  FOR EACH ROW EXECUTE FUNCTION public.bump_reel_view_count();

-- ---------------------------------------------------------------------------
-- RLS — defense in depth (backend uses service role + still validates).
-- The policies below allow:
--   * SELECT on reels iff visibility=public OR author=me OR (visibility=friends
--     AND author is an accepted friend).
--   * SELECT on likes/comments/views iff the underlying reel is visible.
--   * Mutations are blocked from the client; the backend (service role)
--     bypasses RLS.
-- ---------------------------------------------------------------------------
ALTER TABLE public.reels         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_likes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_views    ENABLE ROW LEVEL SECURITY;

-- Helper: is profile_id an accepted friend of the current auth user?
CREATE OR REPLACE FUNCTION public.is_friend_of_me(target_profile_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.friendships f
    JOIN public.profiles me ON me.user_id = auth.uid()
    WHERE f.status = 'accepted'
      AND (
        (f.user_id = me.id AND f.friend_id = target_profile_id)
        OR
        (f.friend_id = me.id AND f.user_id = target_profile_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.my_profile_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Reels: visibility-aware SELECT
DROP POLICY IF EXISTS reels_select_visible ON public.reels;
CREATE POLICY reels_select_visible ON public.reels
  FOR SELECT TO authenticated
  USING (
    visibility = 'public'
    OR author_id = public.my_profile_id()
    OR (visibility = 'friends' AND public.is_friend_of_me(author_id))
  );

-- Reel likes: visible if the reel itself is visible
DROP POLICY IF EXISTS reel_likes_select_visible ON public.reel_likes;
CREATE POLICY reel_likes_select_visible ON public.reel_likes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.reels r
      WHERE r.id = reel_likes.reel_id
        AND (
          r.visibility = 'public'
          OR r.author_id = public.my_profile_id()
          OR (r.visibility = 'friends' AND public.is_friend_of_me(r.author_id))
        )
    )
  );

-- Reel comments: same visibility predicate
DROP POLICY IF EXISTS reel_comments_select_visible ON public.reel_comments;
CREATE POLICY reel_comments_select_visible ON public.reel_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.reels r
      WHERE r.id = reel_comments.reel_id
        AND (
          r.visibility = 'public'
          OR r.author_id = public.my_profile_id()
          OR (r.visibility = 'friends' AND public.is_friend_of_me(r.author_id))
        )
    )
  );

-- Reel views: only the viewer or the reel author can see
DROP POLICY IF EXISTS reel_views_select_self ON public.reel_views;
CREATE POLICY reel_views_select_self ON public.reel_views
  FOR SELECT TO authenticated
  USING (
    user_id = public.my_profile_id()
    OR EXISTS (
      SELECT 1 FROM public.reels r
      WHERE r.id = reel_views.reel_id
        AND r.author_id = public.my_profile_id()
    )
  );

-- ---------------------------------------------------------------------------
-- Realtime publication + REPLICA IDENTITY FULL
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'reels'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.reels';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'reel_likes'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.reel_likes';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'reel_comments'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.reel_comments';
  END IF;
END $$;

ALTER TABLE public.reels         REPLICA IDENTITY FULL;
ALTER TABLE public.reel_likes    REPLICA IDENTITY FULL;
ALTER TABLE public.reel_comments REPLICA IDENTITY FULL;
ALTER TABLE public.reel_views    REPLICA IDENTITY FULL;

-- ---------------------------------------------------------------------------
-- Storage bucket: 'reels'
--   100 MB per file, public-read. Backend mints signed upload URLs.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('reels', 'reels', true, 104857600)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit;
