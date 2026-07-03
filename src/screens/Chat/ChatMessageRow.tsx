import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
  Pressable,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { MaterialIcons, Feather, Ionicons } from '@expo/vector-icons';
import { ChatVideoThumb } from '../../components/ChatVideoThumb';
import { chatTheme, bubbleCorners, type ClusterPosition } from './chatTheme';
import { useChatSettings } from '../../context/ChatSettingsContext';
import type { ChatListMessage } from './chatListModel';
import { getAudioPlaybackUri } from './chatRoomTypes';
import { LinkText } from './LinkText';
import { openFileUrl, formatGroupReadLabel } from './chatMessageUtils';

const MessageStatus = ({
  status,
  isRead,
  delivered,
  isOutgoing,
  isGroup,
  readCount,
  memberCount,
  onRetry,
  onReadReceiptPress,
}: {
  status?: string;
  isRead?: boolean;
  delivered?: boolean;
  isOutgoing: boolean;
  isGroup?: boolean;
  readCount?: number;
  memberCount?: number;
  onRetry?: () => void;
  onReadReceiptPress?: () => void;
}) => {
  const { theme } = useChatSettings();
  const metaColor = isOutgoing ? theme.outgoingMeta : theme.incomingMeta;
  if (status === 'sending') {
    return <ActivityIndicator size={10} color={metaColor} />;
  }
  if (status === 'pending' || status === 'failed') {
    return (
      <TouchableOpacity onPress={onRetry} disabled={!onRetry} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
        <MaterialIcons name="schedule" size={14} color="#E67E22" />
      </TouchableOpacity>
    );
  }
  if (isGroup && isOutgoing && memberCount !== undefined && memberCount > 0) {
    const allRead = (readCount ?? 0) >= memberCount;
    return (
      <TouchableOpacity
        onPress={onReadReceiptPress}
        disabled={!readCount}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <MaterialIcons
          name="done-all"
          size={16}
          color={allRead ? theme.readReceipt : metaColor}
        />
      </TouchableOpacity>
    );
  }
  if (isRead) {
    return <MaterialIcons name="done-all" size={16} color={theme.readReceipt} />;
  }
  if (delivered) {
    return <MaterialIcons name="done-all" size={16} color={metaColor} />;
  }
  return <MaterialIcons name="done" size={16} color={metaColor} />;
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

function groupReactions(reactions?: { emoji: string; user_id: string }[]) {
  if (!reactions?.length) return [];
  const map = new Map<string, number>();
  for (const r of reactions) {
    map.set(r.emoji, (map.get(r.emoji) ?? 0) + 1);
  }
  return [...map.entries()].map(([emoji, count]) => ({ emoji, count }));
}

type Props = {
  message: ChatListMessage;
  isOutgoing: boolean;
  isGroup: boolean;
  clusterPosition: ClusterPosition;
  showAvatar: boolean;
  showName: boolean;
  isPlayingAudio: string | null;
  hasAudioPermission: boolean;
  onPlayAudio: (url: string, id: string) => void;
  getImageUri: (msg: ChatListMessage) => string;
  onOpenMedia?: (messageId: string) => void;
  onOpenReel?: (reelId: string) => void;
  onOpenMoment?: (momentId: string) => void;
  onLongPress?: (message: ChatListMessage) => void;
  onRetry?: (message: ChatListMessage) => void;
  replyTo?: ChatListMessage | null;
  isSearchHit?: boolean;
  onReadReceiptPress?: (message: ChatListMessage) => void;
  onReply?: (message: ChatListMessage) => void;
};

export function ChatMessageRow({
  message: msg,
  isOutgoing,
  isGroup,
  clusterPosition,
  showAvatar,
  showName,
  isPlayingAudio,
  hasAudioPermission,
  onPlayAudio,
  getImageUri,
  onOpenMedia,
  onOpenReel,
  onOpenMoment,
  onLongPress,
  onRetry,
  replyTo,
  isSearchHit,
  onReadReceiptPress,
  onReply,
}: Props) {
  const { theme } = useChatSettings();
  const swipeRef = useRef<Swipeable>(null);
  const corners = bubbleCorners(isOutgoing, clusterPosition);
  const bubbleBg = isOutgoing ? theme.outgoingBubble : theme.incomingBubble;
  const textColor = isOutgoing ? theme.outgoingText : theme.incomingText;
  const metaColor = isOutgoing ? theme.outgoingMeta : theme.incomingMeta;
  const profile = msg.profiles;
  const imageUri = getImageUri(msg);
  const audioUri = getAudioPlaybackUri(msg);
  const reactionGroups = groupReactions(msg.reactions);
  const groupReadLabel =
    isOutgoing && isGroup
      ? formatGroupReadLabel(msg.read_count, msg.member_count)
      : null;

  const meta = (
    <View style={styles.metaRow}>
      {msg.view_once && (
        <Ionicons name="eye-outline" size={12} color={metaColor} style={styles.metaIcon} />
      )}
      {!msg.view_once && !!msg.expires_at && (
        <Ionicons name="timer-outline" size={12} color={metaColor} style={styles.metaIcon} />
      )}
      {!!msg.edited_at && (
        <Text style={[styles.edited, { color: metaColor }]}>edited </Text>
      )}
      <Text style={[styles.time, { color: metaColor }]}>{formatTime(msg.created_at)}</Text>
      {isOutgoing && (
        <MessageStatus
          status={msg._status}
          isRead={msg.is_read}
          delivered={msg.delivered}
          isOutgoing={isOutgoing}
          isGroup={isGroup}
          readCount={msg.read_count}
          memberCount={msg.member_count}
          onRetry={msg._status === 'failed' || msg._status === 'pending' ? () => onRetry?.(msg) : undefined}
          onReadReceiptPress={
            isGroup && (msg.read_count ?? 0) > 0
              ? () => onReadReceiptPress?.(msg)
              : undefined
          }
        />
      )}
    </View>
  );

  const replyQuote = replyTo ? (
    <View style={[styles.replyQuote, isOutgoing ? styles.replyQuoteOut : styles.replyQuoteIn]}>
      <Text style={[styles.replyName, { color: isOutgoing ? textColor : theme.primary }]} numberOfLines={1}>
        {replyTo.profiles?.display_name || 'Message'}
      </Text>
      <Text
        style={[styles.replyText, { color: isOutgoing ? 'rgba(255,255,255,0.85)' : '#666' }]}
        numberOfLines={2}
      >
        {replyTo.message_type === 'text' ? replyTo.content : replyTo.file_name || replyTo.message_type}
      </Text>
    </View>
  ) : null;

  const reactionsBar =
    reactionGroups.length > 0 ? (
      <View style={[styles.reactions, isOutgoing ? styles.reactionsOut : styles.reactionsIn]}>
        {reactionGroups.map((r) => (
          <View key={r.emoji} style={styles.reactionChip}>
            <Text style={styles.reactionEmoji}>{r.emoji}</Text>
            {r.count > 1 && <Text style={styles.reactionCount}>{r.count}</Text>}
          </View>
        ))}
      </View>
    ) : null;

  const wrapPressable = (child: React.ReactNode) => (
    <Pressable
      onLongPress={() => onLongPress?.(msg)}
      delayLongPress={280}
      style={isSearchHit ? styles.searchHit : undefined}
    >
      {child}
      {reactionsBar}
    </Pressable>
  );

  const renderBody = () => {
    if (msg.message_type === 'audio') {
      return wrapPressable(
        <View style={[styles.bubble, { backgroundColor: bubbleBg }, corners, styles.audioRow]}>
          {replyQuote}
          <TouchableOpacity
            style={styles.audioBtn}
            onPress={() => audioUri && onPlayAudio(audioUri, msg.id)}
            disabled={!audioUri || (!hasAudioPermission && Platform.OS !== 'web')}
          >
            <MaterialIcons
              name={isPlayingAudio === msg.id ? 'pause' : 'play-arrow'}
              size={22}
              color={isOutgoing ? textColor : theme.primary}
            />
          </TouchableOpacity>
          <View style={styles.waveform}>
            {[6, 12, 18, 14, 8, 14, 6].map((h, i) => (
              <View
                key={i}
                style={[
                  styles.waveBar,
                  { height: h },
                  isOutgoing ? styles.waveBarOutgoing : null,
                ]}
              />
            ))}
          </View>
          <Text style={[styles.audioDur, { color: textColor }]}>
            {formatDuration(msg.audio_duration || 0)}
          </Text>
          <View style={styles.metaOverlay}>{meta}</View>
        </View>
      );
    }

    if (msg.message_type === 'image') {
      return (
        <Pressable
          onPress={() => imageUri && onOpenMedia?.(msg.id)}
          onLongPress={() => onLongPress?.(msg)}
          delayLongPress={280}
          style={isSearchHit ? styles.searchHit : undefined}
        >
          <View style={[styles.mediaWrap, corners]}>
            {replyQuote}
            <Image source={{ uri: imageUri }} style={styles.mediaImage} resizeMode="cover" />
            <View style={styles.mediaMeta}>{meta}</View>
          </View>
          {reactionsBar}
        </Pressable>
      );
    }

    if (msg.message_type === 'reel') {
      const reelId = msg.reel_id;
      return wrapPressable(
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={() => reelId && onOpenReel?.(reelId)}
          disabled={!reelId || !onOpenReel}
        >
          <View style={[styles.mediaWrap, corners, { backgroundColor: bubbleBg }]}>
            {replyQuote}
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.mediaImage} resizeMode="cover" />
            ) : (
              <View style={[styles.mediaImage, styles.reelPlaceholder]}>
                <Ionicons name="film-outline" size={36} color="#ccc" />
              </View>
            )}
            <View style={styles.videoPlayOverlay}>
              <MaterialIcons name="play-circle-filled" size={52} color="rgba(255,255,255,0.95)" />
            </View>
            {!!msg.content && (
              <Text style={[styles.reelCaption, { color: textColor }]} numberOfLines={2}>
                {msg.content}
              </Text>
            )}
            <View style={styles.mediaMeta}>{meta}</View>
          </View>
        </TouchableOpacity>
      );
    }

    if (msg.message_type === 'moment') {
      const momentId = msg.moment_id;
      return wrapPressable(
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={() => momentId && onOpenMoment?.(momentId)}
          disabled={!momentId || !onOpenMoment}
        >
          <View style={[styles.mediaWrap, corners, { backgroundColor: bubbleBg }]}>
            {replyQuote}
            <View style={styles.momentQuoteBar}>
              <Ionicons name="albums-outline" size={14} color={isOutgoing ? textColor : theme.primary} />
              <Text
                style={[styles.momentQuoteLabel, { color: isOutgoing ? textColor : theme.primary }]}
                numberOfLines={1}
              >
                Moment
              </Text>
            </View>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.momentPreview} resizeMode="cover" />
            ) : (
              <View style={[styles.momentPreview, styles.reelPlaceholder]}>
                <Ionicons name="text-outline" size={28} color="#ccc" />
              </View>
            )}
            {!!msg.content && (
              <Text style={[styles.reelCaption, { color: textColor }]} numberOfLines={4}>
                {msg.content}
              </Text>
            )}
            <View style={styles.mediaMeta}>{meta}</View>
          </View>
        </TouchableOpacity>
      );
    }

    if (msg.message_type === 'video') {
      return (
        <Pressable
          onPress={() => imageUri && onOpenMedia?.(msg.id)}
          onLongPress={() => onLongPress?.(msg)}
          delayLongPress={280}
          style={isSearchHit ? styles.searchHit : undefined}
        >
          <View style={[styles.mediaWrap, corners]}>
            {replyQuote}
            <View style={styles.mediaImage}>
              <ChatVideoThumb videoUri={imageUri} localThumb={msg.local_thumb_uri} />
            </View>
            <View style={styles.videoPlayOverlay}>
              <MaterialIcons name="play-circle-filled" size={52} color="rgba(255,255,255,0.95)" />
            </View>
            <View style={styles.mediaMeta}>{meta}</View>
          </View>
          {reactionsBar}
        </Pressable>
      );
    }

    if (msg.message_type === 'file') {
      const fileUrl = msg.file_url?.split('?')[0];
      return wrapPressable(
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            if (fileUrl) void openFileUrl(fileUrl).catch(() => undefined);
          }}
          disabled={!fileUrl}
        >
          <View style={[styles.bubble, { backgroundColor: bubbleBg }, corners, styles.fileRow]}>
            {replyQuote}
            <Feather name="file" size={20} color={isOutgoing ? textColor : theme.primary} />
            <Text style={[styles.fileName, { color: textColor }]} numberOfLines={2}>
              {msg.file_name || 'Document'}
            </Text>
            {meta}
          </View>
        </TouchableOpacity>
      );
    }

    return wrapPressable(
      <View style={[styles.bubble, { backgroundColor: bubbleBg }, corners]}>
        {replyQuote}
        <LinkText
          text={msg.content ?? ''}
          color={textColor}
          linkColor={isOutgoing ? textColor : theme.link}
          onLinkPress={(url) => {
            void openFileUrl(url.startsWith('http') ? url : `https://${url}`);
          }}
        />
        {meta}
      </View>
    );
  };

  const tightTop = clusterPosition === 'middle' || clusterPosition === 'last';
  const tightBottom = clusterPosition === 'middle' || clusterPosition === 'first';

  const renderReplyAction = () => (
    <View style={styles.swipeReplyAction}>
      <View style={styles.swipeReplyIcon}>
        <Ionicons name="arrow-undo" size={18} color={theme.primary} />
      </View>
    </View>
  );

  const row = (
    <View
      style={[
        styles.row,
        isOutgoing ? styles.rowOut : styles.rowIn,
        tightTop && styles.rowTightTop,
        tightBottom && styles.rowTightBottom,
      ]}
    >
      {!isOutgoing && isGroup && (
        <View style={styles.avatarSlot}>
          {showAvatar ? (
            <Image
              source={{ uri: profile?.avatar_url || 'https://via.placeholder.com/32' }}
              style={styles.avatar}
            />
          ) : (
            <View style={styles.avatarSpacer} />
          )}
        </View>
      )}

      <View style={[styles.content, isOutgoing ? styles.contentOut : styles.contentIn]}>
        {showName && (
          <Text style={styles.senderName}>{profile?.display_name || 'Unknown'}</Text>
        )}
        {renderBody()}
        {!!groupReadLabel && (
          <TouchableOpacity
            onPress={() => onReadReceiptPress?.(msg)}
            disabled={!msg.read_count}
          >
            <Text style={styles.groupReadLabel}>{groupReadLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  if (!onReply) return row;

  return (
    <Swipeable
      ref={swipeRef}
      renderLeftActions={renderReplyAction}
      leftThreshold={48}
      friction={2}
      overshootLeft={false}
      onSwipeableOpen={(direction) => {
        if (direction === 'left') {
          onReply(msg);
        }
        swipeRef.current?.close();
      }}
    >
      {row}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginVertical: 2,
    paddingHorizontal: 4,
    maxWidth: '100%',
  },
  rowTightTop: { marginTop: 1 },
  rowTightBottom: { marginBottom: 1 },
  swipeReplyAction: {
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 12,
  },
  swipeReplyIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowOut: { justifyContent: 'flex-end' },
  rowIn: { justifyContent: 'flex-start' },
  avatarSlot: { width: 36, marginRight: 6, justifyContent: 'flex-end' },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarSpacer: { width: 32, height: 32 },
  content: { maxWidth: '82%' },
  contentOut: { alignItems: 'flex-end' },
  contentIn: { alignItems: 'flex-start' },
  senderName: {
    fontSize: 12.5,
    fontWeight: '600',
    color: chatTheme.senderName,
    marginBottom: 2,
    marginLeft: 4,
  },
  bubble: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
    maxWidth: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 1,
    elevation: 1,
  },
  searchHit: {
    borderRadius: 8,
    backgroundColor: 'rgba(255, 230, 100, 0.35)',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    marginTop: 2,
    gap: 4,
  },
  edited: { fontSize: 10, fontStyle: 'italic' },
  time: { fontSize: 11 },
  metaIcon: { marginRight: 3 },
  audioRow: { flexDirection: 'row', alignItems: 'center', minWidth: 180, paddingBottom: 18 },
  audioBtn: { marginRight: 8 },
  waveform: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  waveBar: {
    width: 2,
    backgroundColor: chatTheme.primary,
    marginHorizontal: 1,
    borderRadius: 1,
    opacity: 0.7,
  },
  waveBarOutgoing: { backgroundColor: '#fff' },
  audioDur: { fontSize: 13, marginLeft: 8 },
  metaOverlay: { position: 'absolute', right: 10, bottom: 6 },
  mediaWrap: { overflow: 'hidden', maxWidth: 260 },
  mediaImage: { width: 260, height: 200, backgroundColor: '#1a1a1a' },
  videoPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaMeta: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  fileName: { flex: 1, fontSize: 14 },
  reelPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  reelCaption: { paddingHorizontal: 10, paddingTop: 8, fontSize: 14 },
  momentQuoteBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
  },
  momentQuoteLabel: { fontSize: 12, fontWeight: '700' },
  momentPreview: { width: 260, height: 140, backgroundColor: '#1a1a1a' },
  replyQuote: {
    borderLeftWidth: 3,
    paddingLeft: 8,
    marginBottom: 6,
    opacity: 0.95,
  },
  replyQuoteOut: { borderLeftColor: 'rgba(255,255,255,0.7)' },
  replyQuoteIn: { borderLeftColor: chatTheme.primary },
  replyName: { fontSize: 12, fontWeight: '700' },
  replyText: { fontSize: 12, marginTop: 2 },
  reactions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  reactionsOut: { alignSelf: 'flex-end' },
  reactionsIn: { alignSelf: 'flex-start' },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
  },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 11, color: '#666', marginLeft: 2 },
  groupReadLabel: {
    fontSize: 11,
    color: chatTheme.readReceipt,
    marginTop: 2,
    marginRight: 4,
    alignSelf: 'flex-end',
  },
});
