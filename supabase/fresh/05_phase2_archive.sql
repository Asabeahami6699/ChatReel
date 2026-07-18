-- Phase 2 cold history (optional on brand-new DBs).
-- Same content as supabase/phase2/01_messages_archive.sql — pasteable in SQL Editor.

CREATE TABLE IF NOT EXISTS public.messages_archive (
  LIKE public.messages INCLUDING DEFAULTS
);

ALTER TABLE public.messages_archive
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  ALTER TABLE public.messages_archive ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN invalid_table_definition THEN NULL;
  WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_messages_archive_created
  ON public.messages_archive(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_archive_group_created
  ON public.messages_archive(group_id, created_at DESC)
  WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_archive_direct_created
  ON public.messages_archive(sender_id, receiver_id, created_at DESC)
  WHERE group_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_archive_archived_at
  ON public.messages_archive(archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_unread_group
  ON public.messages(group_id, created_at DESC)
  WHERE group_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON TABLE public.messages_archive IS
  'Cold store for older messages moved out of messages by the archive job.';
