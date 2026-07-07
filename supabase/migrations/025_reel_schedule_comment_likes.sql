-- Scheduled publish + comment likes
ALTER TABLE public.reels
  ADD COLUMN IF NOT EXISTS scheduled_publish_at timestamptz;

ALTER TABLE public.reels
  ADD COLUMN IF NOT EXISTS sound_volume numeric NOT NULL DEFAULT 1;

ALTER TABLE public.reels
  DROP CONSTRAINT IF EXISTS reels_sound_volume_check;

ALTER TABLE public.reels
  ADD CONSTRAINT reels_sound_volume_check
  CHECK (sound_volume >= 0 AND sound_volume <= 1);

CREATE INDEX IF NOT EXISTS idx_reels_scheduled_publish
  ON public.reels (scheduled_publish_at)
  WHERE scheduled_publish_at IS NOT NULL;

ALTER TABLE public.reel_comments
  ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.reel_comment_likes (
  comment_id uuid NOT NULL REFERENCES public.reel_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_reel_comment_likes_user ON public.reel_comment_likes(user_id);

CREATE OR REPLACE FUNCTION public.bump_reel_comment_like_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reel_comments SET like_count = like_count + 1 WHERE id = NEW.comment_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.reel_comments SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_reel_comment_likes_count ON public.reel_comment_likes;
CREATE TRIGGER trg_reel_comment_likes_count
  AFTER INSERT OR DELETE ON public.reel_comment_likes
  FOR EACH ROW EXECUTE FUNCTION public.bump_reel_comment_like_count();

ALTER TABLE public.reel_comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reel_comment_likes_select ON public.reel_comment_likes;
CREATE POLICY reel_comment_likes_select ON public.reel_comment_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS reel_comment_likes_insert_own ON public.reel_comment_likes;
CREATE POLICY reel_comment_likes_insert_own ON public.reel_comment_likes
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS reel_comment_likes_delete_own ON public.reel_comment_likes;
CREATE POLICY reel_comment_likes_delete_own ON public.reel_comment_likes
  FOR DELETE USING (user_id = auth.uid());
