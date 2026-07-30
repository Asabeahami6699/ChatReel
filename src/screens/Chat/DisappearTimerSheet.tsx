import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DISAPPEAR_OPTIONS, disappearLabel } from '../../lib/disappearOptions';
import { useChatSettings } from '../../context/ChatSettingsContext';

type Props = {
  visible: boolean;
  currentSeconds: number | null;
  onClose: () => void;
  onSave: (seconds: number | null) => void;
};

/**
 * Centered floating timer picker for disappearing messages.
 * Follows chat theme (including dark mode).
 */
export function DisappearTimerSheet({
  visible,
  currentSeconds,
  onClose,
  onSave,
}: Props) {
  const { theme } = useChatSettings();
  const { width, height } = useWindowDimensions();
  const [draft, setDraft] = useState<number | null>(currentSeconds);

  React.useEffect(() => {
    if (visible) setDraft(currentSeconds ?? null);
  }, [visible, currentSeconds]);

  const sheetMaxWidth = useMemo(() => Math.min(420, width - 40), [width]);
  const accent = theme.primary;
  const cardBg = theme.listCardBg;
  const text = theme.listPrimaryText;
  const muted = theme.listSecondaryText;
  const rowBg = theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const cancelBg = theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: cardBg,
              maxWidth: sheetMaxWidth,
              maxHeight: Math.min(height * 0.78, 560),
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.title, { color: text }]}>Disappearing messages</Text>
          <Text style={[styles.subtitle, { color: muted }]}>
            New messages vanish for everyone after they are read, using the timer you pick.
          </Text>

          <ScrollView
            style={styles.listScroll}
            contentContainerStyle={styles.list}
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            {DISAPPEAR_OPTIONS.map((opt) => {
              const selected = (draft ?? null) === (opt.seconds ?? null);
              return (
                <TouchableOpacity
                  key={opt.label}
                  style={[
                    styles.row,
                    { backgroundColor: rowBg },
                    selected && {
                      backgroundColor: theme.isDark
                        ? 'rgba(11,98,255,0.22)'
                        : 'rgba(11,98,255,0.1)',
                      borderColor: accent,
                      borderWidth: StyleSheet.hairlineWidth,
                    },
                  ]}
                  onPress={() => setDraft(opt.seconds)}
                  activeOpacity={0.75}
                >
                  <View style={styles.rowText}>
                    <Text
                      style={[
                        styles.rowLabel,
                        { color: text },
                        selected && { color: accent },
                      ]}
                    >
                      {opt.label}
                    </Text>
                    <Text style={[styles.rowHint, { color: muted }]}>
                      {opt.seconds ? 'After read' : 'Keep messages'}
                    </Text>
                  </View>
                  <Ionicons
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={selected ? accent : muted}
                  />
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={[styles.actions, { borderTopColor: theme.listBorder }]}>
            <TouchableOpacity
              style={[styles.cancelBtn, { backgroundColor: cancelBg }]}
              onPress={onClose}
            >
              <Text style={[styles.cancelText, { color: text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: accent }]}
              onPress={() => onSave(draft)}
              activeOpacity={0.85}
            >
              <Text style={styles.saveText}>
                Save{draft ? ` · ${disappearLabel(draft)}` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  sheet: {
    width: '100%',
    borderRadius: 20,
    paddingTop: 18,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  listScroll: { flexGrow: 0 },
  list: { gap: 6, paddingBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '600' },
  rowHint: { fontSize: 12, marginTop: 2 },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '600' },
  saveBtn: {
    flex: 1.35,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
