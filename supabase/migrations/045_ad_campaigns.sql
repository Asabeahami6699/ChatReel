-- First-party sponsored inventory for Reels / Explore injection.
create table if not exists public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  advertiser_name text not null,
  caption text null,
  media_url text not null,
  media_type text not null default 'video'
    check (media_type in ('video', 'image')),
  thumbnail_url text null,
  avatar_url text null,
  cta_url text null,
  cta_label text not null default 'Learn more',
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'ended')),
  starts_at timestamptz null,
  ends_at timestamptz null,
  priority int not null default 0,
  impression_count bigint not null default 0,
  click_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ad_campaigns_active_priority_idx
  on public.ad_campaigns (priority desc, created_at desc)
  where status = 'active';

create table if not exists public.ad_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.ad_campaigns (id) on delete cascade,
  profile_id uuid null references public.profiles (id) on delete set null,
  event_type text not null check (event_type in ('impression', 'click', 'cta')),
  placement text not null default 'reels_feed',
  created_at timestamptz not null default now()
);

create index if not exists ad_events_campaign_created_idx
  on public.ad_events (campaign_id, created_at desc);

alter table public.ad_campaigns enable row level security;
alter table public.ad_events enable row level security;

comment on table public.ad_campaigns is
  'Sponsored creatives injected into For You / Explore; managed via backend admin API.';
comment on table public.ad_events is
  'Impression and CTA click events for sponsored campaigns.';

create or replace function public.increment_ad_impression(p_campaign_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ad_campaigns
  set impression_count = impression_count + 1,
      updated_at = now()
  where id = p_campaign_id;
$$;

create or replace function public.increment_ad_click(p_campaign_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ad_campaigns
  set click_count = click_count + 1,
      updated_at = now()
  where id = p_campaign_id;
$$;
