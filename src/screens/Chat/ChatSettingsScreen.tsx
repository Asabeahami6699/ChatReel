import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Share,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import Constants from 'expo-constants';
import { chatThemePresets, type ChatThemeId } from '../../lib/chatThemes';
import { useChatSettings } from '../../context/ChatSettingsContext';
import { showErrorAlert, confirmAction } from '../../lib/confirmAction';
import {
  configurePlaybackAudio,
  createPlaybackPlayer,
  releasePlayer,
  resolvePlayableAudioSource,
  safePlayAudioPlayer,
  seekPlaybackPlayer,
} from '../../lib/appAudio';
import { RingtoneTrimModal } from '../../components/RingtoneTrimModal';
import { RINGTONE_CLIP_SEC } from '../../lib/ringtoneTrim';
import { showAppToast } from '../../lib/appToast';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../lib/api';
import { startBackgroundRingtoneSave } from '../../components/RingtoneSaveToast';
import { OfflineAvatar } from '../../components/OfflineAvatar';
import { messageStorage } from '../../utils/messageStorage';
import { getCachedProfile, prefetchMyProfile, hydrateProfileCache, subscribeCachedProfile } from '../../lib/profileCache';

type SettingsPage =
  | 'hub'
  | 'appearance'
  | 'notifications'
  | 'privacy'
  | 'chats'
  | 'storage'
  | 'about'
  | 'tips';

function SectionLabel({ title, color }: { title: string; color: string }) {
  return <Text style={[styles.sectionLabel, { color }]}>{title}</Text>;
}

function SettingsCard({
  children,
  bg,
  border,
}: {
  children: React.ReactNode;
  bg: string;
  border: string;
}) {
  return (
    <View style={[styles.card, { backgroundColor: bg, borderColor: border }]}>
      {children}
    </View>
  );
}

