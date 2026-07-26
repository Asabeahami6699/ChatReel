import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { replyPreviewText } from './chatMessageUtils';
import type { ChatListMessage } from './chatListModel';
import { useChatSettings } from '../../context/ChatSettingsContext';

type Props = {
  message: ChatListMessage;
  senderName?: string;
  onCancel: () => void;
};

export function ReplyPreviewBar({ message, senderName, onCancel }: Props) {
  const { theme } = useChatSettings();

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: theme.inputFieldBg, borderTopColor: theme.composerBorder },
      ]}
    >
      <View style={[styles.accent, { backgroundColor: theme.primary }]} />
      <View style={styles.body}>
        <Text style={[styles.name, { color: theme.primary }]} numberOfLines={1}>
          {senderName || 'Reply'}
        </Text>
        <Text style={[styles.preview, { color: theme.listSecondaryText }]} numberOfLines={2}>
          {replyPreviewText(message)}
        </Text>
      </View>
      <TouchableOpacity onPress={onCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close" size={22} color={theme.listSecondaryText} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
  },
  accent: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
  },
  body: { flex: 1 },
  name: { fontSize: 13, fontWeight: '700' },
  preview: { fontSize: 13, marginTop: 2 },
});
