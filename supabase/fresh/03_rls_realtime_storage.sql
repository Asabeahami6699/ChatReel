-- =============================================================================
-- ChatReel fresh schema — RLS + Realtime + Storage (run third)
-- =============================================================================

-- Helpers already created in 02_functions.sql

-- ---------------------------------------------------------------------------
-- Enable RLS
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
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_engagement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_not_interested ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_ringtones ENABLE ROW LEVEL SECURITY;

-- Moments / chat extras: backend uses service_role; optional client SELECT later
ALTER TABLE public.moments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moment_audience ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moment_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moment_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pinned_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Policies (SELECT-oriented; mutations via Express service role)
-- ---------------------------------------------------------------------------
CREATE POLICY profiles_select_authenticated ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY friendships_select_own ON public.friendships
  FOR SELECT TO authenticated
  USING (
    user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR friend_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY groups_select_member_or_public ON public.groups
  FOR SELECT TO authenticated
  USING (
    is_public = true
    OR creator_id = auth.uid()
    OR id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

CREATE POLICY group_members_select ON public.group_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR group_id IN (SELECT group_id FROM public.group_members gm WHERE gm.user_id = auth.uid())
  );

CREATE POLICY group_invites_select ON public.group_invites
  FOR SELECT TO authenticated USING (true);

CREATE POLICY messages_select_own ON public.messages
  FOR SELECT TO authenticated
  USING (
    sender_id = auth.uid()
    OR receiver_id = auth.uid()
    OR group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

CREATE POLICY public_keys_select ON public.public_keys
  FOR SELECT TO authenticated USING (true);
CREATE POLICY one_time_prekeys_select ON public.one_time_prekeys
  FOR SELECT TO authenticated USING (true);
CREATE POLICY qr_sessions_select ON public.qr_sessions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY linked_devices_select_own ON public.linked_devices
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR linked_user_id = auth.uid());
CREATE POLICY push_tokens_select_own ON public.push_tokens
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY reels_select_visible ON public.reels
  FOR SELECT TO authenticated
  USING (
    visibility = 'public'
    OR author_id = public.my_profile_id()
    OR (visibility = 'friends' AND public.is_friend_of_me(author_id))
    OR (
      visibility = 'group' AND group_id IS NOT NULL
      AND group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
    )
  );

CREATE POLICY reel_likes_select_visible ON public.reel_likes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.reels r
      WHERE r.id = reel_likes.reel_id
        AND (
          r.visibility = 'public'
          OR r.author_id = public.my_profile_id()
          OR (r.visibility = 'friends' AND public.is_friend_of_me(r.author_id))
        )
    )
  );

CREATE POLICY reel_comments_select_visible ON public.reel_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.reels r
      WHERE r.id = reel_comments.reel_id
        AND (
          r.visibility = 'public'
          OR r.author_id = public.my_profile_id()
          OR (r.visibility = 'friends' AND public.is_friend_of_me(r.author_id))
        )
    )
  );

CREATE POLICY reel_views_select_own_or_author ON public.reel_views
  FOR SELECT TO authenticated
  USING (
    user_id = public.my_profile_id()
    OR EXISTS (
      SELECT 1 FROM public.reels r
      WHERE r.id = reel_views.reel_id AND r.author_id = public.my_profile_id()
    )
  );

CREATE POLICY reel_media_select_visible ON public.reel_media
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.reels r
      WHERE r.id = reel_media.reel_id
        AND (
          r.visibility = 'public'
          OR r.author_id = public.my_profile_id()
          OR (r.visibility = 'friends' AND public.is_friend_of_me(r.author_id))
        )
    )
  );

-- Fixed: compare profile id, not auth.uid()
CREATE POLICY reel_comment_likes_select ON public.reel_comment_likes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY reel_comment_likes_insert_own ON public.reel_comment_likes
  FOR INSERT TO authenticated WITH CHECK (user_id = public.my_profile_id());
