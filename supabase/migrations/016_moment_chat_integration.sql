-- Moment replies delivered as chat messages (WhatsApp-style status reply)

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS moment_id UUID REFERENCES public.moments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_moment_id ON public.messages(moment_id) WHERE moment_id IS NOT NULL;
