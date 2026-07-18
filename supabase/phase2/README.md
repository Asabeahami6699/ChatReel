# Phase 2 SQL

Apply on a DB that already ran `supabase/fresh/01–04`:

1. Open Supabase SQL Editor
2. Paste and run `01_messages_archive.sql`

Creates `messages_archive` + an extra hot-table group index.

The API archive job (`MESSAGE_ARCHIVE_*` env) moves old read/group rows from `messages` → `messages_archive` in batches.
