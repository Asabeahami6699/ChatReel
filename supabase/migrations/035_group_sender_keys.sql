-- Group E2E sender keys (Signal-style lite): each member stores a symmetric
-- sender key, distributed to peers encrypted with identity ECDH.
CREATE TABLE IF NOT EXISTS public.group_sender_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  sender_identity_pub TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, sender_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_group_sender_keys_recipient
  ON public.group_sender_keys (group_id, recipient_id);

CREATE INDEX IF NOT EXISTS idx_group_sender_keys_sender
  ON public.group_sender_keys (group_id, sender_id);

ALTER TABLE public.group_sender_keys ENABLE ROW LEVEL SECURITY;
