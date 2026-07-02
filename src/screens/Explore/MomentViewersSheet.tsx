import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError, type MomentReplyDTO, type MomentViewerDTO } from '../../lib/api';
import { navigateToChat } from '../../navigation/navigateToChat';
import { useCurrentProfileId } from '../../hooks/useCurrentProfileId';

const C = {
  primary: '#007AFF',
  bg: '#fff',
  surface: '#f4f8fc',
  border: '#e2eaf3',
  text: '#1c1c1e',
  muted: '#6b7280',
};

type SheetTab = 'comments' | 'views';

type Props = {
  visible: boolean;
  momentId: string;
  isOwner: boolean;
  initialTab?: SheetTab;
  onClose: () => void;
};

function displayName(v: { display_name: string | null; email: string | null }): string {
  return v.display_name?.trim() || v.email?.split('@')[0] || 'User';
}

function formatViewedAt(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

function ReplyRow({
  reply,
  myProfileId,
  isOwner,
  onReply,
}: {
  reply: MomentReplyDTO;
  myProfileId: string | null;
  isOwner: boolean;
  onReply?: (reply: MomentReplyDTO) => void;
}) {
  const isMine = reply.author_id === myProfileId;
  const canOwnerReply = isOwner && !isMine && onReply && reply.author_user_id;

  return (
    <View style={styles.replyRow}>
      {reply.author_avatar_url ? (
        <Image source={{ uri: reply.author_avatar_url }} style={styles.replyAvatar} />
      ) : (
        <View style={[styles.replyAvatar, styles.replyAvatarFallback]}>
          <Text style={styles.replyAvatarLetter}>{reply.author_name.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.replyBody}>
        <Text style={styles.replyAuthor}>{isMine ? 'You' : reply.author_name}</Text>
        <Text style={styles.replyText}>{reply.body}</Text>
        <Text style={styles.replyTime}>{formatViewedAt(reply.created_at)}</Text>
      </View>
      {canOwnerReply ? (
        <TouchableOpacity style={styles.actionBtn} onPress={() => onReply(reply)}>
          <Ionicons name="arrow-undo-outline" size={18} color={C.primary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function MomentViewersSheet({
  visible,
  momentId,
  isOwner,
  initialTab = 'comments',
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const myProfileId = useCurrentProfileId();

  const [tab, setTab] = useState<SheetTab>(initialTab);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewers, setViewers] = useState<MomentViewerDTO[]>([]);
  const [replies, setReplies] = useState<MomentReplyDTO[]>([]);
  const [replyToViewer, setReplyToViewer] = useState<MomentViewerDTO | null>(null);
  const [replyToComment, setReplyToComment] = useState<MomentReplyDTO | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.moments.activity(momentId);
      setViewers(data.viewers);
      setReplies(data.replies);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load comments';
      setLoadError(message);
      setViewers([]);
      setReplies([]);
    } finally {
      setLoading(false);
    }
  }, [momentId]);

  useEffect(() => {
    if (visible) {
      setTab(isOwner ? initialTab : 'comments');
      void load();
      setReplyToViewer(null);
      setReplyToComment(null);
      setReplyText('');
    }
  }, [visible, load, initialTab, isOwner]);

  const clearReplyTarget = () => {
    setReplyToViewer(null);
    setReplyToComment(null);
  };

  const openViewerChat = (viewer: MomentViewerDTO) => {
    onClose();
    navigateToChat({
      chatType: 'individual',
      chatId: viewer.user_id,
      chatName: displayName(viewer),
      avatarUrl: viewer.avatar_url ?? undefined,
    });
  };

  const sendMessage = async () => {
    const body = replyText.trim();
    if (!body || sending) return;

    let recipientUserId =
      replyToComment?.author_user_id?.trim() || replyToViewer?.user_id?.trim() || undefined;

    if (!recipientUserId && replyToComment) {
      const viewer = viewers.find((v) => v.profile_id === replyToComment.author_id);
      recipientUserId = viewer?.user_id;
    }

    const toChat = Boolean(isOwner && recipientUserId);

    setSending(true);
    try {
      let payload = body;
      if (replyToComment) {
        payload = `@${replyToComment.author_name} ${body}`;
      } else if (replyToViewer) {
        payload = `@${displayName(replyToViewer)} ${body}`;
      }

      const { reply } = await api.moments.reply(momentId, payload, recipientUserId, {
        to_chat: toChat,
      });
      setReplies((prev) => [...prev, reply]);
      setReplyText('');
      clearReplyTarget();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not send';
      Alert.alert('Moment', message);
    } finally {
      setSending(false);
    }
  };

  const replyTargetLabel = replyToComment
    ? replyToComment.author_name
    : replyToViewer
      ? displayName(replyToViewer)
      : null;

  const composePlaceholder = isOwner
    ? replyTargetLabel
      ? `Reply to ${replyTargetLabel}…`
      : 'Reply to viewers…'
    : 'Add a comment…';

  const renderComments = () => (
    <FlatList
      data={replies}
      keyExtractor={(item) => item.id}
      contentContainerStyle={replies.length === 0 ? styles.emptyList : undefined}
      ListEmptyComponent={
        <Text style={styles.emptyText}>
          {isOwner ? 'No comments yet.' : 'No comments yet. Be the first!'}
        </Text>
      }
      renderItem={({ item }) => (
        <ReplyRow
          reply={item}
          myProfileId={myProfileId}
          isOwner={isOwner}
          onReply={(r) => {
            const viewer = viewers.find((v) => v.profile_id === r.author_id);
            setReplyToComment({
              ...r,
              author_user_id: r.author_user_id || viewer?.user_id || '',
            });
            setReplyToViewer(null);
            setReplyText('');
          }}
        />
      )}
    />
  );

  const renderViews = () => (
    <FlatList
      data={viewers}
      keyExtractor={(item) => item.profile_id}
      contentContainerStyle={viewers.length === 0 ? styles.emptyList : undefined}
      ListEmptyComponent={
        <Text style={styles.emptyText}>No views yet. Share your moment!</Text>
      }
      renderItem={({ item }) => (
        <View style={styles.viewerRow}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.viewerAvatar} />
          ) : (
            <View style={[styles.viewerAvatar, styles.replyAvatarFallback]}>
              <Text style={styles.replyAvatarLetter}>
                {displayName(item).charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.viewerMeta}>
            <Text style={styles.viewerName}>{displayName(item)}</Text>
            <Text style={styles.viewerTime}>{formatViewedAt(item.viewed_at)}</Text>
          </View>
          <View style={styles.viewerActions}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => openViewerChat(item)}>
              <Ionicons name="chatbubble-outline" size={18} color={C.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => {
                setReplyToViewer(item);
                setReplyToComment(null);
                setReplyText('');
                setTab('comments');
              }}
            >
              <Ionicons name="arrow-undo-outline" size={18} color={C.primary} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    />
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.handle} />
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>
            {isOwner ? (tab === 'views' ? 'Views' : 'Comments') : 'Comments'}
          </Text>
          <Text style={styles.sheetSub}>
            {tab === 'views'
              ? `${viewers.length} viewer${viewers.length === 1 ? '' : 's'}`
              : `${replies.length} comment${replies.length === 1 ? '' : 's'}`}
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={C.muted} />
          </TouchableOpacity>
        </View>

        {isOwner ? (
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'comments' && styles.tabBtnActive]}
              onPress={() => setTab('comments')}
            >
              <Text style={[styles.tabBtnText, tab === 'comments' && styles.tabBtnTextActive]}>
                Comments
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'views' && styles.tabBtnActive]}
              onPress={() => setTab('views')}
            >
              <Text style={[styles.tabBtnText, tab === 'views' && styles.tabBtnTextActive]}>
                Views
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={C.primary} style={{ marginVertical: 32 }} />
        ) : loadError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{loadError}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => void load()}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : tab === 'views' && isOwner ? (
          renderViews()
        ) : (
          renderComments()
        )}

        {(tab === 'comments' || !isOwner) && !loadError ? (
          <View style={styles.composeRow}>
            {replyTargetLabel ? (
              <Text style={styles.replyingTo}>
                Replying to {replyTargetLabel}
                <Text onPress={clearReplyTarget} style={styles.cancelReply}>
                  {' '}
                  · Cancel
                </Text>
              </Text>
            ) : null}
            <View style={styles.composeInputRow}>
              <TextInput
                style={styles.composeInput}
                placeholder={composePlaceholder}
                placeholderTextColor={C.muted}
                value={replyText}
                onChangeText={setReplyText}
                editable={!sending}
              />
              <TouchableOpacity
                style={[styles.sendBtn, !replyText.trim() && styles.sendBtnDisabled]}
                onPress={() => void sendMessage()}
                disabled={!replyText.trim() || sending}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="send" size={16} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '72%',
    minHeight: 280,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: C.text, flex: 1 },
  sheetSub: { fontSize: 13, color: C.muted, marginRight: 8 },
  closeBtn: { padding: 4 },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    backgroundColor: C.surface,
    borderRadius: 10,
    padding: 3,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabBtnActive: { backgroundColor: C.bg, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4 },
  tabBtnText: { fontSize: 14, fontWeight: '600', color: C.muted },
  tabBtnTextActive: { color: C.primary },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  emptyText: { textAlign: 'center', color: C.muted, padding: 32 },
  errorBox: { alignItems: 'center', padding: 24 },
  errorText: { color: '#c62828', textAlign: 'center', marginBottom: 12 },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: C.primary,
    borderRadius: 16,
  },
  retryBtnText: { color: '#fff', fontWeight: '600' },
  viewerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  viewerAvatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12 },
  viewerMeta: { flex: 1 },
  viewerName: { fontSize: 15, fontWeight: '700', color: C.text },
  viewerTime: { fontSize: 12, color: C.muted, marginTop: 2 },
  viewerActions: { flexDirection: 'row', gap: 4 },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  replyAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  replyAvatarFallback: {
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyAvatarLetter: { color: '#fff', fontWeight: '700', fontSize: 13 },
  replyBody: { flex: 1 },
  replyAuthor: { fontSize: 13, fontWeight: '700', color: C.text },
  replyText: { fontSize: 14, color: C.text, marginTop: 2, lineHeight: 20 },
  replyTime: { fontSize: 11, color: C.muted, marginTop: 4 },
  composeRow: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: 14,
    paddingTop: 10,
    backgroundColor: C.bg,
  },
  replyingTo: { fontSize: 12, color: C.muted, marginBottom: 6 },
  cancelReply: { color: C.primary, fontWeight: '600' },
  composeInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  composeInput: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: C.text,
    borderWidth: 1,
    borderColor: C.border,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
});
