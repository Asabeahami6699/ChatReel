// src/components/chatscreen/MessageList.tsx
import React, { forwardRef } from 'react';
import { FlatList, View, Text, Image, StyleSheet } from 'react-native';
import { MessageBubble } from './MessageBubble';

type Message = {
  id: string;
  sender_id: string;
  content: string;
  decrypted?: string;
  message_type?: 'text' | 'image' | 'video' | 'file' | 'audio';
  file_url?: string;
  created_at: string;
  is_expired?: boolean;
  auto_delete_at?: string;
  is_reaction?: boolean;
  original_content?: string;
  status?: 'sending' | 'sent' | 'failed';
};

type Props = {
  messages: Message[];
  currentUserId: string;
  isGroup: boolean;
};

export const MessageList = forwardRef<FlatList<Message>, Props>(
  ({ messages, currentUserId, isGroup }, ref) => {
    const renderItem = ({ item }: { item: Message }) => {
      // Hide expired messages
      if (item.is_expired) return null;

      const isMe = item.sender_id === currentUserId;
      const text = item.decrypted || item.content;

      // Auto-delete countdown
      const showAutoDelete = item.auto_delete_at && !item.is_expired;
      const timeLeft = showAutoDelete
        ? Math.max(0, (new Date(item.auto_delete_at!).getTime() - Date.now()) / 1000)
        : 0;
      const mins = Math.floor(timeLeft / 60);
      const secs = Math.floor(timeLeft % 60);
      const timer = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

      return (
        <View style={{ marginVertical: 4 }}>
          {/* Main Message */}
          <MessageBubble
            message={{
              ...item,
              content: text,
              file_url: item.file_url,
              message_type: item.message_type,
            }}
            isMe={isMe}
            isGroup={isGroup}
          />

          {/* Auto-delete timer */}
          {showAutoDelete && (
            <Text style={styles.timer}>
              {timer} (deletes in {timer})
            </Text>
          )}

          {/* Reaction */}
          {item.is_reaction && item.original_content && (
            <Text style={styles.reaction}>Reacted to: {item.original_content}</Text>
          )}
        </View>
      );
    };

    return (
      <FlatList
        ref={ref}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 10 }}
        inverted={false}
        showsVerticalScrollIndicator={false}
      />
    );
  }
);

const styles = StyleSheet.create({
  timer: {
    fontSize: 10,
    color: '#888',
    textAlign: 'center',
    marginTop: 2,
  },
  reaction: {
    fontSize: 11,
    color: '#555',
    fontStyle: 'italic',
    marginTop: 2,
  },
});