import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DEFAULT_REEL_SETTINGS,
  loadReelSettings,
  saveReelSettings,
  type ReelSettings,
} from '../../lib/reelSettingsStore';
import { REEL_ACCENT } from './reelTheme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#333', true: REEL_ACCENT }}
        thumbColor="#fff"
      />
    </View>
  );
}

function ChoiceRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.choiceBlock}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.chips}>
        {options.map((opt) => {
          const active = value === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onChange(opt.id)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export function ReelSettingsSheet({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<ReelSettings>(DEFAULT_REEL_SETTINGS);

  useEffect(() => {
    if (!visible) return;
    void loadReelSettings().then(setSettings);
  }, [visible]);

  const patch = async (next: Partial<ReelSettings>) => {
    const saved = await saveReelSettings(next);
    setSettings(saved);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + 16, maxHeight: '88%' }]}
          onPress={() => undefined}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>Reel settings</Text>
          <Text style={styles.subtitle}>Privacy & playback — similar to TikTok / Instagram Reels</Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Section title="Playback">
              <ToggleRow
                label="Auto-play on Wi‑Fi"
                hint="Start reels automatically when on Wi‑Fi"
                value={settings.autoPlayOnWifi}
                onChange={(v) => void patch({ autoPlayOnWifi: v })}
              />
              <ToggleRow
                label="Data saver"
                hint="Lower prefetch quality on cellular"
                value={settings.dataSaver}
                onChange={(v) => void patch({ dataSaver: v })}
              />
              <ToggleRow
                label="Muted by default"
                value={settings.mutedByDefault}
                onChange={(v) => void patch({ mutedByDefault: v })}
              />
            </Section>

            <Section title="Privacy">
              <ChoiceRow
                label="Default audience for new reels"
                value={settings.defaultVisibility}
                options={[
                  { id: 'public', label: 'Public' },
                  { id: 'friends', label: 'Friends' },
                  { id: 'private', label: 'Only me' },
                ]}
                onChange={(v) => void patch({ defaultVisibility: v })}
              />
              <ChoiceRow
                label="Who can comment"
                value={settings.whoCanComment}
                options={[
                  { id: 'everyone', label: 'Everyone' },
                  { id: 'friends', label: 'Friends' },
                  { id: 'off', label: 'Off' },
                ]}
                onChange={(v) => void patch({ whoCanComment: v })}
              />
              <ChoiceRow
                label="Who can use your sound / duet"
                value={settings.whoCanDuet}
                options={[
                  { id: 'everyone', label: 'Everyone' },
                  { id: 'friends', label: 'Friends' },
                  { id: 'off', label: 'Off' },
                ]}
                onChange={(v) => void patch({ whoCanDuet: v })}
              />
              <ToggleRow
                label="Allow downloads"
                hint="Others can save your reel with watermark"
                value={settings.allowDownloads}
                onChange={(v) => void patch({ allowDownloads: v })}
              />
            </Section>

            <Section title="Creation">
              <ToggleRow
                label="Save drafts on this device"
                value={settings.saveDraftsToDevice}
                onChange={(v) => void patch({ saveDraftsToDevice: v })}
              />
            </Section>
          </ScrollView>

          <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#141414',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#444',
    alignSelf: 'center',
    marginBottom: 12,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  subtitle: { color: '#888', fontSize: 12, marginTop: 4, marginBottom: 12 },
  section: { marginBottom: 16 },
  sectionTitle: {
    color: '#666',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2a2a2a',
    gap: 12,
  },
  rowBody: { flex: 1 },
  rowLabel: { color: '#fff', fontSize: 15, fontWeight: '600' },
  rowHint: { color: '#777', fontSize: 11, marginTop: 3 },
  choiceBlock: {
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2a2a2a',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#222',
  },
  chipActive: { backgroundColor: '#0e2a44', borderWidth: 1, borderColor: REEL_ACCENT },
  chipText: { color: '#888', fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  doneBtn: {
    marginTop: 8,
    backgroundColor: REEL_ACCENT,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
