// D:\chatApp\chatApp\src\components\chatscreen\ChatHeader.tsx
import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';

export const ChatHeader = ({ title, type, isGroup }: { title: string; type: string; isGroup: boolean }) => (
  <View style={styles.container}>
    <View style={styles.avatarPlaceholder} />
    <View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>
        {isGroup ? 'Group chat' : 'Active now'}
      </Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ddd',
    marginRight: 10,
  },
  title: { fontSize: 18, fontWeight: 'bold' },
  subtitle: { fontSize: 13, color: '#777' },
});