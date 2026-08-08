import React, { useCallback, useState } from 'react';
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useChatSettings } from '../context/ChatSettingsContext';
import { CallFriendPickerSheet } from '../components/CallFriendPickerSheet';
import { useAuth } from '../hooks/useAuth';
import { useCurrentProfileId } from '../hooks/useCurrentProfileId';
import { useCallsFeed } from '../hooks/useCallsFeed';
import { startCallGuarded } from '../lib/startCallGuarded';
import { showAppToast } from '../lib/appToast';
import { ApiError } from '../lib/api';
import { promptSignIn } from '../lib/requireSignedIn';

/**
 * Desktop main-panel for Calls: big empty state + quick dial.
 * Call history stays in the sidebar (CallsScreen).
 */
export function CallsDesktopMain() {
  const { theme } = useChatSettings();
  const { isGuest, exitGuest } = useAuth();
  const myProfileId = useCurrentProfileId();
  const { friends, callsEnabled } = useCallsFeed(myProfileId);
  const [pickerOpen, setPickerOpen] = useState(false);

  const requireAuth = useCallback(
    (message?: string) => {
      if (!isGuest) return true;
      promptSignIn({
        title: 'Sign in required',
        message: message ?? 'Sign in to place a call.',
        onLogin: exitGuest,
      });
      return false;
    },
    [isGuest, exitGuest]
  );

  const startCallToUser = useCallback(
    async (
      userId: string,
      type: 'voice' | 'video',
      peerHint?: { peerName?: string; peerAvatar?: string | null }
    ) => {
      if (!requireAuth()) return;
      if (callsEnabled === false) {
        showAppToast('Calls are not enabled on this server yet', { isError: true });
        return;
      }
      setPickerOpen(false);
      if (Platform.OS === 'android') {
        await new Promise((r) => setTimeout(r, 80));
      }
      try {
        const { call, live_kit } = await startCallGuarded(
          { type, callee_id: userId },
          peerHint
        );
        const { navigateToOutgoingCall } = await import('./rootNavigation');
        navigateToOutgoingCall({ call, token: live_kit.token, url: live_kit.url });
      } catch (err) {
        showAppToast(err instanceof ApiError ? err.message : 'Could not start call', {
          isError: true,
        });
      }
    },
    [callsEnabled, requireAuth]
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.listBg }]}>
      <View style={[styles.hero, { backgroundColor: theme.listCardBg, borderColor: theme.listBorder }]}>
        <View style={styles.iconRing}>
          <Ionicons name="call" size={36} color="#1976d2" />
        </View>
        <Text style={[styles.title, { color: theme.listPrimaryText }]}>Calls</Text>
        <Text style={[styles.sub, { color: theme.listSecondaryText }]}>
          Pick a recent call from the left, or start a new voice or video call with a friend.
        </Text>
        <TouchableOpacity
          style={styles.cta}
          activeOpacity={0.88}
          onPress={() => {
            if (!requireAuth('Sign in to call your friends.')) return;
            setPickerOpen(true);
          }}
        >
          <Ionicons name="people" size={20} color="#fff" />
          <Text style={styles.ctaText}>Call a friend</Text>
        </TouchableOpacity>
      </View>

      {friends.slice(0, 6).length > 0 ? (
        <View style={styles.quickRow}>
          <Text style={[styles.quickLabel, { color: theme.listSecondaryText }]}>Quick dial</Text>
          <View style={styles.avatars}>
            {friends.slice(0, 6).map((f) => (
              <TouchableOpacity
                key={f.userId}
                style={styles.quickItem}
                onPress={() =>
                  void startCallToUser(f.userId, 'voice', {
                    peerName: f.name,
                    peerAvatar: f.avatar,
                  })
                }
              >
                {f.avatar ? (
                  <Image source={{ uri: f.avatar }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarLetter}>{f.name.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <Text style={[styles.quickName, { color: theme.listPrimaryText }]} numberOfLines={1}>
                  {f.name.split(' ')[0]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      <CallFriendPickerSheet
        visible={pickerOpen}
        friends={friends}
        onClose={() => setPickerOpen(false)}
        onCall={(userId, type, peerHint) => void startCallToUser(userId, type, peerHint)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 28,
  },
  hero: {
    maxWidth: 420,
    width: '100%',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 28,
    alignItems: 'center',
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#e3f2fd',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 8 },
  sub: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 20 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1976d2',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 24,
  },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  quickRow: { width: '100%', maxWidth: 480, gap: 10 },
  quickLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  avatars: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  quickItem: { width: 64, alignItems: 'center', gap: 4 },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarFallback: {
    backgroundColor: '#1976d2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontWeight: '800', fontSize: 18 },
  quickName: { fontSize: 12, fontWeight: '600' },
});
