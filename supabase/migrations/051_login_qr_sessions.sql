-- WhatsApp-style desktop login QR sessions (unauthenticated desktop waits; phone approves).
CREATE TABLE IF NOT EXISTS public.login_qr_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'consumed', 'expired')),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  user_json JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_qr_sessions_expires_idx
  ON public.login_qr_sessions (expires_at);

ALTER TABLE public.login_qr_sessions ENABLE ROW LEVEL SECURITY;

-- No direct client access; API uses service role.
DROP POLICY IF EXISTS login_qr_sessions_deny_all ON public.login_qr_sessions;
CREATE POLICY login_qr_sessions_deny_all ON public.login_qr_sessions
  FOR ALL USING (false) WITH CHECK (false);
