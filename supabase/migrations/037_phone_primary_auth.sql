-- Phone-primary identity: unique E.164 phone on profiles + signup trigger update.
-- Existing email users keep NULL phone until they enroll via OTP.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_phone_e164_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_phone_e164_check
  CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$');

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique
  ON public.profiles (phone)
  WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_phone
  ON public.profiles (phone)
  WHERE phone IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  meta_name TEXT;
  fallback_name TEXT;
BEGIN
  meta_name := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'display_name', '')), '');
  fallback_name := COALESCE(
    meta_name,
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    NULLIF(NEW.phone, ''),
    'User'
  );

  INSERT INTO public.profiles (user_id, email, phone, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.phone, ''),
    fallback_name
  )
  ON CONFLICT (user_id) DO UPDATE
    SET
      email = COALESCE(EXCLUDED.email, public.profiles.email),
      phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
      display_name = CASE
        WHEN public.profiles.display_name IS NULL OR public.profiles.display_name = ''
          THEN EXCLUDED.display_name
        ELSE public.profiles.display_name
      END,
      updated_at = now();

  RETURN NEW;
END;
$$;
