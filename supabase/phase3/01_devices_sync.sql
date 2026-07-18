-- Phase 3: multi-device sync + device registry
-- Run after fresh/01–04 (and phase2 archive if used).

CREATE TABLE IF NOT EXISTS public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  platform TEXT,
  app_version TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_devices_user_last_seen
  ON public.devices(user_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.sync_cursor (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  stream TEXT NOT NULL DEFAULT 'messages',
  cursor_at TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01'::timestamptz,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_id, stream)
);

CREATE INDEX IF NOT EXISTS idx_sync_cursor_user_stream
  ON public.sync_cursor(user_id, stream, cursor_at DESC);

COMMENT ON TABLE public.devices IS
  'Phase 3 multi-device presence for WS + sync (separate from push_tokens).';
COMMENT ON TABLE public.sync_cursor IS
  'Per-device catch-up cursor for store-and-forward style sync.';
