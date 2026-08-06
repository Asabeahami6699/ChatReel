-- Account-level privacy lock flags (synced across devices).

create table if not exists public.user_privacy_lock (
  user_id uuid primary key references auth.users (id) on delete cascade,
  app_lock_enabled boolean not null default false,
  chat_lock_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.user_privacy_lock enable row level security;

comment on table public.user_privacy_lock is
  'Account-wide app/chat lock toggles. Synced via API; unlock method stays device-local.';

-- Server uses service role; no direct client policies needed.
