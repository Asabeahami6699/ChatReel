-- Multi-media moment groups, replies, and ordering

ALTER TABLE public.moments
  ADD COLUMN IF NOT EXISTS group_id UUID,
  ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_moments_group_id ON public.moments(group_id);

CREATE TABLE IF NOT EXISTS public.moment_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id UUID NOT NULL REFERENCES public.moments(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(trim(body)) > 0 AND char_length(body) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moment_replies_moment_id ON public.moment_replies(moment_id);
CREATE INDEX IF NOT EXISTS idx_moment_replies_author_id ON public.moment_replies(author_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.moment_views;
