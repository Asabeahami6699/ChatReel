-- Expand reel_sounds catalog: genres, moods, source tracking, and licensed seed tracks.

ALTER TABLE public.reel_sounds
  ADD COLUMN IF NOT EXISTS genre TEXT,
  ADD COLUMN IF NOT EXISTS mood TEXT,
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'licensed',
  ADD COLUMN IF NOT EXISTS source_reel_id UUID REFERENCES public.reels(id) ON DELETE SET NULL;

ALTER TABLE public.reel_sounds
  DROP CONSTRAINT IF EXISTS reel_sounds_source_type_check;

ALTER TABLE public.reel_sounds
  ADD CONSTRAINT reel_sounds_source_type_check
  CHECK (source_type IN ('licensed', 'ugc', 'extracted'));

CREATE INDEX IF NOT EXISTS idx_reel_sounds_genre
  ON public.reel_sounds (genre, usage_count DESC)
  WHERE is_active = true AND genre IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reel_sounds_mood
  ON public.reel_sounds (mood, usage_count DESC)
  WHERE is_active = true AND mood IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reel_sounds_source_reel
  ON public.reel_sounds (source_reel_id)
  WHERE source_reel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reel_sounds_new
  ON public.reel_sounds (created_at DESC)
  WHERE is_active = true;

-- Tag existing demo rows as licensed.
UPDATE public.reel_sounds
SET source_type = 'licensed'
WHERE source_type IS NULL OR source_type = 'licensed';

-- Royalty-free demo catalog (SoundHelix — replace with your licensed uploads in production).
INSERT INTO public.reel_sounds (title, artist, audio_url, preview_url, duration_sec, genre, mood, source_type, is_active)
SELECT v.title, v.artist, v.audio_url, v.preview_url, v.duration_sec, v.genre, v.mood, 'licensed', true
FROM (VALUES
  ('Sunrise Drive', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', 360::numeric, 'electronic', 'upbeat'),
  ('Neon Nights', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', 420::numeric, 'pop', 'energetic'),
  ('Golden Hour', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', 390::numeric, 'acoustic', 'chill'),
  ('City Lights', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', 300::numeric, 'hip-hop', 'groovy'),
  ('Ocean Breeze', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', 330::numeric, 'chill', 'relaxed'),
  ('Afro Pulse', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3', 340::numeric, 'afrobeats', 'upbeat'),
  ('Midnight Run', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3', 310::numeric, 'electronic', 'dark'),
  ('Soft Landing', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3', 280::numeric, 'r&b', 'smooth'),
  ('Island Heat', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3', 350::numeric, 'latin', 'dance'),
  ('Morning Coffee', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3', 320::numeric, 'acoustic', 'warm'),
  ('Skyline', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3', 360::numeric, 'pop', 'bright'),
  ('Low Key', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3', 290::numeric, 'hip-hop', 'chill'),
  ('Velvet Room', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3', 300::numeric, 'r&b', 'romantic'),
  ('Festival Drop', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3', 330::numeric, 'electronic', 'party'),
  ('Savanna Walk', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3', 340::numeric, 'afrobeats', 'groovy'),
  ('Rainy Window', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3', 270::numeric, 'chill', 'mellow')
) AS v(title, artist, audio_url, preview_url, duration_sec, genre, mood)
WHERE NOT EXISTS (
  SELECT 1 FROM public.reel_sounds s WHERE s.title = v.title AND s.artist = v.artist
);
