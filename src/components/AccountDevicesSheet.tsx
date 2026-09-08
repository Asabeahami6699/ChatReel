import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChatSettings } from '../context/ChatSettingsContext';
import { api } from '../lib/api';
import { getInstallationId } from '../lib/installationId';
import { showAppToast } from '../lib/appToast';
import { useAuth } from '../hooks/useAuth';
import { clearUserLocalCaches } from '../lib/clearUserLocalCaches';
import { registerCurrentDevice } from '../lib/deviceSession';

type DeviceRow = {
  id: string;
  installation_id: string;
  label: string | null;
  platform?: string | null;
  device_name?: string | null;
  trusted_at: string;
  last_seen_at: string;
  is_current?: boolean;
};

type LinkedRow = {
  id: string;
  peer_user_id: string;
  label: string;
  avatar_url?: string | null;
  linked_at: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
};

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function platformIcon(platform?: string | null): keyof typeof Ionicons.glyphMap {
  if (platform === 'ios') return 'phone-portrait-outline';
  if (platform === 'android') return 'phone-portrait-outline';
  if (platform === 'web') return 'laptop-outline';
  return 'hardware-chip-outline';
}

export function AccountDevicesSheet({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useChatSettings();
  const { user, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [linked, setLinked] = useState<LinkedRow[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await registerCurrentDevice();
      const installId = await getInstallationId();
      setCurrentId(installId);
      const res = await api.accountSessions.listDevices(installId);
      setDevices(res.devices ?? []);
      setLinked(res.linked ?? []);
    } catch (e) {
      Alert.alert(
        'Could not load devices',
        e instanceof Error ? e.message : 'Check your connection and try again.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    void refresh();
  }, [visible, refresh]);

  const logoutDevice = (device: DeviceRow) => {
    const isCurrent = device.is_current || device.installation_id === currentId;
    Alert.alert(
      isCurrent ? 'Sign out this device?' : 'Sign out device?',
      isCurrent
        ? `${device.label || 'This device'} will be signed out now.`
        : `${device.label || 'Device'} will be signed out the next time it opens ChatReel.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusyId(device.id);
              try {
                await api.accountSessions.revokeDevice(device.id);
                if (isCurrent) {
                  await clearUserLocalCaches(user?.id ?? null);
                  onClose();
                  await signOut();
                  showAppToast('Signed out');
                  return;
                }
                showAppToast('Device signed out');
                await refresh();
              } catch (e) {
                Alert.alert(
                  'Sign out failed',
                  e instanceof Error ? e.message : 'Try again'
                );
              } finally {
                setBusyId(null);
              }
            })();
          },
        },
      ]
    );
  };

  const unlinkDevice = (row: LinkedRow) => {
    Alert.alert(
      'Unlink device?',
      `Remove the QR link with ${row.label}? This does not sign anyone out.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusyId(`linked-${row.id}`);
              try {
                await api.accountSessions.unlinkLinkedDevice(row.id);
                showAppToast('Device unlinked');
                await refresh();
              } catch (e) {
                Alert.alert(
                  'Unlink failed',
                  e instanceof Error ? e.message : 'Try again'
                );
              } finally {
                setBusyId(null);
              }
            })();
          },
        },
      ]
    );
  };

  const logoutOthers = () => {
    Alert.alert(
      'Sign out other devices',
      'All devices except this one will be signed out.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out others',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusyId('others');
              try {
                const installId = await getInstallationId();
                const res = await api.accountSessions.logoutOthers(installId);
                showAppToast(res.message || 'Other devices signed out');
                await refresh();
              } catch (e) {
                Alert.alert(
                  'Could not sign out others',
                  e instanceof Error ? e.message : 'Try again'
                );
              } finally {
                setBusyId(null);
              }
            })();
          },
        },
      ]
    );
  };

  const remoteWipe = () => {
    Alert.alert(
      'Remote wipe sessions',
      'Signs out every device including this one and clears linked devices. You will need to sign in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Wipe all',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusyId('wipe');
              try {
                await api.accountSessions.remoteWipe();
                await clearUserLocalCaches(user?.id ?? null);
                onClose();
                await signOut();
                showAppToast('All sessions wiped');
              } catch (e) {
                Alert.alert('Wipe failed', e instanceof Error ? e.message : 'Try again');
              } finally {
                setBusyId(null);
              }
            })();
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.backdrop,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.listCardBg, borderColor: theme.listBorder },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Ionicons name="phone-portrait-outline" size={22} color={theme.primary} />
            <Text style={[styles.title, { color: theme.listPrimaryText }]}>Logged-in devices</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={theme.listSecondaryText} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.subtitle, { color: theme.listSecondaryText }]}>
            Sessions signed into your account, plus devices linked by QR.
          </Text>

          {loading ? (
            <ActivityIndicator style={{ marginVertical: 28 }} color={theme.primary} />
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 8 }}>
              <Text style={[styles.section, { color: theme.listSecondaryText }]}>
                Active sessions
              </Text>
              {devices.length === 0 ? (
                <Text style={[styles.empty, { color: theme.listSecondaryText }]}>
                  No sessions registered yet. Open ChatReel once while online.
                </Text>
              ) : (
                devices.map((device) => {
                  const isCurrent =
                    device.is_current || device.installation_id === currentId;
                  const viaQr = /QR|Linked via/i.test(
                    `${device.label || ''} ${device.device_name || ''}`
                  );
                  return (
                    <View
                      key={device.id}
                      style={[styles.row, { borderBottomColor: theme.listBorder }]}
                    >
                      <View
                        style={[
                          styles.iconWrap,
                          { backgroundColor: theme.isDark ? '#222' : '#eef2f7' },
                        ]}
                      >
                        <Ionicons
                          name={platformIcon(device.platform)}
                          size={20}
                          color={theme.primary}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.rowTitle, { color: theme.listPrimaryText }]}
                          numberOfLines={1}
                        >
                          {device.label || device.device_name || 'Device'}
                          {isCurrent ? ' · This device' : ''}
                        </Text>
                        <Text style={{ color: theme.listSecondaryText, fontSize: 12 }}>
                          {viaQr ? 'Linked via QR · ' : ''}
                          Last active {formatWhen(device.last_seen_at)}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.logoutBtn}
                        disabled={busyId === device.id}
                        onPress={() => logoutDevice(device)}
                      >
                        {busyId === device.id ? (
                          <ActivityIndicator size="small" color="#ef5350" />
                        ) : (
                          <Text style={styles.logoutText}>
                            {isCurrent ? 'Sign out' : 'Log out'}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}

              <Text
                style={[
                  styles.section,
                  styles.sectionSpaced,
                  { color: theme.listSecondaryText },
                ]}
              >
                Linked by QR
              </Text>
              {linked.length === 0 ? (
                <Text style={[styles.empty, { color: theme.listSecondaryText }]}>
                  No QR account links yet. Pair from Link a Device / My QR Code.
                </Text>
              ) : (
                linked.map((row) => (
                  <View
                    key={row.id}
                    style={[styles.row, { borderBottomColor: theme.listBorder }]}
                  >
                    <View
                      style={[
                        styles.iconWrap,
                        { backgroundColor: theme.isDark ? '#222' : '#eef2f7' },
                      ]}
                    >
                      <Ionicons name="link-outline" size={20} color={theme.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.rowTitle, { color: theme.listPrimaryText }]}
                        numberOfLines={1}
                      >
                        {row.label}
                      </Text>
                      <Text style={{ color: theme.listSecondaryText, fontSize: 12 }}>
                        Linked {formatWhen(row.linked_at)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.logoutBtn}
                      disabled={busyId === `linked-${row.id}`}
                      onPress={() => unlinkDevice(row)}
                    >
                      {busyId === `linked-${row.id}` ? (
                        <ActivityIndicator size="small" color="#ef5350" />
                      ) : (
                        <Text style={styles.logoutText}>Unlink</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          )}

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: theme.primary }]}
            disabled={busyId === 'others' || loading}
            onPress={logoutOthers}
          >
            {busyId === 'others' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.actionText}>Log out other devices</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.wipeBtn]}
            disabled={busyId === 'wipe' || loading}
            onPress={remoteWipe}
          >
            {busyId === 'wipe' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.actionText}>Remote wipe all sessions</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
  },
  sheet: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    maxHeight: '88%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(127,127,127,0.35)',
    marginBottom: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { flex: 1, fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  list: { maxHeight: 360 },
  section: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  sectionSpaced: { marginTop: 16 },
  empty: { textAlign: 'center', paddingVertical: 16, fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  logoutBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  logoutText: { color: '#ef5350', fontWeight: '700', fontSize: 13 },
  actionBtn: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  wipeBtn: { backgroundColor: '#ef5350' },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
