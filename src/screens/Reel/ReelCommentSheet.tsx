import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useReelComments } from '../../hooks/useReelComments';
import type { ReelCommentDTO } from '../../lib/api';

interface Props {
  reelId: string;
  onClose: () => void;
  onCommentAdded?: () => void;
  onCommentRemoved?: () => void;
}

function timeAgo(iso: string): string {
  const created = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - created);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(created).toLocaleDateString();
}

function authorName(c: ReelCommentDTO): string {
  return (
    c.author?.display_name?.trim() ||
    c.author?.email?.split('@')[0] ||
    'unknown'
  );
}

export default function ReelCommentSheet({
  reelId,
  onClose,
  onCommentAdded,
  onCommentRemoved,
}: Props) {
  const {
    comments,
    loading,
    loadingMore,
    hasMore,
    error,
    posting,
    post,
    remove,
    loadMore,
  } = useReelComments(reelId);
  const [text, setText] = useState('');

  const send = async () => {
    if (!text.trim()) return;
    const result = await post(text);
    if (result) {
      setText('');
      onCommentAdded?.();
    }
  };

  const askDelete = (commentId: string) => {
    Alert.alert('Delete comment?', '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await remove(commentId);
          onCommentRemoved?.();
        },
      },
    ]);
  };

  const renderComment = ({ item }: { item: ReelCommentDTO }) => {
    const avatar = item.author?.avatar_url;
    const name = authorName(item);
    return (
      <TouchableOpacity onLongPress={() => askDelete(item.id)} delayLongPress={500} activeOpacity={0.85}>
        <View style={styles.commentItem}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.commentAvatar} />
          ) : (
            <View style={[styles.commentAvatar, styles.avatarFallback]}>
              <Text style={styles.avatarFallbackText}>{name.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.commentContent}>
            <View style={styles.commentHeader}>
              <Text style={styles.commentUser}>@{name}</Text>
              <Text style={styles.commentTime}>{timeAgo(item.created_at)}</Text>
            </View>
            <Text style={styles.commentText}>{item.content}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.handle} />
      <View style={styles.header}>
        <Text style={styles.title}>
          Comments {comments.length ? `(${comments.length}${hasMore ? '+' : ''})` : ''}
        </Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : comments.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="chatbubble-ellipses-outline" size={40} color="#666" />
          <Text style={styles.emptyText}>Be the first to comment</Text>
        </View>
      ) : (
        <FlatList
          data={comments}
          keyExtractor={(c) => c.id}
          renderItem={renderComment}
          style={styles.commentList}
          contentContainerStyle={{ paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
          onEndReached={() => {
            if (hasMore && !loadingMore) loadMore();
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 16 }}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : null
          }
        />
      )}

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Add a comment..."
          placeholderTextColor="#888"
          value={text}
          onChangeText={setText}
          editable={!posting}
          maxLength={1000}
          multiline
        />
        <TouchableOpacity onPress={send} disabled={!text.trim() || posting}>
          <Text style={[styles.sendText, (!text.trim() || posting) && styles.sendTextDisabled]}>
            {posting ? '...' : 'Post'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#444',
    alignSelf: 'center',
    marginTop: 8,
  },
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
  avatarFallback: { backgroundColor: '#1976d2', justifyContent: 'center', alignItems: 'center' },
  avatarFallbackText: { color: '#fff', fontWeight: '700' },
  commentContent: { flex: 1 },
  commentHeader: { flexDirection: 'row', alignItems: 'center' },
  commentUser: { color: '#fff', fontWeight: '600', fontSize: 14 },
  commentTime: { color: '#888', fontSize: 12, marginLeft: 8 },
  commentText: { color: '#fff', marginTop: 4, lineHeight: 18 },
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 0.5,
    borderColor: '#333',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: '#222',
    color: '#fff',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    borderRadius: 20,
    fontSize: 15,
    maxHeight: 120,
  },
  sendText: { color: '#1e90ff', fontWeight: '600', marginLeft: 12, paddingVertical: 10 },
  sendTextDisabled: { color: '#666' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#aaa', marginTop: 12 },
  errorText: { color: '#ff6b6b', marginHorizontal: 24, textAlign: 'center' },
});