CREATE POLICY reel_comment_likes_delete_own ON public.reel_comment_likes
  FOR DELETE TO authenticated USING (user_id = public.my_profile_id());

CREATE POLICY calls_select_visible ON public.calls
  FOR SELECT TO authenticated
  USING (
    caller_id = auth.uid()
    OR callee_id = auth.uid()
    OR (
      group_id IS NOT NULL
      AND group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
    )
    OR id IN (SELECT call_id FROM public.call_participants WHERE user_id = auth.uid())
  );

CREATE POLICY call_participants_select_visible ON public.call_participants
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR call_id IN (
      SELECT id FROM public.calls
      WHERE caller_id = auth.uid()
         OR callee_id = auth.uid()
         OR (group_id IS NOT NULL AND group_id IN (
           SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
         ))
    )
  );

CREATE POLICY gift_catalog_read ON public.gift_catalog
  FOR SELECT TO authenticated USING (active = true);
CREATE POLICY reel_gifts_read ON public.reel_gifts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY call_gifts_select_own ON public.call_gifts
  FOR SELECT TO authenticated
  USING (
    sender_profile_id = public.my_profile_id()
    OR recipient_profile_id = public.my_profile_id()
  );
CREATE POLICY coin_packages_read ON public.coin_packages
  FOR SELECT TO authenticated USING (active = true);

CREATE POLICY user_ringtones_select_own ON public.user_ringtones
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY user_ringtones_insert_own ON public.user_ringtones
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY user_ringtones_delete_own ON public.user_ringtones
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Chat / moments readable enough for Realtime auth clients
CREATE POLICY moments_select_authenticated ON public.moments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY moment_views_select_authenticated ON public.moment_views
  FOR SELECT TO authenticated USING (true);
CREATE POLICY message_reactions_select_own_chats ON public.message_reactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_reactions.message_id
        AND (
          m.sender_id = auth.uid()
          OR m.receiver_id = auth.uid()
          OR m.group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
        )
    )
  );
CREATE POLICY message_reads_select_own ON public.message_reads
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_reads.message_id AND m.sender_id = auth.uid()
    )
  );
CREATE POLICY chat_preferences_select_own ON public.chat_preferences
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- REPLICA IDENTITY FULL (required for Realtime + RLS filters)
-- ---------------------------------------------------------------------------
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.friendships REPLICA IDENTITY FULL;
ALTER TABLE public.groups REPLICA IDENTITY FULL;
ALTER TABLE public.group_members REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.group_invites REPLICA IDENTITY FULL;
ALTER TABLE public.qr_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.linked_devices REPLICA IDENTITY FULL;
ALTER TABLE public.reels REPLICA IDENTITY FULL;
ALTER TABLE public.reel_likes REPLICA IDENTITY FULL;
ALTER TABLE public.reel_comments REPLICA IDENTITY FULL;
ALTER TABLE public.reel_views REPLICA IDENTITY FULL;
ALTER TABLE public.reel_media REPLICA IDENTITY FULL;
ALTER TABLE public.calls REPLICA IDENTITY FULL;
ALTER TABLE public.call_participants REPLICA IDENTITY FULL;
ALTER TABLE public.moments REPLICA IDENTITY FULL;
ALTER TABLE public.moment_views REPLICA IDENTITY FULL;
ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.message_reads REPLICA IDENTITY FULL;
ALTER TABLE public.reel_gifts REPLICA IDENTITY FULL;

-- ---------------------------------------------------------------------------
-- Realtime publication
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'messages','friendships','groups','group_members','profiles','group_invites',
    'qr_sessions','linked_devices','reels','reel_likes','reel_comments',
    'calls','call_participants','moments','moment_views','reel_media',
    'message_reactions','message_reads','reel_gifts'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('avatars', 'avatars', true, 5242880),
  ('group_avatar', 'group_avatar', true, 5242880),
  ('chat-files', 'chat-files', true, 52428880),
  ('reels', 'reels', true, 104857600),
  ('ringtones', 'ringtones', true, 10485760)
ON CONFLICT (id) DO NOTHING;
