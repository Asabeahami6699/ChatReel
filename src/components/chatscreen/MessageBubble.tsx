// src/components/chatscreen/MessageBubble.tsx
import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

type Props = {
  message: {
    content: string;
    file_url?: string;
    message_type?: string;
    status?: string;
  };
  isMe: boolean;
  isGroup: boolean;
};

export const MessageBubble = ({ message, isMe, isGroup }: Props) => {
  const bubbleStyle = isMe ? styles.me : styles.other;
  const textStyle = isMe ? styles.meText : styles.otherText;

  return (
    <View style={[styles.container, bubbleStyle]}>
      {message.message_type === 'image' && message.file_url ? (
        <Image source={{ uri: message.file_url }} style={styles.image} />
      ) : message.message_type === 'video' && message.file_url ? (
        <View style={styles.video}>
          <Text style={textStyle}>[Video] Tap to play</Text>
        </View>
      ) : (
        <Text style={textStyle}>{message.content}</Text>
      )}
      {message.status && <Text style={styles.status}>{message.status}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    maxWidth: '80%',
    padding: 10,
    borderRadius: 16,
    marginVertical: 2,
  },
  me: {
    alignSelf: 'flex-end',
    backgroundColor: '#DCF8C6',
  },
  other: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
  },
  meText: { color: '#000' },
  otherText: { color: '#000' },
  image: { width: 200, height: 200, borderRadius: 12 },
  video: { width: 200, height: 120, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  status: { fontSize: 10, color: '#666', marginTop: 4, alignSelf: 'flex-end' },
});