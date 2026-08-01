-- Bump session_epoch to invalidate sessions after "log out other devices" / remote wipe.
alter table public.profiles
  add column if not exists session_epoch integer not null default 0;

comment on column public.profiles.session_epoch is
  'Incremented to force re-auth on all devices after logout-others / remote wipe.';
