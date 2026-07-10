import React, { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { labelForOption, type SelectOption } from '../lib/profileLocaleOptions';

/** Plain CSS for the native `<select>` on web — not valid in StyleSheet.create. */
const WEB_SELECT_STYLE: React.CSSProperties = {
  width: '100%',
  border: 'none',
  outline: 'none',
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  backgroundColor: 'transparent',
  fontSize: 16,
  color: '#1a1a1a',
  padding: 14,
  paddingRight: 36,
  cursor: 'pointer',
};

type Props<T extends FieldValues> = {
  label: string;
  control: Control<T>;
  name: Path<T>;
  options: SelectOption[];
  placeholder?: string;
  error?: { message?: string };
};

export function FormSelectField<T extends FieldValues>({
  label,
  control,
  name,
  options,
  placeholder = 'Select…',
  error,
}: Props<T>) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field }) => {
          const display = labelForOption(options, field.value) || placeholder;
          const hasValue = Boolean(field.value);

          if (Platform.OS === 'web') {
            return (
              <>
                <View style={[styles.selectWrap, error && styles.inputError]}>
                  <select
                    value={field.value || ''}
                    onChange={(e) => field.onChange(e.target.value)}
                    onBlur={field.onBlur}
                    style={WEB_SELECT_STYLE}
                  >
                    <option value="">{placeholder}</option>
                    {options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <Ionicons name="chevron-down" size={18} color="#666" style={styles.webChevron} />
                </View>
                {error?.message ? <Text style={styles.errorText}>{error.message}</Text> : null}
              </>
            );
          }

          return (
            <>
              <TouchableOpacity
                style={[styles.selectBtn, error && styles.inputError]}
                onPress={() => setOpen(true)}
                activeOpacity={0.85}
              >
                <Text style={[styles.selectText, !hasValue && styles.placeholderText]} numberOfLines={1}>
                  {display}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#666" />
              </TouchableOpacity>

              <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
                <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
                  <Pressable
                    style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}
                    onPress={() => undefined}
                  >
                    <View style={styles.sheetHandle} />
                    <Text style={styles.sheetTitle}>{label}</Text>
                    <ScrollView style={styles.optionList} keyboardShouldPersistTaps="handled">
                      <TouchableOpacity
                        style={[styles.optionRow, !field.value && styles.optionRowActive]}
                        onPress={() => {
                          field.onChange('');
                          field.onBlur();
                          setOpen(false);
                        }}
                      >
                        <Text style={[styles.optionText, !field.value && styles.optionTextActive]}>
                          {placeholder}
                        </Text>
                        {!field.value ? <Ionicons name="checkmark" size={18} color="#0066cc" /> : null}
                      </TouchableOpacity>
                      {options.map((opt) => {
                        const active = field.value === opt.value;
                        return (
                          <TouchableOpacity
                            key={opt.value}
                            style={[styles.optionRow, active && styles.optionRowActive]}
                            onPress={() => {
                              field.onChange(opt.value);
                              field.onBlur();
                              setOpen(false);
                            }}
                          >
                            <Text style={[styles.optionText, active && styles.optionTextActive]}>
                              {opt.label}
                            </Text>
                            {active ? <Ionicons name="checkmark" size={18} color="#0066cc" /> : null}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </Pressable>
                </Pressable>
              </Modal>

              {error?.message ? <Text style={styles.errorText}>{error.message}</Text> : null}
            </>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 18 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#1a1a1a',
    letterSpacing: 0.3,
  },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#fafafa',
  },
  selectWrap: {
    position: 'relative',
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 12,
    backgroundColor: '#fafafa',
    overflow: 'hidden',
  },
  webChevron: {
    position: 'absolute',
    right: 14,
    top: '50%',
    marginTop: -9,
    pointerEvents: 'none',
  },
  selectText: {
    flex: 1,
    fontSize: 16,
    color: '#1a1a1a',
    paddingRight: 8,
  },
  placeholderText: {
    color: '#999',
  },
  inputError: {
    borderColor: '#d32f2f',
  },
  errorText: {
    color: '#d32f2f',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '500',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 10,
    maxHeight: '70%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ccc',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
  },
  optionList: {
    maxHeight: 360,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  optionRowActive: {
    backgroundColor: '#f0f7ff',
  },
  optionText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
    paddingRight: 12,
  },
  optionTextActive: {
    color: '#0066cc',
    fontWeight: '600',
  },
});
