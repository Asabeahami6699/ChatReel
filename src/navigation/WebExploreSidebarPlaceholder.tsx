import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChatSettings } from '../context/ChatSettingsContext';

/** Narrow sidebar placeholder when Explore fills the main desktop panel. */
export function WebExploreSidebarPlaceholder() {
  const { theme } = useChatSettings();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: theme.listBg }]}>
      <TouchableOpacity
        style={[styles.backBtn, { marginTop: Math.max(insets.top, 8) }]}
        onPress={() => navigation.navigate('Chats')}
        accessibilityLabel="Back to chats"
        hitSlop={10}
      >
        <Ionicons name="arrow-back" size={22} color={theme.listPrimaryText} />
      </TouchableOpacity>
      <View style={styles.center}>
        <Ionicons name="compass" size={28} color={theme.tabActive} />
        <Text style={[styles.label, { color: theme.listSecondaryText }]}>Explore</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: { fontSize: 13, fontWeight: '700' },
});
