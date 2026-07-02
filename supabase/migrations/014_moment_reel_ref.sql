-- Moments that reference / reshare someone else's reel

ALTER TABLE public.moments
  ADD COLUMN IF NOT EXISTS reel_id UUID REFERENCES public.reels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_moments_reel_id ON public.moments(reel_id);

ALTER TABLE public.moments
  DROP CONSTRAINT IF EXISTS moments_media_type_check;

ALTER TABLE public.moments
  ADD CONSTRAINT moments_media_type_check
  CHECK (media_type IN ('image', 'video', 'text', 'reel'));
