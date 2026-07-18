import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Country = {
  iso: string;
  name: string;
  code: string;
  flag: string;
};

const COUNTRIES: Country[] = [
  { iso: 'NG', name: 'Nigeria', code: '+234', flag: '🇳🇬' },
  { iso: 'GH', name: 'Ghana', code: '+233', flag: '🇬🇭' },
  { iso: 'KE', name: 'Kenya', code: '+254', flag: '🇰🇪' },
  { iso: 'ZA', name: 'South Africa', code: '+27', flag: '🇿🇦' },
  { iso: 'UG', name: 'Uganda', code: '+256', flag: '🇺🇬' },
  { iso: 'TZ', name: 'Tanzania', code: '+255', flag: '🇹🇿' },
  { iso: 'RW', name: 'Rwanda', code: '+250', flag: '🇷🇼' },
  { iso: 'CM', name: 'Cameroon', code: '+237', flag: '🇨🇲' },
  { iso: 'CI', name: "Côte d'Ivoire", code: '+225', flag: '🇨🇮' },
  { iso: 'SN', name: 'Senegal', code: '+221', flag: '🇸🇳' },
  { iso: 'ET', name: 'Ethiopia', code: '+251', flag: '🇪🇹' },
  { iso: 'EG', name: 'Egypt', code: '+20', flag: '🇪🇬' },
  { iso: 'MA', name: 'Morocco', code: '+212', flag: '🇲🇦' },
  { iso: 'DZ', name: 'Algeria', code: '+213', flag: '🇩🇿' },
  { iso: 'TN', name: 'Tunisia', code: '+216', flag: '🇹🇳' },
  { iso: 'ZW', name: 'Zimbabwe', code: '+263', flag: '🇿🇼' },
  { iso: 'ZM', name: 'Zambia', code: '+260', flag: '🇿🇲' },
  { iso: 'BW', name: 'Botswana', code: '+267', flag: '🇧🇼' },
  { iso: 'AO', name: 'Angola', code: '+244', flag: '🇦🇴' },
  { iso: 'US', name: 'United States', code: '+1', flag: '🇺🇸' },
  { iso: 'CA', name: 'Canada', code: '+1', flag: '🇨🇦' },
  { iso: 'GB', name: 'United Kingdom', code: '+44', flag: '🇬🇧' },
  { iso: 'IE', name: 'Ireland', code: '+353', flag: '🇮🇪' },
  { iso: 'FR', name: 'France', code: '+33', flag: '🇫🇷' },
  { iso: 'DE', name: 'Germany', code: '+49', flag: '🇩🇪' },
  { iso: 'ES', name: 'Spain', code: '+34', flag: '🇪🇸' },
  { iso: 'IT', name: 'Italy', code: '+39', flag: '🇮🇹' },
  { iso: 'PT', name: 'Portugal', code: '+351', flag: '🇵🇹' },
  { iso: 'NL', name: 'Netherlands', code: '+31', flag: '🇳🇱' },
  { iso: 'BE', name: 'Belgium', code: '+32', flag: '🇧🇪' },
  { iso: 'CH', name: 'Switzerland', code: '+41', flag: '🇨🇭' },
  { iso: 'AT', name: 'Austria', code: '+43', flag: '🇦🇹' },
  { iso: 'SE', name: 'Sweden', code: '+46', flag: '🇸🇪' },
  { iso: 'NO', name: 'Norway', code: '+47', flag: '🇳🇴' },
  { iso: 'DK', name: 'Denmark', code: '+45', flag: '🇩🇰' },
  { iso: 'FI', name: 'Finland', code: '+358', flag: '🇫🇮' },
  { iso: 'PL', name: 'Poland', code: '+48', flag: '🇵🇱' },
  { iso: 'GR', name: 'Greece', code: '+30', flag: '🇬🇷' },
  { iso: 'RO', name: 'Romania', code: '+40', flag: '🇷🇴' },
  { iso: 'UA', name: 'Ukraine', code: '+380', flag: '🇺🇦' },
  { iso: 'RU', name: 'Russia', code: '+7', flag: '🇷🇺' },
  { iso: 'TR', name: 'Türkiye', code: '+90', flag: '🇹🇷' },
  { iso: 'AE', name: 'United Arab Emirates', code: '+971', flag: '🇦🇪' },
  { iso: 'SA', name: 'Saudi Arabia', code: '+966', flag: '🇸🇦' },
  { iso: 'QA', name: 'Qatar', code: '+974', flag: '🇶🇦' },
  { iso: 'KW', name: 'Kuwait', code: '+965', flag: '🇰🇼' },
  { iso: 'IL', name: 'Israel', code: '+972', flag: '🇮🇱' },
  { iso: 'IN', name: 'India', code: '+91', flag: '🇮🇳' },
  { iso: 'PK', name: 'Pakistan', code: '+92', flag: '🇵🇰' },
  { iso: 'BD', name: 'Bangladesh', code: '+880', flag: '🇧🇩' },
  { iso: 'LK', name: 'Sri Lanka', code: '+94', flag: '🇱🇰' },
  { iso: 'CN', name: 'China', code: '+86', flag: '🇨🇳' },
  { iso: 'JP', name: 'Japan', code: '+81', flag: '🇯🇵' },
  { iso: 'KR', name: 'South Korea', code: '+82', flag: '🇰🇷' },
  { iso: 'SG', name: 'Singapore', code: '+65', flag: '🇸🇬' },
  { iso: 'MY', name: 'Malaysia', code: '+60', flag: '🇲🇾' },
  { iso: 'ID', name: 'Indonesia', code: '+62', flag: '🇮🇩' },
  { iso: 'PH', name: 'Philippines', code: '+63', flag: '🇵🇭' },
  { iso: 'TH', name: 'Thailand', code: '+66', flag: '🇹🇭' },
  { iso: 'VN', name: 'Vietnam', code: '+84', flag: '🇻🇳' },
  { iso: 'AU', name: 'Australia', code: '+61', flag: '🇦🇺' },
  { iso: 'NZ', name: 'New Zealand', code: '+64', flag: '🇳🇿' },
  { iso: 'BR', name: 'Brazil', code: '+55', flag: '🇧🇷' },
  { iso: 'MX', name: 'Mexico', code: '+52', flag: '🇲🇽' },
  { iso: 'AR', name: 'Argentina', code: '+54', flag: '🇦🇷' },
  { iso: 'CO', name: 'Colombia', code: '+57', flag: '🇨🇴' },
  { iso: 'CL', name: 'Chile', code: '+56', flag: '🇨🇱' },
  { iso: 'PE', name: 'Peru', code: '+51', flag: '🇵🇪' },
  { iso: 'JM', name: 'Jamaica', code: '+1', flag: '🇯🇲' },
];

