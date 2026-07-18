-- =============================================================================
-- ChatReel fresh schema — FUNCTIONS & TRIGGERS (run second)
-- =============================================================================

-- Auto profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  meta_name TEXT;
  fallback_name TEXT;
BEGIN
  meta_name := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'display_name', '')), '');
  fallback_name := COALESCE(
    meta_name,
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    NULLIF(NEW.phone, ''),
    'User'
  );

  INSERT INTO public.profiles (user_id, email, phone, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.phone, ''),
    fallback_name
  )
  ON CONFLICT (user_id) DO UPDATE
    SET
      email = COALESCE(EXCLUDED.email, public.profiles.email),
      phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
      display_name = CASE
        WHEN public.profiles.display_name IS NULL OR public.profiles.display_name = ''
          THEN EXCLUDED.display_name
        ELSE public.profiles.display_name
      END,
      updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.is_friend_of_me(target_profile_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.friendships f
    JOIN public.profiles me ON me.user_id = auth.uid()
    WHERE f.status = 'accepted'
      AND (
        (f.user_id = me.id AND f.friend_id = target_profile_id)
        OR
        (f.friend_id = me.id AND f.user_id = target_profile_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.my_profile_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;


-- ===== Counter / lifecycle triggers =====

CREATE OR REPLACE FUNCTION public.bump_reel_like_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reels SET like_count = like_count + 1, updated_at = now() WHERE id = NEW.reel_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.reels SET like_count = GREATEST(like_count - 1, 0), updated_at = now() WHERE id = OLD.reel_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_reel_likes_count ON public.reel_likes;
CREATE TRIGGER trg_reel_likes_count AFTER INSERT OR DELETE ON public.reel_likes
  FOR EACH ROW EXECUTE FUNCTION public.bump_reel_like_count();

CREATE OR REPLACE FUNCTION public.bump_reel_comment_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reels SET comment_count = comment_count + 1, updated_at = now() WHERE id = NEW.reel_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.reels SET comment_count = GREATEST(comment_count - 1, 0), updated_at = now() WHERE id = OLD.reel_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_reel_comments_count ON public.reel_comments;
CREATE TRIGGER trg_reel_comments_count AFTER INSERT OR DELETE ON public.reel_comments
  FOR EACH ROW EXECUTE FUNCTION public.bump_reel_comment_count();

CREATE OR REPLACE FUNCTION public.bump_reel_view_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.reels SET view_count = view_count + 1 WHERE id = NEW.reel_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_reel_views_count ON public.reel_views;
CREATE TRIGGER trg_reel_views_count AFTER INSERT ON public.reel_views
  FOR EACH ROW EXECUTE FUNCTION public.bump_reel_view_count();

CREATE OR REPLACE FUNCTION public.calls_lifecycle_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'ringing' AND NEW.started_at IS NULL THEN
    NEW.started_at = now();
  END IF;
  IF NEW.status IN ('ended', 'declined', 'missed', 'cancelled')
     AND OLD.status NOT IN ('ended', 'declined', 'missed', 'cancelled')
  THEN
    IF NEW.ended_at IS NULL THEN NEW.ended_at = now(); END IF;
    IF NEW.started_at IS NOT NULL AND NEW.duration_seconds IS NULL THEN
      NEW.duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))::INT);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_calls_lifecycle ON public.calls;
CREATE TRIGGER trg_calls_lifecycle BEFORE UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.calls_lifecycle_trigger();


-- ===== From prior migrations (final versions) =====

-- source: 023_reel_sounds.sql:34-66

CREATE OR REPLACE FUNCTION public.bump_reel_sound_usage()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.sound_id IS NOT NULL THEN
    UPDATE public.reel_sounds
    SET usage_count = usage_count + 1
    WHERE id = NEW.sound_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.sound_id IS DISTINCT FROM NEW.sound_id THEN
      IF OLD.sound_id IS NOT NULL THEN
        UPDATE public.reel_sounds
        SET usage_count = GREATEST(usage_count - 1, 0)
        WHERE id = OLD.sound_id;
      END IF;
      IF NEW.sound_id IS NOT NULL THEN
        UPDATE public.reel_sounds
        SET usage_count = usage_count + 1
        WHERE id = NEW.sound_id;
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.sound_id IS NOT NULL THEN
    UPDATE public.reel_sounds
    SET usage_count = GREATEST(usage_count - 1, 0)
    WHERE id = OLD.sound_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_reel_sound_usage ON public.reels;
CREATE TRIGGER trg_reel_sound_usage
  AFTER INSERT OR UPDATE OF sound_id OR DELETE ON public.reels
  FOR EACH ROW EXECUTE FUNCTION public.bump_reel_sound_usage();

-- source: 025_reel_schedule_comment_likes.sql:31-50

CREATE OR REPLACE FUNCTION public.bump_reel_comment_like_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reel_comments SET like_count = like_count + 1 WHERE id = NEW.comment_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.reel_comments SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_reel_comment_likes_count ON public.reel_comment_likes;
CREATE TRIGGER trg_reel_comment_likes_count
  AFTER INSERT OR DELETE ON public.reel_comment_likes
  FOR EACH ROW EXECUTE FUNCTION public.bump_reel_comment_like_count();

-- source: 026_moment_sounds.sql:25-57

CREATE OR REPLACE FUNCTION public.bump_reel_sound_usage_from_moments()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.sound_id IS NOT NULL THEN
    UPDATE public.reel_sounds
    SET usage_count = usage_count + 1
    WHERE id = NEW.sound_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.sound_id IS DISTINCT FROM NEW.sound_id THEN
      IF OLD.sound_id IS NOT NULL THEN
        UPDATE public.reel_sounds
        SET usage_count = GREATEST(usage_count - 1, 0)
        WHERE id = OLD.sound_id;
      END IF;
      IF NEW.sound_id IS NOT NULL THEN
        UPDATE public.reel_sounds
        SET usage_count = usage_count + 1
        WHERE id = NEW.sound_id;
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.sound_id IS NOT NULL THEN
    UPDATE public.reel_sounds
    SET usage_count = GREATEST(usage_count - 1, 0)
    WHERE id = OLD.sound_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS moments_sound_usage ON public.moments;
CREATE TRIGGER moments_sound_usage
  AFTER INSERT OR UPDATE OF sound_id OR DELETE ON public.moments
  FOR EACH ROW EXECUTE FUNCTION public.bump_reel_sound_usage_from_moments();

-- source: 028_reel_gifts_wallet.sql:96-383

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
-- Wallet helpers (SECURITY DEFINER â€” only callable from service role / RPC)
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

-- source: 031_wallet_payouts.sql:55-142 (final apply_wallet_entry)

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

-- source: 031_wallet_payouts.sql:242-462

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

-- source: 033_call_gifts.sql:31-175

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

