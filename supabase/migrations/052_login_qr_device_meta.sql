-- Store desktop install metadata on login QR so phone approve can register the device.
ALTER TABLE public.login_qr_sessions
  ADD COLUMN IF NOT EXISTS installation_id TEXT,
  ADD COLUMN IF NOT EXISTS device_label TEXT,
  ADD COLUMN IF NOT EXISTS device_platform TEXT;
