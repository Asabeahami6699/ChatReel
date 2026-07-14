-- Call tips/gifts (wallet debit/credit reuses gift_sent / gift_received ledger types).

CREATE TABLE IF NOT EXISTS public.call_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  sender_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  gift_id UUID NOT NULL REFERENCES public.gift_catalog(id),
  coin_amount INTEGER NOT NULL CHECK (coin_amount > 0),
  creator_coins INTEGER NOT NULL CHECK (creator_coins >= 0),
  platform_fee_coins INTEGER NOT NULL CHECK (platform_fee_coins >= 0),
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT call_gifts_idempotency_unique UNIQUE (idempotency_key),
  CHECK (sender_profile_id <> recipient_profile_id),
  CHECK (coin_amount = creator_coins + platform_fee_coins)
);

CREATE INDEX IF NOT EXISTS idx_call_gifts_call_created
  ON public.call_gifts (call_id, created_at DESC);

ALTER TABLE public.call_gifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS call_gifts_select_own ON public.call_gifts;
CREATE POLICY call_gifts_select_own ON public.call_gifts
  FOR SELECT USING (
    sender_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR recipient_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.send_call_gift(
  p_sender_profile_id UUID,
  p_call_id UUID,
  p_recipient_user_id UUID,
  p_gift_id UUID,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.call_gifts%ROWTYPE;
  v_gift public.gift_catalog%ROWTYPE;
  v_call public.calls%ROWTYPE;
  v_recipient_profile_id UUID;
  v_creator_coins INTEGER;
  v_platform_fee INTEGER;
  v_gift_row public.call_gifts%ROWTYPE;
  v_sender_balance BIGINT;
  v_recipient_balance BIGINT;
  v_debit_key TEXT;
  v_credit_key TEXT;
  v_part_ok BOOLEAN;
BEGIN
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'invalid_idempotency_key' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_existing
  FROM public.call_gifts
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

  SELECT * INTO v_call
  FROM public.calls
  WHERE id = p_call_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'call_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_call.status NOT IN ('ringing', 'accepted') THEN
    RAISE EXCEPTION 'call_not_active' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.call_participants
    WHERE call_id = p_call_id
      AND user_id = (SELECT user_id FROM public.profiles WHERE id = p_sender_profile_id)
      AND state = 'joined'
  ) INTO v_part_ok;
  IF NOT v_part_ok THEN
    RAISE EXCEPTION 'not_in_call' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_recipient_profile_id
  FROM public.profiles
  WHERE user_id = p_recipient_user_id;
  IF v_recipient_profile_id IS NULL THEN
    RAISE EXCEPTION 'recipient_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_recipient_profile_id = p_sender_profile_id THEN
    RAISE EXCEPTION 'cannot_gift_self' USING ERRCODE = 'P0001';
  END IF;

  v_creator_coins := floor(v_gift.coin_price * 0.6)::INTEGER;
  v_platform_fee := v_gift.coin_price - v_creator_coins;

  PERFORM public.ensure_wallet_account(p_sender_profile_id);
  PERFORM public.ensure_wallet_account(v_recipient_profile_id);

  v_debit_key := 'call-gift-debit:' || p_idempotency_key;
  v_credit_key := 'call-gift-credit:' || p_idempotency_key;

  v_sender_balance := public.apply_wallet_entry(
    p_sender_profile_id,
    -v_gift.coin_price,
    'gift_sent',
    NULL,
    v_debit_key,
    jsonb_build_object('call_id', p_call_id, 'gift_id', p_gift_id)
  );

  v_recipient_balance := public.apply_wallet_entry(
    v_recipient_profile_id,
    v_creator_coins,
    'gift_received',
    NULL,
    v_credit_key,
    jsonb_build_object('call_id', p_call_id, 'gift_id', p_gift_id, 'sender_profile_id', p_sender_profile_id)
  );

  INSERT INTO public.call_gifts (
    call_id,
    sender_profile_id,
    recipient_profile_id,
    gift_id,
    coin_amount,
    creator_coins,
    platform_fee_coins,
    idempotency_key
  )
  VALUES (
    p_call_id,
    p_sender_profile_id,
    v_recipient_profile_id,
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
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_call_gift(UUID, UUID, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_call_gift(UUID, UUID, UUID, UUID, TEXT) TO service_role;
