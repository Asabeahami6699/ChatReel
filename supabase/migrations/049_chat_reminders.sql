-- Message-anchored chat reminders ("Remind me about this chat")

CREATE TABLE IF NOT EXISTS public.chat_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id UUID NOT NULL,
  chat_type TEXT NOT NULL CHECK (chat_type IN ('individual', 'group')),
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  remind_at TIMESTAMPTZ NOT NULL,
  note TEXT,
  preview_text TEXT,
  chat_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'fired', 'done', 'cancelled')),
  fired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_reminders_due
  ON public.chat_reminders (remind_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_chat_reminders_user_status
  ON public.chat_reminders (user_id, status, remind_at);

CREATE INDEX IF NOT EXISTS idx_chat_reminders_user_chat
  ON public.chat_reminders (user_id, chat_type, chat_id)
  WHERE status IN ('pending', 'fired');

ALTER TABLE public.chat_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own chat reminders" ON public.chat_reminders;
CREATE POLICY "Users manage own chat reminders"
  ON public.chat_reminders
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
