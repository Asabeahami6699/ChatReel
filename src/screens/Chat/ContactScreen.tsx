import React, { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../lib/api';
import { showAppToast } from '../../lib/appToast';
import { confirmAction, showErrorAlert } from '../../lib/confirmAction';
import { formatLastSeen } from './chatMessageUtils';
import { chatTheme } from './chatTheme';
import { useAuth } from '../../hooks/useAuth';
import { usePeerProfileStore } from '../../stores/peerProfileStore';

type RouteParams = {
  userId: string;
  chatName?: string;
  avatarUrl?: string;
};

export default function ContactScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { userId, chatName, avatarUrl } = route.params as RouteParams;

  const profile = usePeerProfileStore((s) => s.byUserId[userId]?.profile ?? null);
  const loading = usePeerProfileStore((s) => Boolean(s.loadingIds[userId]) && !s.byUserId[userId]);
  const ensureLoaded = usePeerProfileStore((s) => s.ensureLoaded);
  const [muting, setMuting] = React.useState(false);

  useEffect(() => {
    void ensureLoaded(userId);
  }, [ensureLoaded, userId]);

  const displayName =
    (profile?.display_name as string) || chatName || (profile?.email as string) || 'Contact';
  const avatar = (profile?.avatar_url as string) || avatarUrl;
  const statusText = formatLastSeen(
    profile?.last_seen_at as string | undefined,
    profile?.status as string | undefined
  );

  const startCall = useCallback(
    async (type: 'voice' | 'video') => {
      try {
        const { startCallGuarded } = await import('../../lib/startCallGuarded');
        const { call, live_kit } = await startCallGuarded({ type, callee_id: userId });
        const { navigateToOutgoingCall } = await import('../../navigation/rootNavigation');
        navigateToOutgoingCall({ call, token: live_kit.token, url: live_kit.url });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Could not start call';
        showAppToast(msg, { isError: true });
      }
    },
    [userId]
  );

  const toggleMute = useCallback(async () => {
    setMuting(true);
    try {
      const { preferences } = await api.chatSettings.get('individual', userId);
      const muted = preferences.muted_until as string | null;
      const isMuted = muted && new Date(muted) > new Date();
      await api.chatSettings.update('individual', userId, {
        muted_until: isMuted ? null : new Date(Date.now() + 365 * 86400_000).toISOString(),
      });
      showAppToast(isMuted ? 'Notifications unmuted' : 'Notifications muted');
    } catch {
      showErrorAlert('Notifications', 'Could not update mute setting');
    } finally {
      setMuting(false);
    }
  }, [userId]);

  const blockUser = useCallback(() => {
    void (async () => {
      const ok = await confirmAction(
        `Block ${displayName}?`,
        'They will no longer be able to call or message you.',
        'Block'
      );
      if (!ok) return;
      try {
        await api.friendships.block(userId);
        showAppToast(`${displayName} blocked`);
        navigation.goBack();
      } catch {
        showErrorAlert('Block', 'Could not block user');
      }
    })();
  }, [displayName, navigation, userId]);

  if (loading && !profile && !avatarUrl && !chatName) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={chatTheme.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={chatTheme.headerBg} />
      <View
        style={[
          styles.header,
          {
            // Pull header into the shell top inset so blue fills the status area (no double pad).
            marginTop: -insets.top,
            paddingTop: insets.top + 14,
          },
        ]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Contact</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Image source={{ uri: avatar || undefined }} style={styles.avatar} />
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.status}>{statusText}</Text>
        {!!profile?.bio && <Text style={styles.bio}>{profile.bio as string}</Text>}

        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => startCall('voice')}>
            <Ionicons name="call" size={22} color={chatTheme.primary} />
            <Text style={styles.actionLabel}>Audio</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => startCall('video')}>
            <Ionicons name="videocam" size={22} color={chatTheme.primary} />
            <Text style={styles.actionLabel}>Video</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chatbubble" size={22} color={chatTheme.primary} />
            <Text style={styles.actionLabel}>Message</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.row} onPress={toggleMute} disabled={muting}>
          <Ionicons name="volume-mute-outline" size={22} color="#444" />
          <Text style={styles.rowText}>{muting ? 'Updating…' : 'Mute notifications'}</Text>
        </TouchableOpacity>

        {user?.id !== userId && (
          <TouchableOpacity style={styles.row} onPress={blockUser}>
            <Ionicons name="ban-outline" size={22} color="#FF3B30" />
            <Text style={[styles.rowText, styles.destructive]}>Block user</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: chatTheme.headerBg,
    paddingHorizontal: 12,
    paddingBottom: 14,
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  content: { alignItems: 'center', padding: 24 },
  avatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#eee' },
  name: { fontSize: 24, fontWeight: '700', marginTop: 16, color: '#111' },
  status: { fontSize: 14, color: '#666', marginTop: 6 },
  bio: { fontSize: 15, color: '#444', marginTop: 12, textAlign: 'center', lineHeight: 22 },
  actions: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 28,
    marginBottom: 32,
  },
  actionBtn: { alignItems: 'center', gap: 6 },
  actionLabel: { fontSize: 13, color: '#444' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    width: '100%',
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
  },
  rowText: { fontSize: 16, color: '#222' },
  destructive: { color: '#FF3B30' },
});
