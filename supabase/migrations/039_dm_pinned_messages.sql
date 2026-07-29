-- Allow pinning in 1:1 chats as well as groups.
-- Groups keep using group_id; DMs use peer_user_low / peer_user_high (sorted pair).

ALTER TABLE public.pinned_messages
  ALTER COLUMN group_id DROP NOT NULL;

ALTER TABLE public.pinned_messages
  ADD COLUMN IF NOT EXISTS peer_user_low UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS peer_user_high UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.pinned_messages
  DROP CONSTRAINT IF EXISTS pinned_messages_target_check;

ALTER TABLE public.pinned_messages
  ADD CONSTRAINT pinned_messages_target_check CHECK (
    (group_id IS NOT NULL AND peer_user_low IS NULL AND peer_user_high IS NULL)
    OR (group_id IS NULL AND peer_user_low IS NOT NULL AND peer_user_high IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_pinned_messages_dm_unique
  ON public.pinned_messages (peer_user_low, peer_user_high, message_id)
  WHERE group_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_pinned_messages_dm_pair
  ON public.pinned_messages (peer_user_low, peer_user_high)
  WHERE group_id IS NULL;
