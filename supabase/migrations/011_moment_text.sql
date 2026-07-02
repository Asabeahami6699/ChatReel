-- Text-only moments with selectable backgrounds

ALTER TABLE public.moments
  ALTER COLUMN media_url DROP NOT NULL;

ALTER TABLE public.moments
  DROP CONSTRAINT IF EXISTS moments_media_type_check;

ALTER TABLE public.moments
  ADD CONSTRAINT moments_media_type_check
  CHECK (media_type IN ('image', 'video', 'text'));

ALTER TABLE public.moments
  ADD COLUMN IF NOT EXISTS text_background TEXT;