function LinkRow({
  icon,
  label,
  subtitle,
  onPress,
  textColor,
  subColor,
  iconBg,
  iconColor,
  destructive,
  showChevron = true,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  onPress: () => void;
  textColor: string;
  subColor: string;
  iconBg: string;
  iconColor: string;
  destructive?: boolean;
  showChevron?: boolean;
  last?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.linkRow, !last && styles.linkRowBorder]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.linkIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={styles.linkTextWrap}>
        <Text style={[styles.linkLabel, { color: destructive ? '#FF3B30' : textColor }]}>
          {label}
        </Text>
        {subtitle ? (
          <Text style={[styles.linkSub, { color: subColor }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {showChevron ? (
        <Ionicons name="chevron-forward" size={18} color={subColor} />
      ) : null}
    </TouchableOpacity>
  );
}

function ToggleRow({
  icon,
  label,
  subtitle,
  value,
  onValueChange,
  textColor,
  subColor,
  iconBg,
  iconColor,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  textColor: string;
  subColor: string;
  iconBg: string;
  iconColor: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.linkRow, !last && styles.linkRowBorder]}>
      <View style={[styles.linkIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={styles.linkTextWrap}>
        <Text style={[styles.linkLabel, { color: textColor }]}>{label}</Text>
        {subtitle ? <Text style={[styles.linkSub, { color: subColor }]}>{subtitle}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

function formatSec(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export default function ChatSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user, signOut } = useAuth();
  const {
    settings,
    theme,
    updateSettings,
    ringtoneLibrary,
    refreshRingtoneLibrary,
    selectRingtone,
  } = useChatSettings();

  const [page, setPage] = useState<SettingsPage>('hub');
  const [profile, setProfile] = useState<{
    display_name?: string;
    email?: string;
    avatar_url?: string;
  } | null>(() => {
    const cached = getCachedProfile();
    if (!cached) return null;
    return {
      display_name: cached.display_name,
      email: cached.email,
      avatar_url: cached.avatar_url,
    };
  });
  const [trimUri, setTrimUri] = useState<string | null>(null);
  const [trimLabel, setTrimLabel] = useState('Custom tone');
  const [trimMime, setTrimMime] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    void refreshRingtoneLibrary();
  }, [refreshRingtoneLibrary]);

  useEffect(() => {
    let alive = true;
    void hydrateProfileCache().then(() => {
      if (!alive) return;
      const cached = getCachedProfile();
      if (cached) {
        setProfile({
          display_name: cached.display_name,
          email: cached.email || user?.email || undefined,
          avatar_url: cached.avatar_url,
        });
      }
    });
    const unsub = subscribeCachedProfile(() => {
      const cached = getCachedProfile();
      if (!cached || !alive) return;
      setProfile({
        display_name: cached.display_name,
        email: cached.email || user?.email || undefined,
        avatar_url: cached.avatar_url,
      });
    });
    void prefetchMyProfile(user?.email).then((next) => {
      if (!alive || !next) return;
      setProfile({
        display_name: next.display_name,
        email: next.email || user?.email || undefined,
        avatar_url: next.avatar_url,
      });
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [user?.email]);

  const closeTrimModal = useCallback(() => setTrimUri(null), []);
  const themeIds = Object.keys(chatThemePresets) as ChatThemeId[];
  const selectedId = settings.incomingRingtoneId;
  const appVersion =
    Constants.expoConfig?.version ||
    Constants.nativeAppVersion ||
    '1.0.0';

  const goBack = () => {
    if (page === 'hub') navigation.goBack();
    else setPage('hub');
  };

  const pageTitle =
    page === 'hub'
      ? 'Settings'
      : page === 'appearance'
        ? 'Appearance'
        : page === 'notifications'
          ? 'Notifications'
          : page === 'privacy'
            ? 'Privacy'
            : page === 'chats'
              ? 'Chats'
              : page === 'storage'
                ? 'Data and storage'
                : page === 'tips'
                  ? 'Tips'
                  : 'About';

  const pickRingtone = async () => {
    if (!user?.id) {
      showErrorAlert('Ringtone', 'Sign in to save ringtones to your account.');
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setTrimLabel(asset.name || 'Custom tone');
      setTrimMime(asset.mimeType ?? null);
      setTrimUri(asset.uri);
    } catch (err) {
      showErrorAlert('Ringtone', err instanceof Error ? err.message : 'Could not pick audio file');
    }
  };

  const previewUri = async (uri: string | null, startSec = 0) => {
    try {
      await configurePlaybackAudio();
      const source = uri?.trim() || require('../../../assets/sounds/incoming-ring.mp3');
      const resolved =
        typeof source === 'string' ? source : await resolvePlayableAudioSource(source as number);
      const player = createPlaybackPlayer(resolved);
      if (uri) await seekPlaybackPlayer(player, startSec);
      const ok = await safePlayAudioPlayer(player);
      if (!ok) {
        showErrorAlert('Ringtone', 'Could not play this tone.');
        void releasePlayer(player);
        return;
      }
      setTimeout(() => void releasePlayer(player), 2500);
    } catch (err) {
      showErrorAlert('Ringtone', err instanceof Error ? err.message : 'Could not play preview');
    }
  };

  const onSaveTrim = useCallback(
    ({ startSec, endSec }: { startSec: number; endSec: number }) => {
      if (!trimUri || !user?.id) return;
      const localUri = trimUri;
      const label = trimLabel;
      const mimeType = trimMime;
      setTrimUri(null);
      startBackgroundRingtoneSave({
        userId: user.id,
        localUri,
        label,
        name: label,
        mimeType,
        startSec,
        endSec: Math.min(endSec, startSec + RINGTONE_CLIP_SEC),
        afterSave: async (ringtone) => {
          await selectRingtone(ringtone);
        },
      });
    },
    [selectRingtone, trimLabel, trimMime, trimUri, user?.id]
  );

  const removeTone = async (id: string) => {
    try {
      await api.ringtones.remove(id);
      if (selectedId === id) await selectRingtone(null);
      else await refreshRingtoneLibrary();
      showAppToast('Ringtone removed');
    } catch (err) {
      showErrorAlert('Ringtone', err instanceof Error ? err.message : 'Could not delete ringtone');
    }
  };

  const clearLocalCache = async () => {
    const ok = await confirmAction(
      'Clear local cache?',
      'Cached media and offline message copies on this device will be removed. Chats on the server stay safe.',
      'Clear'
    );
    if (!ok) return;
    setClearing(true);
    try {
      await messageStorage.clearAll?.();
      showAppToast('Local cache cleared');
    } catch {
      showAppToast('Could not clear cache', { isError: true });
    } finally {
      setClearing(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'You will need to sign in again to use ChatReel.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => void signOut(),
      },
    ]);
  };

  const tc = theme.listPrimaryText;
  const sc = theme.listSecondaryText;
  const cardBg = theme.listCardBg;
  const border = theme.listBorder;
  const chip = (lightBg: string, accent: string) =>
    theme.isDark
      ? { bg: 'rgba(255,255,255,0.08)', color: accent }
      : { bg: lightBg, color: accent };

  const renderHub = () => {
    const a = {
      friends: chip('#e8f2ff', '#007AFF'),
      add: chip('#e8f5e9', '#34c759'),
      requests: chip('#fff3e0', '#ff9500'),
      groups: chip('#f3e5f5', '#af52de'),
      newGroup: chip('#e3f2fd', '#1976d2'),
      qr: chip('#eceff1', '#90a4ae'),
      devices: chip('#e0f7fa', '#00acc1'),
      invite: chip('#fce4ec', '#e91e63'),
      appearance: chip('#ede7f6', '#b39ddb'),
      chats: chip('#e8f5e9', '#66bb6a'),
      notif: chip('#fff8e1', '#fdd835'),
      privacy: chip('#e3f2fd', '#42a5f5'),
      storage: chip('#efebe9', '#a1887f'),
      about: chip('#e8eaf6', '#7986cb'),
      tips: chip('#e0f2f1', '#26a69a'),
      signOut: chip('#ffebee', '#ef5350'),
      calls: chip('#fce4ec', '#ec407a'),
      explore: chip('#fff3e0', '#ffa726'),
    };

    const goTab = (tab: string) => {
      const tabNav = navigation.getParent?.();
      if (tabNav?.navigate) tabNav.navigate(tab);
      else navigation.navigate(tab);
    };

    return (
      <>
        <TouchableOpacity
          style={[styles.profileCard, { backgroundColor: cardBg, borderColor: border }]}
          onPress={() => {
            void prefetchMyProfile(user?.email);
            navigation.navigate('Profile');
          }}
          activeOpacity={0.85}
        >
          <OfflineAvatar
            uri={profile?.avatar_url}
            name={profile?.display_name || profile?.email || user?.email || 'You'}
            size={64}
            style={styles.profileAvatar}
          />
          <View style={styles.profileText}>
            <Text style={[styles.profileName, { color: tc }]} numberOfLines={1}>
              {profile?.display_name ||
                profile?.email ||
                user?.email ||
                (profile ? 'Profile' : 'Loading…')}
            </Text>
            <Text style={[styles.profileEmail, { color: sc }]} numberOfLines={1}>
              {profile?.display_name
                ? profile?.email || user?.email || 'Tap to edit profile'
                : 'Tap to edit profile'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={sc} />
        </TouchableOpacity>

        <SectionLabel title="Account" color={sc} />
        <SettingsCard bg={cardBg} border={border}>
          <LinkRow
            icon="people-outline"
            label="Friends"
            subtitle="People you chat with"
            onPress={() => navigation.navigate('FriendsList')}
            textColor={tc}
            subColor={sc}
            iconBg={a.friends.bg}
            iconColor={a.friends.color}
          />
          <LinkRow
            icon="person-add-outline"
            label="Add friends"
            subtitle="Search people to connect"
            onPress={() => navigation.navigate('AddFriend')}
            textColor={tc}
            subColor={sc}
            iconBg={a.add.bg}
            iconColor={a.add.color}
          />
          <LinkRow
            icon="mail-unread-outline"
            label="Friend requests"
            onPress={() => navigation.navigate('FriendRequests')}
            textColor={tc}
            subColor={sc}
            iconBg={a.requests.bg}
            iconColor={a.requests.color}
          />
          <LinkRow
            icon="people-circle-outline"
            label="Groups"
            subtitle="Groups you created or joined"
            onPress={() => navigation.navigate('GroupsList')}
            textColor={tc}
            subColor={sc}
            iconBg={a.groups.bg}
            iconColor={a.groups.color}
          />
          <LinkRow
            icon="add-circle-outline"
            label="New group"
            onPress={() => navigation.navigate('NewGroup')}
            textColor={tc}
            subColor={sc}
            iconBg={a.newGroup.bg}
            iconColor={a.newGroup.color}
            last
          />
        </SettingsCard>

        <SectionLabel title="Connect" color={sc} />
        <SettingsCard bg={cardBg} border={border}>
          <LinkRow
            icon="qr-code-outline"
            label="My QR code"
            subtitle="Let friends scan to add you"
            onPress={() => navigation.navigate('QRCode')}
            textColor={tc}
            subColor={sc}
            iconBg={a.qr.bg}
            iconColor={a.qr.color}
          />
          <LinkRow
            icon="scan-outline"
            label="Scan code"
            subtitle="Add a friend or link a device"
            onPress={() => navigation.navigate('QRScanner')}
            textColor={tc}
            subColor={sc}
            iconBg={a.devices.bg}
            iconColor={a.devices.color}
          />
          <LinkRow
            icon="share-social-outline"
            label="Invite a friend"
            subtitle="Share ChatReel with someone"
            onPress={() => {
              void Share.share({
                message:
                  'Join me on ChatReel — chat, calls, moments and reels in one app.',
                title: 'Invite to ChatReel',
              }).catch(() => undefined);
            }}
            textColor={tc}
            subColor={sc}
            iconBg={a.invite.bg}
            iconColor={a.invite.color}
            last
          />
        </SettingsCard>

        <SectionLabel title="Discover" color={sc} />
        <SettingsCard bg={cardBg} border={border}>
          <LinkRow
            icon="call-outline"
            label="Calls"
            subtitle="Recent voice and video calls"
            onPress={() => goTab('Calls')}
            textColor={tc}
            subColor={sc}
            iconBg={a.calls.bg}
            iconColor={a.calls.color}
          />
          <LinkRow
            icon="compass-outline"
            label="Explore"
            subtitle="Moments, market and more"
            onPress={() => goTab('Explore')}
            textColor={tc}
            subColor={sc}
            iconBg={a.explore.bg}
            iconColor={a.explore.color}
            last
          />
        </SettingsCard>

        <SectionLabel title="Settings" color={sc} />
        <SettingsCard bg={cardBg} border={border}>
          <LinkRow
            icon="color-palette-outline"
            label="Appearance"
            subtitle={chatThemePresets[settings.themeId]?.label || 'Theme'}
            onPress={() => setPage('appearance')}
            textColor={tc}
            subColor={sc}
            iconBg={a.appearance.bg}
            iconColor={a.appearance.color}
          />
          <LinkRow
            icon="chatbubbles-outline"
            label="Chats"
            subtitle="Enter to send, compact list, media"
            onPress={() => setPage('chats')}
            textColor={tc}
            subColor={sc}
            iconBg={a.chats.bg}
            iconColor={a.chats.color}
          />
          <LinkRow
            icon="notifications-outline"
            label="Notifications and sounds"
            subtitle="Push, message tones, ringtone"
            onPress={() => setPage('notifications')}
            textColor={tc}
            subColor={sc}
            iconBg={a.notif.bg}
            iconColor={a.notif.color}
          />
          <LinkRow
            icon="lock-closed-outline"
            label="Privacy and security"
            subtitle="Read receipts, last seen"
            onPress={() => setPage('privacy')}
            textColor={tc}
            subColor={sc}
            iconBg={a.privacy.bg}
            iconColor={a.privacy.color}
          />
          <LinkRow
            icon="search-outline"
            label="Search messages"
            subtitle="Find text across all chats on this device"
            onPress={() => navigation.navigate('GlobalSearch')}
            textColor={tc}
            subColor={sc}
            iconBg="#e8eaf6"
            iconColor="#3949ab"
          />
          <LinkRow
            icon="folder-outline"
            label="Data and storage"
            subtitle="Cache and downloads"
            onPress={() => setPage('storage')}
            textColor={tc}
            subColor={sc}
            iconBg={a.storage.bg}
            iconColor={a.storage.color}
            last
          />
        </SettingsCard>

        <SectionLabel title="Help" color={sc} />
        <SettingsCard bg={cardBg} border={border}>
          <LinkRow
            icon="information-circle-outline"
            label="About ChatReel"
            subtitle={`Version ${appVersion}`}
            onPress={() => setPage('about')}
            textColor={tc}
            subColor={sc}
            iconBg={a.about.bg}
            iconColor={a.about.color}
          />
          <LinkRow
            icon="help-circle-outline"
            label="Tips"
            subtitle="Quick tips for calls, moments and chats"
            onPress={() => setPage('tips')}
            textColor={tc}
            subColor={sc}
            iconBg={a.tips.bg}
            iconColor={a.tips.color}
            last
          />
        </SettingsCard>

        <SettingsCard bg={cardBg} border={border}>
          <LinkRow
            icon="log-out-outline"
            label="Sign out"
            onPress={handleSignOut}
            textColor={tc}
            subColor={sc}
            iconBg={a.signOut.bg}
            iconColor={a.signOut.color}
            destructive
            showChevron={false}
            last
          />
        </SettingsCard>
      </>
    );
  };

  const renderAppearance = () => (
    <>
      <SectionLabel title="Color theme" color={sc} />
      <SettingsCard bg={cardBg} border={border}>
        {themeIds.map((id, index) => {
          const preset = chatThemePresets[id];
          const active = settings.themeId === id;
          return (
            <TouchableOpacity
              key={id}
              style={[
                styles.themeRow,
                index < themeIds.length - 1 && styles.linkRowBorder,
                active && { backgroundColor: theme.isDark ? '#111' : '#f5f9ff' },
              ]}
              onPress={() => {
                void updateSettings({ themeId: id });
                showAppToast(`${preset.label} applied`);
              }}
            >
              <View style={[styles.themeSwatch, { backgroundColor: preset.headerBg }]} />
              <View style={styles.linkTextWrap}>
                <Text style={[styles.linkLabel, { color: tc }]}>{preset.label}</Text>
                <Text style={[styles.linkSub, { color: sc }]}>
                  {preset.isDark ? 'Dark interface' : 'Light interface'}
                </Text>
              </View>
              {active ? <Ionicons name="checkmark-circle" size={22} color={preset.primary} /> : null}
            </TouchableOpacity>
          );
        })}
      </SettingsCard>
      <Text style={[styles.footnote, { color: sc }]}>
        Themes apply across chats, lists, and menus. Per-chat wallpapers are set from a chat’s ⋮ menu.
      </Text>
    </>
  );

  const renderNotifications = () => (
    <>
      <SectionLabel title="Alerts" color={sc} />
      <SettingsCard bg={cardBg} border={border}>
        <ToggleRow
          icon="notifications-outline"
          label="Push notifications"
          subtitle="New messages and friend requests"
          value={settings.pushNotifications}
          onValueChange={(v) => void updateSettings({ pushNotifications: v })}
          textColor={tc}
          subColor={sc}
          iconBg="#fff3e0"
          iconColor="#ff9500"
        />
        <ToggleRow
          icon="volume-high-outline"
          label="Message sounds"
          subtitle="Play a sound for incoming messages"
          value={settings.messageSounds}
          onValueChange={(v) => void updateSettings({ messageSounds: v })}
          textColor={tc}
          subColor={sc}
          iconBg="#e3f2fd"
          iconColor="#1976d2"
          last
        />
      </SettingsCard>

      <SectionLabel title="Incoming call ringtone" color={sc} />
      <SettingsCard bg={cardBg} border={border}>
        <Text style={[styles.libraryHint, { color: sc }]}>
          Trim any song to 1 minute, then save it to your account library.
        </Text>
        <TouchableOpacity
          style={[styles.toneRow, !selectedId && styles.toneRowActive]}
          onPress={() => void selectRingtone(null)}
        >
          <View style={styles.linkTextWrap}>
            <Text style={[styles.linkLabel, { color: tc }]}>Default</Text>
            <Text style={[styles.linkSub, { color: sc }]}>Built-in ring</Text>
          </View>
          {!selectedId ? <Ionicons name="checkmark-circle" size={22} color={theme.primary} /> : null}
          <TouchableOpacity style={styles.miniBtn} onPress={() => void previewUri(null)} hitSlop={8}>
            <Ionicons name="play" size={16} color={tc} />
          </TouchableOpacity>
        </TouchableOpacity>

        {ringtoneLibrary.map((tone) => {
          const active = selectedId === tone.id;
          return (
            <View key={tone.id} style={[styles.toneRow, active && styles.toneRowActive]}>
              <TouchableOpacity style={styles.linkTextWrap} onPress={() => void selectRingtone(tone)}>
                <Text style={[styles.linkLabel, { color: tc }]} numberOfLines={1}>
                  {tone.label}
                </Text>
                <Text style={[styles.linkSub, { color: sc }]}>
                  {formatSec(Number(tone.duration_sec) || RINGTONE_CLIP_SEC)} clip · saved
                </Text>
              </TouchableOpacity>
              {active ? <Ionicons name="checkmark-circle" size={22} color={theme.primary} /> : null}
              <TouchableOpacity style={styles.miniBtn} onPress={() => void previewUri(tone.audio_url)}>
                <Ionicons name="play" size={16} color={tc} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.miniBtn} onPress={() => void removeTone(tone.id)}>
                <Ionicons name="trash-outline" size={16} color="#dc2626" />
              </TouchableOpacity>
            </View>
          );
        })}

        <TouchableOpacity style={[styles.addToneBtn, { backgroundColor: theme.primary }]} onPress={() => void pickRingtone()}>
          <Ionicons name="add-circle-outline" size={20} color="#fff" />
          <Text style={styles.addToneText}>Add ringtone (trim to 1 min)</Text>
        </TouchableOpacity>
      </SettingsCard>
    </>
  );

  const renderPrivacy = () => (
    <>
      <SectionLabel title="Personal" color={sc} />
      <SettingsCard bg={cardBg} border={border}>
        <ToggleRow
          icon="checkmark-done-outline"
          label="Read receipts"
          subtitle="Let others see when you've read messages"
          value={settings.readReceipts}
          onValueChange={(v) => void updateSettings({ readReceipts: v })}
          textColor={tc}
          subColor={sc}
          iconBg="#e8f5e9"
          iconColor="#43a047"
        />
        <ToggleRow
          icon="time-outline"
          label="Show last seen"
          subtitle="Others can see when you were last online"
          value={settings.showLastSeen}
          onValueChange={(v) => void updateSettings({ showLastSeen: v })}
          textColor={tc}
          subColor={sc}
          iconBg="#e3f2fd"
          iconColor="#1e88e5"
          last
        />
      </SettingsCard>
    </>
  );

  const renderChats = () => {
    const c = {
      media: chip('#e3f2fd', '#1976d2'),
      enter: chip('#f3e5f5', '#8e24aa'),
      compact: chip('#eceff1', '#90a4ae'),
      wall: chip('#fff8e1', '#f9a825'),
    };
    return (
      <>
        <SectionLabel title="Chat preferences" color={sc} />
        <SettingsCard bg={cardBg} border={border}>
          <ToggleRow
            icon="cloud-download-outline"
            label="Media auto-download"
            subtitle="Download photos and videos on Wi-Fi"
            value={settings.mediaAutoDownload}
            onValueChange={(v) => void updateSettings({ mediaAutoDownload: v })}
            textColor={tc}
            subColor={sc}
            iconBg={c.media.bg}
            iconColor={c.media.color}
          />
          <ToggleRow
            icon="return-down-back-outline"
            label="Enter to send"
            subtitle="Press Enter to send (web)"
            value={settings.enterToSend}
            onValueChange={(v) => void updateSettings({ enterToSend: v })}
            textColor={tc}
            subColor={sc}
            iconBg={c.enter.bg}
            iconColor={c.enter.color}
          />
          <ToggleRow
            icon="list-outline"
            label="Compact chat list"
            subtitle="Show denser rows in Chats"
            value={settings.compactChatList}
            onValueChange={(v) => void updateSettings({ compactChatList: v })}
            textColor={tc}
            subColor={sc}
            iconBg={c.compact.bg}
            iconColor={c.compact.color}
            last
          />
        </SettingsCard>

        <SectionLabel title="Wallpaper" color={sc} />
        <SettingsCard bg={cardBg} border={border}>
          <LinkRow
            icon="image-outline"
            label="Chat wallpapers"
            subtitle="Open a chat → ⋮ → Wallpaper — colors or your own photo"
            onPress={() =>
              Alert.alert(
                'Chat wallpapers',
                'Open any conversation, tap ⋮, then Wallpaper. Pick a color swatch or Add photo from your gallery. Photos stay on this device.'
              )
            }
            textColor={tc}
            subColor={sc}
            iconBg={c.wall.bg}
            iconColor={c.wall.color}
            last
          />
        </SettingsCard>
      </>
    );
  };

  const renderStorage = () => (
    <>
      <SectionLabel title="Device" color={sc} />
      <SettingsCard bg={cardBg} border={border}>
        <ToggleRow
          icon="cloud-download-outline"
          label="Media auto-download"
          value={settings.mediaAutoDownload}
          onValueChange={(v) => void updateSettings({ mediaAutoDownload: v })}
          textColor={tc}
          subColor={sc}
          iconBg="#e3f2fd"
          iconColor="#1976d2"
        />
        <LinkRow
          icon="trash-outline"
          label={clearing ? 'Clearing…' : 'Clear local cache'}
          subtitle="Remove offline message copies on this device"
          onPress={() => {
            if (!clearing) void clearLocalCache();
          }}
          textColor={tc}
          subColor={sc}
          iconBg="#ffebee"
          iconColor="#e53935"
          destructive
          showChevron={false}
          last
        />
      </SettingsCard>
      {clearing ? <ActivityIndicator style={{ marginTop: 16 }} color={theme.primary} /> : null}
    </>
  );

  const renderAbout = () => (
    <>
      <SettingsCard bg={cardBg} border={border}>
        <View style={styles.aboutBlock}>
          <Image
            source={require('../../../assets/favIconChat.png')}
            style={styles.aboutLogo}
            resizeMode="contain"
          />
          <Text style={[styles.aboutTitle, { color: tc }]}>ChatReel</Text>
          <Text style={[styles.aboutSub, { color: sc }]}>Version {appVersion}</Text>
          <Text style={[styles.aboutBody, { color: sc }]}>
            Chat, calls, moments and reels in one place. Built for friends who stay connected.
          </Text>
        </View>
      </SettingsCard>
    </>
  );

  const tipSections: { title: string; tips: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] }[] = [
    {
      title: 'Chats',
      tips: [
        {
          icon: 'hand-left-outline',
          title: 'Message actions',
          body: 'Long-press any message to reply, star, forward, copy, or delete.',
        },
        {
          icon: 'search-outline',
          title: 'Find in chat',
          body: 'Open ⋮ → Search, type, and tap a result to jump straight to that message.',
        },
        {
          icon: 'image-outline',
          title: 'Wallpapers',
          body: '⋮ → Wallpaper. Choose a color or Add photo from your gallery for that chat.',
        },
        {
          icon: 'notifications-off-outline',
          title: 'Mute a chat',
          body: '⋮ → Mute when you need quiet. Unmute the same way anytime.',
        },
      ],
    },
    {
      title: 'Calls',
      tips: [
        {
          icon: 'videocam-outline',
          title: 'Voice & video',
          body: 'Tap the phone or video icon in a chat header to start a call.',
        },
        {
          icon: 'musical-notes-outline',
          title: 'Custom ringtone',
          body: 'Settings → Notifications → Add ringtone, trim to 1 minute, and save.',
        },
      ],
    },
    {
      title: 'Friends & groups',
      tips: [
        {
          icon: 'qr-code-outline',
          title: 'QR connect',
          body: 'Share My QR code or Scan to add friends and link another device.',
        },
        {
          icon: 'people-outline',
          title: 'Groups',
          body: 'Create a group from Settings → New group, or add members from a group chat menu.',
        },
      ],
    },
    {
      title: 'Look & feel',
      tips: [
        {
          icon: 'moon-outline',
          title: 'Dark & Night',
          body: 'Appearance → Dark for classic black UI, or Night for a deep navy dark theme.',
        },
        {
          icon: 'color-palette-outline',
          title: 'Themes',
          body: 'Blue, Teal, and Classic Green change accents across lists, chats, and menus.',
        },
      ],
    },
  ];

  const renderTips = () => (
    <>
      <Text style={[styles.footnote, { color: sc, marginTop: 0, marginBottom: 8 }]}>
        Handy shortcuts so you get more out of ChatReel.
      </Text>
      {tipSections.map((section) => (
        <React.Fragment key={section.title}>
          <SectionLabel title={section.title} color={sc} />
          <SettingsCard bg={cardBg} border={border}>
            {section.tips.map((tip, index) => (
              <View
                key={tip.title}
                style={[
                  styles.tipRow,
                  index < section.tips.length - 1 && styles.linkRowBorder,
                ]}
              >
                <View
                  style={[
                    styles.linkIcon,
                    {
                      backgroundColor: theme.isDark
                        ? 'rgba(255,255,255,0.08)'
                        : 'rgba(0,122,255,0.1)',
                    },
                  ]}
                >
                  <Ionicons name={tip.icon} size={18} color={theme.primary} />
                </View>
                <View style={styles.linkTextWrap}>
                  <Text style={[styles.linkLabel, { color: tc }]}>{tip.title}</Text>
                  <Text style={[styles.linkSub, { color: sc }]}>{tip.body}</Text>
                </View>
              </View>
            ))}
          </SettingsCard>
        </React.Fragment>
      ))}
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.listBg }]}>
      <View
        style={[
          styles.header,
          {
            marginTop: -insets.top,
            paddingTop: insets.top + 8,
            backgroundColor: theme.headerBg,
          },
        ]}
      >
        <TouchableOpacity onPress={goBack} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={theme.headerText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.headerText }]}>{pageTitle}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        {page === 'hub' && renderHub()}
        {page === 'appearance' && renderAppearance()}
        {page === 'notifications' && renderNotifications()}
        {page === 'privacy' && renderPrivacy()}
        {page === 'chats' && renderChats()}
        {page === 'storage' && renderStorage()}
        {page === 'about' && renderAbout()}
        {page === 'tips' && renderTips()}
      </ScrollView>

      {trimUri ? (
        <RingtoneTrimModal
          visible
          uri={trimUri}
          label={trimLabel}
          initialStartSec={0}
          initialEndSec={null}
          onCancel={closeTrimModal}
          onSave={onSaveTrim}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700' },
  content: { paddingHorizontal: 14, paddingTop: 12 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 14,
    marginLeft: 4,
  },
  card: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  profileAvatar: { width: 64, height: 64, borderRadius: 32 },
  profileText: { flex: 1, minWidth: 0 },
  profileName: { fontSize: 18, fontWeight: '800' },
  profileEmail: { fontSize: 13, marginTop: 2 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
  },
  linkRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(120,120,128,0.18)',
  },
  linkIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkTextWrap: { flex: 1, minWidth: 0, paddingRight: 4 },
  linkLabel: { fontSize: 16, fontWeight: '600' },
  linkSub: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
  },
  themeSwatch: { width: 32, height: 32, borderRadius: 16 },
  libraryHint: {
    fontSize: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
    lineHeight: 17,
  },
  toneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(120,120,128,0.18)',
  },
  toneRowActive: { backgroundColor: 'rgba(37,99,235,0.08)' },
  miniBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(120,120,128,0.12)',
  },
  addToneBtn: {
    margin: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 12,
  },
  addToneText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  footnote: { fontSize: 12, lineHeight: 17, marginTop: 10, marginHorizontal: 6 },
  aboutBlock: { alignItems: 'center', padding: 24, gap: 8 },
  aboutLogo: { width: 72, height: 72, borderRadius: 18, marginBottom: 4 },
  aboutTitle: { fontSize: 22, fontWeight: '800' },
  aboutSub: { fontSize: 13 },
  aboutBody: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginTop: 8 },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
  },
});
