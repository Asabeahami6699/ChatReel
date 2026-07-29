-- Per-chat disappearing timer (seconds). Timer starts when a message is read.
ALTER TABLE public.chat_preferences
  ADD COLUMN IF NOT EXISTS disappear_after_seconds INTEGER
  CHECK (
    disappear_after_seconds IS NULL
    OR disappear_after_seconds IN (60, 1800, 86400, 604800, 2592000, 7776000)
  );
