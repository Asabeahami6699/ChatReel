-- ChatApp initial schema (recreated from frontend usage)
-- Run in Supabase SQL Editor or via Supabase CLI

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles (linked to Supabase Auth users)
-- friendships.user_id / friend_id reference profiles.id (NOT auth user id)
-- messages.sender_id / receiver_id use auth.users.id
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT DEFAULT '',
  email TEXT,
  avatar_url TEXT,
  bio TEXT,
  country TEXT,
  region TEXT,
  language TEXT,
  status TEXT DEFAULT 'Offline' CHECK (status IN ('Online', 'Offline')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_display_name ON public.profiles(display_name);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- ---------------------------------------------------------------------------
-- Friendships (profile id ↔ profile id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, friend_id),
  CHECK (user_id <> friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON public.friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON public.friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status ON public.friendships(status);

-- ---------------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_groups_creator_id ON public.groups(creator_id);

CREATE TABLE IF NOT EXISTS public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('creator', 'admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON public.group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON public.group_members(user_id);

CREATE TABLE IF NOT EXISTS public.group_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_invites_token ON public.group_invites(token);
CREATE INDEX IF NOT EXISTS idx_group_invites_group_id ON public.group_invites(group_id);

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  file_url TEXT,
  file_name TEXT,
  file_type TEXT,
  audio_url TEXT,
  audio_duration INTEGER,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  plaintext BOOLEAN DEFAULT true,
  iv TEXT,
  ephemeral_public_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (receiver_id IS NOT NULL AND group_id IS NULL)
    OR (receiver_id IS NULL AND group_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON public.messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_group_id ON public.messages(group_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at DESC);

-- ---------------------------------------------------------------------------
-- E2EE keys
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.public_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('identity', 'signed_prekey')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_keys_user_id ON public.public_keys(user_id);

CREATE TABLE IF NOT EXISTS public.one_time_prekeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_one_time_prekeys_user_id ON public.one_time_prekeys(user_id);

-- ---------------------------------------------------------------------------
-- QR device linking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.qr_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ref TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.linked_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Auto-create profile on signup
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1), '')
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security (frontend uses Realtime with Supabase Auth JWT)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.one_time_prekeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linked_devices ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Friendships (via own profile)
CREATE POLICY "friendships_select_own" ON public.friendships
  FOR SELECT TO authenticated
  USING (
    user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR friend_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Groups
CREATE POLICY "groups_select_member_or_public" ON public.groups
  FOR SELECT TO authenticated
  USING (
    is_public = true
    OR creator_id = auth.uid()
    OR id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

CREATE POLICY "group_members_select" ON public.group_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR group_id IN (SELECT group_id FROM public.group_members gm WHERE gm.user_id = auth.uid())
  );

CREATE POLICY "group_invites_select" ON public.group_invites
  FOR SELECT TO authenticated USING (true);

-- Messages
CREATE POLICY "messages_select_own" ON public.messages
  FOR SELECT TO authenticated
  USING (
    sender_id = auth.uid()
    OR receiver_id = auth.uid()
    OR group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

-- Public keys readable by authenticated users
CREATE POLICY "public_keys_select" ON public.public_keys
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "one_time_prekeys_select" ON public.one_time_prekeys
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "qr_sessions_select" ON public.qr_sessions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "linked_devices_select_own" ON public.linked_devices
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR linked_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime publication
-- ---------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
ALTER PUBLICATION supabase_realtime ADD TABLE public.groups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- ---------------------------------------------------------------------------
-- Storage buckets (create in Supabase Dashboard → Storage if SQL fails)
-- avatars, group_avatar, chat-files — all public read recommended for MVP
-- ---------------------------------------------------------------------------
