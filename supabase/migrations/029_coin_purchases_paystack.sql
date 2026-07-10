-- Coin packages + payment purchase records (provider-agnostic schema)
CREATE TABLE IF NOT EXISTS public.coin_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  coins INTEGER NOT NULL CHECK (coins > 0),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'NGN',
  country_code TEXT NOT NULL DEFAULT 'NG',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slug, country_code)
);

INSERT INTO public.coin_packages (slug, label, coins, amount_minor, currency, country_code, sort_order)
VALUES
  ('starter', '100 coins', 100, 50000, 'NGN', 'NG', 1),
  ('popular', '550 coins', 550, 200000, 'NGN', 'NG', 2),
  ('pro', '1200 coins', 1200, 450000, 'NGN', 'NG', 3)
ON CONFLICT (slug, country_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.coin_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.coin_packages(id),
  payment_provider TEXT NOT NULL DEFAULT 'paystack'
    CHECK (payment_provider IN ('paystack', 'stripe')),
  payment_reference TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'NGN',
  coins INTEGER NOT NULL CHECK (coins > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payment_provider, payment_reference)
);

CREATE INDEX IF NOT EXISTS idx_coin_purchases_profile_created
  ON public.coin_purchases (profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coin_packages_country_active_sort
  ON public.coin_packages (country_code, active, sort_order);

ALTER TABLE public.coin_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coin_packages_read ON public.coin_packages;
CREATE POLICY coin_packages_read ON public.coin_packages
  FOR SELECT TO authenticated
  USING (active = true);
