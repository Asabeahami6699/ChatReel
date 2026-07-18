-- =============================================================================
-- ChatReel fresh schema — SEEDS (run fourth)
-- =============================================================================

INSERT INTO public.gift_catalog (slug, name, emoji, coin_price, sort_order) VALUES
  ('rose', 'Rose', '🌹', 5, 1),
  ('heart', 'Heart', '💖', 10, 2),
  ('star', 'Star', '⭐', 25, 3),
  ('fire', 'Fire', '🔥', 50, 4),
  ('diamond', 'Diamond', '💎', 100, 5),
  ('crown', 'Crown', '👑', 500, 6)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.coin_packages (
  slug, label, coins, amount_minor, currency, country_code, sort_order, active
) VALUES
  ('starter', '100 coins', 100, 50000, 'NGN', 'NG', 1, true),
  ('popular', '550 coins', 550, 200000, 'NGN', 'NG', 2, true),
  ('pro', '1200 coins', 1200, 450000, 'NGN', 'NG', 3, true),
  ('starter', '100 coins', 100, 500, 'GHS', 'GH', 1, true),
  ('popular', '550 coins', 550, 2000, 'GHS', 'GH', 2, true),
  ('pro', '1200 coins', 1200, 4500, 'GHS', 'GH', 3, true)
ON CONFLICT (slug, country_code) DO NOTHING;

INSERT INTO public.payout_thresholds (
  country_code, currency, min_amount_minor, coin_to_fiat_minor, fee_flat_minor, fee_bps
) VALUES
  ('NG', 'NGN', 5000000, 500, 10000, 150),
  ('GH', 'GHS', 50000, 50, 100, 150),
  ('KE', 'KES', 1000000, 50, 10000, 150),
  ('ZA', 'ZAR', 100000, 50, 1000, 150)
ON CONFLICT (country_code) DO UPDATE SET
  currency = EXCLUDED.currency,
  min_amount_minor = EXCLUDED.min_amount_minor,
  coin_to_fiat_minor = EXCLUDED.coin_to_fiat_minor,
  fee_flat_minor = EXCLUDED.fee_flat_minor,
  fee_bps = EXCLUDED.fee_bps,
  active = true,
  updated_at = now();

-- Demo sounds (SoundHelix — replace in production)
INSERT INTO public.reel_sounds (title, artist, audio_url, preview_url, duration_sec, genre, mood, is_active)
SELECT v.title, v.artist, v.audio_url, v.preview_url, v.duration_sec, v.genre, v.mood, true
FROM (VALUES
  ('Sunrise Drive', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', 360::numeric, 'pop', 'upbeat'),
  ('Neon Nights', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', 420::numeric, 'electronic', 'energetic'),
  ('Golden Hour', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', 390::numeric, 'chill', 'warm'),
  ('City Lights', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', 300::numeric, 'pop', 'night'),
  ('Ocean Breeze', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', 330::numeric, 'ambient', 'calm'),
  ('Midnight Run', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3', 350::numeric, 'electronic', 'dark'),
  ('Soft Rain', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3', 310::numeric, 'ambient', 'soft'),
  ('Pulse Wave', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3', 340::numeric, 'electronic', 'hype')
) AS v(title, artist, audio_url, preview_url, duration_sec, genre, mood)
WHERE NOT EXISTS (
  SELECT 1 FROM public.reel_sounds s
  WHERE s.title = v.title AND COALESCE(s.artist, '') = COALESCE(v.artist, '')
);
