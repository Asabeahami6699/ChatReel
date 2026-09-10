import React, { useMemo, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChatSettings } from '../context/ChatSettingsContext';
import { openFileUrl, splitTextWithLinks } from '../screens/Chat/chatMessageUtils';
import { getMediaUri, type ChatMessage } from '../screens/Chat/chatRoomTypes';
import { showAppToast } from '../lib/appToast';
import type { ChatMediaItem } from './ChatMediaViewer';

export type SharedMediaTab = 'media' | 'links' | 'docs';

type LinkItem = {
  key: string;
  url: string;
  messageId: string;
  senderName?: string;
  createdAt: string;
  preview: string;
};

type DocItem = {
  key: string;
  messageId: string;
  name: string;
  uri: string;
  senderName?: string;
  createdAt: string;
  mime?: string;
};

type Props = {
  visible: boolean;
  messages: ChatMessage[];
  chatName?: string;
  initialTab?: SharedMediaTab;
  onClose: () => void;
  onOpenMedia: (messageId: string) => void;
  onJumpToMessage?: (messageId: string) => void;
};

const TABS: { id: SharedMediaTab; label: string }[] = [
  { id: 'media', label: 'Media' },
  { id: 'links', label: 'Links' },
  { id: 'docs', label: 'Docs' },
];

const COLS = 3;
const GAP = 2;
const TILE = Math.floor((Dimensions.get('window').width - GAP * (COLS - 1)) / COLS);

