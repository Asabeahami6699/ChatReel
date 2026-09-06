-- Birthday / age gate for signup (minimum age enforced in API)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;

COMMENT ON COLUMN public.profiles.date_of_birth IS
  'User birthday collected at signup for age gating. Null for legacy accounts.';
    