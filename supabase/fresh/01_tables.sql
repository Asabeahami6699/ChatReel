-- =============================================================================
-- ChatReel fresh schema — TABLES (run first on an empty Supabase project)
-- Inferred from production dump + wallet/payout/call extras from app migrations.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles (ringtone FK added after user_ringtones)
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT DEFAULT '',
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  bio TEXT,
  country TEXT,
  region TEXT,
  language TEXT,
  status TEXT DEFAULT 'Offline' CHECK (status IN ('Online', 'Offline')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ,
  CONSTRAINT profiles_phone_e164_check
    CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$')
);

CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX idx_profiles_display_name ON public.profiles(display_name);
CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE UNIQUE INDEX profiles_phone_unique ON public.profiles(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_profiles_phone ON public.profiles(phone) WHERE phone IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Social / groups
-- ---------------------------------------------------------------------------
CREATE TABLE public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, friend_id),
  CHECK (user_id <> friend_id)
);

CREATE INDEX idx_friendships_user_id ON public.friendships(user_id);
CREATE INDEX idx_friendships_friend_id ON public.friendships(friend_id);
CREATE INDEX idx_friendships_status ON public.friendships(status);

CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_groups_creator_id ON public.groups(creator_id);

CREATE TABLE public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('creator', 'admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

CREATE INDEX idx_group_members_group_id ON public.group_members(group_id);
CREATE INDEX idx_group_members_user_id ON public.group_members(user_id);

CREATE TABLE public.group_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_group_invites_token ON public.group_invites(token);
CREATE INDEX idx_group_invites_group_id ON public.group_invites(group_id);

-- ---------------------------------------------------------------------------
-- Messages (+ client_message_id for idempotent / offline sends)
-- ---------------------------------------------------------------------------
CREATE TABLE public.messages (
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
  reel_id UUID,          -- FK added after reels
  moment_id UUID,        -- FK added after moments
  reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  view_once BOOLEAN NOT NULL DEFAULT false,
  viewed_at TIMESTAMPTZ,
  -- Client-generated id so retries do not insert duplicates
  client_message_id TEXT,
  CHECK (
    (receiver_id IS NOT NULL AND group_id IS NULL)
    OR (receiver_id IS NULL AND group_id IS NOT NULL)
  )
);

CREATE INDEX idx_messages_sender_id ON public.messages(sender_id);
CREATE INDEX idx_messages_receiver_id ON public.messages(receiver_id);
CREATE INDEX idx_messages_group_id ON public.messages(group_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);
CREATE INDEX idx_messages_group_created ON public.messages(group_id, created_at DESC)
  WHERE group_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_messages_direct_created
  ON public.messages(sender_id, receiver_id, created_at DESC)
  WHERE group_id IS NULL AND deleted_at IS NULL;
CREATE INDEX idx_messages_unread_direct
  ON public.messages(receiver_id, created_at DESC)
  WHERE group_id IS NULL AND is_read = false AND deleted_at IS NULL;
CREATE INDEX idx_messages_expires_at ON public.messages(expires_at)
  WHERE expires_at IS NOT NULL;
CREATE UNIQUE INDEX idx_messages_client_message_id
  ON public.messages(sender_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- E2EE keys + device linking + push
-- ---------------------------------------------------------------------------
CREATE TABLE public.public_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('identity', 'signed_prekey')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_public_keys_user_id ON public.public_keys(user_id);

CREATE TABLE public.one_time_prekeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_one_time_prekeys_user_id ON public.one_time_prekeys(user_id);

CREATE TABLE public.qr_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ref TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.linked_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);
CREATE INDEX idx_push_tokens_user_id ON public.push_tokens(user_id);

-- ---------------------------------------------------------------------------
-- Reel sounds (source_reel_id FK after reels)
-- ---------------------------------------------------------------------------
CREATE TABLE public.reel_sounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  artist TEXT,
  audio_url TEXT NOT NULL,
  preview_url TEXT,
  duration_sec NUMERIC,
  cover_url TEXT,
  usage_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  genre TEXT,
  mood TEXT,
  source_type TEXT NOT NULL DEFAULT 'licensed'
    CHECK (source_type IN ('licensed', 'ugc', 'extracted')),
  source_reel_id UUID
);

