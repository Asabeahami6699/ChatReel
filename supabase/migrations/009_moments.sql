-- Ephemeral feed moments (status-style posts)

CREATE TABLE IF NOT EXISTS public.moments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  caption TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 1440 CHECK (duration_minutes >= 10 AND duration_minutes <= 1440),
  expires_at TIMESTAMPTZ NOT NULL,
  view_once BOOLEAN NOT NULL DEFAULT false,
  audience_mode TEXT NOT NULL DEFAULT 'friends' CHECK (audience_mode IN ('friends', 'only', 'except')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moments_author_id ON public.moments(author_id);
CREATE INDEX IF NOT EXISTS idx_moments_expires_at ON public.moments(expires_at);

CREATE TABLE IF NOT EXISTS public.moment_audience (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id UUID NOT NULL REFERENCES public.moments(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rule TEXT NOT NULL CHECK (rule IN ('include', 'exclude')),
  UNIQUE (moment_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_moment_audience_moment_id ON public.moment_audience(moment_id);

CREATE TABLE IF NOT EXISTS public.moment_views (
  moment_id UUID NOT NULL REFERENCES public.moments(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (moment_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_moment_views_viewer_id ON public.moment_views(viewer_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.moments;
