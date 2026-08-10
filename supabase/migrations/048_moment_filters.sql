-- Color filter presets on moments (same ids as reels.filter_id).
ALTER TABLE public.moments
  ADD COLUMN IF NOT EXISTS filter_id TEXT;

COMMENT ON COLUMN public.moments.filter_id IS
  'Color filter preset id (none|bw|warm|cool|…); applied at view time like reels';