CREATE INDEX idx_reel_sounds_active_usage
  ON public.reel_sounds(usage_count DESC, created_at DESC) WHERE is_active;
CREATE INDEX idx_reel_sounds_uploaded_by
  ON public.reel_sounds(uploaded_by, created_at DESC) WHERE uploaded_by IS NOT NULL;
CREATE INDEX idx_reel_sounds_genre
  ON public.reel_sounds(genre, usage_count DESC) WHERE is_active AND genre IS NOT NULL;
CREATE INDEX idx_reel_sounds_mood
  ON public.reel_sounds(mood, usage_count DESC) WHERE is_active AND mood IS NOT NULL;
CREATE INDEX idx_reel_sounds_new
  ON public.reel_sounds(created_at DESC) WHERE is_active;

-- ---------------------------------------------------------------------------
-- Reels
-- ---------------------------------------------------------------------------
CREATE TABLE public.reels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  caption TEXT,
  duration NUMERIC,
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'friends', 'private', 'group')),
  width INTEGER,
  height INTEGER,
  view_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hls_url TEXT,
  transcode_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (transcode_status IN ('pending', 'processing', 'ready', 'failed', 'skipped')),
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  moderation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'flagged')),
  moderation_reason TEXT,
  moderation_score NUMERIC,
  sound_id UUID REFERENCES public.reel_sounds(id) ON DELETE SET NULL,
  sound_start_sec NUMERIC NOT NULL DEFAULT 0,
  original_audio_volume NUMERIC NOT NULL DEFAULT 1
    CHECK (original_audio_volume >= 0 AND original_audio_volume <= 1),
  scheduled_publish_at TIMESTAMPTZ,
  sound_volume NUMERIC NOT NULL DEFAULT 1
    CHECK (sound_volume >= 0 AND sound_volume <= 1),
  gift_count INTEGER NOT NULL DEFAULT 0,
  gift_coin_total BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_reels_author_id ON public.reels(author_id);
CREATE INDEX idx_reels_created_at ON public.reels(created_at DESC, id DESC);
CREATE INDEX idx_reels_visibility ON public.reels(visibility);
CREATE INDEX idx_reels_visibility_created
  ON public.reels(visibility, created_at DESC) WHERE visibility = 'public';
CREATE INDEX idx_reels_transcode_status ON public.reels(transcode_status);
CREATE INDEX idx_reels_group_id ON public.reels(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX idx_reels_moderation_feed
  ON public.reels(moderation_status, created_at DESC) WHERE moderation_status = 'approved';
CREATE INDEX idx_reels_sound_id ON public.reels(sound_id) WHERE sound_id IS NOT NULL;
CREATE INDEX idx_reels_scheduled_publish
  ON public.reels(scheduled_publish_at) WHERE scheduled_publish_at IS NOT NULL;

ALTER TABLE public.reel_sounds
  ADD CONSTRAINT reel_sounds_source_reel_id_fkey
  FOREIGN KEY (source_reel_id) REFERENCES public.reels(id) ON DELETE SET NULL;
CREATE INDEX idx_reel_sounds_source_reel
  ON public.reel_sounds(source_reel_id) WHERE source_reel_id IS NOT NULL;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_reel_id_fkey
  FOREIGN KEY (reel_id) REFERENCES public.reels(id) ON DELETE SET NULL;
CREATE INDEX idx_messages_reel_id ON public.messages(reel_id);

CREATE TABLE public.reel_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reel_id, user_id)
);
CREATE INDEX idx_reel_likes_reel_id ON public.reel_likes(reel_id);
CREATE INDEX idx_reel_likes_user_id ON public.reel_likes(user_id);

CREATE TABLE public.reel_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  parent_id UUID REFERENCES public.reel_comments(id) ON DELETE CASCADE,
  like_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_reel_comments_reel_created ON public.reel_comments(reel_id, created_at DESC);
CREATE INDEX idx_reel_comments_user_id ON public.reel_comments(user_id);
CREATE INDEX idx_reel_comments_parent ON public.reel_comments(parent_id);

CREATE TABLE public.reel_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reel_id, user_id)
);
CREATE INDEX idx_reel_views_reel_id ON public.reel_views(reel_id);

