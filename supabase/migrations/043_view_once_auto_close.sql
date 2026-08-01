-- Optional auto-close window (seconds) when a view-once media is opened.
alter table public.messages
  add column if not exists view_once_auto_close_sec integer null;

comment on column public.messages.view_once_auto_close_sec is
  'When set with view_once, the recipient viewer auto-closes after N seconds.';
