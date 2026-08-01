-- Expand trusted devices into a full login-device registry with revoke support.
alter table public.account_trusted_devices
  add column if not exists revoked_at timestamptz null;

alter table public.account_trusted_devices
  add column if not exists platform text null;

alter table public.account_trusted_devices
  add column if not exists device_name text null;

comment on column public.account_trusted_devices.revoked_at is
  'When set, that installation must sign out locally on next heartbeat.';
