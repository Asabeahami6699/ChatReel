-- Realtime needs the full row in WAL events so RLS policies that reference
-- non-PK columns (sender_id, receiver_id, group_id, user_id, friend_id, ...)
-- can be evaluated. Without REPLICA IDENTITY FULL, only the primary key is
-- streamed and Supabase Realtime silently drops every event for the
-- subscribed user → channels say "subscribed" but no INSERT/UPDATE events
-- ever fire.
--
-- Idempotent: safe to re-run.

ALTER TABLE public.messages       REPLICA IDENTITY FULL;
ALTER TABLE public.friendships    REPLICA IDENTITY FULL;
ALTER TABLE public.groups         REPLICA IDENTITY FULL;
ALTER TABLE public.group_members  REPLICA IDENTITY FULL;
ALTER TABLE public.profiles       REPLICA IDENTITY FULL;

-- Tables added by migration 004; safe to set even if 004 hasn't run yet
-- (the ALTER will only succeed if the table exists).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='group_invites') THEN
    EXECUTE 'ALTER TABLE public.group_invites REPLICA IDENTITY FULL';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='qr_sessions') THEN
    EXECUTE 'ALTER TABLE public.qr_sessions REPLICA IDENTITY FULL';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='linked_devices') THEN
    EXECUTE 'ALTER TABLE public.linked_devices REPLICA IDENTITY FULL';
  END IF;
END $$;
