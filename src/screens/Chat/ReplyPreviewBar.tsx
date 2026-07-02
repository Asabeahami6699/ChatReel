import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { chatTheme } from './chatTheme';
import { replyPreviewText } from './chatMessageUtils';
import type { ChatListMessage } from './chatListModel';

type Props = {
  message: ChatListMessage;
  senderName?: string;
  onCancel: () => void;
};

export function ReplyPreviewBar({ message, senderName, onCancel }: Props) {
  return (
    <View style={styles.bar}>
      <View style={styles.accent} />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {senderName || 'Reply'}
        </Text>
        <Text style={styles.preview} numberOfLines={2}>
          {replyPreviewText(message)}
        </Text>
      </View>
      <TouchableOpacity onPress={onCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close" size={22} color="#888" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: chatTheme.composerBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
  },
  accent: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
    backgroundColor: chatTheme.primary,
  },
  body: { flex: 1 },
  name: { fontSize: 13, fontWeight: '700', color: chatTheme.primary },
  preview: { fontSize: 13, color: '#666', marginTop: 2 },
});
