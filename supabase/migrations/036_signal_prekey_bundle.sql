-- Signal / X3DH bundle fields (safe to re-run)
ALTER TABLE public.public_keys DROP CONSTRAINT IF EXISTS public_keys_type_check;
ALTER TABLE public.public_keys
  ADD CONSTRAINT public_keys_type_check
  CHECK (type IN ('identity', 'signed_prekey', 'identity_x25519', 'signing'));

ALTER TABLE public.public_keys ADD COLUMN IF NOT EXISTS key_id INTEGER;
ALTER TABLE public.public_keys ADD COLUMN IF NOT EXISTS signature TEXT;
ALTER TABLE public.public_keys ADD COLUMN IF NOT EXISTS registration_id INTEGER;

ALTER TABLE public.one_time_prekeys ADD COLUMN IF NOT EXISTS key_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_one_time_prekeys_unused
  ON public.one_time_prekeys (user_id)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_public_keys_user_type
  ON public.public_keys (user_id, type);
