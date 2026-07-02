-- Carousel / multi-media reels: several photos or videos in one post.

CREATE TABLE IF NOT EXISTS public.reel_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  thumbnail_url TEXT,
  duration NUMERIC,
  width INTEGER,
  height INTEGER,
  hls_url TEXT,
  transcode_status TEXT NOT NULL DEFAULT 'skipped'
    CHECK (transcode_status IN ('pending', 'processing', 'ready', 'failed', 'skipped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reel_id, position)
);

CREATE INDEX IF NOT EXISTS idx_reel_media_reel_id ON public.reel_media(reel_id, position);

ALTER TABLE public.reel_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reel_media_select_visible ON public.reel_media;
CREATE POLICY reel_media_select_visible ON public.reel_media
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.reels r
      WHERE r.id = reel_media.reel_id
        AND (
          r.visibility = 'public'
          OR r.author_id = public.my_profile_id()
          OR (r.visibility = 'friends' AND public.is_friend_of_me(r.author_id))
        )
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'reel_media'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.reel_media';
  END IF;
END $$;

ALTER TABLE public.reel_media REPLICA IDENTITY FULL;