type Props = {
  value: string;
  onChange: (code: string) => void;
};

function normalizeCallingCode(value: string): string | null {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (!digits || digits.startsWith('0')) return null;
  return `+${digits}`;
}

export default function CountryCodePicker({ value, onChange }: Props) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [customCode, setCustomCode] = useState('');

  const selected =
    COUNTRIES.find((country) => country.code === value) ??
    ({ iso: '', name: 'Custom', code: value, flag: '🌐' } as Country);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (country) =>
        country.name.toLowerCase().includes(q) ||
        country.iso.toLowerCase().includes(q) ||
        country.code.includes(q)
    );
  }, [query]);

  const choose = (country: Country) => {
    onChange(country.code);
    setVisible(false);
    setQuery('');
  };

  const useCustomCode = () => {
    const normalized = normalizeCallingCode(customCode);
    if (!normalized) return;
    onChange(normalized);
    setVisible(false);
    setQuery('');
    setCustomCode('');
  };

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setVisible(true)}
        accessibilityRole="button"
        accessibilityLabel={`Country code ${selected.code}`}
      >
        <Text style={styles.code}>{selected.code}</Text>
        <Ionicons name="chevron-down" size={15} color="#555" />
      </TouchableOpacity>

      <Modal visible={visible} animationType="slide" transparent onRequestClose={() => setVisible(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setVisible(false)} />
          <SafeAreaView style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>Select country code</Text>
              <TouchableOpacity onPress={() => setVisible(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color="#222" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchRow}>
              <Ionicons name="search" size={18} color="#777" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search country or code"
                style={styles.searchInput}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.customRow}>
              <TextInput
                value={customCode}
                onChangeText={setCustomCode}
                placeholder="Other code, e.g. +358"
                keyboardType="phone-pad"
                style={styles.customInput}
              />
              <TouchableOpacity
                style={[
                  styles.useButton,
                  !normalizeCallingCode(customCode) && styles.useButtonDisabled,
                ]}
                onPress={useCustomCode}
                disabled={!normalizeCallingCode(customCode)}
              >
                <Text style={styles.useButtonText}>Use</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={filtered}
              keyExtractor={(item) => item.iso}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.row} onPress={() => choose(item)}>
                  <Text style={styles.rowFlag}>{item.flag}</Text>
                  <Text style={styles.countryName}>{item.name}</Text>
                  <Text style={styles.rowCode}>{item.code}</Text>
                  {item.iso === selected.iso ? (
                    <Ionicons name="checkmark" size={20} color="#007AFF" />
                  ) : (
                    <View style={styles.checkSpace} />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.empty}>No country found. Enter a custom code above.</Text>}
            />
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    height: 52,
    minWidth: 82,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#bbb',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  code: { color: '#222', fontSize: 15, fontWeight: '600', marginRight: 4 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    height: '78%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  title: { fontSize: 19, fontWeight: '700', color: '#222' },
  searchRow: {
    margin: 14,
    marginBottom: 8,
    borderRadius: 10,
    backgroundColor: '#f2f3f5',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 9,
    paddingVertical: 12,
    fontSize: 15,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginBottom: 8,
  },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  useButton: {
    marginLeft: 8,
    borderRadius: 10,
    backgroundColor: '#007AFF',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  useButtonDisabled: { opacity: 0.4 },
  useButtonText: { color: '#fff', fontWeight: '700' },
  row: {
    minHeight: 54,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  rowFlag: { fontSize: 23, width: 38 },
  countryName: { flex: 1, color: '#222', fontSize: 15 },
  rowCode: { color: '#555', fontSize: 15, fontWeight: '600', marginRight: 12 },
  checkSpace: { width: 20 },
  empty: { textAlign: 'center', color: '#777', padding: 28 },
});
