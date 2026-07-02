-- Extend realtime publication for invites, QR linking, and device links
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_invites;
ALTER PUBLICATION supabase_realtime ADD TABLE public.qr_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.linked_devices;
