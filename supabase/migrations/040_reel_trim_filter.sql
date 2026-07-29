-- Persist reel trim window + color filter so publish/reconcile can apply them
-- even when HLS is off and no soundtrack is attached.

ALTER TABLE public.reels
  ADD COLUMN IF NOT EXISTS trim_start_sec DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS trim_end_sec DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS filter_id TEXT;

ALTER TABLE public.reel_media
  ADD COLUMN IF NOT EXISTS trim_start_sec DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS trim_end_sec DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS filter_id TEXT;

COMMENT ON COLUMN public.reels.trim_start_sec IS 'Clip start (seconds) applied during encode';
COMMENT ON COLUMN public.reels.trim_end_sec IS 'Clip end (seconds) applied during encode';
COMMENT ON COLUMN public.reels.filter_id IS 'Color filter preset id (none|warm|cool|vivid|fade|mono)';
