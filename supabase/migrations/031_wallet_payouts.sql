-- =============================================================================
-- Wallet cash-out: cashable earnings, recipients, thresholds, payout requests
-- =============================================================================

-- Only gift earnings are cashable (not purchased / welcome coins).
ALTER TABLE public.wallet_accounts
  ADD COLUMN IF NOT EXISTS cashable_coins BIGINT NOT NULL DEFAULT 0
    CHECK (cashable_coins >= 0);

-- Keep cashable within total balance.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallet_accounts_cashable_lte_balance'
  ) THEN
    ALTER TABLE public.wallet_accounts
      ADD CONSTRAINT wallet_accounts_cashable_lte_balance
      CHECK (cashable_coins <= balance_coins);
  END IF;
END $$;

-- Backfill cashable from gift_received + payout (payout deltas are negative).
UPDATE public.wallet_accounts wa
SET cashable_coins = LEAST(
  wa.balance_coins,
  GREATEST(
    0,
    COALESCE((
      SELECT SUM(wl.delta_coins)
      FROM public.wallet_ledger wl
      WHERE wl.profile_id = wa.profile_id
        AND wl.entry_type = 'gift_received'
    ), 0)
    + COALESCE((
      SELECT SUM(wl.delta_coins)
      FROM public.wallet_ledger wl
      WHERE wl.profile_id = wa.profile_id
        AND wl.entry_type = 'payout'
    ), 0)
    + COALESCE((
      SELECT SUM(COALESCE((wl.metadata->>'cashable_delta')::BIGINT, 0))
      FROM public.wallet_ledger wl
      WHERE wl.profile_id = wa.profile_id
        AND wl.entry_type = 'refund'
    ), 0)
  )
);

