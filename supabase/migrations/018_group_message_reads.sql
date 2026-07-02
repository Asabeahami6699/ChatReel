-- Per-user read receipts for group messages

CREATE TABLE IF NOT EXISTS public.message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_reads_message
  ON public.message_reads (message_id);

CREATE INDEX IF NOT EXISTS idx_message_reads_user
  ON public.message_reads (user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reads;
