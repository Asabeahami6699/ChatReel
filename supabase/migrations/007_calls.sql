-- =============================================================================
-- Calls (1:1 + group, voice + video) using LiveKit Cloud as the SFU.
--
-- The Express backend mints a short-lived LiveKit JWT for each participant.
-- The DB tables here track:
--   * calls            — one row per call session (the "room" record)
--   * call_participants — who was in the room, when they joined/left
--
-- Realtime: rows are streamed to the global hub. The frontend uses the
-- `calls` topic to detect incoming rings (status='ringing' INSERTs where
-- callee_id = auth.uid()) and call lifecycle changes for history refresh.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- LiveKit room name. Unique per call.
  room_name TEXT NOT NULL UNIQUE,
  call_type TEXT NOT NULL DEFAULT 'voice'
    CHECK (call_type IN ('voice', 'video')),
  -- 'direct' = 1:1, 'group' = N participants from a chat group
  scope TEXT NOT NULL DEFAULT 'direct'
    CHECK (scope IN ('direct', 'group')),
  caller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- For 1:1 calls. Null for group calls.
  callee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- For group calls. Null for direct.
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ringing'
    CHECK (status IN ('ringing', 'accepted', 'declined', 'missed', 'ended', 'cancelled')),
  -- Wall-clock timestamps for history display.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ, -- when first participant joined past ringing
  ended_at TIMESTAMPTZ,
  -- Cached duration in seconds (filled when status flips to 'ended').
  duration_seconds INTEGER,
  -- Free-form metadata (e.g. who declined first, error reason).
  metadata JSONB,
  CHECK (
    (scope = 'direct' AND callee_id IS NOT NULL AND group_id IS NULL)
    OR (scope = 'group'  AND group_id  IS NOT NULL AND callee_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_calls_caller_id ON public.calls(caller_id);
CREATE INDEX IF NOT EXISTS idx_calls_callee_id ON public.calls(callee_id);
CREATE INDEX IF NOT EXISTS idx_calls_group_id ON public.calls(group_id);
CREATE INDEX IF NOT EXISTS idx_calls_status ON public.calls(status);
CREATE INDEX IF NOT EXISTS idx_calls_created_at ON public.calls(created_at DESC);

CREATE TABLE IF NOT EXISTS public.call_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  -- 'invited' = added to room but hasn't joined; 'joined' = currently in room;
  -- 'left' = was in and now gone; 'declined'/'missed' for direct mirrors call status.
  state TEXT NOT NULL DEFAULT 'invited'
    CHECK (state IN ('invited', 'joined', 'left', 'declined', 'missed')),
  UNIQUE (call_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_call_participants_call_id ON public.call_participants(call_id);
CREATE INDEX IF NOT EXISTS idx_call_participants_user_id ON public.call_participants(user_id);

-- ---------------------------------------------------------------------------
-- Auto-populate started_at / ended_at / duration_seconds.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calls_lifecycle_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'ringing' AND NEW.started_at IS NULL THEN
    NEW.started_at = now();
  END IF;

  IF NEW.status IN ('ended', 'declined', 'missed', 'cancelled')
     AND OLD.status NOT IN ('ended', 'declined', 'missed', 'cancelled')
  THEN
    IF NEW.ended_at IS NULL THEN
      NEW.ended_at = now();
    END IF;
    IF NEW.started_at IS NOT NULL AND NEW.duration_seconds IS NULL THEN
      NEW.duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))::INT);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calls_lifecycle ON public.calls;
CREATE TRIGGER trg_calls_lifecycle
  BEFORE UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.calls_lifecycle_trigger();

-- ---------------------------------------------------------------------------
-- RLS: defense-in-depth. The backend uses service role and bypasses RLS,
-- but if a stray client direct-queries we still want it locked down.
-- ---------------------------------------------------------------------------
ALTER TABLE public.calls              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_participants  ENABLE ROW LEVEL SECURITY;

-- A call is visible to:
--   * caller, or
--   * callee (direct), or
--   * any current member of the group (group call), or
--   * anyone listed in call_participants for this call.
DROP POLICY IF EXISTS calls_select_visible ON public.calls;
CREATE POLICY calls_select_visible ON public.calls
  FOR SELECT TO authenticated
  USING (
    caller_id = auth.uid()
    OR callee_id = auth.uid()
    OR (
      group_id IS NOT NULL
      AND group_id IN (
        SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
      )
    )
    OR id IN (SELECT call_id FROM public.call_participants WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS call_participants_select_visible ON public.call_participants;
CREATE POLICY call_participants_select_visible ON public.call_participants
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR call_id IN (
      SELECT id FROM public.calls
      WHERE caller_id = auth.uid()
         OR callee_id = auth.uid()
         OR (group_id IS NOT NULL AND group_id IN (
           SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
         ))
    )
  );

-- ---------------------------------------------------------------------------
-- Realtime publication + REPLICA IDENTITY FULL
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'calls'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.calls';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'call_participants'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.call_participants';
  END IF;
END $$;

ALTER TABLE public.calls             REPLICA IDENTITY FULL;
ALTER TABLE public.call_participants REPLICA IDENTITY FULL;
