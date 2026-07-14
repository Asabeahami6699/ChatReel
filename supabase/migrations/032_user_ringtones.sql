-- User ringtone library + selected incoming tone on profile.

CREATE TABLE IF NOT EXISTS public.user_ringtones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  storage_path TEXT,
  duration_sec NUMERIC NOT NULL DEFAULT 60
    CHECK (duration_sec > 0 AND duration_sec <= 60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_ringtones_user_created
  ON public.user_ringtones (user_id, created_at DESC);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS incoming_ringtone_id UUID
    REFERENCES public.user_ringtones(id) ON DELETE SET NULL;

ALTER TABLE public.user_ringtones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_ringtones_select_own" ON public.user_ringtones;
CREATE POLICY "user_ringtones_select_own" ON public.user_ringtones
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_ringtones_insert_own" ON public.user_ringtones;
CREATE POLICY "user_ringtones_insert_own" ON public.user_ringtones
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_ringtones_delete_own" ON public.user_ringtones;
CREATE POLICY "user_ringtones_delete_own" ON public.user_ringtones
  FOR DELETE USING (user_id = auth.uid());

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('ringtones', 'ringtones', true, 10485760)
ON CONFLICT (id) DO NOTHING;
