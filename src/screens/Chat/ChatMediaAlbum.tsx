import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { chatTheme, bubbleCorners, type ClusterPosition } from './chatTheme';
import type { ChatListMessage } from './chatListModel';

const TILE = 128;
const GAP = 2;
const ALBUM_W = TILE * 2 + GAP;

type Props = {
  messages: ChatListMessage[];
  isOutgoing: boolean;
  clusterPosition: ClusterPosition;
  getImageUri: (msg: ChatListMessage) => string;
  onOpenMedia?: (messageId: string) => void;
  onLongPress?: (message: ChatListMessage) => void;
  formatTime: (iso: string) => string;
};

function MediaTile({
  msg,
  uri,
  style,
  overlay,
  onPress,
  onLongPress,
}: {
  msg: ChatListMessage;
  uri: string;
  style: object;
  overlay?: React.ReactNode;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <Pressable
      style={style}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
    >
      <Image source={{ uri }} style={styles.tileImage} resizeMode="cover" />
      {msg.message_type === 'video' && (
        <View style={styles.playOverlay}>
          <MaterialIcons name="play-circle-filled" size={36} color="rgba(255,255,255,0.95)" />
        </View>
      )}
      {overlay}
    </Pressable>
  );
}

/** WhatsApp-style grouped image/video album in one bubble. */
export function ChatMediaAlbum({
  messages,
  isOutgoing,
  clusterPosition,
  getImageUri,
  onOpenMedia,
  onLongPress,
  formatTime,
}: Props) {
  const corners = bubbleCorners(isOutgoing, clusterPosition);
  const count = messages.length;
  const last = messages[messages.length - 1];
  const metaColor = isOutgoing ? chatTheme.outgoingMeta : chatTheme.incomingMeta;

  const open = (id: string) => onOpenMedia?.(id);
  const longPress = (msg: ChatListMessage) => onLongPress?.(msg);

  const meta = (
    <View style={styles.mediaMeta}>
      <Text style={[styles.time, { color: metaColor }]}>{formatTime(last.created_at)}</Text>
    </View>
  );

  if (count === 1) {
    const msg = messages[0];
    const uri = getImageUri(msg);
    return (
      <Pressable onLongPress={() => longPress(msg)} delayLongPress={280}>
        <View style={[styles.wrap, corners]}>
          <Pressable onPress={() => open(msg.id)} onLongPress={() => longPress(msg)} delayLongPress={280}>
            <Image source={{ uri }} style={styles.single} resizeMode="cover" />
            {msg.message_type === 'video' && (
              <View style={styles.playOverlay}>
                <MaterialIcons name="play-circle-filled" size={52} color="rgba(255,255,255,0.95)" />
              </View>
            )}
          </Pressable>
          {meta}
        </View>
      </Pressable>
    );
  }

  if (count === 2) {
    return (
      <View style={[styles.wrap, corners]}>
        <View style={styles.row2}>
          {messages.map((msg) => (
            <MediaTile
              key={msg.id}
              msg={msg}
              uri={getImageUri(msg)}
              style={styles.half}
              onPress={() => open(msg.id)}
              onLongPress={() => longPress(msg)}
            />
          ))}
        </View>
        {meta}
      </View>
    );
  }

  if (count === 3) {
    const [a, b, c] = messages;
    return (
      <View style={[styles.wrap, corners]}>
        <View style={styles.row3}>
          <MediaTile
            msg={a}
            uri={getImageUri(a)}
            style={styles.tallLeft}
            onPress={() => open(a.id)}
            onLongPress={() => longPress(a)}
          />
          <View style={styles.colRight}>
            <MediaTile
              msg={b}
              uri={getImageUri(b)}
              style={styles.small}
              onPress={() => open(b.id)}
              onLongPress={() => longPress(b)}
            />
            <MediaTile
              msg={c}
              uri={getImageUri(c)}
              style={styles.small}
              onPress={() => open(c.id)}
              onLongPress={() => longPress(c)}
            />
          </View>
        </View>
        {meta}
      </View>
    );
  }

  const visible = messages.slice(0, 4);
  const extra = count - 4;

  return (
    <View style={[styles.wrap, corners]}>
      <View style={styles.grid4}>
        {visible.map((msg, i) => (
          <MediaTile
            key={msg.id}
            msg={msg}
            uri={getImageUri(msg)}
            style={styles.quarter}
            onPress={() => open(msg.id)}
            onLongPress={() => longPress(msg)}
            overlay={
              i === 3 && extra > 0 ? (
                <View style={styles.moreOverlay}>
                  <Text style={styles.moreText}>+{extra}</Text>
                </View>
              ) : undefined
            }
          />
        ))}
      </View>
      {meta}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    maxWidth: ALBUM_W,
    backgroundColor: '#1a1a1a',
  },
  single: { width: 260, height: 200 },
  row2: { flexDirection: 'row', gap: GAP },
  half: { width: TILE, height: TILE },
  row3: { flexDirection: 'row', gap: GAP },
  tallLeft: { width: TILE, height: TILE * 2 + GAP },
  colRight: { gap: GAP },
  small: { width: TILE, height: TILE },
  grid4: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, width: ALBUM_W },
  quarter: { width: TILE, height: TILE },
  tileImage: { width: '100%', height: '100%' },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: { color: '#fff', fontSize: 22, fontWeight: '700' },
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
  time: { fontSize: 11 },
});
