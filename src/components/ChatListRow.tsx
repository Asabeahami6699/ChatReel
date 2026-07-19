import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { ChatListAvatar } from './ChatListAvatar';

export type ChatListRowItem = {
  user_id?: string;
  id?: string;
  name: string;
  avatar_url?: string | null;
  last_message?: string | null;
  last_message_at?: string | null;
  unread_count?: number;
  member_count?: number;
  user_role?: string;
  last_message_sender?: string | null;
  last_message_sender_display_name?: string;
};

type RowProps = {
  item: ChatListRowItem;
  isGroup?: boolean;
  listBg: string;
  primaryText: string;
  secondaryText: string;
  preview: string;
  timeLabel: string;
  onPress: () => void;
  onLongPress: (e: any) => void;
};

/** Memoized row — avatar only re-renders when uri/name change. */
export const ChatListRow = memo(
  function ChatListRow({
    item,
    isGroup,
    listBg,
    primaryText,
    secondaryText,
    preview,
    timeLabel,
    onPress,
    onLongPress,
  }: RowProps) {
    return (
      <TouchableOpacity
        style={[styles.chatItem, { backgroundColor: listBg }]}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={400}
      >
        <View style={styles.avatarContainer}>
          <ChatListAvatar uri={item.avatar_url} name={item.name} previewOnPress />
          {isGroup &&
            item.user_role &&
            (item.user_role === 'creator' || item.user_role === 'admin') && (
              <View
                style={[
                  styles.roleBadge,
                  item.user_role === 'creator' ? styles.creatorBadge : styles.adminBadge,
                ]}
              >
                <Text style={styles.roleBadgeText}>
                  {item.user_role === 'creator' ? '👑' : '⚡'}
                </Text>
              </View>
            )}
        </View>

        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <Text style={[styles.chatName, { color: primaryText }]} numberOfLines={1}>
              {item.name}
              {isGroup && (item.member_count ?? 0) > 0 && (
                <Text style={[styles.memberCountText, { color: secondaryText }]}>
                  {' '}
                  • {item.member_count}
                </Text>
              )}
            </Text>
            <View style={styles.timeContainer}>
              {!!timeLabel && (
                <Text style={[styles.time, { color: secondaryText }]}>{timeLabel}</Text>
              )}
            </View>
          </View>

          <View style={styles.messageContainer}>
            <Text
              style={[
                styles.lastMessage,
                { color: secondaryText },
                (item.unread_count ?? 0) > 0 && [styles.unreadMessage, { color: primaryText }],
              ]}
              numberOfLines={1}
            >
              {preview}
            </Text>
            <View style={styles.rightContainer}>
              {(item.unread_count ?? 0) > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadCount}>
                    {(item.unread_count ?? 0) > 99 ? '99+' : item.unread_count}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  },
  (prev, next) =>
    prev.item.avatar_url === next.item.avatar_url &&
    prev.item.name === next.item.name &&
    prev.item.last_message === next.item.last_message &&
    prev.item.last_message_at === next.item.last_message_at &&
    prev.item.unread_count === next.item.unread_count &&
    prev.item.member_count === next.item.member_count &&
    prev.item.user_role === next.item.user_role &&
    prev.preview === next.preview &&
    prev.timeLabel === next.timeLabel &&
    prev.listBg === next.listBg &&
    prev.primaryText === next.primaryText &&
    prev.secondaryText === next.secondaryText &&
    prev.isGroup === next.isGroup
);

type PaneProps = {
  refreshing: boolean;
  onRefresh: () => void;
  isOnline: boolean;
  header?: React.ReactNode;
  empty?: React.ReactNode;
  children: React.ReactNode;
};

/** ScrollView list — React reconciles by key (no FlatList cell recycling blink). */
export function ChatListScrollPane({
  refreshing,
  onRefresh,
  isOnline,
  header,
  empty,
  children,
}: PaneProps) {
  const hasChildren = React.Children.count(children) > 0;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={!hasChildren ? styles.emptyGrow : undefined}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} enabled={isOnline} />
      }
      removeClippedSubviews={false}
      keyboardShouldPersistTaps="handled"
    >
      {header}
      {hasChildren ? children : empty}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  emptyGrow: { flexGrow: 1 },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  avatarContainer: {
    width: 52,
    height: 52,
    marginRight: 12,
    position: 'relative',
  },
  roleBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  creatorBadge: { backgroundColor: '#fef3c7' },
  adminBadge: { backgroundColor: '#dbeafe' },
  roleBadgeText: { fontSize: 10 },
  chatInfo: { flex: 1 },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatName: { fontSize: 16, fontWeight: '600', flex: 1 },
  memberCountText: { fontSize: 12, fontWeight: 'normal' },
  timeContainer: { flexDirection: 'row', alignItems: 'center' },
  time: { fontSize: 12 },
  messageContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: { fontSize: 14, flex: 1, marginRight: 8 },
  unreadMessage: { fontWeight: '600' },
  rightContainer: { flexDirection: 'row', alignItems: 'center' },
  unreadBadge: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadCount: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
});
