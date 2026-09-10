import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';
import { chatThemePresets, type ChatThemeId } from '../../lib/chatThemes';
import { useChatSettings } from '../../context/ChatSettingsContext';
import { useHeaderChrome } from '../../context/AppChromeContext';
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
import { formatBytes, getLocalCacheBreakdown, type LocalCacheBreakdown } from '../../lib/localCacheSize';
import { clearOfflineFeedKeys, OFFLINE_FEED_KEYS } from '../../lib/offlineFeedStore';
import {
  authenticateAppUnlock,
  getAppLockAvailability,
  getAppLockPinLength,
  hasAppLockPin,
  setAppLockPin,
} from '../../lib/appLock';
import { Account2FASetupSheet } from '../../components/Account2FASetupSheet';
import { AccountDevicesSheet } from '../../components/AccountDevicesSheet';
import { AppLockPinPad } from '../../components/AppLockPinPad';
import { ChatLockChatsPicker } from '../../components/ChatLockChatsPicker';
import { prefetch2faStatus } from '../../lib/account2faCache';

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
  useHeaderChrome(theme.headerBg);

  const [page, setPage] = useState<SettingsPage>('hub');
  const [settingsQuery, setSettingsQuery] = useState('');
  const [twoFaOpen, setTwoFaOpen] = useState(false);
  const [devicesOpen, setDevicesOpen] = useState(false);
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
  const [cacheBreakdown, setCacheBreakdown] = useState<LocalCacheBreakdown | null>(null);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [webLockPinModal, setWebLockPinModal] = useState<{
    purpose: 'app' | 'chat';
    mode: 'setup' | 'confirm' | 'verify';
    intent?: 'enable' | 'disable';
    draft?: string;
    pinLength?: number | null;
  } | null>(null);
  const [webLockPinError, setWebLockPinError] = useState<string | null>(null);
  const [chatLockPickerOpen, setChatLockPickerOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    void prefetch2faStatus();
  }, [user]);

  const refreshCacheSize = useCallback(async () => {
    setCacheLoading(true);
    try {
      setCacheBreakdown(await getLocalCacheBreakdown());
    } catch {
      setCacheBreakdown(null);
    } finally {
      setCacheLoading(false);
    }
  }, []);

  useEffect(() => {
    if (page === 'storage') void refreshCacheSize();
  }, [page, refreshCacheSize]);

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
    else {
      setSettingsQuery('');
      setPage('hub');
    }
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
      await clearOfflineFeedKeys(Object.values(OFFLINE_FEED_KEYS));
      if (Platform.OS !== 'web') {
        const dir = `${FileSystem.cacheDirectory ?? ''}reels-cache/`;
        if (dir) {
          const info = await FileSystem.getInfoAsync(dir);
          if (info.exists) await FileSystem.deleteAsync(dir, { idempotent: true });
        }
      }
      showAppToast('Local cache cleared');
      await refreshCacheSize();
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

  const toggleAppLock = async (next: boolean) => {
    if (!next) {
      await updateSettings({ appLockBiometric: false });
      showAppToast('App lock turned off');
      return;
    }

    if (Platform.OS === 'web') {
      setWebLockPinError(null);
      const hasPin = await hasAppLockPin();
      setWebLockPinModal({
        purpose: 'app',
        mode: hasPin ? 'verify' : 'setup',
        intent: 'enable',
        pinLength: hasPin ? await getAppLockPinLength() : 4,
      });
      return;
    }

    const availability = await getAppLockAvailability();
    if (!availability.available) {
      Alert.alert('App lock unavailable', availability.reason || 'Cannot enable app lock.');
      return;
    }

    const verified = await authenticateAppUnlock(
      `Enable app lock with ${availability.biometricsLabel}`
    );
    if (!verified.success) {
      if (verified.error) {
        Alert.alert('App lock', verified.error);
      }
      return;
    }

    await updateSettings({ appLockBiometric: true });
    showAppToast(`App lock on · ${availability.biometricsLabel}`);
  };

  const toggleChatLock = async (next: boolean) => {
    if (!next) {
      if (Platform.OS === 'web') {
        setWebLockPinError(null);
        const hasPin = await hasAppLockPin();
        if (!hasPin) {
          await updateSettings({ chatLockEnabled: false });
          showAppToast('Chat lock turned off');
          return;
        }
        setWebLockPinModal({
          purpose: 'chat',
          mode: 'verify',
          intent: 'disable',
          pinLength: await getAppLockPinLength(),
        });
        return;
      }

      const verified = await authenticateAppUnlock('Turn off chat lock');
      if (!verified.success) {
        if (verified.error) {
          Alert.alert('Chat lock', verified.error);
        }
        return;
      }
      await updateSettings({ chatLockEnabled: false });
      showAppToast('Chat lock turned off');
      return;
    }

    if (Platform.OS === 'web') {
      setWebLockPinError(null);
      const hasPin = await hasAppLockPin();
      setWebLockPinModal({
        purpose: 'chat',
        mode: hasPin ? 'verify' : 'setup',
        intent: 'enable',
        pinLength: hasPin ? await getAppLockPinLength() : 4,
      });
      return;
    }

    const availability = await getAppLockAvailability();
    if (!availability.available) {
      Alert.alert('Chat lock unavailable', availability.reason || 'Cannot enable chat lock.');
      return;
    }

    const verified = await authenticateAppUnlock(
      `Enable chat lock with ${availability.biometricsLabel}`
    );
    if (!verified.success) {
      if (verified.error) {
        Alert.alert('Chat lock', verified.error);
      }
      return;
    }

    await updateSettings({ chatLockEnabled: true });
    showAppToast(`Chat lock on · conversations only`);
  };

  const finishWebLockChange = async (
    purpose: 'app' | 'chat',
    intent: 'enable' | 'disable' = 'enable'
  ) => {
    if (intent === 'disable') {
      if (purpose === 'chat') {
        await updateSettings({ chatLockEnabled: false });
        showAppToast('Chat lock turned off');
      } else {
        await updateSettings({ appLockBiometric: false });
        showAppToast('App lock turned off');
      }
      setWebLockPinModal(null);
      setWebLockPinError(null);
      return;
    }

    if (purpose === 'app') {
      await updateSettings({ appLockBiometric: true });
      showAppToast('App lock on · PIN code');
    } else {
      await updateSettings({ chatLockEnabled: true });
      showAppToast('Chat lock on · PIN code');
    }
    setWebLockPinModal(null);
    setWebLockPinError(null);
  };

  const onWebLockPinSubmit = async (pin: string): Promise<boolean> => {
    if (!webLockPinModal) return false;
    const { purpose, mode, draft, intent = 'enable', pinLength } = webLockPinModal;
    setWebLockPinError(null);

    if (mode === 'setup') {
      if (pin.length < 4) {
        setWebLockPinError('Use a 4–6 digit code.');
        return false;
      }
      setWebLockPinModal({ purpose, mode: 'confirm', intent, draft: pin, pinLength: pin.length });
      return true;
    }

    if (mode === 'confirm') {
      if (pin !== draft) {
        setWebLockPinError('Codes do not match. Try again.');
        setWebLockPinModal({ purpose, mode: 'setup', intent, pinLength: 4 });
        return false;
      }
      const result = await setAppLockPin(pin);
      if (!result.ok) {
        setWebLockPinError(result.error);
        setWebLockPinModal({ purpose, mode: 'setup', intent, pinLength: 4 });
        return false;
      }
      await finishWebLockChange(purpose, intent);
      return true;
    }

    const verified = await authenticateAppUnlock(undefined, pin);
    if (!verified.success) {
      const max = pinLength && pinLength >= 4 ? pinLength : 6;
      if (pin.length >= max) setWebLockPinError(verified.error || 'Wrong code');
      return false;
    }
    await finishWebLockChange(purpose, intent);
    return true;
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

    const q = settingsQuery.trim().toLowerCase();
    const match = (...parts: Array<string | undefined>) => {
      if (!q) return true;
      return parts.some((p) => (p || '').toLowerCase().includes(q));
    };

    type SearchHit = {
      key: string;
      label: string;
      subtitle?: string;
      icon: keyof typeof Ionicons.glyphMap;
      iconBg: string;
      iconColor: string;
      onPress: () => void;
    };

    const searchHits: SearchHit[] = [
      {
        key: 'profile',
        label: 'Edit profile',
        subtitle: 'Name, photo, bio, language',
        icon: 'person-outline',
        iconBg: a.appearance.bg,
        iconColor: a.appearance.color,
        onPress: () => {
          void prefetchMyProfile(user?.email);
          navigation.navigate('Profile');
        },
      },
      {
        key: '2fa',
        label: 'Two-step verification',
        subtitle: 'Secret code · security question',
        icon: 'shield-checkmark-outline',
        iconBg: '#e8eaf6',
        iconColor: '#5c6bc0',
        onPress: () => {
          if (!user) {
            Alert.alert('Sign in required', 'Sign in to set up two-step verification.');
            return;
          }
          setTwoFaOpen(true);
        },
      },
      {
        key: 'devices',
        label: 'Logged-in devices',
        subtitle: 'Sessions · QR-linked devices',
        icon: 'phone-portrait-outline',
        iconBg: '#efebe9',
        iconColor: '#8d6e63',
        onPress: () => {
          if (!user) {
            Alert.alert('Sign in required', 'Sign in to manage devices.');
            return;
          }
          setDevicesOpen(true);
        },
      },
      {
        key: 'privacy',
        label: 'Privacy and security',
        subtitle: 'Receipts, presence, app lock, chat lock',
        icon: 'lock-closed-outline',
        iconBg: a.privacy.bg,
        iconColor: a.privacy.color,
        onPress: () => setPage('privacy'),
      },
      {
        key: 'appearance',
        label: 'Appearance',
        subtitle: 'Theme · light dark night',
        icon: 'color-palette-outline',
        iconBg: a.appearance.bg,
        iconColor: a.appearance.color,
        onPress: () => setPage('appearance'),
      },
      {
        key: 'chats',
        label: 'Chats',
        subtitle: 'Wallpaper, media, enter to send',
        icon: 'chatbubbles-outline',
        iconBg: a.chats.bg,
        iconColor: a.chats.color,
        onPress: () => setPage('chats'),
      },
      {
        key: 'notif',
        label: 'Notifications',
        subtitle: 'Ringtones and alerts',
        icon: 'notifications-outline',
        iconBg: a.notif.bg,
        iconColor: a.notif.color,
        onPress: () => setPage('notifications'),
      },
      {
        key: 'storage',
        label: 'Storage and data',
        subtitle: 'Cache size and clear',
        icon: 'folder-outline',
        iconBg: a.storage.bg,
        iconColor: a.storage.color,
        onPress: () => setPage('storage'),
      },
      {
        key: 'about',
        label: 'About',
        subtitle: 'Version and legal',
        icon: 'information-circle-outline',
        iconBg: a.about.bg,
        iconColor: a.about.color,
        onPress: () => setPage('about'),
      },
      {
        key: 'tips',
        label: 'Tips',
        subtitle: 'How to use ChatReel',
        icon: 'bulb-outline',
        iconBg: a.tips.bg,
        iconColor: a.tips.color,
        onPress: () => setPage('tips'),
      },
      {
        key: 'friends',
        label: 'Friends',
        subtitle: 'People you know',
        icon: 'people-outline',
        iconBg: a.friends.bg,
        iconColor: a.friends.color,
        onPress: () => navigation.navigate('FriendsList'),
      },
      {
        key: 'add',
        label: 'Add friend',
        subtitle: 'Search by username or email',
        icon: 'person-add-outline',
        iconBg: a.add.bg,
        iconColor: a.add.color,
        onPress: () => {
          void import('../../lib/addFriendPrefetch').then((m) => m.prefetchAddFriend());
          navigation.navigate('AddFriend');
        },
      },
      {
        key: 'qr',
        label: 'My QR code',
        subtitle: 'Link a device',
        icon: 'qr-code-outline',
        iconBg: a.qr.bg,
        iconColor: a.qr.color,
        onPress: () => navigation.navigate('QRCode'),
      },
      {
        key: 'scanner',
        label: 'Link a Device',
        subtitle: 'Scan QR · add friend',
        icon: 'scan-outline',
        iconBg: a.devices.bg,
        iconColor: a.devices.color,
        onPress: () => navigation.navigate('QRScanner'),
      },
      {
        key: 'search',
        label: 'Search messages',
        subtitle: 'Find chats and media',
        icon: 'search-outline',
        iconBg: a.explore.bg,
        iconColor: a.explore.color,
        onPress: () => navigation.navigate('GlobalSearch'),
      },
      {
        key: 'explore',
        label: 'Explore',
        subtitle: 'Feed and market',
        icon: 'compass-outline',
        iconBg: a.explore.bg,
        iconColor: a.explore.color,
        onPress: () => goTab('Explore'),
      },
      {
        key: 'calls',
        label: 'Calls',
        subtitle: 'Voice and video',
        icon: 'call-outline',
        iconBg: a.calls.bg,
        iconColor: a.calls.color,
        onPress: () => goTab('Calls'),
      },
    ].filter((hit) => match(hit.label, hit.subtitle, hit.key));

    return (
      <>
        <View
          style={[
            styles.settingsSearchWrap,
            {
              backgroundColor: theme.isDark ? theme.listCardBg : '#fff',
              borderColor: settingsQuery ? theme.primary : 'transparent',
              shadowOpacity: theme.isDark ? 0 : 0.06,
              elevation: theme.isDark ? 0 : 2,
            },
          ]}
        >
          <View
            style={[
              styles.settingsSearchIcon,
              {
                backgroundColor: settingsQuery
                  ? theme.isDark
                    ? `${theme.primary}33`
                    : `${theme.primary}18`
                  : theme.searchBg,
              },
            ]}
          >
            <Ionicons
              name="search"
              size={16}
              color={settingsQuery ? theme.primary : sc}
            />
          </View>
          <TextInput
            value={settingsQuery}
            onChangeText={setSettingsQuery}
            placeholder="Search settings"
            placeholderTextColor={theme.searchPlaceholder}
            style={[styles.settingsSearchInput, { color: theme.searchText }]}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="never"
            underlineColorAndroid="transparent"
          />
          {settingsQuery ? (
            <TouchableOpacity
              style={[styles.settingsClearChip, { backgroundColor: theme.searchBg }]}
              onPress={() => setSettingsQuery('')}
              hitSlop={10}
            >
              <Ionicons name="close" size={14} color={sc} />
            </TouchableOpacity>
          ) : null}
        </View>

        {q ? (
          <>
            <SectionLabel title={searchHits.length ? 'Results' : 'No matches'} color={sc} />
            <SettingsCard bg={cardBg} border={border}>
              {searchHits.length === 0 ? (
                <Text style={[styles.linkSub, { color: sc, padding: 16 }]}>
                  Try “lock”, “theme”, “devices”, or “ringtone”.
                </Text>
              ) : (
                searchHits.map((hit, index) => (
                  <LinkRow
                    key={hit.key}
                    icon={hit.icon}
                    label={hit.label}
                    subtitle={hit.subtitle}
                    onPress={() => {
                      setSettingsQuery('');
                      hit.onPress();
                    }}
                    textColor={tc}
                    subColor={sc}
                    iconBg={hit.iconBg}
                    iconColor={hit.iconColor}
                    last={index === searchHits.length - 1}
                  />
                ))
              )}
            </SettingsCard>
          </>
        ) : (
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

        {/* Account = identity & security only. Profile card above is the edit entry. */}
        <SectionLabel title="Account" color={sc} />
        <SettingsCard bg={cardBg} border={border}>
          <LinkRow
            icon="shield-checkmark-outline"
            label="Two-step verification"
            subtitle="Secret code on new devices · security question to reset"
            onPress={() => {
              if (!user) {
                Alert.alert('Sign in required', 'Sign in to set up two-step verification.');
                return;
              }
              setTwoFaOpen(true);
            }}
            textColor={tc}
            subColor={sc}
            iconBg="#e8eaf6"
            iconColor="#5c6bc0"
          />
          <LinkRow
            icon="phone-portrait-outline"
            label="Logged-in devices"
            subtitle="Sessions · QR-linked devices · log out any"
            onPress={() => {
              if (!user) {
                Alert.alert('Sign in required', 'Sign in to manage devices.');
                return;
              }
              setDevicesOpen(true);
            }}
            textColor={tc}
            subColor={sc}
            iconBg="#efebe9"
            iconColor="#8d6e63"
          />
          <LinkRow
            icon="lock-closed-outline"
            label="Privacy and security"
            subtitle="Receipts, presence, app lock, chat lock"
            onPress={() => setPage('privacy')}
            textColor={tc}
            subColor={sc}
            iconBg={a.privacy.bg}
            iconColor={a.privacy.color}
            last
          />
        </SettingsCard>

        <SectionLabel title="People" color={sc} />
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
            onPress={() => {
              void import('../../lib/addFriendPrefetch').then((m) => m.prefetchAddFriend());
              navigation.navigate('AddFriend');
            }}
            textColor={tc}
            subColor={sc}
            iconBg={a.add.bg}
            iconColor={a.add.color}
          />
          <LinkRow
            icon="mail-unread-outline"
            label="Friend requests"
            subtitle="Incoming connection requests"
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
            subtitle="Create a group chat"
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
            subtitle="Share a link to ChatReel"
            onPress={() => {
              void import('../../lib/appInviteLinks').then(({ shareAppInvite }) =>
                shareAppInvite({
                  fromName: profile?.display_name || user?.email || null,
                  fromUserId: user?.id ?? null,
                })
              );
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
            subtitle="Chats, privacy, devices, reels & more"
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
        )}
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
        />
        <ToggleRow
          icon="radio-outline"
          label="Online status"
          subtitle="Show when you are currently online"
          value={settings.showOnlineStatus}
          onValueChange={(v) => void updateSettings({ showOnlineStatus: v })}
          textColor={tc}
          subColor={sc}
          iconBg="#e0f7fa"
          iconColor="#00acc1"
        />
        <ToggleRow
          icon="chatbubble-ellipses-outline"
          label="Typing indicator"
          subtitle="Let others see when you are typing"
          value={settings.showTypingIndicator}
          onValueChange={(v) => void updateSettings({ showTypingIndicator: v })}
          textColor={tc}
          subColor={sc}
          iconBg="#fff3e0"
          iconColor="#fb8c00"
          last
        />
      </SettingsCard>

      <SectionLabel title="Content" color={sc} />
      <SettingsCard bg={cardBg} border={border}>
        <ToggleRow
          icon="link-outline"
          label="Link previews"
          subtitle="Show previews for links in chats"
          value={settings.linkPreviews}
          onValueChange={(v) => void updateSettings({ linkPreviews: v })}
          textColor={tc}
          subColor={sc}
          iconBg="#e8eaf6"
          iconColor="#5c6bc0"
        />
        <ToggleRow
          icon="images-outline"
          label="Save media to gallery"
          subtitle="Auto-save received photos and videos on this device"
          value={settings.saveMediaToGallery}
          onValueChange={(v) => void updateSettings({ saveMediaToGallery: v })}
          textColor={tc}
          subColor={sc}
          iconBg="#fce4ec"
          iconColor="#ec407a"
          last
        />
      </SettingsCard>

      <SectionLabel title="Security" color={sc} />
      <SettingsCard bg={cardBg} border={border}>
        <ToggleRow
          icon="phone-portrait-outline"
          label="App lock"
          subtitle={
            Platform.OS === 'web'
              ? 'Locks ChatReel when you leave this tab — unlock with PIN'
              : 'Locks the whole app when you leave ChatReel'
          }
          value={settings.appLockBiometric}
          onValueChange={(v) => void toggleAppLock(v)}
          textColor={tc}
          subColor={sc}
          iconBg="#efebe9"
          iconColor="#8d6e63"
        />
        <ToggleRow
          icon="chatbubbles-outline"
          label="Chat lock"
          subtitle={
            settings.chatLockEnabled
              ? settings.chatLockScope === 'selected'
                ? `Specific chats · ${settings.chatLockedKeys.length} locked`
                : 'All chats · unlock when you open Chats'
              : 'PIN-gate conversations — does not lock the whole app'
          }
          value={settings.chatLockEnabled}
          onValueChange={(v) => void toggleChatLock(v)}
          textColor={tc}
          subColor={sc}
          iconBg="#e8eaf6"
          iconColor="#5c6bc0"
          last={!settings.chatLockEnabled}
        />
        {settings.chatLockEnabled ? (
          <>
            <TouchableOpacity
              style={[styles.linkRow, styles.linkRowBorder]}
              onPress={() => void updateSettings({ chatLockScope: 'all' })}
              activeOpacity={0.7}
            >
              <View style={[styles.linkIcon, { backgroundColor: '#e8eaf6' }]}>
                <Ionicons
                  name={settings.chatLockScope === 'all' ? 'radio-button-on' : 'radio-button-off'}
                  size={18}
                  color="#5c6bc0"
                />
              </View>
              <View style={styles.linkTextWrap}>
                <Text style={[styles.linkLabel, { color: tc }]}>Lock all chats</Text>
                <Text style={[styles.linkSub, { color: sc }]} numberOfLines={2}>
                  Require unlock to open the Chats tab
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.linkRow, styles.linkRowBorder]}
              onPress={() => {
                void updateSettings({ chatLockScope: 'selected' });
                if (settings.chatLockedKeys.length === 0) {
                  setChatLockPickerOpen(true);
                }
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.linkIcon, { backgroundColor: '#e8eaf6' }]}>
                <Ionicons
                  name={
                    settings.chatLockScope === 'selected'
                      ? 'radio-button-on'
                      : 'radio-button-off'
                  }
                  size={18}
                  color="#5c6bc0"
                />
              </View>
              <View style={styles.linkTextWrap}>
                <Text style={[styles.linkLabel, { color: tc }]}>Lock specific chats</Text>
                <Text style={[styles.linkSub, { color: sc }]} numberOfLines={2}>
                  Only chosen conversations need unlock
                </Text>
              </View>
            </TouchableOpacity>
            {settings.chatLockScope === 'selected' ? (
              <LinkRow
                icon="list-outline"
                label="Choose chats"
                subtitle={
                  settings.chatLockedKeys.length
                    ? `${settings.chatLockedKeys.length} selected`
                    : 'Pick which chats to lock'
                }
                onPress={() => setChatLockPickerOpen(true)}
                textColor={tc}
                subColor={sc}
                iconBg="#e8eaf6"
                iconColor="#5c6bc0"
              />
            ) : null}
          </>
        ) : null}
        <ToggleRow
          icon="videocam-off-outline"
          label="Call privacy"
          subtitle="Hide call preview and block capture when you leave the app"
          value={settings.callPrivacyOnBackground}
          onValueChange={(v) => void updateSettings({ callPrivacyOnBackground: v })}
          textColor={tc}
          subColor={sc}
          iconBg="#e0f2f1"
          iconColor="#00897b"
        />
        <LinkRow
          icon="people-outline"
          label="Friends and blocked"
          subtitle="Manage who can message you"
          onPress={() => navigation.navigate('FriendsList', { mode: 'privacy' })}
          textColor={tc}
          subColor={sc}
          iconBg="#e3f2fd"
          iconColor="#1976d2"
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
      <SectionLabel title="Local usage" color={sc} />
      <SettingsCard bg={cardBg} border={border}>
        <View style={styles.storageBlock}>
          <Text style={[styles.storageTotal, { color: tc }]}>
            {cacheLoading && !cacheBreakdown
              ? 'Calculating…'
              : formatBytes(cacheBreakdown?.totalBytes ?? 0)}
          </Text>
          <Text style={[styles.storageHint, { color: sc }]}>
            Offline data stored on this device
          </Text>
          <View style={styles.storageRows}>
            <Text style={[styles.storageRow, { color: sc }]}>
              Messages · {formatBytes(cacheBreakdown?.messagesBytes ?? 0)}
            </Text>
            <Text style={[styles.storageRow, { color: sc }]}>
              Moments, calls & reels · {formatBytes(cacheBreakdown?.feedsBytes ?? 0)}
            </Text>
            <Text style={[styles.storageRow, { color: sc }]}>
              Reel media files · {formatBytes(cacheBreakdown?.reelsMediaBytes ?? 0)}
            </Text>
          </View>
        </View>
      </SettingsCard>

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
          icon="refresh-outline"
          label="Refresh size"
          subtitle="Recalculate local cache usage"
          onPress={() => void refreshCacheSize()}
          textColor={tc}
          subColor={sc}
          iconBg="#eceff1"
          iconColor="#607d8b"
          showChevron={false}
        />
        <LinkRow
          icon="trash-outline"
          label={clearing ? 'Clearing…' : 'Clear local cache'}
          subtitle="Remove offline message copies and feed caches on this device"
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
          body: 'Long-press any message to reply, star, pin, forward, copy, or delete.',
        },
        {
          icon: 'timer-outline',
          title: 'Disappearing & view once',
          body: 'Use chat settings for a disappear timer, or send view-once media that closes after you open it (pick 5s / 10s / 30s).',
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
      title: 'Privacy & security',
      tips: [
        {
          icon: 'lock-closed-outline',
          title: 'App lock & chat lock',
          body: 'Lock the whole app, or lock only the Chats tab so reels stay open without a PIN.',
        },
        {
          icon: 'eye-off-outline',
          title: 'Secret Space',
          body: 'Hide chats in a vault with a PIN. Open it by long-pressing the logo or entering your code in Search.',
        },
        {
          icon: 'shield-checkmark-outline',
          title: 'Account 2FA',
          body: 'Settings → Account → Two-step verification. New devices need your secret code (recover with your security question).',
        },
        {
          icon: 'phone-portrait-outline',
          title: 'Logged-in devices',
          body: 'Settings → Account → Logged-in devices to see every login, sign out any device, or remote-wipe all sessions.',
        },
        {
          icon: 'people-outline',
          title: 'Friends & groups',
          body: 'Settings → People for friends, requests, and creating groups — separate from your Account settings.',
        },
      ],
    },
    {
      title: 'Calls',
      tips: [
        {
          icon: 'videocam-outline',
          title: 'Voice & video',
          body: 'Tap the phone or video icon in a chat header to start a call. React during a call from the reactions bar.',
        },
        {
          icon: 'eye-outline',
          title: 'Call privacy',
          body: 'When you leave ChatReel mid-call, the call screen is covered so others nearby can’t see it.',
        },
        {
          icon: 'musical-notes-outline',
          title: 'Custom ringtone',
          body: 'Settings → Notifications → Add ringtone, trim to 1 minute, and save.',
        },
      ],
    },
    {
      title: 'Reels',
      tips: [
        {
          icon: 'refresh-outline',
          title: 'Pull for newer reels',
          body: 'On the first reel, pull down to refresh and load the newest posts in For You or Following.',
        },
        {
          icon: 'film-outline',
          title: 'Post & trim',
          body: 'Trim, filter, and caption before you post. Uploads continue in the background from the status chip.',
        },
      ],
    },
    {
      title: 'Friends & groups',
      tips: [
        {
          icon: 'qr-code-outline',
          title: 'QR connect',
          body: 'Share My QR or Scan to add friends. Device-link codes work for a few minutes — hold steady until it confirms.',
        },
        {
          icon: 'people-outline',
          title: 'Groups',
          body: 'Create a group from Settings → New group, or add members from a group chat menu.',
        },
        {
          icon: 'ban-outline',
          title: 'Block',
          body: 'Blocked people can’t find you in search, or show up in your reels and moments feeds.',
        },
      ],
    },
    {
      title: 'Look & feel',
      tips: [
        {
          icon: 'moon-outline',
          title: 'Dark & Night',
          body: 'Appearance → ChatReel Blue, Gray, or Light Gray for light UI, Dark for classic black, or Night for a deep navy dark theme.',
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
      <StatusBar
        barStyle="light-content"
        backgroundColor={theme.headerBg}
      />
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

      <Account2FASetupSheet visible={twoFaOpen} onClose={() => setTwoFaOpen(false)} />
      <AccountDevicesSheet visible={devicesOpen} onClose={() => setDevicesOpen(false)} />

      <Modal
        visible={Boolean(webLockPinModal)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setWebLockPinModal(null);
          setWebLockPinError(null);
        }}
      >
        <View style={styles.webLockRoot}>
          <Pressable
            style={styles.webLockBackdrop}
            onPress={() => {
              setWebLockPinModal(null);
              setWebLockPinError(null);
            }}
          />
          <View
            style={[
              styles.webLockCard,
              { backgroundColor: theme.listCardBg, borderColor: theme.listBorder },
            ]}
          >
            <AppLockPinPad
              light
              title={
                webLockPinModal?.mode === 'setup'
                  ? 'Create app lock PIN'
                  : webLockPinModal?.mode === 'confirm'
                    ? 'Confirm PIN'
                    : 'Enter unlock PIN'
              }
              subtitle={
                webLockPinModal?.mode === 'setup'
                  ? 'Choose a 4-digit code to unlock ChatReel on this browser.'
                  : webLockPinModal?.mode === 'confirm'
                    ? 'Enter the same code again.'
                    : webLockPinModal?.intent === 'disable'
                      ? 'Enter your PIN to turn this lock off.'
                      : 'Verify your PIN to turn this lock on.'
              }
              error={webLockPinError}
              pinLength={
                webLockPinModal?.mode === 'setup'
                  ? 4
                  : webLockPinModal?.mode === 'confirm'
                    ? webLockPinModal.draft?.length ?? 4
                    : webLockPinModal?.pinLength ?? null
              }
              onSubmit={onWebLockPinSubmit}
            />
            <TouchableOpacity
              style={styles.webLockCancel}
              onPress={() => {
                setWebLockPinModal(null);
                setWebLockPinError(null);
              }}
            >
              <Text style={{ color: theme.listSecondaryText, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {chatLockPickerOpen ? (
        <ChatLockChatsPicker
          visible={chatLockPickerOpen}
          selectedKeys={settings.chatLockedKeys}
          onClose={() => setChatLockPickerOpen(false)}
          onSave={(keys) => {
            void updateSettings({
              chatLockScope: 'selected',
              chatLockedKeys: keys,
            });
            setChatLockPickerOpen(false);
            showAppToast(
              keys.length
                ? `${keys.length} chat${keys.length === 1 ? '' : 's'} locked`
                : 'No chats locked'
            );
          }}
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
  settingsSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 22,
    borderWidth: 1.5,
    paddingLeft: 6,
    paddingRight: 10,
    paddingVertical: 6,
    marginBottom: 14,
    shadowColor: '#0f172a',
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  settingsSearchIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsSearchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.2,
    padding: 0,
    margin: 0,
  },
  settingsClearChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
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
  storageBlock: { paddingHorizontal: 16, paddingVertical: 16, gap: 4 },
  storageTotal: { fontSize: 28, fontWeight: '800' },
  storageHint: { fontSize: 13, marginBottom: 8 },
  storageRows: { gap: 4, marginTop: 4 },
  storageRow: { fontSize: 13, lineHeight: 18 },
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
  webLockRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  webLockBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  webLockCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
    alignItems: 'center',
  },
  webLockCancel: {
    marginTop: 4,
    paddingVertical: 12,
  },
});
