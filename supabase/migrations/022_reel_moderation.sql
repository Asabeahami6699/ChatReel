-- Reel content moderation (Sightengine): pending until scan passes.
ALTER TABLE public.reels
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'flagged')),
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
  ADD COLUMN IF NOT EXISTS moderation_score NUMERIC;

-- Existing reels stay visible in feeds.
UPDATE public.reels SET moderation_status = 'approved' WHERE moderation_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_reels_moderation_feed
  ON public.reels (moderation_status, created_at DESC)
  WHERE moderation_status = 'approved';
