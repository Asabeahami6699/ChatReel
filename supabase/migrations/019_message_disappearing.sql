-- Disappearing / view-once chat media
-- expires_at: hard expiry timestamp after which the message is hidden for everyone.
-- view_once:  media that disappears after the recipient opens it once.
-- viewed_at:  set when a view-once message has been opened by the recipient.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS view_once BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_messages_expires_at
  ON public.messages (expires_at)
  WHERE expires_at IS NOT NULL;
