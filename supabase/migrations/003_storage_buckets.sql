-- Public storage buckets for uploads (avatars, groups, chat files).
-- Safe to re-run: skips buckets that already exist.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('avatars', 'avatars', true, 5242880),
  ('group_avatar', 'group_avatar', true, 5242880),
  ('chat-files', 'chat-files', true, 52428880)
ON CONFLICT (id) DO NOTHING;
