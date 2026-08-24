import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Props = {
  visible: boolean;
  chatName: string;
  previewText: string;
  onClose: () => void;
  onConfirm: (remindAt: Date, note: string | null) => void;
};

/**
 * Fast "Remind me" picker — presets first, optional note + custom time.
 * Phone: bottom sheet. Desktop/web wide: centered card.
 */
export function RemindMeSheet({
  visible,
  chatName,
  previewText,
  onClose,
  onConfirm,
}: Props) {
  const { theme } = useChatSettings();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isPhoneLayout = !(Platform.OS === 'web' && width >= 768);

  const [note, setNote] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [customDate, setCustomDate] = useState(() => new Date(Date.now() + 60 * 60_000));
  const [saving, setSaving] = useState(false);
  const [androidPicker, setAndroidPicker] = useState<'date' | 'time' | null>(null);

  useEffect(() => {
    if (visible) {
      setNote('');
      setCustomOpen(false);
      setCustomDate(new Date(Date.now() + 60 * 60_000));
      setSaving(false);
      setAndroidPicker(null);
    }
  }, [visible]);

  const presets = useMemo(() => buildReminderPresets(new Date()), [visible]);
  const accent = theme.primary;
  const cardBg = theme.listCardBg;
  const text = theme.listPrimaryText;
  const muted = theme.listSecondaryText;
  const rowBg = theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const cancelBg = theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';
  const inputBg = theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';

  const submit = (when: Date) => {
    if (saving) return;
    setSaving(true);
    onConfirm(when, note.trim() || null);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, isPhoneLayout ? styles.backdropPhone : styles.backdropDesktop]}
        onPress={onClose}
      >
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: cardBg,
              maxHeight: isPhoneLayout ? height * 0.88 : Math.min(height * 0.85, 640),
              paddingBottom: isPhoneLayout ? Math.max(insets.bottom, 12) + 8 : 14,
            },
            isPhoneLayout ? styles.sheetPhone : styles.sheetDesktop,
            !isPhoneLayout && { maxWidth: Math.min(420, width - 40) },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {isPhoneLayout ? <View style={[styles.grabber, { backgroundColor: muted }]} /> : null}

          <View style={styles.titleRow}>
            <Ionicons name="notifications-outline" size={22} color={accent} />
            <Text style={[styles.title, { color: text }]}>Remind me</Text>
          </View>
          <Text style={[styles.subtitle, { color: muted }]} numberOfLines={2}>
            {chatName}
            {previewText ? ` — “${previewText.slice(0, 80)}”` : ''}
          </Text>

          <KeyboardAwareScrollView
            style={styles.listScroll}
            contentContainerStyle={styles.list}
            bounces={false}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bottomOffset={24}
          >
            {presets.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.row, { backgroundColor: rowBg }]}
                onPress={() => submit(opt.resolve())}
                activeOpacity={0.75}
                disabled={saving}
              >
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, { color: text }]}>{opt.label}</Text>
                  {opt.hint ? (
                    <Text style={[styles.rowHint, { color: muted }]}>{opt.hint}</Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={muted} />
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.row, { backgroundColor: rowBg }]}
              onPress={() => {
                if (Platform.OS === 'android') {
                  setCustomOpen(true);
                  setAndroidPicker('date');
                } else {
                  setCustomOpen((v) => !v);
                }
              }}
              activeOpacity={0.75}
            >
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: text }]}>Pick date & time</Text>
                <Text style={[styles.rowHint, { color: muted }]}>
                  {formatReminderWhen(customDate.toISOString())}
                </Text>
              </View>
              <Ionicons
                name={customOpen ? 'chevron-up' : 'calendar-outline'}
                size={18}
                color={muted}
              />
            </TouchableOpacity>

            {customOpen ? (
              <View style={styles.customBlock}>
                {Platform.OS === 'web' ? (
                  React.createElement('input', {
                    type: 'datetime-local',
                    value: toLocalInputValue(customDate),
                    min: toLocalInputValue(new Date()),
                    onChange: (e: { target: { value: string } }) => {
                      const v = e.target?.value;
                      if (!v) return;
                      const parsed = new Date(v);
                      if (!Number.isNaN(parsed.getTime())) setCustomDate(parsed);
                    },
                    style: {
                      padding: 12,
                      borderRadius: 12,
                      border: `1px solid ${theme.listBorder}`,
                      background: inputBg,
                      color: text,
                      fontSize: 15,
                      width: '100%',
                      boxSizing: 'border-box',
                    },
                  })
                ) : Platform.OS === 'ios' ? (
                  <DateTimePicker
                    value={customDate}
                    mode="datetime"
                    display="spinner"
                    minimumDate={new Date()}
                    onChange={(_e, date) => {
                      if (date) setCustomDate(date);
                    }}
                    themeVariant={theme.isDark ? 'dark' : 'light'}
                    style={{ alignSelf: 'center' }}
                  />
                ) : androidPicker ? (
                  <DateTimePicker
                    value={customDate}
                    mode={androidPicker}
                    display="default"
                    minimumDate={new Date()}
                    onChange={(event, date) => {
                      if (event.type === 'dismissed') {
                        setAndroidPicker(null);
                        return;
                      }
                      if (date) setCustomDate(date);
                      if (androidPicker === 'date') {
                        setAndroidPicker('time');
                      } else {
                        setAndroidPicker(null);
                      }
                    }}
                  />
                ) : null}
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: accent }]}
                  onPress={() => submit(customDate)}
                  activeOpacity={0.85}
                  disabled={saving}
                >
                  <Text style={styles.saveText}>Set reminder</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <Text style={[styles.noteLabel, { color: muted }]}>Note (optional)</Text>
            <TextInput
              style={[styles.noteInput, { backgroundColor: inputBg, color: text }]}
              placeholder="e.g. Ask about pricing"
              placeholderTextColor={muted}
              value={note}
              onChangeText={setNote}
              maxLength={200}
            />
          </KeyboardAwareScrollView>

          <TouchableOpacity
            style={[styles.cancelBtn, { backgroundColor: cancelBg }]}
            onPress={onClose}
          >
            <Text style={[styles.cancelText, { color: text }]}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backdropPhone: {
    justifyContent: 'flex-end',
  },
  backdropDesktop: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  sheet: {
    width: '100%',
    paddingTop: 10,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  sheetPhone: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  sheetDesktop: {
    borderRadius: 20,
    paddingTop: 18,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    opacity: 0.35,
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  listScroll: { flexGrow: 0 },
  list: { gap: 8, paddingBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    minHeight: 52,
  },
  rowText: { flex: 1, paddingRight: 8 },
  rowLabel: { fontSize: 16, fontWeight: '600' },
  rowHint: { fontSize: 12, marginTop: 2 },
  customBlock: { marginTop: 4, gap: 10 },
  noteLabel: { fontSize: 12, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  noteInput: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  cancelBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  cancelText: { fontSize: 16, fontWeight: '600' },
  saveBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  saveText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
