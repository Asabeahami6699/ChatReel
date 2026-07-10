-- =============================================================================
-- Reel gifts + virtual coin wallet (ledger-backed, server-authoritative balances)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.gift_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🎁',
  coin_price INTEGER NOT NULL CHECK (coin_price > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gift_catalog_active_sort
  ON public.gift_catalog (active, sort_order)
  WHERE active = true;

INSERT INTO public.gift_catalog (slug, name, emoji, coin_price, sort_order)
VALUES
  ('rose', 'Rose', '🌹', 5, 1),
  ('heart', 'Heart', '💖', 10, 2),
  ('star', 'Star', '⭐', 25, 3),
  ('fire', 'Fire', '🔥', 50, 4),
  ('diamond', 'Diamond', '💎', 100, 5),
  ('crown', 'Crown', '👑', 500, 6)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.wallet_accounts (
  profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance_coins BIGINT NOT NULL DEFAULT 0 CHECK (balance_coins >= 0),
  lifetime_earned_coins BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_earned_coins >= 0),
  lifetime_spent_coins BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_spent_coins >= 0),
  welcome_claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  delta_coins BIGINT NOT NULL CHECK (delta_coins <> 0),
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  entry_type TEXT NOT NULL CHECK (
    entry_type IN (
      'welcome_bonus',
      'gift_sent',
      'gift_received',
      'purchase',
      'payout',
      'adjustment',
      'refund'
    )
  ),
  reference_id UUID,
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wallet_ledger_idempotency_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_profile_created
  ON public.wallet_ledger (profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.reel_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  sender_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  gift_id UUID NOT NULL REFERENCES public.gift_catalog(id),
  coin_amount INTEGER NOT NULL CHECK (coin_amount > 0),
  creator_coins INTEGER NOT NULL CHECK (creator_coins >= 0),
  platform_fee_coins INTEGER NOT NULL CHECK (platform_fee_coins >= 0),
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reel_gifts_idempotency_unique UNIQUE (idempotency_key),
  CHECK (sender_profile_id <> recipient_profile_id),
  CHECK (coin_amount = creator_coins + platform_fee_coins)
);

