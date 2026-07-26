// src/screens/Chat/EmptyChatScreen.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useChatSettings } from '../../context/ChatSettingsContext';

export default function EmptyChatScreen() {
  const { theme } = useChatSettings();

  return (
    <View style={[styles.container, { backgroundColor: theme.listBg }]}>
      <View
        style={[
          styles.iconRing,
          {
            backgroundColor: theme.listCardBg,
            borderColor: theme.listBorder,
          },
        ]}
      >
        <Ionicons name="chatbubble-ellipses-outline" size={56} color={theme.primary} />
      </View>
      <Text style={[styles.title, { color: theme.listPrimaryText }]}>
        Select a chat to start
      </Text>
      <Text style={[styles.subtitle, { color: theme.listSecondaryText }]}>
        Pick a conversation from the list, or start a new one.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  iconRing: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 20,
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
  },
});
