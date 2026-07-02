-- Chat enhancements: replies, edits, soft-delete, reactions, preferences, pins, presence

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.chat_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id UUID NOT NULL,
  chat_type TEXT NOT NULL CHECK (chat_type IN ('individual', 'group')),
  muted_until TIMESTAMPTZ,
  wallpaper TEXT,
  cleared_at TIMESTAMPTZ,
  starred_message_ids UUID[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, chat_id, chat_type)
);

CREATE INDEX IF NOT EXISTS idx_chat_preferences_user
  ON public.chat_preferences (user_id);

CREATE TABLE IF NOT EXISTS public.message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_message
  ON public.message_reactions (message_id);

CREATE TABLE IF NOT EXISTS public.pinned_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  pinned_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_pinned_messages_group
  ON public.pinned_messages (group_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;