CREATE TABLE public.reel_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  thumbnail_url TEXT,
  duration NUMERIC,
  width INTEGER,
  height INTEGER,
  hls_url TEXT,
  transcode_status TEXT NOT NULL DEFAULT 'skipped'
    CHECK (transcode_status IN ('pending', 'processing', 'ready', 'failed', 'skipped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reel_id, position)
);
CREATE INDEX idx_reel_media_reel_id ON public.reel_media(reel_id, position);

CREATE TABLE public.reel_comment_likes (
  comment_id UUID NOT NULL REFERENCES public.reel_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);
CREATE INDEX idx_reel_comment_likes_user ON public.reel_comment_likes(user_id);

CREATE TABLE public.reel_engagement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'view', 'skip', 'pause', 'completion', 'rewatch', 'like', 'save',
    'share', 'comment', 'follow', 'not_interested'
  )),
  completion_rate REAL,
  watch_ms INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reel_engagement_profile_created
  ON public.reel_engagement_events(profile_id, created_at DESC);
CREATE INDEX idx_reel_engagement_reel_type
  ON public.reel_engagement_events(reel_id, event_type);

CREATE TABLE public.reel_not_interested (
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, reel_id)
);

CREATE TABLE public.reel_saves (
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, reel_id)
);
CREATE INDEX idx_reel_saves_profile ON public.reel_saves(profile_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Moments
-- ---------------------------------------------------------------------------
CREATE TABLE public.moments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  media_url TEXT,
  media_type TEXT NOT NULL DEFAULT 'image'
    CHECK (media_type IN ('image', 'video', 'text', 'reel')),
  caption TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 1440
    CHECK (duration_minutes >= 10 AND duration_minutes <= 1440),
  expires_at TIMESTAMPTZ NOT NULL,
  view_once BOOLEAN NOT NULL DEFAULT false,
  audience_mode TEXT NOT NULL DEFAULT 'friends'
    CHECK (audience_mode IN ('friends', 'only', 'except')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  text_background TEXT,
  reel_id UUID REFERENCES public.reels(id) ON DELETE SET NULL,
  thumbnail_url TEXT,
  sound_id UUID REFERENCES public.reel_sounds(id) ON DELETE SET NULL,
  sound_start_sec NUMERIC NOT NULL DEFAULT 0,
  original_audio_volume NUMERIC NOT NULL DEFAULT 1
    CHECK (original_audio_volume >= 0 AND original_audio_volume <= 1),
  sound_volume NUMERIC NOT NULL DEFAULT 0.45
    CHECK (sound_volume >= 0 AND sound_volume <= 1)
);

CREATE INDEX idx_moments_author_id ON public.moments(author_id);
CREATE INDEX idx_moments_expires_at ON public.moments(expires_at);
CREATE INDEX idx_moments_group_id ON public.moments(group_id);
CREATE INDEX idx_moments_reel_id ON public.moments(reel_id);
CREATE INDEX idx_moments_sound_id ON public.moments(sound_id) WHERE sound_id IS NOT NULL;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_moment_id_fkey
  FOREIGN KEY (moment_id) REFERENCES public.moments(id) ON DELETE SET NULL;
CREATE INDEX idx_messages_moment_id ON public.messages(moment_id) WHERE moment_id IS NOT NULL;

CREATE TABLE public.moment_audience (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id UUID NOT NULL REFERENCES public.moments(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rule TEXT NOT NULL CHECK (rule IN ('include', 'exclude')),
  UNIQUE (moment_id, profile_id)
);
CREATE INDEX idx_moment_audience_moment_id ON public.moment_audience(moment_id);

CREATE TABLE public.moment_views (
  moment_id UUID NOT NULL REFERENCES public.moments(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (moment_id, viewer_id)
);
CREATE INDEX idx_moment_views_viewer_id ON public.moment_views(viewer_id);

CREATE TABLE public.moment_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id UUID NOT NULL REFERENCES public.moments(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL
    CHECK (char_length(TRIM(BOTH FROM body)) > 0 AND char_length(body) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_moment_replies_moment_id ON public.moment_replies(moment_id);
CREATE INDEX idx_moment_replies_author_id ON public.moment_replies(author_id);

-- ---------------------------------------------------------------------------
-- Chat extras
-- ---------------------------------------------------------------------------
CREATE TABLE public.chat_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id UUID NOT NULL,
  chat_type TEXT NOT NULL CHECK (chat_type IN ('individual', 'group')),
  muted_until TIMESTAMPTZ,
  wallpaper TEXT,
  cleared_at TIMESTAMPTZ,
  starred_message_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, chat_id, chat_type)
);
CREATE INDEX idx_chat_preferences_user ON public.chat_preferences(user_id);

CREATE TABLE public.message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);
CREATE INDEX idx_message_reactions_message ON public.message_reactions(message_id);

CREATE TABLE public.pinned_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  pinned_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, message_id)
);
CREATE INDEX idx_pinned_messages_group ON public.pinned_messages(group_id);

