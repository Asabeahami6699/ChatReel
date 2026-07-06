-- TikTok-style reel sounds: library tracks + per-reel sound attachment.

CREATE TABLE IF NOT EXISTS public.reel_sounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  artist TEXT,
  audio_url TEXT NOT NULL,
  preview_url TEXT,
  duration_sec NUMERIC,
  cover_url TEXT,
  usage_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reel_sounds_active_usage
  ON public.reel_sounds (usage_count DESC, created_at DESC)
  WHERE is_active = true;

ALTER TABLE public.reels
  ADD COLUMN IF NOT EXISTS sound_id UUID REFERENCES public.reel_sounds(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sound_start_sec NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS original_audio_volume NUMERIC NOT NULL DEFAULT 1;

ALTER TABLE public.reels
  DROP CONSTRAINT IF EXISTS reels_original_audio_volume_check;

ALTER TABLE public.reels
  ADD CONSTRAINT reels_original_audio_volume_check
  CHECK (original_audio_volume >= 0 AND original_audio_volume <= 1);

CREATE INDEX IF NOT EXISTS idx_reels_sound_id ON public.reels(sound_id) WHERE sound_id IS NOT NULL;

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

-- Sample royalty-free tracks (SoundHelix — dev/demo; replace with your own uploads in production).
INSERT INTO public.reel_sounds (title, artist, audio_url, preview_url, duration_sec, is_active)
SELECT v.title, v.artist, v.audio_url, v.preview_url, v.duration_sec, true
FROM (VALUES
  ('Sunrise Drive', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', 360::numeric),
  ('Neon Nights', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', 420::numeric),
  ('Golden Hour', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', 390::numeric),
  ('City Lights', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', 300::numeric),
  ('Ocean Breeze', 'SoundHelix', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', 330::numeric)
) AS v(title, artist, audio_url, preview_url, duration_sec)
WHERE NOT EXISTS (SELECT 1 FROM public.reel_sounds LIMIT 1);
