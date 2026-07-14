import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
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
import { chatThemePresets, type ChatThemeId } from '../../lib/chatThemes';
import { useChatSettings } from '../../context/ChatSettingsContext';
import { showErrorAlert } from '../../lib/confirmAction';
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
import { saveRingtoneClip } from '../../lib/ringtoneLibrary';

function SettingRow({
  label,
  subtitle,
  value,
  onValueChange,
  textColor,
  subColor,
}: {
  label: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  textColor: string;
  subColor: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: textColor }]}>{label}</Text>
        {subtitle ? <Text style={[styles.rowSub, { color: subColor }]}>{subtitle}</Text> : null}
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
  const navigation = useNavigation();
  const { user } = useAuth();
  const {
    settings,
    theme,
    updateSettings,
    ringtoneLibrary,
    refreshRingtoneLibrary,
    selectRingtone,
  } = useChatSettings();

  const [trimUri, setTrimUri] = useState<string | null>(null);
  const [trimLabel, setTrimLabel] = useState('Custom tone');
  const [trimMime, setTrimMime] = useState<string | null>(null);
  const [savingTrim, setSavingTrim] = useState(false);
  const saveAbortRef = useRef(false);

  useEffect(() => {
    void refreshRingtoneLibrary();
  }, [refreshRingtoneLibrary]);

  const closeTrimModal = useCallback(() => {
    saveAbortRef.current = true;
    setSavingTrim(false);
    setTrimUri(null);
  }, []);

  const themeIds = Object.keys(chatThemePresets) as ChatThemeId[];
  const selectedId = settings.incomingRingtoneId;

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
      const label = asset.name || 'Custom tone';
      setTrimLabel(label);
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
    async ({ startSec, endSec }: { startSec: number; endSec: number }) => {
      if (!trimUri || !user?.id || savingTrim) return;
      saveAbortRef.current = false;
      setSavingTrim(true);
      try {
        const ringtone = await saveRingtoneClip({
          userId: user.id,
          localUri: trimUri,
          label: trimLabel,
          name: trimLabel,
          mimeType: trimMime,
          startSec,
          endSec: Math.min(endSec, startSec + RINGTONE_CLIP_SEC),
        });
        if (saveAbortRef.current) return;
        await updateSettings({
          incomingRingtoneId: ringtone.id,
          incomingRingtoneUri: ringtone.audio_url,
          incomingRingtoneLabel: ringtone.label,
          incomingRingtoneStartSec: 0,
          incomingRingtoneEndSec: ringtone.duration_sec,
        });
        // Close immediately; refresh library in background.
        setTrimUri(null);
        setSavingTrim(false);
        showAppToast('Ringtone saved to your library');
        void refreshRingtoneLibrary();
      } catch (err) {
        if (saveAbortRef.current) return;
        setSavingTrim(false);
        showErrorAlert(
          'Ringtone',
          err instanceof Error ? err.message : 'Could not save trimmed ringtone'
        );
      }
    },
    [refreshRingtoneLibrary, savingTrim, trimLabel, trimMime, trimUri, updateSettings, user?.id]
  );

  const removeTone = async (id: string) => {
    try {
      await api.ringtones.remove(id);
      if (selectedId === id) {
        await selectRingtone(null);
      } else {
        await refreshRingtoneLibrary();
      }
      showAppToast('Ringtone removed');
    } catch (err) {
      showErrorAlert('Ringtone', err instanceof Error ? err.message : 'Could not delete ringtone');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.listBg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: theme.headerBg }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.headerText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.headerText }]}>Settings</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.section, { color: theme.sectionLabel }]}>Theme</Text>
        <View style={[styles.card, { backgroundColor: theme.listCardBg, borderColor: theme.listBorder }]}>
          {themeIds.map((id) => {
            const preset = chatThemePresets[id];
            const active = settings.themeId === id;
            return (
              <TouchableOpacity
                key={id}
                style={[styles.themeRow, active && { borderColor: preset.primary, borderWidth: 2 }]}
                onPress={() => void updateSettings({ themeId: id })}
              >
                <View style={[styles.themeSwatch, { backgroundColor: preset.headerBg }]} />
                <Text style={[styles.themeLabel, { color: theme.listPrimaryText }]}>{preset.label}</Text>
                {active ? <Ionicons name="checkmark-circle" size={20} color={preset.primary} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.section, { color: theme.sectionLabel }]}>Notifications</Text>
        <View style={[styles.card, { backgroundColor: theme.listCardBg, borderColor: theme.listBorder }]}>
          <SettingRow
            label="Push notifications"
            subtitle="New messages and friend requests"
            value={settings.pushNotifications}
            onValueChange={(v) => void updateSettings({ pushNotifications: v })}
            textColor={theme.listPrimaryText}
            subColor={theme.listSecondaryText}
          />
          <SettingRow
            label="Message sounds"
            value={settings.messageSounds}
            onValueChange={(v) => void updateSettings({ messageSounds: v })}
            textColor={theme.listPrimaryText}
            subColor={theme.listSecondaryText}
          />
        </View>

        <Text style={[styles.section, { color: theme.sectionLabel }]}>Incoming ringtone</Text>
        <View style={[styles.card, { backgroundColor: theme.listCardBg, borderColor: theme.listBorder }]}>
          <Text style={[styles.libraryHint, { color: theme.listSecondaryText }]}>
            Trim any song to 1 minute, then it is saved to your account library.
          </Text>

          <TouchableOpacity
            style={[styles.toneRow, !selectedId && styles.toneRowActive]}
            onPress={() => void selectRingtone(null)}
          >
            <View style={styles.toneText}>
              <Text style={[styles.rowLabel, { color: theme.listPrimaryText }]}>Default</Text>
              <Text style={[styles.rowSub, { color: theme.listSecondaryText }]}>Built-in ring</Text>
            </View>
            {!selectedId ? (
              <Ionicons name="checkmark-circle" size={22} color={theme.headerBg} />
            ) : null}
            <TouchableOpacity
              style={styles.miniBtn}
              onPress={() => void previewUri(null)}
              hitSlop={8}
            >
              <Ionicons name="play" size={16} color={theme.listPrimaryText} />
            </TouchableOpacity>
          </TouchableOpacity>

          {ringtoneLibrary.map((tone) => {
            const active = selectedId === tone.id;
            return (
              <View key={tone.id} style={[styles.toneRow, active && styles.toneRowActive]}>
                <TouchableOpacity style={styles.toneText} onPress={() => void selectRingtone(tone)}>
                  <Text style={[styles.rowLabel, { color: theme.listPrimaryText }]} numberOfLines={1}>
                    {tone.label}
                  </Text>
                  <Text style={[styles.rowSub, { color: theme.listSecondaryText }]}>
                    {formatSec(Number(tone.duration_sec) || RINGTONE_CLIP_SEC)} clip · saved
                  </Text>
                </TouchableOpacity>
                {active ? <Ionicons name="checkmark-circle" size={22} color={theme.headerBg} /> : null}
                <TouchableOpacity
                  style={styles.miniBtn}
                  onPress={() => void previewUri(tone.audio_url)}
                >
                  <Ionicons name="play" size={16} color={theme.listPrimaryText} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.miniBtn} onPress={() => void removeTone(tone.id)}>
                  <Ionicons name="trash-outline" size={16} color="#dc2626" />
                </TouchableOpacity>
              </View>
            );
          })}

          <TouchableOpacity style={styles.addToneBtn} onPress={() => void pickRingtone()}>
            <Ionicons name="add-circle-outline" size={20} color="#fff" />
            <Text style={styles.addToneText}>Add ringtone (trim to 1 min)</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.section, { color: theme.sectionLabel }]}>Privacy</Text>
        <View style={[styles.card, { backgroundColor: theme.listCardBg, borderColor: theme.listBorder }]}>
          <SettingRow
            label="Read receipts"
            subtitle="Let others see when you've read messages"
            value={settings.readReceipts}
            onValueChange={(v) => void updateSettings({ readReceipts: v })}
            textColor={theme.listPrimaryText}
            subColor={theme.listSecondaryText}
          />
          <SettingRow
            label="Show last seen"
            value={settings.showLastSeen}
            onValueChange={(v) => void updateSettings({ showLastSeen: v })}
            textColor={theme.listPrimaryText}
            subColor={theme.listSecondaryText}
          />
        </View>

        <Text style={[styles.section, { color: theme.sectionLabel }]}>Chats</Text>
        <View style={[styles.card, { backgroundColor: theme.listCardBg, borderColor: theme.listBorder }]}>
          <SettingRow
            label="Media auto-download"
            subtitle="Download photos and videos on Wi-Fi"
            value={settings.mediaAutoDownload}
            onValueChange={(v) => void updateSettings({ mediaAutoDownload: v })}
            textColor={theme.listPrimaryText}
            subColor={theme.listSecondaryText}
          />
          <SettingRow
            label="Enter to send"
            subtitle="Press Enter to send (web)"
            value={settings.enterToSend}
            onValueChange={(v) => void updateSettings({ enterToSend: v })}
            textColor={theme.listPrimaryText}
            subColor={theme.listSecondaryText}
          />
          <SettingRow
            label="Compact chat list"
            value={settings.compactChatList}
            onValueChange={(v) => void updateSettings({ compactChatList: v })}
            textColor={theme.listPrimaryText}
            subColor={theme.listSecondaryText}
          />
        </View>
      </ScrollView>

      {trimUri ? (
        <RingtoneTrimModal
          visible
          uri={trimUri}
          label={trimLabel}
          initialStartSec={0}
          initialEndSec={null}
          saving={savingTrim}
          onCancel={closeTrimModal}
          onSave={(range) => {
            void onSaveTrim(range);
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
  content: { padding: 16, paddingBottom: 40 },
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f1f5f9',
  },
  rowText: { flex: 1, paddingRight: 12 },
  rowLabel: { fontSize: 15, fontWeight: '600', color: '#111' },
  rowSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
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
    borderBottomColor: '#f1f5f9',
  },
  toneRowActive: { backgroundColor: 'rgba(37,99,235,0.06)' },
  toneText: { flex: 1, paddingRight: 4 },
  miniBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  addToneBtn: {
    margin: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 12,
  },
  addToneText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f1f5f9',
    borderRadius: 8,
    marginHorizontal: 8,
    marginVertical: 4,
  },
  themeSwatch: { width: 28, height: 28, borderRadius: 14, marginRight: 12 },
  themeLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111' },
});