CREATE TABLE public.message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);
CREATE INDEX idx_message_reads_message ON public.message_reads(message_id);
CREATE INDEX idx_message_reads_user ON public.message_reads(user_id);

-- ---------------------------------------------------------------------------
-- Calls (+ hold / waiting)
-- ---------------------------------------------------------------------------
CREATE TABLE public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_name TEXT NOT NULL UNIQUE,
  call_type TEXT NOT NULL DEFAULT 'voice' CHECK (call_type IN ('voice', 'video')),
  scope TEXT NOT NULL DEFAULT 'direct' CHECK (scope IN ('direct', 'group')),
  caller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  callee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ringing'
    CHECK (status IN ('ringing', 'accepted', 'declined', 'missed', 'ended', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  metadata JSONB,
  CHECK (
    (scope = 'direct' AND callee_id IS NOT NULL AND group_id IS NULL)
    OR (scope = 'group' AND group_id IS NOT NULL AND callee_id IS NULL)
  )
);

CREATE INDEX idx_calls_caller_id ON public.calls(caller_id);
CREATE INDEX idx_calls_callee_id ON public.calls(callee_id);
CREATE INDEX idx_calls_group_id ON public.calls(group_id);
CREATE INDEX idx_calls_status ON public.calls(status);
CREATE INDEX idx_calls_created_at ON public.calls(created_at DESC);

CREATE TABLE public.call_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  state TEXT NOT NULL DEFAULT 'invited'
    CHECK (state IN ('invited', 'joined', 'held', 'left', 'declined', 'missed')),
  held_at TIMESTAMPTZ,
  UNIQUE (call_id, user_id)
);

CREATE INDEX idx_call_participants_call_id ON public.call_participants(call_id);
CREATE INDEX idx_call_participants_user_id ON public.call_participants(user_id);

-- ---------------------------------------------------------------------------
-- Ringtones (then profile FK)
-- ---------------------------------------------------------------------------
CREATE TABLE public.user_ringtones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  storage_path TEXT,
  duration_sec NUMERIC NOT NULL DEFAULT 60
    CHECK (duration_sec > 0 AND duration_sec <= 60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_ringtones_user_created
  ON public.user_ringtones(user_id, created_at DESC);

ALTER TABLE public.profiles
  ADD COLUMN incoming_ringtone_id UUID
    REFERENCES public.user_ringtones(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Wallet / gifts / coins / payouts
-- ---------------------------------------------------------------------------
CREATE TABLE public.gift_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🎁',
  coin_price INTEGER NOT NULL CHECK (coin_price > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gift_catalog_active_sort
  ON public.gift_catalog(active, sort_order) WHERE active;

CREATE TABLE public.wallet_accounts (
  profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance_coins BIGINT NOT NULL DEFAULT 0 CHECK (balance_coins >= 0),
  cashable_coins BIGINT NOT NULL DEFAULT 0 CHECK (cashable_coins >= 0),
  lifetime_earned_coins BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_earned_coins >= 0),
  lifetime_spent_coins BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_spent_coins >= 0),
  welcome_claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wallet_accounts_cashable_lte_balance
    CHECK (cashable_coins <= balance_coins)
);

CREATE TABLE public.wallet_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  delta_coins BIGINT NOT NULL CHECK (delta_coins <> 0),
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  entry_type TEXT NOT NULL CHECK (entry_type IN (
    'welcome_bonus', 'gift_sent', 'gift_received', 'purchase',
    'payout', 'adjustment', 'refund'
  )),
  reference_id UUID,
  idempotency_key TEXT UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wallet_ledger_profile_created
  ON public.wallet_ledger(profile_id, created_at DESC);

CREATE TABLE public.reel_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  sender_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  gift_id UUID NOT NULL REFERENCES public.gift_catalog(id),
  coin_amount INTEGER NOT NULL CHECK (coin_amount > 0),
  creator_coins INTEGER NOT NULL CHECK (creator_coins >= 0),
  platform_fee_coins INTEGER NOT NULL CHECK (platform_fee_coins >= 0),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (sender_profile_id <> recipient_profile_id),
  CHECK (coin_amount = creator_coins + platform_fee_coins)
);
CREATE INDEX idx_reel_gifts_reel_created ON public.reel_gifts(reel_id, created_at DESC);
CREATE INDEX idx_reel_gifts_recipient_created
  ON public.reel_gifts(recipient_profile_id, created_at DESC);
