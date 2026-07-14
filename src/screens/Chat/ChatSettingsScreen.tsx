import React, { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
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
  seekPlaybackPlayer,
} from '../../lib/appAudio';
import { RingtoneTrimModal } from '../../components/RingtoneTrimModal';
import { RINGTONE_CLIP_SEC } from '../../lib/ringtoneTrim';
import {
  clearPersistedRingtoneBlob,
  persistIncomingRingtoneSource,
} from '../../lib/persistRingtone';
import { showAppToast } from '../../lib/appToast';

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
  const { settings, theme, updateSettings } = useChatSettings();
  const [trimUri, setTrimUri] = useState<string | null>(null);
  const [trimLabel, setTrimLabel] = useState('Custom tone');

  const themeIds = Object.keys(chatThemePresets) as ChatThemeId[];
  const ringtoneLabel = settings.incomingRingtoneUri
    ? settings.incomingRingtoneLabel || 'Custom tone'
    : 'Default (system)';
  const hasCustom = Boolean(settings.incomingRingtoneUri);
  const trimStart = Math.max(0, settings.incomingRingtoneStartSec || 0);
  const trimEnd =
    settings.incomingRingtoneEndSec != null && settings.incomingRingtoneEndSec > trimStart
      ? settings.incomingRingtoneEndSec
      : trimStart + RINGTONE_CLIP_SEC;
  const trimSubtitle = hasCustom
    ? `Favourite ${formatSec(Math.min(RINGTONE_CLIP_SEC, Math.max(0.5, trimEnd - trimStart)))} · ${formatSec(trimStart)}–${formatSec(trimEnd)}`
    : Platform.OS === 'web'
      ? 'Pick any audio file · trim up to 1 minute'
      : 'Pick a song · trim up to 1 minute';

  const openTrim = (uri: string, label: string) => {
    setTrimLabel(label);
    setTrimUri(uri);
  };

  const pickRingtone = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const label = asset.name || 'Custom tone';
      const durableUri = await persistIncomingRingtoneSource({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType,
      });
      await updateSettings({
        incomingRingtoneUri: durableUri,
        incomingRingtoneLabel: label,
        incomingRingtoneStartSec: 0,
        incomingRingtoneEndSec: null,
      });
      openTrim(durableUri, label);
      showAppToast('Custom ringtone saved');
    } catch (err) {
      showErrorAlert('Ringtone', err instanceof Error ? err.message : 'Could not pick audio file');
    }
  };

  const previewRingtone = async () => {
    try {
      await configurePlaybackAudio();
      const source =
        settings.incomingRingtoneUri?.trim() ||
        require('../../../assets/sounds/incoming-ring.mp3');
      const { resolvePlayableAudioSource, safePlayAudioPlayer } = await import('../../lib/appAudio');
      const resolved =
        typeof source === 'string' ? source : await resolvePlayableAudioSource(source as number);
      const player = createPlaybackPlayer(resolved);
      if (settings.incomingRingtoneUri) {
        await seekPlaybackPlayer(player, trimStart);
      }
      const ok = await safePlayAudioPlayer(player);
      if (!ok) {
        showErrorAlert('Ringtone', 'Could not play this file. Try another MP3/M4A.');
        void releasePlayer(player);
        return;
      }
      const previewMs = Math.min(
        2500,
        Math.max(800, (trimEnd - trimStart) * 1000)
      );
      setTimeout(() => {
        void releasePlayer(player);
      }, previewMs);
    } catch (err) {
      showErrorAlert('Ringtone', err instanceof Error ? err.message : 'Could not play preview');
    }
  };

  const clearRingtone = () => {
    void clearPersistedRingtoneBlob();
    void updateSettings({
      incomingRingtoneUri: null,
      incomingRingtoneLabel: null,
      incomingRingtoneStartSec: 0,
      incomingRingtoneEndSec: null,
    });
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
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: theme.listPrimaryText }]}>
                Incoming call ringtone
              </Text>
              <Text style={[styles.rowSub, { color: theme.listSecondaryText }]}>
                {ringtoneLabel}
              </Text>
              <Text style={[styles.rowSub, { color: theme.listSecondaryText }]}>{trimSubtitle}</Text>
            </View>
            <View style={styles.ringtoneActions}>
              <TouchableOpacity style={styles.miniBtn} onPress={() => void previewRingtone()}>
                <Ionicons name="play" size={16} color={theme.listPrimaryText} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.miniBtn} onPress={() => void pickRingtone()}>
                <Ionicons name="musical-notes" size={16} color={theme.listPrimaryText} />
              </TouchableOpacity>
              {hasCustom ? (
                <TouchableOpacity
                  style={styles.miniBtn}
                  onPress={() =>
                    openTrim(
                      settings.incomingRingtoneUri!,
                      settings.incomingRingtoneLabel || 'Custom tone'
                    )
                  }
                >
                  <Ionicons name="cut-outline" size={16} color={theme.listPrimaryText} />
                </TouchableOpacity>
              ) : null}
              {hasCustom ? (
                <TouchableOpacity style={styles.miniBtn} onPress={clearRingtone}>
                  <Ionicons name="refresh" size={16} color={theme.listPrimaryText} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
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
          initialStartSec={settings.incomingRingtoneStartSec || 0}
          initialEndSec={settings.incomingRingtoneEndSec}
          onCancel={() => setTrimUri(null)}
          onSave={({ startSec, endSec }) => {
            void updateSettings({
              incomingRingtoneStartSec: startSec,
              incomingRingtoneEndSec: endSec,
            });
            setTrimUri(null);
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
  ringtoneActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', maxWidth: 160, justifyContent: 'flex-end' },
  miniBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
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
