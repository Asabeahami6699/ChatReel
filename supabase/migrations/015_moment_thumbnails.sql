-- Video moment preview thumbnails (frame extracted at upload time)

ALTER TABLE public.moments
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
