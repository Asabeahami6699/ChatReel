-- Threaded reel comments (reply to a parent comment).
ALTER TABLE reel_comments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES reel_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_reel_comments_parent ON reel_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_reel_comments_reel_created ON reel_comments(reel_id, created_at DESC);
