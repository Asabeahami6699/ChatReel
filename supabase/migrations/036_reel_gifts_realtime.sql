-- Fix: reel_gifts was never added to the supabase_realtime publication
-- (omitted in 028_reel_gifts_wallet.sql), so the client's reel-gifts realtime
-- channel received no events on databases built from migrations.

ALTER TABLE public.reel_gifts REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'reel_gifts'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.reel_gifts';
  END IF;
END $$;