-- ---------------------------------------------------------------------------
-- apply_wallet_entry: also maintain cashable_coins
-- gift_received → cashable += delta
-- payout → cashable += delta (negative)
-- refund → cashable += metadata.cashable_delta when present
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_wallet_entry(
  p_profile_id UUID,
  p_delta BIGINT,
  p_entry_type TEXT,
  p_reference_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance BIGINT;
  v_cashable BIGINT;
  v_cashable_delta BIGINT;
  v_existing BIGINT;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT balance_after INTO v_existing
    FROM public.wallet_ledger
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    IF FOUND THEN
      RETURN v_existing;
    END IF;
  END IF;

  PERFORM public.ensure_wallet_account(p_profile_id);

  SELECT balance_coins, cashable_coins
  INTO v_balance, v_cashable
  FROM public.wallet_accounts
  WHERE profile_id = p_profile_id
  FOR UPDATE;

  v_cashable_delta := CASE p_entry_type
    WHEN 'gift_received' THEN p_delta
    WHEN 'payout' THEN p_delta
    WHEN 'refund' THEN COALESCE((p_metadata->>'cashable_delta')::BIGINT, 0)
    ELSE 0
  END;

  v_balance := v_balance + p_delta;
  IF v_balance < 0 THEN
    RAISE EXCEPTION 'insufficient_coins' USING ERRCODE = 'P0001';
  END IF;

  v_cashable := v_cashable + v_cashable_delta;
  IF v_cashable < 0 THEN
    RAISE EXCEPTION 'insufficient_cashable_coins' USING ERRCODE = 'P0001';
  END IF;
  IF v_cashable > v_balance THEN
    v_cashable := v_balance;
  END IF;

  UPDATE public.wallet_accounts
  SET
    balance_coins = v_balance,
    cashable_coins = v_cashable,
    lifetime_earned_coins = lifetime_earned_coins + GREATEST(p_delta, 0),
    lifetime_spent_coins = lifetime_spent_coins + GREATEST(-p_delta, 0),
    updated_at = now()
  WHERE profile_id = p_profile_id;

  INSERT INTO public.wallet_ledger (
    profile_id,
    delta_coins,
    balance_after,
    entry_type,
    reference_id,
    idempotency_key,
    metadata
  )
  VALUES (
    p_profile_id,
    p_delta,
    v_balance,
    p_entry_type,
    p_reference_id,
    p_idempotency_key,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN v_balance;
END;
$$;

-- ---------------------------------------------------------------------------
-- Per-country cash-out thresholds and coin→fiat rates
-- coin_to_fiat_minor = fiat minor units paid per 1 cashable coin
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payout_thresholds (
  country_code TEXT PRIMARY KEY,
  currency TEXT NOT NULL,
  min_amount_minor INTEGER NOT NULL CHECK (min_amount_minor > 0),
  coin_to_fiat_minor INTEGER NOT NULL CHECK (coin_to_fiat_minor > 0),
  fee_flat_minor INTEGER NOT NULL DEFAULT 0 CHECK (fee_flat_minor >= 0),
  fee_bps INTEGER NOT NULL DEFAULT 150 CHECK (fee_bps >= 0 AND fee_bps <= 5000),
  active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.payout_thresholds (
  country_code, currency, min_amount_minor, coin_to_fiat_minor, fee_flat_minor, fee_bps
) VALUES
  -- ₦50,000 min @ ₦5/coin; ₦100 + 1.5% fee
  ('NG', 'NGN', 5000000, 500, 10000, 150),
  -- GH₵500 min @ GH₵0.50/coin; GH₵1 + 1.5%
  ('GH', 'GHS', 50000, 50, 100, 150),
  -- KES 10,000 min @ KES 0.50/coin; KES 100 + 1.5%
  ('KE', 'KES', 1000000, 50, 10000, 150),
  -- R1,000 min @ R0.50/coin; R10 + 1.5%
  ('ZA', 'ZAR', 100000, 50, 1000, 150)
ON CONFLICT (country_code) DO UPDATE SET
  currency = EXCLUDED.currency,
  min_amount_minor = EXCLUDED.min_amount_minor,
  coin_to_fiat_minor = EXCLUDED.coin_to_fiat_minor,
  fee_flat_minor = EXCLUDED.fee_flat_minor,
  fee_bps = EXCLUDED.fee_bps,
  active = true,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Saved payout recipients (Paystack Transfer Recipient)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payout_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  currency TEXT NOT NULL,
  recipient_type TEXT NOT NULL
    CHECK (recipient_type IN ('nuban', 'mobile_money', 'basa')),
  account_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  bank_code TEXT NOT NULL,
  bank_name TEXT,
  paystack_recipient_code TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payout_recipients_unique_account
  ON public.payout_recipients (profile_id, account_number, bank_code)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_payout_recipients_profile
  ON public.payout_recipients (profile_id, created_at DESC)
  WHERE active = true;

-- ---------------------------------------------------------------------------
-- Payout requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.payout_recipients(id),
  amount_coins BIGINT NOT NULL CHECK (amount_coins > 0),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  fee_minor INTEGER NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
  net_amount_minor INTEGER NOT NULL CHECK (net_amount_minor > 0),
  currency TEXT NOT NULL,
  country_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'cancelled')),
  paystack_transfer_code TEXT,
  paystack_transfer_reference TEXT,
  idempotency_key TEXT NOT NULL,
  failure_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payout_requests_idempotency_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_payout_requests_profile_created
  ON public.payout_requests (profile_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payout_requests_one_open
  ON public.payout_requests (profile_id)
  WHERE status IN ('pending', 'processing');

-- ---------------------------------------------------------------------------
-- Atomic payout debit (balance + cashable)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_wallet_payout(
  p_profile_id UUID,
  p_recipient_id UUID,
  p_amount_coins BIGINT,
  p_amount_minor INTEGER,
  p_fee_minor INTEGER,
  p_net_amount_minor INTEGER,
  p_currency TEXT,
  p_country_code TEXT,
  p_idempotency_key TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.payout_requests%ROWTYPE;
  v_recipient public.payout_recipients%ROWTYPE;
  v_balance BIGINT;
  v_cashable BIGINT;
  v_request public.payout_requests%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'invalid_idempotency_key' USING ERRCODE = 'P0001';
  END IF;
  IF p_amount_coins IS NULL OR p_amount_coins <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_existing
  FROM public.payout_requests
  WHERE idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    SELECT balance_coins, cashable_coins INTO v_balance, v_cashable
    FROM public.wallet_accounts
    WHERE profile_id = p_profile_id;
    RETURN jsonb_build_object(
      'duplicate', true,
      'payout', row_to_json(v_existing),
      'balance_coins', COALESCE(v_balance, 0),
      'cashable_coins', COALESCE(v_cashable, 0)
    );
  END IF;

  SELECT * INTO v_recipient
  FROM public.payout_recipients
  WHERE id = p_recipient_id
    AND profile_id = p_profile_id
    AND active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recipient_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payout_requests
    WHERE profile_id = p_profile_id
      AND status IN ('pending', 'processing')
  ) THEN
    RAISE EXCEPTION 'payout_already_pending' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.ensure_wallet_account(p_profile_id);

  PERFORM public.apply_wallet_entry(
    p_profile_id,
    -p_amount_coins,
    'payout',
    NULL,
    'payout-debit:' || p_idempotency_key,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'amount_minor', p_amount_minor,
      'fee_minor', p_fee_minor,
      'net_amount_minor', p_net_amount_minor,
      'currency', p_currency
    )
  );

  INSERT INTO public.payout_requests (
    profile_id,
    recipient_id,
    amount_coins,
    amount_minor,
    fee_minor,
    net_amount_minor,
    currency,
    country_code,
    status,
    idempotency_key,
    metadata
  )
  VALUES (
    p_profile_id,
    p_recipient_id,
    p_amount_coins,
    p_amount_minor,
    p_fee_minor,
    p_net_amount_minor,
    p_currency,
    p_country_code,
    'pending',
    p_idempotency_key,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING * INTO v_request;

  -- Link ledger reference after insert
  UPDATE public.wallet_ledger
  SET reference_id = v_request.id
  WHERE idempotency_key = 'payout-debit:' || p_idempotency_key;

  SELECT balance_coins, cashable_coins INTO v_balance, v_cashable
  FROM public.wallet_accounts
  WHERE profile_id = p_profile_id;

  RETURN jsonb_build_object(
    'duplicate', false,
    'payout', row_to_json(v_request),
    'balance_coins', v_balance,
    'cashable_coins', v_cashable
  );
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RAISE;
  WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM public.payout_requests
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    SELECT balance_coins, cashable_coins INTO v_balance, v_cashable
    FROM public.wallet_accounts
    WHERE profile_id = p_profile_id;
    RETURN jsonb_build_object(
      'duplicate', true,
      'payout', row_to_json(v_existing),
      'balance_coins', COALESCE(v_balance, 0),
      'cashable_coins', COALESCE(v_cashable, 0)
    );
END;
$$;

-- Refund cashable coins when a payout fails after debit
CREATE OR REPLACE FUNCTION public.refund_wallet_payout(
  p_payout_id UUID,
  p_failure_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout public.payout_requests%ROWTYPE;
  v_balance BIGINT;
  v_cashable BIGINT;
BEGIN
  SELECT * INTO v_payout
  FROM public.payout_requests
  WHERE id = p_payout_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_payout.status = 'failed' THEN
    SELECT balance_coins, cashable_coins INTO v_balance, v_cashable
    FROM public.wallet_accounts
    WHERE profile_id = v_payout.profile_id;
    RETURN jsonb_build_object(
      'duplicate', true,
      'payout', row_to_json(v_payout),
      'balance_coins', COALESCE(v_balance, 0),
      'cashable_coins', COALESCE(v_cashable, 0)
    );
  END IF;

  IF v_payout.status NOT IN ('pending', 'processing') THEN
    RAISE EXCEPTION 'payout_not_refundable' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.apply_wallet_entry(
    v_payout.profile_id,
    v_payout.amount_coins,
    'refund',
    v_payout.id,
    'payout-refund:' || v_payout.id::text,
    jsonb_build_object(
      'cashable_delta', v_payout.amount_coins,
      'payout_id', v_payout.id,
      'reason', COALESCE(p_failure_reason, 'transfer_failed')
    )
  );

  UPDATE public.payout_requests
  SET
    status = 'failed',
    failure_reason = COALESCE(p_failure_reason, failure_reason),
    updated_at = now()
  WHERE id = p_payout_id
  RETURNING * INTO v_payout;

  SELECT balance_coins, cashable_coins INTO v_balance, v_cashable
  FROM public.wallet_accounts
  WHERE profile_id = v_payout.profile_id;

  RETURN jsonb_build_object(
    'duplicate', false,
    'payout', row_to_json(v_payout),
    'balance_coins', v_balance,
    'cashable_coins', v_cashable
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_wallet_payout(
  UUID, UUID, BIGINT, INTEGER, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB
) TO service_role;

GRANT EXECUTE ON FUNCTION public.refund_wallet_payout(UUID, TEXT) TO service_role;

ALTER TABLE public.payout_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
