-- Group polls: question + options + votes, linked to a chat message.

create table if not exists public.group_polls (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.messages (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  question text not null,
  allows_multiple boolean not null default false,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  closes_at timestamptz null
);

create table if not exists public.group_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.group_polls (id) on delete cascade,
  label text not null,
  sort_order integer not null default 0
);

create table if not exists public.group_poll_votes (
  poll_id uuid not null references public.group_polls (id) on delete cascade,
  option_id uuid not null references public.group_poll_options (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id, option_id)
);

create index if not exists idx_group_polls_group on public.group_polls (group_id);
create index if not exists idx_group_poll_votes_poll on public.group_poll_votes (poll_id);

alter table public.group_polls enable row level security;
alter table public.group_poll_options enable row level security;
alter table public.group_poll_votes enable row level security;

comment on table public.group_polls is 'In-chat group polls (message_type = poll).';