CREATE INDEX IF NOT EXISTS idx_reel_gifts_reel_created
  ON public.reel_gifts (reel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reel_gifts_recipient_created
  ON public.reel_gifts (recipient_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reel_gifts_sender_created
  ON public.reel_gifts (sender_profile_id, created_at DESC);

ALTER TABLE public.reels
  ADD COLUMN IF NOT EXISTS gift_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gift_coin_total BIGINT NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Counter trigger (denormalized reel stats)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bump_reel_gift_stats()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reels
    SET
      gift_count = gift_count + 1,
      gift_coin_total = gift_coin_total + NEW.coin_amount,
      updated_at = now()
    WHERE id = NEW.reel_id;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_reel_gifts_stats ON public.reel_gifts;
CREATE TRIGGER trg_reel_gifts_stats
  AFTER INSERT ON public.reel_gifts
  FOR EACH ROW EXECUTE FUNCTION public.bump_reel_gift_stats();

-- ---------------------------------------------------------------------------
-- Wallet helpers (SECURITY DEFINER — only callable from service role / RPC)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_wallet_account(p_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wallet_accounts (profile_id)
  VALUES (p_profile_id)
  ON CONFLICT (profile_id) DO NOTHING;
END;
$$;

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

  SELECT balance_coins INTO v_balance
  FROM public.wallet_accounts
  WHERE profile_id = p_profile_id
  FOR UPDATE;

  v_balance := v_balance + p_delta;
  IF v_balance < 0 THEN
    RAISE EXCEPTION 'insufficient_coins' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.wallet_accounts
  SET
    balance_coins = v_balance,
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

CREATE OR REPLACE FUNCTION public.claim_welcome_wallet_bonus(
  p_profile_id UUID,
  p_bonus_coins INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance BIGINT;
  v_claimed TIMESTAMPTZ;
  v_key TEXT;
BEGIN
  IF p_bonus_coins <= 0 OR p_bonus_coins > 1000 THEN
    RAISE EXCEPTION 'invalid_bonus' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.ensure_wallet_account(p_profile_id);

  SELECT welcome_claimed_at, balance_coins INTO v_claimed, v_balance
  FROM public.wallet_accounts
  WHERE profile_id = p_profile_id
  FOR UPDATE;

  IF v_claimed IS NOT NULL THEN
    RETURN jsonb_build_object('already_claimed', true, 'balance_coins', COALESCE(v_balance, 0));
  END IF;

  v_key := 'welcome:' || p_profile_id::text;
  v_balance := public.apply_wallet_entry(
    p_profile_id,
    p_bonus_coins,
    'welcome_bonus',
    NULL,
    v_key,
    jsonb_build_object('bonus_coins', p_bonus_coins)
  );

  UPDATE public.wallet_accounts
  SET welcome_claimed_at = now(), updated_at = now()
  WHERE profile_id = p_profile_id;

  RETURN jsonb_build_object('already_claimed', false, 'balance_coins', v_balance, 'bonus_coins', p_bonus_coins);
END;
$$;

CREATE OR REPLACE FUNCTION public.send_reel_gift(
  p_sender_profile_id UUID,
  p_reel_id UUID,
  p_gift_id UUID,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.reel_gifts%ROWTYPE;
  v_gift public.gift_catalog%ROWTYPE;
  v_reel public.reels%ROWTYPE;
  v_creator_coins INTEGER;
  v_platform_fee INTEGER;
  v_gift_row public.reel_gifts%ROWTYPE;
  v_sender_balance BIGINT;
  v_recipient_balance BIGINT;
  v_debit_key TEXT;
  v_credit_key TEXT;
BEGIN
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'invalid_idempotency_key' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_existing
  FROM public.reel_gifts
  WHERE idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    SELECT balance_coins INTO v_sender_balance
    FROM public.wallet_accounts
    WHERE profile_id = p_sender_profile_id;
    RETURN jsonb_build_object(
      'duplicate', true,
      'gift', row_to_json(v_existing),
      'sender_balance_coins', COALESCE(v_sender_balance, 0)
    );
  END IF;

  SELECT * INTO v_gift
  FROM public.gift_catalog
  WHERE id = p_gift_id AND active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gift_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_reel
  FROM public.reels
  WHERE id = p_reel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reel_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_reel.author_id = p_sender_profile_id THEN
    RAISE EXCEPTION 'cannot_gift_self' USING ERRCODE = 'P0001';
  END IF;

  v_creator_coins := floor(v_gift.coin_price * 0.6)::INTEGER;
  v_platform_fee := v_gift.coin_price - v_creator_coins;

  PERFORM public.ensure_wallet_account(p_sender_profile_id);
  PERFORM public.ensure_wallet_account(v_reel.author_id);

  v_debit_key := 'gift-debit:' || p_idempotency_key;
  v_credit_key := 'gift-credit:' || p_idempotency_key;

  v_sender_balance := public.apply_wallet_entry(
    p_sender_profile_id,
    -v_gift.coin_price,
    'gift_sent',
    NULL,
    v_debit_key,
    jsonb_build_object('reel_id', p_reel_id, 'gift_id', p_gift_id)
  );

  v_recipient_balance := public.apply_wallet_entry(
    v_reel.author_id,
    v_creator_coins,
    'gift_received',
    NULL,
    v_credit_key,
    jsonb_build_object('reel_id', p_reel_id, 'gift_id', p_gift_id, 'sender_profile_id', p_sender_profile_id)
  );

  INSERT INTO public.reel_gifts (
    reel_id,
    sender_profile_id,
    recipient_profile_id,
    gift_id,
    coin_amount,
    creator_coins,
    platform_fee_coins,
    idempotency_key
  )
  VALUES (
    p_reel_id,
    p_sender_profile_id,
    v_reel.author_id,
    p_gift_id,
    v_gift.coin_price,
    v_creator_coins,
    v_platform_fee,
    p_idempotency_key
  )
  RETURNING * INTO v_gift_row;

  RETURN jsonb_build_object(
    'duplicate', false,
    'gift', row_to_json(v_gift_row),
    'catalog', row_to_json(v_gift),
    'sender_balance_coins', v_sender_balance,
    'recipient_balance_coins', v_recipient_balance
  );
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RAISE;
  WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM public.reel_gifts
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    SELECT balance_coins INTO v_sender_balance
    FROM public.wallet_accounts
    WHERE profile_id = p_sender_profile_id;
    RETURN jsonb_build_object(
      'duplicate', true,
      'gift', row_to_json(v_existing),
      'sender_balance_coins', COALESCE(v_sender_balance, 0)
    );
END;
$$;

-- RLS: read-only catalog for authenticated users; wallets managed server-side only
ALTER TABLE public.gift_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_gifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gift_catalog_read ON public.gift_catalog;
CREATE POLICY gift_catalog_read ON public.gift_catalog
  FOR SELECT TO authenticated
  USING (active = true);

DROP POLICY IF EXISTS reel_gifts_read ON public.reel_gifts;
CREATE POLICY reel_gifts_read ON public.reel_gifts
  FOR SELECT TO authenticated
  USING (true);
