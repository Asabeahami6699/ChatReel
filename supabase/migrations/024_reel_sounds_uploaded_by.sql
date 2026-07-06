-- Track who uploaded a custom reel sound (for "My uploads" in the sound picker).

ALTER TABLE public.reel_sounds
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reel_sounds_uploaded_by
  ON public.reel_sounds (uploaded_by, created_at DESC)
  WHERE uploaded_by IS NOT NULL;
