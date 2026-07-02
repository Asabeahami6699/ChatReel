-- Reel messages in chat + group-scoped reels

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reel_id UUID REFERENCES public.reels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_reel_id ON public.messages(reel_id);

ALTER TABLE public.reels
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE public.reels DROP CONSTRAINT IF EXISTS reels_visibility_check;
ALTER TABLE public.reels ADD CONSTRAINT reels_visibility_check
  CHECK (visibility IN ('public', 'friends', 'private', 'group'));

CREATE INDEX IF NOT EXISTS idx_reels_group_id ON public.reels(group_id) WHERE group_id IS NOT NULL;
