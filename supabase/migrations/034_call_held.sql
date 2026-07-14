-- Call waiting: participants can be put on hold while answering another call.

DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'call_participants'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%state%'
  LIMIT 1;
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.call_participants DROP CONSTRAINT %I', conname);
  END IF;
END $$;

ALTER TABLE public.call_participants
  ADD CONSTRAINT call_participants_state_check
  CHECK (state IN ('invited', 'joined', 'held', 'left', 'declined', 'missed'));

ALTER TABLE public.call_participants
  ADD COLUMN IF NOT EXISTS held_at TIMESTAMPTZ;
