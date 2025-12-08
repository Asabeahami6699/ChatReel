// src/screens/Chat/EmptyChatScreen.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function EmptyChatScreen() {
  return (
    <View style={styles.container}>
      <Ionicons name="chatbubble-ellipses-outline" size={72} color="#ccc" />
      <Text style={styles.text}>Select a chat to start</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  text: {
    marginTop: 12,
    fontSize: 16,
    color: '#999',
  },
});