CREATE INDEX idx_reel_gifts_sender_created
  ON public.reel_gifts(sender_profile_id, created_at DESC);

CREATE TABLE public.call_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  sender_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  gift_id UUID NOT NULL REFERENCES public.gift_catalog(id),
  coin_amount INTEGER NOT NULL CHECK (coin_amount > 0),
  creator_coins INTEGER NOT NULL CHECK (creator_coins >= 0),
  platform_fee_coins INTEGER NOT NULL CHECK (platform_fee_coins >= 0),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (sender_profile_id <> recipient_profile_id),
  CHECK (coin_amount = creator_coins + platform_fee_coins)
);
CREATE INDEX idx_call_gifts_call_created ON public.call_gifts(call_id, created_at DESC);

CREATE TABLE public.coin_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  coins INTEGER NOT NULL CHECK (coins > 0),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'NGN',
  country_code TEXT NOT NULL DEFAULT 'NG',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_coin_packages_slug_country
  ON public.coin_packages(slug, country_code);
CREATE INDEX idx_coin_packages_country_active_sort
  ON public.coin_packages(country_code, active, sort_order);

CREATE TABLE public.coin_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.coin_packages(id),
  payment_provider TEXT NOT NULL DEFAULT 'paystack'
    CHECK (payment_provider IN ('paystack', 'stripe')),
  payment_reference TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'NGN',
  coins INTEGER NOT NULL CHECK (coins > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_coin_purchases_payment_ref
  ON public.coin_purchases(payment_provider, payment_reference);
CREATE INDEX idx_coin_purchases_profile_created
  ON public.coin_purchases(profile_id, created_at DESC);

CREATE TABLE public.payout_thresholds (
  country_code TEXT PRIMARY KEY,
  currency TEXT NOT NULL,
  min_amount_minor INTEGER NOT NULL CHECK (min_amount_minor > 0),
  coin_to_fiat_minor INTEGER NOT NULL CHECK (coin_to_fiat_minor > 0),
  fee_flat_minor INTEGER NOT NULL DEFAULT 0 CHECK (fee_flat_minor >= 0),
  fee_bps INTEGER NOT NULL DEFAULT 150 CHECK (fee_bps >= 0 AND fee_bps <= 5000),
  active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.payout_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  currency TEXT NOT NULL,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('nuban', 'mobile_money', 'basa')),
  account_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  bank_code TEXT NOT NULL,
  bank_name TEXT,
  paystack_recipient_code TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_payout_recipients_unique_account
  ON public.payout_recipients(profile_id, account_number, bank_code) WHERE active;
CREATE INDEX idx_payout_recipients_profile
  ON public.payout_recipients(profile_id, created_at DESC) WHERE active;

CREATE TABLE public.payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.payout_recipients(id),
  amount_coins BIGINT NOT NULL CHECK (amount_coins > 0),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  fee_minor INTEGER NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
  net_amount_minor INTEGER NOT NULL CHECK (net_amount_minor > 0),
  currency TEXT NOT NULL,
  country_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'cancelled')),
  paystack_transfer_code TEXT,
  paystack_transfer_reference TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  failure_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payout_requests_profile_created
  ON public.payout_requests(profile_id, created_at DESC);
CREATE UNIQUE INDEX idx_payout_requests_one_open
  ON public.payout_requests(profile_id)
  WHERE status IN ('pending', 'processing');