function formatWhen(iso: string) {
  return new Date(iso).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function hostOf(url: string) {
  try {
    const normalized = url.startsWith('http') ? url : `https://${url}`;
    return new URL(normalized).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** WhatsApp-style Media / Links / Docs browser with a shared tab strip header. */
export function ChatSharedMediaSheet({
  visible,
  messages,
  chatName,
  initialTab = 'media',
  onClose,
  onOpenMedia,
  onJumpToMessage,
}: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useChatSettings();
  const [tab, setTab] = useState<SharedMediaTab>(initialTab);

  React.useEffect(() => {
    if (visible) setTab(initialTab);
  }, [visible, initialTab]);

  const mediaItems = useMemo((): ChatMediaItem[] => {
    return messages
      .filter((m) => m.message_type === 'image' || m.message_type === 'video')
      .map((m) => ({
        id: m.id,
        type: m.message_type as 'image' | 'video',
        uri: getMediaUri(m),
        senderName: m.profiles?.display_name,
        createdAt: m.created_at,
      }))
      .filter((item) => Boolean(item.uri))
      .reverse();
  }, [messages]);

  const linkItems = useMemo((): LinkItem[] => {
    const out: LinkItem[] = [];
    for (const m of messages) {
      const text = m.decrypted || m.content || '';
      if (!text || m.message_type === 'image' || m.message_type === 'video') continue;
      const segments = splitTextWithLinks(text);
      for (const seg of segments) {
        if (seg.type !== 'link') continue;
        out.push({
          key: `${m.id}:${seg.value}`,
          url: seg.value,
          messageId: m.id,
          senderName: m.profiles?.display_name,
          createdAt: m.created_at,
          preview: text.trim().slice(0, 120),
        });
      }
    }
    return out.reverse();
  }, [messages]);

  const docItems = useMemo((): DocItem[] => {
    return messages
      .filter((m) => m.message_type === 'file')
      .map((m) => ({
        key: m.id,
        messageId: m.id,
        name: m.file_name || 'Document',
        uri: getMediaUri(m) || m.file_url || '',
        senderName: m.profiles?.display_name,
        createdAt: m.created_at,
        mime: m.file_type,
      }))
      .filter((d) => Boolean(d.uri))
      .reverse();
  }, [messages]);

  const openLink = async (url: string) => {
    try {
      await openFileUrl(url);
    } catch {
      try {
        const normalized = url.startsWith('http') ? url : `https://${url}`;
        await Linking.openURL(normalized);
      } catch {
        showAppToast('Could not open link', { isError: true });
      }
    }
  };

  const openDoc = async (uri: string) => {
    try {
      await openFileUrl(uri);
    } catch {
      showAppToast('Could not open document', { isError: true });
    }
  };

  const emptyLabel =
    tab === 'media'
      ? 'No photos or videos yet'
      : tab === 'links'
        ? 'No links shared yet'
        : 'No documents yet';

  const count =
    tab === 'media' ? mediaItems.length : tab === 'links' ? linkItems.length : docItems.length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss" />
        <View
          style={[
            styles.root,
            {
              backgroundColor: theme.listBg,
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
            },
          ]}
        >
        <View style={[styles.topBar, { backgroundColor: theme.headerBg }]}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={theme.headerText} />
          </TouchableOpacity>
          <View style={styles.topTitleWrap}>
            <Text style={[styles.topTitle, { color: theme.headerText }]} numberOfLines={1}>
              {chatName || 'Shared'}
            </Text>
            <Text style={[styles.topSub, { color: theme.headerStatus }]}>
              {count} {tab === 'media' ? 'items' : tab}
            </Text>
          </View>
          <View style={styles.iconBtn} />
        </View>

        {/* Stripe tab header — same strip for Media / Links / Docs */}
        <View
          style={[
            styles.stripe,
            {
              backgroundColor: theme.headerBg,
              borderBottomColor: theme.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
            },
          ]}
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                style={styles.stripeTab}
                onPress={() => setTab(t.id)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.stripeLabel,
                    {
                      color: active
                        ? theme.headerText
                        : theme.isDark
                          ? 'rgba(255,255,255,0.55)'
                          : 'rgba(255,255,255,0.7)',
                      fontWeight: active ? '800' : '600',
                    },
                  ]}
                >
                  {t.label}
                </Text>
                <View
                  style={[
                    styles.stripeUnderline,
                    {
                      backgroundColor: active ? theme.headerText : 'transparent',
                    },
                  ]}
                />
              </TouchableOpacity>
            );
          })}
        </View>

        {tab === 'media' ? (
          mediaItems.length === 0 ? (
            <EmptyState label={emptyLabel} color={theme.listSecondaryText} />
          ) : (
            <FlatList
              data={mediaItems}
              keyExtractor={(item) => item.id}
              numColumns={COLS}
              contentContainerStyle={styles.grid}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={[
                    styles.tile,
                    {
                      marginRight: (index + 1) % COLS === 0 ? 0 : GAP,
                      marginBottom: GAP,
                    },
                  ]}
                  activeOpacity={0.85}
                  onPress={() => onOpenMedia(item.id)}
                >
                  <Image source={{ uri: item.uri }} style={styles.tileImage} />
                  {item.type === 'video' ? (
                    <View style={styles.videoBadge}>
                      <Ionicons name="play" size={14} color="#fff" />
                    </View>
                  ) : null}
                </TouchableOpacity>
              )}
            />
          )
        ) : null}

        {tab === 'links' ? (
          linkItems.length === 0 ? (
            <EmptyState label={emptyLabel} color={theme.listSecondaryText} />
          ) : (
            <ScrollView contentContainerStyle={styles.listPad}>
              {linkItems.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[
                    styles.row,
                    {
                      backgroundColor: theme.listCardBg,
                      borderColor: theme.listBorder,
                    },
                  ]}
                  onPress={() => void openLink(item.url)}
                  onLongPress={() => onJumpToMessage?.(item.messageId)}
                >
                  <View style={[styles.rowIcon, { backgroundColor: theme.primary + '22' }]}>
                    <Ionicons name="link-outline" size={20} color={theme.primary} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, { color: theme.link }]} numberOfLines={1}>
                      {hostOf(item.url)}
                    </Text>
                    <Text style={[styles.rowSub, { color: theme.listSecondaryText }]} numberOfLines={2}>
                      {item.preview}
                    </Text>
                    <Text style={[styles.rowMeta, { color: theme.listSecondaryText }]}>
                      {[item.senderName, formatWhen(item.createdAt)].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Ionicons name="open-outline" size={18} color={theme.listSecondaryText} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )
        ) : null}

        {tab === 'docs' ? (
          docItems.length === 0 ? (
            <EmptyState label={emptyLabel} color={theme.listSecondaryText} />
          ) : (
            <ScrollView contentContainerStyle={styles.listPad}>
              {docItems.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[
                    styles.row,
                    {
                      backgroundColor: theme.listCardBg,
                      borderColor: theme.listBorder,
                    },
                  ]}
                  onPress={() => void openDoc(item.uri)}
                  onLongPress={() => onJumpToMessage?.(item.messageId)}
                >
                  <View style={[styles.rowIcon, { backgroundColor: '#f59e0b22' }]}>
                    <Ionicons name="document-text-outline" size={20} color="#f59e0b" />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, { color: theme.listPrimaryText }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.rowMeta, { color: theme.listSecondaryText }]}>
                      {[item.mime || 'Document', item.senderName, formatWhen(item.createdAt)]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Ionicons name="download-outline" size={18} color={theme.listSecondaryText} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )
        ) : null}
      </View>
      </View>
    </Modal>
  );
}

function EmptyState({ label, color }: { label: string; color: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name="folder-open-outline" size={42} color={color} />
      <Text style={[styles.emptyText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  root: {
    maxHeight: '94%',
    minHeight: '75%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
    paddingTop: 6,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  topTitleWrap: { flex: 1, alignItems: 'center' },
  topTitle: { fontSize: 17, fontWeight: '700' },
  topSub: { fontSize: 12, marginTop: 1 },
  stripe: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stripeTab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 12,
  },
  stripeLabel: {
    fontSize: 14,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  stripeUnderline: {
    height: 3,
    alignSelf: 'stretch',
    marginHorizontal: 18,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  grid: { paddingTop: GAP },
  tile: {
    width: TILE,
    height: TILE,
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  tileImage: { width: '100%', height: '100%' },
  videoBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listPad: { padding: 12, gap: 10, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSub: { fontSize: 13, marginTop: 2, lineHeight: 17 },
  rowMeta: { fontSize: 11, marginTop: 4 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
  },
  emptyText: { fontSize: 15, fontWeight: '600' },
});
