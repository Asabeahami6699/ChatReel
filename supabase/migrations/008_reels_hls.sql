-- HLS adaptive playback + transcode pipeline status
ALTER TABLE public.reels
  ADD COLUMN IF NOT EXISTS hls_url TEXT,
  ADD COLUMN IF NOT EXISTS transcode_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (transcode_status IN ('pending', 'processing', 'ready', 'failed', 'skipped'));

CREATE INDEX IF NOT EXISTS idx_reels_transcode_status ON public.reels(transcode_status);
