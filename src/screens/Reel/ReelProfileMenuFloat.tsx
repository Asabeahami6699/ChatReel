import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deleteReelComposeDraft, listReelComposeDrafts, type SavedReelComposeDraft } from '../../lib/reelComposeDraftStore';
import { ReelSettingsSheet } from './ReelSettingsSheet';
import { useReelPlaybackGate } from '../../hooks/useReelPlaybackGate';
import { REEL_ACCENT } from './reelTheme';

type Props = {
  onNewReel: () => void;
  onOpenDraft?: (draft: SavedReelComposeDraft) => void;
  /** When set, pins the ⋮ button to the header (top-right). */
  topOffset?: number;
};

export function ReelProfileMenuFloat({ onNewReel, onOpenDraft, topOffset }: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [drafts, setDrafts] = useState<SavedReelComposeDraft[]>([]);

  useReelPlaybackGate('profile-menu', open || settingsOpen);

  const openMenu = async () => {
    const list = await listReelComposeDrafts();
    setDrafts(list);
    setOpen(true);
  };

  const handleDraft = (draft: SavedReelComposeDraft) => {
    setOpen(false);
    onOpenDraft?.(draft);
  };

  const handleDeleteDraft = (draft: SavedReelComposeDraft) => {
    Alert.alert('Delete draft?', draft.label, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteReelComposeDraft(draft.id);
          setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
        },
      },
    ]);
  };

  const fabTop = topOffset ?? insets.top + 8;

  return (
    <>
      <TouchableOpacity
        style={[styles.fab, { top: fabTop }]}
        onPress={() => void openMenu()}
        activeOpacity={0.88}
        hitSlop={10}
      >
        <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => undefined}>
            <Text style={styles.sheetTitle}>Reel options</Text>

            <TouchableOpacity
              style={styles.row}
              onPress={() => {
                setOpen(false);
                onNewReel();
              }}
            >
              <Ionicons name="add-circle-outline" size={22} color="#fff" />
              <Text style={styles.rowText}>Create new reel</Text>
            </TouchableOpacity>

            {drafts.length > 0 ? (
              <>
                <Text style={styles.section}>Drafts</Text>
                {drafts.map((d) => (
                  <View key={d.id} style={styles.draftRow}>
                    <TouchableOpacity style={styles.draftMain} onPress={() => handleDraft(d)}>
                      <Ionicons name="document-text-outline" size={20} color={REEL_ACCENT} />
                      <View style={styles.draftBody}>
                        <Text style={styles.rowText} numberOfLines={1}>
                          {d.label}
                        </Text>
                        <Text style={styles.draftSub}>
                          {new Date(d.savedAt).toLocaleString()}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteDraft(d)} hitSlop={10}>
                      <Ionicons name="trash-outline" size={18} color="#f87171" />
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            ) : null}

            <TouchableOpacity
              style={styles.row}
              onPress={() => {
                setOpen(false);
                setSettingsOpen(true);
              }}
            >
              <Ionicons name="settings-outline" size={22} color="#fff" />
              <Text style={styles.rowText}>Reel settings</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <ReelSettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

type ScheduleProps = {
  enabled: boolean;
  value: Date;
  onEnabledChange: (v: boolean) => void;
  onChange: (d: Date) => void;
};

export function ReelSchedulePicker({ enabled, value, onEnabledChange, onChange }: ScheduleProps) {
  const [mode, setMode] = useState<'date' | 'time' | null>(null);

  const onPicker = (event: DateTimePickerEvent, picked?: Date) => {
    if (Platform.OS === 'android') setMode(null);
    if (event.type === 'dismissed' || !picked) return;
    onChange(picked);
  };

  return (
    <View style={scheduleStyles.wrap}>
      <View style={scheduleStyles.toggleRow}>
        <TouchableOpacity
          style={[scheduleStyles.chip, !enabled && scheduleStyles.chipActive]}
          onPress={() => onEnabledChange(false)}
        >
          <Text style={[scheduleStyles.chipText, !enabled && scheduleStyles.chipTextActive]}>Post now</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[scheduleStyles.chip, enabled && scheduleStyles.chipActive]}
          onPress={() => onEnabledChange(true)}
        >
          <Text style={[scheduleStyles.chipText, enabled && scheduleStyles.chipTextActive]}>Schedule</Text>
        </TouchableOpacity>
      </View>

      {enabled ? (
        <View style={scheduleStyles.pickerRow}>
          <TouchableOpacity style={scheduleStyles.pickerBtn} onPress={() => setMode('date')}>
            <Ionicons name="calendar-outline" size={18} color="#fff" />
            <Text style={scheduleStyles.pickerText}>{value.toLocaleDateString()}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={scheduleStyles.pickerBtn} onPress={() => setMode('time')}>
            <Ionicons name="time-outline" size={18} color="#fff" />
            <Text style={scheduleStyles.pickerText}>
              {value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {mode ? (
        <DateTimePicker
          value={value}
          mode={mode}
          minimumDate={new Date()}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onPicker}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 14,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(28,28,28,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    elevation: 8,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#161616',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  sheetTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 12 },
  section: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333',
  },
  rowText: { color: '#fff', fontSize: 15, fontWeight: '600', flex: 1 },
  draftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2a2a2a',
  },
  draftMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  draftBody: { flex: 1 },
  draftSub: { color: '#666', fontSize: 11, marginTop: 2 },
});

const scheduleStyles = StyleSheet.create({
  wrap: { marginTop: 8 },
  toggleRow: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#161616',
  },
  chipActive: { backgroundColor: '#0e2a44', borderWidth: 1, borderColor: REEL_ACCENT },
  chipText: { color: '#888', fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  pickerRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  pickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#161616',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  pickerText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
