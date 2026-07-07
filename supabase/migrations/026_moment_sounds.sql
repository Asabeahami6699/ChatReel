-- Background music on video moments (reuses reel_sounds library).

ALTER TABLE public.moments
  ADD COLUMN IF NOT EXISTS sound_id UUID REFERENCES public.reel_sounds(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sound_start_sec NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS original_audio_volume NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sound_volume NUMERIC NOT NULL DEFAULT 0.45;

ALTER TABLE public.moments
  DROP CONSTRAINT IF EXISTS moments_original_audio_volume_check;

ALTER TABLE public.moments
  ADD CONSTRAINT moments_original_audio_volume_check
  CHECK (original_audio_volume >= 0 AND original_audio_volume <= 1);

ALTER TABLE public.moments
  DROP CONSTRAINT IF EXISTS moments_sound_volume_check;

ALTER TABLE public.moments
  ADD CONSTRAINT moments_sound_volume_check
  CHECK (sound_volume >= 0 AND sound_volume <= 1);

CREATE INDEX IF NOT EXISTS idx_moments_sound_id ON public.moments(sound_id) WHERE sound_id IS NOT NULL;

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
