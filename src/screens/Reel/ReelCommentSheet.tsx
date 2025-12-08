// D:\chatApp\chatApp\src\screens\Reel\ReelCommentSheet.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Comment {
  id: string;
  user: string;
  avatar: string;
  text: string;
  likes: number;
  replies: Comment[];
  timestamp: string;
}

interface ReelCommentSheetProps {
  reelId: string;
  onClose: () => void;
}

const mockComments: Comment[] = [
  {
    id: '1',
    user: 'alexmorgan',
    avatar: 'https://randomuser.me/api/portraits/women/44.jpg',
    text: 'This is so good!',
    likes: 12,
    timestamp: '2h',
    replies: [
      {
        id: '1-1',
        user: 'jordanlee',
        avatar: 'https://randomuser.me/api/portraits/men/32.jpg',
        text: 'Right?!',
        likes: 3,
        timestamp: '1h',
        replies: [],
      },
    ],
  },
];

export default function ReelCommentSheet({ onClose }: ReelCommentSheetProps) {
  const [comments, setComments] = useState(mockComments);
  const [newComment, setNewComment] = useState('');

  const sendComment = () => {
    if (newComment.trim()) {
      setComments([
        ...comments,
        {
          id: Date.now().toString(),
          user: 'you',
          avatar: 'https://randomuser.me/api/portraits/men/1.jpg',
          text: newComment,
          likes: 0,
          timestamp: 'now',
          replies: [],
        },
      ]);
      setNewComment('');
    }
  };

  const renderComment = ({ item }: { item: Comment }) => (
    <View style={styles.commentItem}>
      <Image source={{ uri: item.avatar }} style={styles.commentAvatar} />
      <View style={styles.commentContent}>
        <View style={styles.commentHeader}>
          <Text style={styles.commentUser}>@{item.user}</Text>
          <Text style={styles.commentTime}>{item.timestamp}</Text>
        </View>
        <Text style={styles.commentText}>{item.text}</Text>
        <View style={styles.commentActions}>
          <TouchableOpacity style={styles.likeButton}>
            <Ionicons name="heart-outline" size={16} color="#888" />
            <Text style={styles.likeCount}>{item.likes}</Text>
          </TouchableOpacity>
          <TouchableOpacity>
            <Text style={styles.replyText}>Reply</Text>
          </TouchableOpacity>
        </View>
        {item.replies.map(reply => (
          <View key={reply.id} style={styles.replyItem}>
            <Image source={{ uri: reply.avatar }} style={styles.replyAvatar} />
            <View style={styles.replyContent}>
              <Text style={styles.replyUser}>@{reply.user}</Text>
              <Text style={styles.replyText}>{reply.text}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Comments (89)</Text>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={comments}
        keyExtractor={item => item.id}
        renderItem={renderComment}
        style={styles.commentList}
        showsVerticalScrollIndicator={false}
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Add a comment..."
          placeholderTextColor="#888"
          value={newComment}
          onChangeText={setNewComment}
        />
        <TouchableOpacity onPress={sendComment} disabled={!newComment.trim()}>
          <Text style={[styles.sendText, !newComment.trim() && styles.sendTextDisabled]}>
            Post
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 0.5,
    borderColor: '#333',
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '600' },
  commentList: { flex: 1, paddingHorizontal: 16 },
  commentItem: { flexDirection: 'row', marginVertical: 12 },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 12 },
  commentContent: { flex: 1 },
  commentHeader: { flexDirection: 'row', alignItems: 'center' },
  commentUser: { color: '#fff', fontWeight: '600', fontSize: 14 },
  commentTime: { color: '#888', fontSize: 12, marginLeft: 8 },
  commentText: { color: '#fff', marginTop: 4 },
  commentActions: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  likeButton: { flexDirection: 'row', alignItems: 'center', marginRight: 16 },
  likeCount: { color: '#888', marginLeft: 4, fontSize: 12 },
  replyText: { color: '#888', fontSize: 12 },
  replyItem: { flexDirection: 'row', marginTop: 12, marginLeft: 48 },
  replyAvatar: { width: 28, height: 28, borderRadius: 14, marginRight: 8 },
  replyContent: { flex: 1 },
  replyUser: { color: '#fff', fontWeight: '600', fontSize: 13 },
  replyText: { color: '#ddd', fontSize: 13, marginTop: 2 },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 0.5,
    borderColor: '#333',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#222',
    color: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    fontSize: 16,
  },
  sendText: { color: '#0095f6', fontWeight: '600', marginLeft: 12 },
  sendTextDisabled: { color: '#666' },
});