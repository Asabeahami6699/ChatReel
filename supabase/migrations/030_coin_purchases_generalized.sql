-- Upgrade legacy Paystack-specific schema (skip when 029 already created generalized tables)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'coin_purchases' AND column_name = 'paystack_reference'
  ) THEN
    ALTER TABLE public.coin_purchases RENAME COLUMN paystack_reference TO payment_reference;
  END IF;
END $$;

ALTER TABLE public.coin_packages
  ADD COLUMN IF NOT EXISTS country_code TEXT NOT NULL DEFAULT 'NG';

UPDATE public.coin_packages SET country_code = 'NG' WHERE country_code IS NULL OR country_code = '';

ALTER TABLE public.coin_packages DROP CONSTRAINT IF EXISTS coin_packages_slug_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_coin_packages_slug_country
  ON public.coin_packages (slug, country_code);

CREATE INDEX IF NOT EXISTS idx_coin_packages_country_active_sort
  ON public.coin_packages (country_code, active, sort_order);

INSERT INTO public.coin_packages (slug, label, coins, amount_minor, currency, country_code, sort_order)
VALUES
  ('starter', '100 coins', 100, 500, 'GHS', 'GH', 1),
  ('popular', '550 coins', 550, 2000, 'GHS', 'GH', 2),
  ('pro', '1200 coins', 1200, 4500, 'GHS', 'GH', 3)
ON CONFLICT (slug, country_code) DO NOTHING;

ALTER TABLE public.coin_purchases
  ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'paystack';

ALTER TABLE public.coin_purchases
  DROP CONSTRAINT IF EXISTS coin_purchases_paystack_reference_key;

ALTER TABLE public.coin_purchases
  DROP CONSTRAINT IF EXISTS coin_purchases_payment_reference_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_coin_purchases_payment_ref
  ON public.coin_purchases (payment_provider, payment_reference);

ALTER TABLE public.coin_purchases DROP CONSTRAINT IF EXISTS coin_purchases_payment_provider_check;
ALTER TABLE public.coin_purchases
  ADD CONSTRAINT coin_purchases_payment_provider_check
  CHECK (payment_provider IN ('paystack', 'stripe'));
