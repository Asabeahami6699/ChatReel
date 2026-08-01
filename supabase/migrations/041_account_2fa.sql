-- Account 2FA (secret code) + security-question recovery + trusted devices.

create table if not exists public.account_2fa (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pin_hash text not null,
  pin_salt text not null,
  security_question text not null,
  answer_hash text not null,
  answer_salt text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.account_trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  installation_id text not null,
  label text,
  trusted_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, installation_id)
);

create index if not exists account_trusted_devices_user_idx
  on public.account_trusted_devices (user_id);

alter table public.account_2fa enable row level security;
alter table public.account_trusted_devices enable row level security;

-- Server uses service role; no direct client policies needed.
