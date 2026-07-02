// src/screens/Chat/ChatRoomScreen.tsx
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { IconButton } from 'react-native-paper';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../lib/api';
import { uploadFromUri } from '../../lib/uploads';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialIcons, Feather } from '@expo/vector-icons';
import ChatMenuDropdown, { MenuItem } from '../../components/ChatMenuDropdown';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ChatInput from './ChatInput';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { messageStorage } from '../../utils/messageStorage';
import * as FileSystem from 'expo-file-system/legacy';
import {
  configurePlaybackAudio,
  createPlaybackPlayer,
  ensureMicPermission,
  releasePlayer,
  type AudioPlayer,
} from '../../lib/appAudio';
import AttachmentPreview from '../../components/AttachmentPreview';
import { ChatMediaViewer, type ChatMediaItem } from '../../components/ChatMediaViewer';
import { chatTheme } from './chatTheme';
import { buildChatRows, type ChatRow } from './chatListModel';
import { ChatMessageRow } from './ChatMessageRow';
import { ChatMediaAlbum } from './ChatMediaAlbum';
import { navigateToReelPreview } from '../../navigation/navigateToChat';
import { ensureSupabaseSession } from '../../lib/ensureSupabaseSession';
import { useChatTyping } from '../../hooks/useChatTyping';
import { usePartnerPresence } from '../../hooks/usePartnerPresence';
import { setStringAsync } from '../../lib/clipboard';
import { ChatSearchOverlay } from './ChatSearchOverlay';
import { MessageActionSheet, type MessageAction } from './MessageActionSheet';
import { ReplyPreviewBar } from './ReplyPreviewBar';
import { MomentChatPreview } from './MomentChatPreview';
import { isWithinMinutes, WALLPAPER_OPTIONS, buildForwardPayload, isValidUuid } from './chatMessageUtils';
import { ForwardToChatPicker, type ForwardTarget } from './ForwardToChatPicker';
import { ReadReceiptSheet } from './ReadReceiptSheet';
import {
  type ChatMessage as Message,
  type AttachmentFile,
  type ChatRouteParams as RouteParams,
  generateTempId,
  isLocalFile,
  getMediaUri,
  getAudioPlaybackUri,
  deduplicateMessages,
  messageBelongsToChat as rowBelongsToChat,
  buildChatSendPayload,
  sanitizeChatMessages,
  isOutgoingChatMessage,
  isIncomingChatMessage,
  matchesOptimisticTemp,
  normalizeRealtimeMessage,
  filterMessagesByClearedAt,
  visibilityToExpiry,
  isMessageExpired,
} from './chatRoomTypes';
import { useChatRoomScroll } from './useChatRoomScroll';
import { useChatRoomRealtime } from './useChatRoomRealtime';
import { useRealtimeTopic } from '../../hooks/useRealtimeTopic';

export default function ChatRoomScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const params = route.params as RouteParams & { groupId?: string };
  const chatId = params.chatId ?? params.groupId ?? '';
  const chatType = params.chatType ?? (params.groupId ? 'group' : 'individual');
  const chatName = params.chatName ?? 'Chat';
  const avatarUrl = params.avatarUrl;
  const hasNetwork = useNetworkStatus();
  const isOnline = hasNetwork;

  const insets = useSafeAreaInsets();

  // Header (70) + status bar height — keeps the FlatList aligned when keyboard slides in.
  const keyboardVerticalOffset =
    Platform.OS === 'ios' ? 70 + insets.top : 0;

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isPlayingAudio, setIsPlayingAudio] = useState<string | null>(null);
  const [sound, setSound] = useState<AudioPlayer | null>(null);
  const [composerDraft, setComposerDraft] = useState('');
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [hasAudioPermission, setHasAudioPermission] = useState<boolean>(false);
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentFile[]>([]);
  const [showAttachmentPreview, setShowAttachmentPreview] = useState(false);
  const [mediaViewer, setMediaViewer] = useState<{ visible: boolean; index: number }>({
    visible: false,
    index: 0,
  });
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchHitId, setSearchHitId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const [momentPreviewId, setMomentPreviewId] = useState<string | null>(null);
  const [wallpaper, setWallpaper] = useState<string | null>(null);
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const [clearedAt, setClearedAt] = useState<string | null>(null);
  const [settingsReady, setSettingsReady] = useState(false);
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);
  const [pinnedBanner, setPinnedBanner] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [readReceiptMessageId, setReadReceiptMessageId] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<
    Array<{ display_name: string; user_id?: string }>
  >([]);
  const unreadCapturedRef = useRef(false);

  const { statusText: partnerStatus } = usePartnerPresence(
    chatType === 'individual' ? chatId : undefined,
    chatType === 'individual'
  );
  const { typingLabel } = useChatTyping({
    chatId,
    chatType,
    userId: user?.id,
    displayName: user?.email?.split('@')[0],
    draft: composerDraft,
  });

  const replyLookup = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  const filterByClearedAt = useCallback(
    (list: Message[]) => filterMessagesByClearedAt(list, clearedAt),
    [clearedAt]
  );

  // Re-evaluate disappearing messages on a timer so they vanish on schedule.
  const [expiryTick, setExpiryTick] = useState(0);
  useEffect(() => {
    if (!messages.some((m) => m.expires_at)) return;
    const id = setInterval(() => setExpiryTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, [messages]);

  const visibleMessages = useMemo(() => {
    const now = Date.now();
    return filterByClearedAt(messages).filter((m) => !isMessageExpired(m, now));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, filterByClearedAt, expiryTick]);
  const listTailId = visibleMessages[visibleMessages.length - 1]?.id ?? '';

  const chatBgColor =
    WALLPAPER_OPTIONS.find((w) => w.id === wallpaper)?.color ?? chatTheme.chatBg;

  const pendingRetryRef = useRef<boolean>(false);
  const syncInProgressRef = useRef<boolean>(false);
  const pullLatestAtRef = useRef(0);
  const messagesCountRef = useRef(0);
  const lastMessageAtRef = useRef<string | null>(null);
  const pullLatestMessagesRef = useRef<() => Promise<void>>(async () => undefined);
  const loadMoreMessagesRef = useRef<() => void>(() => undefined);

  messagesCountRef.current = messages.length;
  lastMessageAtRef.current = messages[messages.length - 1]?.created_at ?? null;

  const chatRows = useMemo(
    () =>
      buildChatRows(visibleMessages, {
        isGroup: chatType === 'group',
        myUserId: user?.id ?? '',
        firstUnreadId,
      }),
    [visibleMessages, chatType, user?.id, firstUnreadId]
  );

  const {
    flatListRef,
    showScrollDown,
    isKeyboardVisible,
    shouldStickToBottomRef: shouldScrollToBottomRef,
    scrollToBottom,
    scrollToBottomAndStick,
    stickBeforeSend,
    handleScroll,
    onContentSizeChange,
    onListLayout,
    resetForChat,
    beginLoadMore,
    endLoadMore,
    loadingMoreRef,
  } = useChatRoomScroll({
    messageCount: chatRows.length,
    hasMore,
    loadingMore,
    initialLoadComplete,
    onLoadMore: () => loadMoreMessagesRef.current(),
  });

  const persistMessages = useCallback(
    (updater: (prev: Message[]) => Message[]) => {
      setMessages((prev) => {
        const next = deduplicateMessages(updater(prev));
        void messageStorage.saveMessages(chatId, next);
        return next;
      });
    },
    [chatId]
  );

  const loadChatSettings = useCallback(async () => {
    if (!chatId) {
      setSettingsReady(true);
      return;
    }
    try {
      const { preferences } = await api.chatSettings.get(chatType, chatId);
      setWallpaper((preferences.wallpaper as string) ?? null);
      setClearedAt((preferences.cleared_at as string) ?? null);
      setStarredIds((preferences.starred_message_ids as string[]) ?? []);
    } catch {
      // Preferences are optional until migration is applied.
    }
    if (chatType === 'group') {
      try {
        const { pinned } = await api.chatSettings.pinned(chatId);
        const first = pinned?.[0] as { messages?: Message } | undefined;
        if (first?.messages) setPinnedBanner(first.messages);
      } catch {
        setPinnedBanner(null);
      }
    }
    setSettingsReady(true);
  }, [chatId, chatType]);

  useEffect(() => {
    setSettingsReady(false);
    unreadCapturedRef.current = false;
    setFirstUnreadId(null);
    setReplyTo(null);
    setEditingMessage(null);
    void loadChatSettings();
    if (chatType === 'group' && chatId) {
      void api.groups
        .members(chatId)
        .then(async ({ members }) => {
          const ids = (members as Array<{ user_id?: string }>)
            .map((m) => m.user_id)
            .filter(Boolean) as string[];
          if (!ids.length) {
            setGroupMembers([]);
            return;
          }
          const { profiles } = await api.profiles.batch(ids);
          setGroupMembers(
            profiles.map((p) => ({
              display_name: (p.display_name as string) || (p.email as string) || 'Member',
              user_id: p.user_id as string,
            }))
          );
        })
        .catch(() => setGroupMembers([]));
    } else {
      setGroupMembers([]);
    }
  }, [chatId, chatType, loadChatSettings]);

  useEffect(() => {
    if (!user?.id || unreadCapturedRef.current || !initialLoadComplete) return;
    const first = messages.find((m) => m.sender_id !== user.id && !m.is_read);
    if (first) {
      setFirstUnreadId(first.id);
      unreadCapturedRef.current = true;
    }
  }, [messages, user?.id, initialLoadComplete]);

  const scrollToMessage = useCallback(
    (messageId: string) => {
      const idx = chatRows.findIndex((r) => r.kind === 'message' && r.message.id === messageId);
      if (idx >= 0) {
        flatListRef.current?.scrollToIndex?.({ index: idx, animated: true });
        setSearchHitId(messageId);
        setTimeout(() => setSearchHitId(null), 2500);
      }
    },
    [chatRows, flatListRef]
  );

  const handleMessageAction = useCallback(
    async (action: MessageAction, emoji?: string) => {
      const msg = actionMessage;
      if (!msg) return;

      if (action === 'reply') {
        setReplyTo(msg);
        return;
      }
      if (action === 'copy') {
        const text =
          msg.message_type === 'text' ? msg.content : msg.file_name || msg.content || '';
        await setStringAsync(text);
        return;
      }
      if (action === 'edit') {
        setEditingMessage(msg);
        setComposerDraft(msg.content);
        return;
      }
      if (action === 'react' && emoji && !msg.id.startsWith('temp-')) {
        try {
          await api.messages.react(msg.id, emoji);
          setMessages((prev) => {
            const next = prev.map((m) => {
              if (m.id !== msg.id) return m;
              const reactions = [...(m.reactions ?? [])];
              const idx = reactions.findIndex(
                (r) => r.emoji === emoji && r.user_id === user?.id
              );
              if (idx >= 0) reactions.splice(idx, 1);
              else if (user?.id) reactions.push({ emoji, user_id: user.id });
              return { ...m, reactions };
            });
            void messageStorage.saveMessages(chatId, next);
            return next;
          });
        } catch {
          Alert.alert('Error', 'Could not add reaction');
        }
        return;
      }
      if (action === 'star') {
        const next = starredIds.includes(msg.id)
          ? starredIds.filter((id) => id !== msg.id)
          : [...starredIds, msg.id];
        setStarredIds(next);
        try {
          await api.chatSettings.update(chatType, chatId, { starred_message_ids: next });
        } catch {
          Alert.alert('Error', 'Could not update starred messages');
        }
        return;
      }
      if (action === 'pin' && chatType === 'group' && !msg.id.startsWith('temp-')) {
        try {
          await api.chatSettings.pin(chatId, msg.id);
          setPinnedBanner(msg);
          Alert.alert('Pinned', 'Message pinned for the group');
        } catch {
          Alert.alert('Error', 'Could not pin message');
        }
        return;
      }
      if (action === 'forward') {
        setForwardMessage(msg);
        return;
      }
      if (action === 'delete_me' && !msg.id.startsWith('temp-')) {
        try {
          await api.messages.delete(msg.id, false);
          persistMessages((prev) => prev.filter((m) => m.id !== msg.id));
        } catch {
          Alert.alert('Error', 'Could not delete message');
        }
        return;
      }
      if (action === 'delete_all' && !msg.id.startsWith('temp-')) {
        try {
          await api.messages.delete(msg.id, true);
          persistMessages((prev) =>
            prev.map((m) =>
              m.id === msg.id
                ? { ...m, content: 'This message was deleted', message_type: 'text' as const }
                : m
            )
          );
        } catch {
          Alert.alert('Error', 'Could not delete for everyone');
        }
      }
    },
    [
      actionMessage,
      starredIds,
      chatType,
      chatId,
      user?.id,
      persistMessages,
    ]
  );

  const handleForwardTo = useCallback(
    async (target: ForwardTarget) => {
      const msg = forwardMessage;
      if (!msg || msg.id.startsWith('temp-')) {
        Alert.alert('Forward', 'Wait until the message is sent before forwarding.');
        return;
      }

      try {
        const payload = {
          ...buildForwardPayload(msg),
          ...(target.chatType === 'individual'
            ? { receiver_id: target.chatId }
            : { group_id: target.chatId }),
        };
        await api.messages.send(payload);
        Alert.alert('Forwarded', `Message sent to ${target.chatName}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Could not forward message';
        Alert.alert('Forward failed', message);
      } finally {
        setForwardMessage(null);
      }
    },
    [forwardMessage]
  );

  /* ------------------------------------------------------------------ */
  /*  AUDIO PERMISSION & SETUP                                          */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    const setupAudioPermissions = async () => {
      try {
        if (Platform.OS === 'web') {
          setHasAudioPermission(true);
          return;
        }

        const granted = await ensureMicPermission();
        
        if (granted) {
          setHasAudioPermission(true);
          await configurePlaybackAudio();
        } else {
          console.log('Audio permission not granted');
          setHasAudioPermission(false);
        }
      } catch (error) {
        console.error('Failed to setup audio permissions:', error);
        setHasAudioPermission(false);
      }
    };

    setupAudioPermissions();
  }, []);

  /* ------------------------------------------------------------------ */
  /*  MESSAGE MANAGEMENT FUNCTIONS                                      */
  /* ------------------------------------------------------------------ */
  const messageBelongsToChat = useCallback(
    (msg: Message) => rowBelongsToChat(msg, chatId, chatType, user?.id),
    [chatId, chatType, user?.id]
  );

  const syncWithServer = async (localMessages: Message[], loadMore: boolean = false) => {
    if (!isOnline || syncInProgressRef.current || !user?.id) return;

    try {
      syncInProgressRef.current = true;
      if (loadMore) {
        beginLoadMore();
        setLoadingMore(true);
      } else {
        setSyncing(true);
      }

      const before =
        loadMore && localMessages.length > 0 ? localMessages[0].created_at : undefined;
      const { messages: rawMessages } = await api.messages.list(
        chatId,
        chatType === 'group',
        50,
        before,
        clearedAt ?? undefined
      );
      const messagesData = sanitizeChatMessages([...(rawMessages as Message[])]).filter((m) =>
        messageBelongsToChat(m)
      );

      if (messagesData && messagesData.length > 0) {
        const senderIds = [...new Set(messagesData.map((m) => m.sender_id))];

        let profilesData: Record<string, Message['profiles']> = {};
        if (senderIds.length > 0) {
          const { profiles } = await api.profiles.batch(senderIds);
          profilesData = profiles.reduce(
            (acc: Record<string, Message['profiles']>, p: any) => {
              if (p?.user_id) acc[p.user_id] = p;
              return acc;
            },
            {}
          );
        }

        const messagesWithProfiles: Message[] = messagesData.map((serverMsg) => {
          const localMatch = localMessages.find(localMsg => {
            if (localMsg.id === serverMsg.id) return true;
            if (
              localMsg.file_name === serverMsg.file_name &&
              localMsg.file_type === serverMsg.file_type &&
              localMsg.message_type === serverMsg.message_type &&
              Math.abs(new Date(localMsg.created_at).getTime() - new Date(serverMsg.created_at).getTime()) < 5000
            ) return true;
            return false;
          });

          return {
            ...serverMsg,
            profiles: profilesData[serverMsg.sender_id] || {
              display_name: serverMsg.sender_id === user.id ? 'You' : 'Unknown User',
              avatar_url: null,
              user_id: serverMsg.sender_id
            },
            _status: 'sent' as const,
            local_file_uri: localMatch?.local_file_uri || serverMsg.local_file_uri,
            file_url: serverMsg.file_url || localMatch?.file_url,
            local_audio_uri: localMatch?.local_audio_uri || serverMsg.local_audio_uri
          };
        });

        const serverMessages = messagesWithProfiles;

        let finalMessages: Message[];

        if (loadMore) {
          finalMessages = deduplicateMessages([
            ...serverMessages,
            ...sanitizeChatMessages(localMessages),
          ]);
        } else {
          const localPending = localMessages.filter(m =>
            m.id.startsWith('temp-') &&
            ['pending', 'failed', 'sending'].includes(m._status || '')
          );

          const serverIds = new Set(serverMessages.map(m => m.id));
          const uniquePending = localPending.filter(m => !serverIds.has(m.id));

          finalMessages = deduplicateMessages([...serverMessages, ...uniquePending]);
        }

        setMessages(finalMessages);
        setHasMore(messagesData.length === 50);

        await messageStorage.saveMessages(chatId, finalMessages);
      }
      else if (messagesData && messagesData.length === 0 && !loadMore) {
        const kept = deduplicateMessages(
          filterByClearedAt(sanitizeChatMessages(localMessages)).filter((m) =>
            messageBelongsToChat(m)
          )
        );
        if (kept.length > 0) {
          setMessages(kept);
          setHasMore(false);
          await messageStorage.saveMessages(chatId, kept);
        } else {
          await messageStorage.clearMessages(chatId);
          setMessages([]);
          setHasMore(false);
        }
      }
      else {
        setHasMore(false);
        if (!loadMore) {
          const deduped = deduplicateMessages(localMessages);
          setMessages(deduped);
        }
      }
    } catch (err: any) {
      console.error('Sync error:', err);
      if (!loadMore) {
        const deduped = deduplicateMessages(localMessages);
        if (deduped.length > 0) setMessages(deduped);
      }
    } finally {
      if (loadMore) {
        endLoadMore();
        setLoadingMore(false);
      } else {
        setLoading(false);
        setSyncing(false);
      }
      syncInProgressRef.current = false;
      if (!loadMore) setInitialLoadComplete(true);
    }
  };

  const fetchMessages = useCallback(async (loadMore: boolean = false) => {
    if (!user?.id || !chatId) {
      setLoading(false);
      setInitialLoadComplete(true);
      return;
    }

    if (loadMore) {
      setLoadingMore(true);
    } else if (!initialLoadComplete) {
      setLoading(true);
    }

    try {
      const localMessages = await messageStorage.getMessages(chatId);
      const dedupedLocalMessages = deduplicateMessages(
        filterByClearedAt(sanitizeChatMessages(localMessages))
      );
      
      if (!loadMore && dedupedLocalMessages.length > 0) {
        setMessages(dedupedLocalMessages);
        setLoading(false);
      }

      if (isOnline) {
        await syncWithServer(dedupedLocalMessages, loadMore);
      } else {
        if (!loadMore) {
          if (dedupedLocalMessages.length === 0) {
            setMessages([]);
          }
          setLoading(false);
          setInitialLoadComplete(true);
        }
        setLoadingMore(false);
      }
    } catch (error) {
      console.error('Fetch messages error:', error);
      if (!loadMore) {
        setLoading(false);
        setInitialLoadComplete(true);
      }
      setLoadingMore(false);
    }
  }, [user?.id, chatId, isOnline, initialLoadComplete, filterByClearedAt, clearedAt]);

  const markMessagesAsRead = useCallback(async () => {
    if (!user?.id || !isValidUuid(chatId)) return;

    try {
      if (chatType === 'individual') {
        await api.messages.markRead({ partner_user_id: chatId });
        setMessages((prev) =>
          prev.map((msg) =>
            msg.sender_id === chatId && msg.receiver_id === user.id
              ? { ...msg, is_read: true }
              : msg
          )
        );
      } else {
        await api.messages.markRead({ group_id: chatId });
        setMessages((prev) =>
          prev.map((msg) =>
            msg.sender_id !== user.id && msg.group_id === chatId
              ? { ...msg, is_read: true }
              : msg
          )
        );
      }
    } catch (error) {
      console.error('Mark as read error:', error);
    }
  }, [user?.id, chatId, chatType]);

  const markSingleMessageAsRead = useCallback(async (messageId: string) => {
    if (!user?.id || !isValidUuid(messageId)) return;

    setMessages((prev) =>
      prev.map((msg) => (msg.id === messageId ? { ...msg, is_read: true } : msg))
    );

    try {
      await api.messages.markRead({ message_id: messageId });
    } catch (error) {
      console.error('Mark single as read error:', error);
    }
  }, [user?.id]);

  const retryPendingMessages = useCallback(async () => {
    if (!isOnline || pendingRetryRef.current) return;

    try {
      pendingRetryRef.current = true;
      
      const pendingMessages = messages.filter(msg => 
        msg._status === 'pending' || msg._status === 'failed'
      );

      const batchSize = 3;
      for (let i = 0; i < pendingMessages.length; i += batchSize) {
        const batch = pendingMessages.slice(i, i + batchSize);
        await Promise.allSettled(
          batch.map(msg => sendMessageToServer(msg))
        );
        
        if (i + batchSize < pendingMessages.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } catch (error) {
      console.error('Retry pending messages error:', error);
    } finally {
      pendingRetryRef.current = false;
    }
  }, [messages, isOnline]);

  const sendMessageToServer = async (message: Message) => {
    try {
      const payload = buildChatSendPayload(chatType, chatId, {
        content: message.content,
        message_type: message.message_type || 'text',
        ...(message.reply_to_id ? { reply_to_id: message.reply_to_id } : {}),
      });

      if (message.message_type === 'audio') {
        payload.audio_url = message.audio_url;
        payload.audio_duration = message.audio_duration;
        payload.file_name = message.file_name;
        payload.file_type = message.file_type;
      }

      if (message.message_type === 'image' || message.message_type === 'file' || message.message_type === 'video') {
        const cleanFileUrl = message.file_url ? message.file_url.split('?')[0] : message.file_url;
        payload.file_url = cleanFileUrl;
        payload.file_name = message.file_name;
        payload.file_type = message.file_type;
        if (message.expires_at) payload.expires_at = message.expires_at;
        if (message.view_once) payload.view_once = true;
      }

      const { message: rawData } = await api.messages.send(payload);
      const data = rawData as unknown as Message;

      setMessages(prevMessages => {
        const updated: Message[] = prevMessages.map(msg =>
          msg.id === message.id
            ? ({
                ...data,
                profiles: message.profiles,
                _status: 'sent' as const,
                local_file_uri: msg.local_file_uri,
                ...(message.message_type === 'audio' && { local_audio_uri: message.local_audio_uri }),
              } as Message)
            : msg
        );
        const deduped = deduplicateMessages(updated);
        void messageStorage.saveMessages(chatId, deduped);
        return deduped;
      });

      shouldScrollToBottomRef.current = true;
      setTimeout(() => scrollToBottom(), 50);

      return true;
    } catch (error) {
      console.error('Send message to server error:', error);

      persistMessages((prev) =>
        prev.map((msg) =>
          msg.id === message.id ? { ...msg, _status: 'failed' as const } : msg
        )
      );

      return false;
    }
  };

  const retrySingleMessage = async (message: Message) => {
    if (!isOnline) {
      Alert.alert('Offline', 'Reconnect to retry sending.');
      return;
    }
    persistMessages((prev) =>
      prev.map((m) => (m.id === message.id ? { ...m, _status: 'sending' as const } : m))
    );
    await sendMessageToServer(message);
  };

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || !user?.id) return;

    if (editingMessage && !editingMessage.id.startsWith('temp-')) {
      try {
        const { message: updated } = await api.messages.edit(
          editingMessage.id,
          messageText.trim()
        );
        persistMessages((prev) =>
          prev.map((m) =>
            m.id === editingMessage.id
              ? { ...m, ...(updated as Message), _status: 'sent' as const }
              : m
          )
        );
        setEditingMessage(null);
        setComposerDraft('');
        void messageStorage.clearDraft(chatId);
        return;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Could not edit message';
        Alert.alert('Edit failed', msg);
        return;
      }
    }

    const messageContent = messageText.trim();
    const tempId = generateTempId();
    const replyId = replyTo?.id.startsWith('temp-') ? undefined : replyTo?.id;

    setComposerDraft('');
    setReplyTo(null);
    void messageStorage.clearDraft(chatId);

    const optimisticMessage: Message = {
      id: tempId,
      content: messageContent,
      created_at: new Date().toISOString(),
      sender_id: user.id,
      ...(chatType === 'individual'
        ? { receiver_id: chatId }
        : { group_id: chatId }),
      message_type: 'text',
      reply_to_id: replyId,
      delivered: false,
      is_read: false,
      profiles: {
        display_name: 'You',
        avatar_url: null,
        user_id: user.id
      },
      _status: 'sending' as const
    };

    persistMessages((prev) => [...prev, optimisticMessage]);

    stickBeforeSend();
    setTimeout(() => scrollToBottom(), 50);

    if (isOnline) {
      const success = await sendMessageToServer(optimisticMessage);
      if (!success) {
        Alert.alert('Error', 'Failed to send message');
      }
    } else {
      persistMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId ? { ...msg, _status: 'pending' as const } : msg
        )
      );
    }
  };

  const sendVoiceMessage = async (audioUri: string, duration: number) => {
    if (!user?.id) return;

    const tempId = generateTempId();
    const fileName = `voice_message_${Date.now()}.${Platform.OS === 'web' ? 'webm' : 'm4a'}`;
    const mimeType = Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a';

    const optimisticMessage: Message = {
      id: tempId,
      content: 'Voice message',
      created_at: new Date().toISOString(),
      sender_id: user.id,
      ...(chatType === 'individual'
        ? { receiver_id: chatId }
        : { group_id: chatId }),
      message_type: 'audio',
      audio_url: audioUri,
      audio_duration: Math.round(duration),
      file_name: fileName,
      file_type: mimeType,
      local_audio_uri: audioUri,
      delivered: false,
      is_read: false,
      profiles: {
        display_name: 'You',
        avatar_url: null,
        user_id: user.id
      },
      _status: 'sending' as const
    };

    persistMessages((prev) => [...prev, optimisticMessage]);

    stickBeforeSend();
    setTimeout(() => scrollToBottom(), 50);

    if (!isOnline) {
      persistMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId ? { ...msg, _status: 'pending' as const } : msg
        )
      );
      return;
    }

    await uploadAndSendVoiceMessage(optimisticMessage, audioUri, Math.round(duration));
  };

  const uploadAndSendVoiceMessage = async (message: Message, audioUri: string, duration: number) => {
    try {
      if (Platform.OS === 'web') {
        const response = await fetch(audioUri);
        if (!response.ok) {
          throw new Error('Audio file not found');
        }
      } else {
        const fileInfo = await FileSystem.getInfoAsync(audioUri);
        if (!fileInfo.exists) {
          throw new Error('Audio file not found');
        }
      }

      const fileName = `${user?.id}/audio/${Date.now()}_voice.${Platform.OS === 'web' ? 'webm' : 'm4a'}`;
      const mimeType = Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a';
      const publicUrl = await uploadFromUri('chat-files', fileName, audioUri, mimeType);

      const payload: Record<string, unknown> = {
        content: 'Voice message',
        message_type: 'audio',
        audio_url: publicUrl,
        audio_duration: duration,
        file_name: `voice_message_${Date.now()}.${Platform.OS === 'web' ? 'webm' : 'm4a'}`,
        file_type: mimeType,
      };

      if (chatType === 'individual') {
        payload.receiver_id = chatId;
      } else {
        payload.group_id = chatId;
      }

      const { message: rawInsertedData } = await api.messages.send(payload);
      const insertedData = rawInsertedData as unknown as Message;

      setMessages(prevMessages => {
        const updated: Message[] = prevMessages.map(msg =>
          msg.id === message.id
            ? ({
                ...insertedData,
                profiles: message.profiles,
                _status: 'sent' as const,
                local_audio_uri: message.local_audio_uri,
              } as Message)
            : msg
        );
        const deduped = deduplicateMessages(updated);
        void messageStorage.saveMessages(chatId, deduped);
        return deduped;
      });

      shouldScrollToBottomRef.current = true;
      setTimeout(() => scrollToBottom(), 50);

    } catch (error) {
      console.error('Failed to send voice message:', error);

      persistMessages((prev) =>
        prev.map((msg) =>
          msg.id === message.id ? { ...msg, _status: 'failed' as const } : msg
        )
      );

      Alert.alert('Error', 'Failed to send voice message');
    }
  };

  /* ------------------------------------------------------------------ */
  /*  FILE UPLOAD FUNCTIONS - FIXED                                     */
  /* ------------------------------------------------------------------ */
  const uploadFile = async (
    uri: string,
    name: string,
    type: string,
    messageType: 'image' | 'video' | 'file',
    options?: { localThumbUri?: string; expiresAt?: string | null; viewOnce?: boolean }
  ) => {
    if (!user?.id) return;

    const tempId = generateTempId();
    const cleanFileName = name.replace(/[^a-zA-Z0-9.-]/g, '_');

    const optimisticMessage: Message = {
      id: tempId,
      content: name,
      created_at: new Date().toISOString(),
      sender_id: user.id,
      ...(chatType === 'individual'
        ? { receiver_id: chatId }
        : { group_id: chatId }),
      message_type: messageType,
      file_url: uri,
      local_file_uri: uri,
      local_thumb_uri: options?.localThumbUri,
      file_name: cleanFileName,
      file_type: type,
      delivered: false,
      is_read: false,
      ...(options?.expiresAt ? { expires_at: options.expiresAt } : {}),
      ...(options?.viewOnce ? { view_once: true } : {}),
      profiles: {
        display_name: 'You',
        avatar_url: null,
        user_id: user.id
      },
      _status: 'sending' as const
    };

    persistMessages((prev) => [...prev, optimisticMessage]);

    stickBeforeSend();
    setTimeout(() => scrollToBottom(), 50);

    if (!isOnline) {
      persistMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, _status: 'pending' as const } : m
        )
      );
      return;
    }

    try {
      const storagePath = `${user.id}/files/${Date.now()}_${cleanFileName}`;
      const publicUrl = await uploadFromUri('chat-files', storagePath, uri, type);

      const payload: Record<string, unknown> = {
        content: cleanFileName,
        message_type: messageType,
        file_url: publicUrl,
        file_name: cleanFileName,
        file_type: type,
      };

      if (options?.expiresAt) payload.expires_at = options.expiresAt;
      if (options?.viewOnce) payload.view_once = true;

      if (chatType === 'individual') {
        payload.receiver_id = chatId;
      } else {
        payload.group_id = chatId;
      }

      const { message: rawInsertedData } = await api.messages.send(payload);
      const insertedData = rawInsertedData as unknown as Message;

      setMessages((prev) => {
        const updated = prev.map((msg) =>
          msg.id === tempId
            ? ({
                ...insertedData,
                profiles: optimisticMessage.profiles,
                _status: 'sent' as const,
                local_file_uri: optimisticMessage.local_file_uri,
                local_thumb_uri: optimisticMessage.local_thumb_uri,
                file_url: publicUrl,
              } as Message)
            : msg
        );
        const deduped = deduplicateMessages(updated);
        void messageStorage.saveMessages(chatId, deduped);
        return deduped;
      });

      shouldScrollToBottomRef.current = true;
      setTimeout(() => scrollToBottom(), 100);
    } catch (error: unknown) {
      console.error('File upload failed:', error);

      persistMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId ? { ...msg, _status: 'failed' as const } : msg
        )
      );

      const message =
        error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Upload Failed', `Could not send ${messageType}. ${message}`);
    }
  };

  /* ------------------------------------------------------------------ */
  /*  ATTACHMENT HANDLING FUNCTIONS                                     */
  /* ------------------------------------------------------------------ */
  const handleSendFiles = useCallback(async (files: AttachmentFile[]) => {
    if (!user?.id || files.length === 0) return;

    for (const file of files) {
      try {
        let messageType: 'image' | 'video' | 'file' = 'file';
        
        if (file.type === 'photo') {
          messageType = 'image';
        } else if (file.type === 'video') {
          messageType = 'video';
        } else if (file.type === 'audio') {
          // Handle audio files separately
          await sendVoiceMessage(file.uri, file.duration || 0);
          continue;
        }
        
        await uploadFile(
          file.uri,
          file.name || `file_${Date.now()}`,
          file.mimeType || 'application/octet-stream',
          messageType,
          {
            localThumbUri: file.thumbnail,
            expiresAt: visibilityToExpiry(file.expiresInSeconds),
            viewOnce: file.viewOnce,
          }
        );
      } catch (error) {
        console.error('Failed to send file:', error);
        Alert.alert('Error', `Failed to send ${file.type}`);
      }
    }

    // Clear attachments after sending
    setPendingAttachments([]);
    setShowAttachmentPreview(false);
  }, [user?.id, sendVoiceMessage]);

  // Add function to handle single file send
  const handleSendSingleFile = useCallback(async (file: AttachmentFile) => {
    if (!user?.id) return;

    try {
      let messageType: 'image' | 'video' | 'file' = 'file';
      
      if (file.type === 'photo') {
        messageType = 'image';
      } else if (file.type === 'video') {
        messageType = 'video';
      } else if (file.type === 'audio') {
        await sendVoiceMessage(file.uri, file.duration || 0);
        setShowAttachmentPreview(false);
        return;
      }
      
      await uploadFile(
        file.uri,
        file.name || `file_${Date.now()}`,
        file.mimeType || 'application/octet-stream',
        messageType,
        {
          localThumbUri: file.thumbnail,
          expiresAt: visibilityToExpiry(file.expiresInSeconds),
          viewOnce: file.viewOnce,
        }
      );
      setShowAttachmentPreview(false);
    } catch (error) {
      console.error('Failed to send single file:', error);
      Alert.alert('Error', `Failed to send ${file.type}`);
    }
  }, [user?.id, sendVoiceMessage]);

  // Add function to handle attachments from ChatInput
  const handleAttachmentsSelected = useCallback((attachments: AttachmentFile[]) => {
    setPendingAttachments((prev) => [...prev, ...attachments]);
    setShowAttachmentPreview(true);
  }, []);

  // Add function to remove attachment
  const handleRemoveAttachment = useCallback((id: string) => {
    setPendingAttachments(prev => {
      const updated = prev.filter(att => att.id !== id);
      if (updated.length === 0) {
        setShowAttachmentPreview(false);
      }
      return updated;
    });
  }, []);

  // Add function to clear all attachments
  const handleClearAllAttachments = useCallback(() => {
    setPendingAttachments([]);
    setShowAttachmentPreview(false);
  }, []);

  /* ------------------------------------------------------------------ */
  /*  AUDIO PLAYBACK FUNCTIONS                                          */
  /* ------------------------------------------------------------------ */
  const playAudio = async (url: string, id: string) => {
    try {
      if (!hasAudioPermission && Platform.OS !== 'web') {
        const granted = await ensureMicPermission();
        if (!granted) {
          Alert.alert('Permission Required', 'Please grant audio permission to play voice messages.');
          return;
        }
        setHasAudioPermission(true);
      }

      if (sound && isPlayingAudio === id) {
        await releasePlayer(sound);
        setIsPlayingAudio(null);
        setSound(null);
        return;
      }

      if (sound) {
        await releasePlayer(sound);
        setSound(null);
        setIsPlayingAudio(null);
      }

      const message = messages.find((msg) => msg.id === id);
      let audioUri = message ? getAudioPlaybackUri(message) : url;

      if (!audioUri) {
        throw new Error('Audio URI is null or undefined');
      }

      if (isLocalFile(audioUri) && !audioUri.startsWith('file://') && Platform.OS !== 'web') {
        audioUri = `file://${audioUri}`;
      }

      await configurePlaybackAudio();

      const newSound = createPlaybackPlayer(audioUri);
      newSound.play();

      setSound(newSound);
      setIsPlayingAudio(id);

      const sub = newSound.addListener('playbackStatusUpdate', (status) => {
        if (status.duration > 0 && status.currentTime >= status.duration - 0.05) {
          setIsPlayingAudio(null);
          setSound(null);
          void releasePlayer(newSound);
          sub.remove();
        }
      });

    } catch (error) {
      console.error('Failed to play audio:', error);
      Alert.alert('Error', 'Failed to play audio message');
      setIsPlayingAudio(null);
      setSound(null);
    }
  };

  /* ------------------------------------------------------------------ */
  /*  EFFECTS AND LIFECYCLE                                             */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (!settingsReady || !user?.id || !chatId) return;
    resetForChat();
    void fetchMessages();
  }, [user?.id, chatId, chatType, settingsReady]);

  useEffect(() => {
    if (isOnline && initialLoadComplete) {
      void retryPendingMessages();
    }
  }, [isOnline, initialLoadComplete]);

  useEffect(() => {
    return () => {
      if (sound) {
        void releasePlayer(sound);
      }
    };
  }, [sound]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        if (sound) {
          void releasePlayer(sound);
        }
      };
    }, [sound])
  );

  useEffect(() => {
    let alive = true;
    if (!chatId) return;
    void messageStorage.getDraft(chatId).then((saved) => {
      if (alive) setComposerDraft(saved);
    });
    return () => {
      alive = false;
    };
  }, [chatId]);

  const handleDraftChange = useCallback(
    (next: string) => {
      setComposerDraft(next);
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = setTimeout(() => {
        void messageStorage.saveDraft(chatId, next);
      }, 250);
    },
    [chatId]
  );

  const upsertRealtimeMessage = useCallback(
    (raw: Message, event: 'INSERT' | 'UPDATE') => {
      if (!user?.id) return;

      const normalized = normalizeRealtimeMessage(raw, chatId, chatType, user.id);
      if (!messageBelongsToChat(normalized)) return;

      // View-once was opened by the recipient: remove it for everyone (sender + recipient).
      if (normalized.view_once && normalized.viewed_at) {
        consumedViewOnceIdsRef.current.add(normalized.id);
        persistMessages((prev) => prev.filter((m) => m.id !== normalized.id));
        return;
      }

      // Don't resurrect a view-once message the recipient already opened.
      if (consumedViewOnceIdsRef.current.has(normalized.id)) return;
      if (isMessageExpired(normalized)) return;

      const isOutgoing = isOutgoingChatMessage(normalized, user.id);
      const isIncoming = isIncomingChatMessage(normalized, chatId, chatType, user.id);

      const fallbackProfile: Message['profiles'] = {
        display_name: isOutgoing ? 'You' : 'Unknown User',
        avatar_url: '',
        user_id: normalized.sender_id,
      };

      const incoming: Message = {
        ...normalized,
        profiles: normalized.profiles ?? fallbackProfile,
        _status: 'sent',
      };

      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === incoming.id);

        if (idx >= 0) {
          const next = [...prev];
          const existing = next[idx];
          next[idx] = {
            ...existing,
            ...incoming,
            local_file_uri: existing.local_file_uri ?? incoming.local_file_uri,
            local_audio_uri: existing.local_audio_uri ?? incoming.local_audio_uri,
            file_url: incoming.file_url || existing.file_url,
            audio_url: incoming.audio_url || existing.audio_url,
            profiles: incoming.profiles ?? existing.profiles,
          };
          void messageStorage.saveMessages(chatId, next);
          return next;
        }

        if (event === 'INSERT' && isOutgoing) {
          const tempIdx = prev.findIndex((m) =>
            matchesOptimisticTemp(m, incoming, user.id)
          );
          if (tempIdx >= 0) {
            const next = [...prev];
            const temp = prev[tempIdx];
            next[tempIdx] = {
              ...incoming,
              local_file_uri: temp.local_file_uri,
              local_audio_uri: temp.local_audio_uri,
              file_url: incoming.file_url || temp.file_url,
              audio_url: incoming.audio_url || temp.audio_url,
              profiles: temp.profiles ?? incoming.profiles,
              _status: 'sent',
            };
            const deduped = deduplicateMessages(next);
            void messageStorage.saveMessages(chatId, deduped);
            return deduped;
          }
        }

        if (event !== 'INSERT') return prev;

        if (isIncoming || isOutgoing) {
          const next = deduplicateMessages([...prev, incoming]);
          void messageStorage.saveMessages(chatId, next);
          return next;
        }

        return prev;
      });

      if (event === 'INSERT' && isIncoming) {
        // Only follow the new message if the user is already at the bottom.
        // If they scrolled up to read history, don't yank them down.
        if (shouldScrollToBottomRef.current) {
          requestAnimationFrame(() => scrollToBottom(false));
          setTimeout(() => scrollToBottom(false), 80);
        }

        if (chatType === 'individual' && incoming.receiver_id === user.id) {
          markSingleMessageAsRead(incoming.id);
        }
        if (chatType === 'group' && incoming.sender_id !== user.id) {
          markSingleMessageAsRead(incoming.id);
        }

        setTimeout(() => void pullLatestMessagesRef.current(), 400);
      }

      if (!normalized.profiles && normalized.sender_id && isIncoming) {
        void api.profiles.getByUserId(normalized.sender_id).then(({ profile: p }) => {
          if (!p) return;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === normalized.id ? { ...m, profiles: p as Message['profiles'] } : m
            )
          );
        }).catch(() => undefined);
      }
    },
    [
      messageBelongsToChat,
      user?.id,
      chatId,
      chatType,
      scrollToBottom,
      markSingleMessageAsRead,
    ]
  );

  useChatRoomRealtime({
    chatId,
    chatType,
    userId: user?.id,
    onMessage: upsertRealtimeMessage,
  });

  const pullLatestMessages = useCallback(async () => {
    if (!chatId || !user?.id || syncInProgressRef.current) return;

    const now = Date.now();
    if (now - pullLatestAtRef.current < 500) return;
    pullLatestAtRef.current = now;

    await ensureSupabaseSession();
    try {
      let since = clearedAt ?? undefined;
      const lastAt = lastMessageAtRef.current;
      if (lastAt) {
        const bufferedSince = new Date(new Date(lastAt).getTime() - 3000).toISOString();
        if (!since || new Date(bufferedSince) > new Date(since)) {
          since = bufferedSince;
        }
      }

      const { messages: raw } = await api.messages.list(
        chatId,
        chatType === 'group',
        50,
        undefined,
        since
      );
      const incoming = sanitizeChatMessages([...(raw as Message[])]).filter(
        messageBelongsToChat
      );
      if (incoming.length === 0) return;

      setMessages((prev) => {
        const prevIds = new Set(prev.map((m) => m.id));
        const hasNew = incoming.some((m) => !prevIds.has(m.id));
        if (!hasNew) return prev;

        const pending = prev.filter(
          (m) =>
            m.id.startsWith('temp-') ||
            m._status === 'sending' ||
            m._status === 'pending' ||
            m._status === 'failed'
        );
        const incomingIds = new Set(incoming.map((m) => m.id));
        const kept = prev.filter((m) => !incomingIds.has(m.id));
        const uniquePending = pending.filter((m) => !incomingIds.has(m.id));
        const merged = deduplicateMessages([...kept, ...incoming, ...uniquePending]);

        const readIds = new Set(prev.filter((m) => m.is_read).map((m) => m.id));
        const withReadState = merged.map((m) =>
          readIds.has(m.id) ? { ...m, is_read: true } : m
        );

        void messageStorage.saveMessages(chatId, withReadState);
        return withReadState;
      });

      const newFromPartner = incoming.some((m) => m.sender_id !== user.id);
      if (newFromPartner && shouldScrollToBottomRef.current) {
        requestAnimationFrame(() => scrollToBottom(false));
      }
    } catch (err) {
      console.warn('[ChatRoom] pullLatestMessages failed:', err);
    }
  }, [
    chatId,
    chatType,
    user?.id,
    messageBelongsToChat,
    scrollToBottom,
    clearedAt,
  ]);

  pullLatestMessagesRef.current = pullLatestMessages;

  // Fallback: when the global hub sees any message change, sync this chat (debounced in pullLatestMessages).
  useRealtimeTopic(
    'messages',
    () => {
      void pullLatestMessages();
    },
    Boolean(chatId && user?.id)
  );

  // Mark read + incremental sync while the chat is open (realtime backup).
  useFocusEffect(
    useCallback(() => {
      void ensureSupabaseSession().then(() => {
        void pullLatestMessages();
        markMessagesAsRead();
      });

      const poll = setInterval(() => {
        void pullLatestMessages();
      }, 2000);
      return () => clearInterval(poll);
    }, [markMessagesAsRead, pullLatestMessages])
  );

  // Keep the viewport pinned to the newest row when live messages arrive (web FlatList).
  useEffect(() => {
    if (!initialLoadComplete || !listTailId) return;
    if (!shouldScrollToBottomRef.current) return;
    const timer = setTimeout(() => scrollToBottom(false), 0);
    return () => clearTimeout(timer);
  }, [listTailId, chatRows.length, initialLoadComplete, scrollToBottom]);

  // While the chat is open, mark any unread incoming messages as read.
  useEffect(() => {
    if (!initialLoadComplete || !user?.id) return;
    const hasUnreadIncoming = messages.some(
      (m) =>
        m.sender_id !== user.id &&
        !m.is_read &&
        (chatType === 'group' ? m.group_id === chatId : m.receiver_id === user.id)
    );
    if (hasUnreadIncoming) {
      void markMessagesAsRead();
    }
  }, [messages, initialLoadComplete, user?.id, chatType, chatId, markMessagesAsRead]);

  /* ------------------------------------------------------------------ */
  /*  UI HANDLERS                                                       */
  /* ------------------------------------------------------------------ */
  const loadMoreMessages = useCallback(async () => {
    if (loadingMore || !hasMore || !initialLoadComplete) return;

    beginLoadMore();
    await fetchMessages(true);
  }, [loadingMore, hasMore, fetchMessages, initialLoadComplete, beginLoadMore]);

  useEffect(() => {
    loadMoreMessagesRef.current = () => {
      void loadMoreMessages();
    };
  }, [loadMoreMessages]);

  const handleInfoPress = useCallback(() => {
    if (chatType === 'individual') {
      navigation.navigate('Contact', {
        userId: chatId,
        chatName,
        avatarUrl,
      });
    } else {
      navigation.push('GroupInfo', {
        groupId: chatId,
        groupName: chatName,
        avatarUrl,
      });
    }
  }, [chatType, chatId, chatName, avatarUrl, navigation]);

  const handleMuteChat = useCallback(async () => {
    try {
      const { preferences } = await api.chatSettings.get(chatType, chatId);
      const muted = preferences.muted_until as string | null;
      const isMuted = muted && new Date(muted) > new Date();
      await api.chatSettings.update(chatType, chatId, {
        muted_until: isMuted ? null : new Date(Date.now() + 365 * 86400_000).toISOString(),
      });
      Alert.alert('Notifications', isMuted ? 'Chat unmuted' : 'Chat muted');
    } catch {
      Alert.alert('Error', 'Could not update mute setting');
    }
  }, [chatType, chatId]);

  const handleClearChat = useCallback(() => {
    Alert.alert('Clear chat', 'Hide all messages in this chat on this device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          const now = new Date().toISOString();
          setClearedAt(now);
          void api.chatSettings.update(chatType, chatId, { cleared_at: now }).catch(() => undefined);
          void messageStorage.clearMessages(chatId);
          setMessages([]);
        },
      },
    ]);
  }, [chatType, chatId]);

  const handleWallpaper = useCallback(() => {
    const buttons = WALLPAPER_OPTIONS.map((w) => ({
      text: w.label,
      onPress: () => {
        setWallpaper(w.id === 'default' ? null : w.id);
        void api.chatSettings
          .update(chatType, chatId, { wallpaper: w.id === 'default' ? null : w.id })
          .catch(() => undefined);
      },
    }));
    Alert.alert('Chat wallpaper', 'Choose a background', [...buttons, { text: 'Cancel', style: 'cancel' }]);
  }, [chatType, chatId]);

  const startChatCall = useCallback(
    async (type: 'voice' | 'video') => {
      if (!chatId) return;
      if (chatType === 'individual') {
        if (!user?.id) {
          Alert.alert('Call', 'You must be signed in to place a call.');
          return;
        }
        if (chatId === user.id) {
          Alert.alert('Call', 'Cannot call yourself.');
          return;
        }
      }
      try {
        // Individual chats use auth user id as chatId (see ChatListScreen).
        const body =
          chatType === 'group'
            ? { type, group_id: chatId }
            : { type, callee_id: chatId };
        const { call, live_kit } = await api.calls.start(body);
        const { navigateToOutgoingCall } = await import('../../navigation/rootNavigation');
        navigateToOutgoingCall({
          call,
          token: live_kit.token,
          url: live_kit.url,
        });
      } catch (err) {
        const message =
          err && typeof err === 'object' && 'message' in err
            ? (err as { message: string }).message
            : 'Could not start call';
        Alert.alert('Call', String(message));
      }
    },
    [chatId, chatType, navigation, user?.id]
  );

  const menuItems: MenuItem[] = useMemo(() => {
    const items = [
      {
        title: chatType === 'individual' ? 'View Contact' : 'Group Info',
        icon: chatType === 'individual' ? 'person-outline' : 'people-outline',
        onPress: handleInfoPress,
      },
      { title: 'Search', icon: 'search', onPress: () => setSearchVisible(true) },
      { title: 'Mute', icon: 'volume-mute', onPress: handleMuteChat },
      { title: 'Wallpaper', icon: 'color-palette-outline', onPress: handleWallpaper },
      { title: 'Clear Chat', icon: 'trash-outline', onPress: handleClearChat },
    ];

    return items;
  }, [handleInfoPress, handleMuteChat, handleClearChat, handleWallpaper, chatType]);

  /* ------------------------------------------------------------------ */
  /*  UTILITY FUNCTIONS                                                 */
  /* ------------------------------------------------------------------ */
  const getImageUri = getMediaUri;

  const chatMediaItems = useMemo((): ChatMediaItem[] => {
    return visibleMessages
      .filter((m) => m.message_type === 'image' || m.message_type === 'video')
      .map((m) => ({
        id: m.id,
        type: m.message_type as 'image' | 'video',
        uri: getImageUri(m),
        senderName: m.profiles?.display_name,
        createdAt: m.created_at,
      }))
      .filter((item) => Boolean(item.uri));
  }, [visibleMessages, getImageUri]);

  const viewOnceToConsumeRef = useRef<string | null>(null);
  const consumedViewOnceIdsRef = useRef<Set<string>>(new Set());

  const openMediaViewer = useCallback(
    (messageId: string) => {
      const idx = chatMediaItems.findIndex((item) => item.id === messageId);
      if (idx >= 0) {
        const msg = replyLookup.get(messageId);
        if (msg?.view_once && msg.sender_id !== user?.id && !msg.viewed_at) {
          viewOnceToConsumeRef.current = messageId;
          consumedViewOnceIdsRef.current.add(messageId);
          void api.messages.markViewed(messageId).catch(() => undefined);
        }
        setMediaViewer({ visible: true, index: idx });
      }
    },
    [chatMediaItems, replyLookup, user?.id]
  );

  const closeMediaViewer = useCallback(() => {
    setMediaViewer((prev) => ({ ...prev, visible: false }));
    const consumed = viewOnceToConsumeRef.current;
    if (consumed) {
      viewOnceToConsumeRef.current = null;
      // View-once: remove the media for the recipient once the viewer closes.
      persistMessages((prev) => prev.filter((m) => m.id !== consumed));
    }
  }, [persistMessages]);

  /* ------------------------------------------------------------------ */
  /*  RENDER FUNCTIONS                                                  */
  /* ------------------------------------------------------------------ */
  const renderChatRow = ({ item }: { item: ChatRow }) => {
    if (item.kind === 'date') {
      return (
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderContent}>
            <Text style={styles.sectionHeaderText}>{item.label}</Text>
          </View>
        </View>
      );
    }

    if (item.kind === 'unread') {
      return (
        <View style={styles.unreadDivider}>
          <Text style={styles.unreadDividerText}>
            {item.count} unread message{item.count === 1 ? '' : 's'}
          </Text>
        </View>
      );
    }

    if (item.kind === 'media_album') {
      const anchor = item.messages[0];
      const profile = anchor.profiles;
      const isOutgoing = anchor.sender_id === user?.id;

      return (
        <View
          style={[
            styles.albumRow,
            isOutgoing ? styles.albumRowOut : styles.albumRowIn,
          ]}
        >
          {!isOutgoing && chatType === 'group' && (
            <View style={styles.albumAvatarSlot}>
              {item.showAvatar ? (
                <Image
                  source={{ uri: profile?.avatar_url || 'https://via.placeholder.com/32' }}
                  style={styles.albumAvatar}
                />
              ) : (
                <View style={styles.albumAvatarSpacer} />
              )}
            </View>
          )}
          <View style={[styles.albumContent, isOutgoing ? styles.albumContentOut : styles.albumContentIn]}>
            {item.showName && (
              <Text style={styles.senderName}>{profile?.display_name || 'Unknown'}</Text>
            )}
            <ChatMediaAlbum
              messages={item.messages}
              isOutgoing={isOutgoing}
              clusterPosition={item.clusterPosition}
              getImageUri={getImageUri}
              onOpenMedia={openMediaViewer}
              onLongPress={(m) => setActionMessage(m)}
              formatTime={(iso) =>
                new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              }
            />
          </View>
        </View>
      );
    }

    const msg = item.message;
    const replyParent = msg.reply_to_id ? replyLookup.get(msg.reply_to_id) ?? null : null;

    return (
      <ChatMessageRow
        message={msg}
        isOutgoing={msg.sender_id === user?.id}
        isGroup={chatType === 'group'}
        clusterPosition={item.clusterPosition}
        showAvatar={item.showAvatar}
        showName={item.showName}
        isPlayingAudio={isPlayingAudio}
        hasAudioPermission={hasAudioPermission}
        onPlayAudio={playAudio}
        getImageUri={getImageUri}
        onOpenMedia={openMediaViewer}
        onOpenReel={navigateToReelPreview}
        onOpenMoment={(id) => setMomentPreviewId(id)}
        onLongPress={(m) => setActionMessage(m)}
        onRetry={retrySingleMessage}
        replyTo={replyParent}
        isSearchHit={searchHitId === msg.id}
        onReadReceiptPress={(m) => setReadReceiptMessageId(m.id)}
        onReply={(m) => setReplyTo(m as Message)}
      />
    );
  };


  /* ------------------------------------------------------------------ */
  /*  MAIN RENDER                                                       */
  /* ------------------------------------------------------------------ */
  return (
    <SafeAreaView
      style={styles.container}
      edges={['left', 'right']}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <IconButton 
            icon="arrow-left" 
            size={24} 
            iconColor="#fff" 
            onPress={() => navigation.goBack()} 
          />
          <TouchableOpacity style={styles.headerInfo} onPress={handleInfoPress}>
            <Image 
              source={{ uri: avatarUrl || 'https://via.placeholder.com/40' }} 
              style={styles.headerAvatar} 
            />
            <View style={styles.headerText}>
              <Text style={styles.headerName} numberOfLines={1}>
                {chatName}
              </Text>
              <Text style={styles.headerStatus} numberOfLines={1}>
                {!hasNetwork
                  ? 'Waiting for network'
                  : typingLabel
                    ? typingLabel
                    : chatType === 'individual'
                      ? partnerStatus
                      : `${messages.length ? 'Group chat' : 'New group'}`}
                {syncing && ' · Syncing...'}
                {__DEV__ && ` · ${visibleMessages.length}/${messages.length}`}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
        <View style={styles.headerActions}>
          <IconButton
            icon="video"
            size={24}
            iconColor="#fff"
            onPress={() => startChatCall('video')}
          />
          <IconButton
            icon="phone"
            size={24}
            iconColor="#fff"
            onPress={() => startChatCall('voice')}
          />
          <ChatMenuDropdown items={menuItems} />
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        <View style={[styles.chatBody, { backgroundColor: chatBgColor }]}>
          {pinnedBanner && chatType === 'group' && (
            <TouchableOpacity
              style={styles.pinnedBar}
              onPress={() => scrollToMessage(pinnedBanner.id)}
            >
              <Ionicons name="pin" size={16} color={chatTheme.primary} />
              <Text style={styles.pinnedText} numberOfLines={1}>
                {pinnedBanner.content || pinnedBanner.file_name || 'Pinned message'}
              </Text>
            </TouchableOpacity>
          )}
          <FlatList
            ref={flatListRef}
            data={chatRows}
            extraData={`${visibleMessages.length}:${listTailId}:${chatRows.length}:${isPlayingAudio ?? ''}`}
            renderItem={renderChatRow}
            keyExtractor={(item) => item.key}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              !initialLoadComplete ? (
                <ActivityIndicator style={styles.loadingIndicator} size="large" color={chatTheme.primary} />
              ) : (
                <View style={styles.empty}>
                  <Ionicons name="chatbubble-ellipses-outline" size={80} color="#c5c5c5" />
                  <Text style={styles.emptyTitle}>No messages yet</Text>
                  <Text style={styles.emptySubtitle}>
                    {isOnline
                      ? 'Send a message to start the conversation.'
                      : 'You are offline. Messages will send when you reconnect.'}
                  </Text>
                </View>
              )
            }
            ListHeaderComponent={
              loadingMore ? (
                <View style={styles.loadingMoreContainer}>
                  <ActivityIndicator size="small" color={chatTheme.primary} />
                  <Text style={styles.loadingMoreText}>Loading older messages…</Text>
                </View>
              ) : null
            }
            initialNumToRender={24}
            maxToRenderPerBatch={16}
            windowSize={15}
            removeClippedSubviews={false}
            maintainVisibleContentPosition={
              Platform.OS === 'web'
                ? undefined
                : { minIndexForVisible: 0, autoscrollToTopThreshold: 10 }
            }
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onContentSizeChange={onContentSizeChange}
            onLayout={onListLayout}
          />

          {showScrollDown && (
            <TouchableOpacity
              style={[styles.scrollFab, { bottom: 76 + insets.bottom }]}
              onPress={scrollToBottomAndStick}
              activeOpacity={0.85}
            >
              <Ionicons name="chevron-down" size={22} color={chatTheme.primary} />
            </TouchableOpacity>
          )}
        </View>

        {replyTo && (
          <ReplyPreviewBar
            message={replyTo}
            senderName={replyTo.profiles?.display_name}
            onCancel={() => setReplyTo(null)}
          />
        )}

        <ChatInput
          placeholder={editingMessage ? 'Edit message' : 'Message'}
          draft={composerDraft}
          onDraftChange={handleDraftChange}
          onSend={sendMessage}
          onSendVoice={sendVoiceMessage}
          onAttachmentsSelected={handleAttachmentsSelected}
          pendingAttachmentCount={pendingAttachments.length}
          onPendingAttachmentsPress={() => setShowAttachmentPreview(true)}
          mentionMembers={chatType === 'group' ? groupMembers : undefined}
          style={{ paddingBottom: isKeyboardVisible ? 0 : insets.bottom }}
          disabled={!user?.id}
        />
      </KeyboardAvoidingView>

      <AttachmentPreview
        attachments={pendingAttachments}
        visible={showAttachmentPreview}
        onClose={() => {
          if (pendingAttachments.length === 0) {
            setShowAttachmentPreview(false);
            return;
          }
          Alert.alert(
            'Discard attachments?',
            'Your selected files will be removed.',
            [
              { text: 'Keep editing', style: 'cancel' },
              {
                text: 'Discard',
                style: 'destructive',
                onPress: () => {
                  setPendingAttachments([]);
                  setShowAttachmentPreview(false);
                },
              },
            ]
          );
        }}
        onRemove={handleRemoveAttachment}
        onClearAll={handleClearAllAttachments}
        onSendAll={handleSendFiles}
        onSendSingle={handleSendSingleFile}
      />

      <ChatMediaViewer
        items={chatMediaItems}
        initialIndex={mediaViewer.index}
        visible={mediaViewer.visible}
        onClose={closeMediaViewer}
      />

      <ChatSearchOverlay
        visible={searchVisible}
        messages={visibleMessages}
        onClose={() => setSearchVisible(false)}
        onSelect={scrollToMessage}
      />

      <MessageActionSheet
        visible={!!actionMessage}
        message={actionMessage}
        isOutgoing={actionMessage?.sender_id === user?.id}
        isGroup={chatType === 'group'}
        isStarred={actionMessage ? starredIds.includes(actionMessage.id) : false}
        canEdit={
          !!actionMessage &&
          actionMessage.sender_id === user?.id &&
          actionMessage.message_type === 'text' &&
          isWithinMinutes(actionMessage.created_at, 15)
        }
        canDeleteForAll={
          !!actionMessage &&
          actionMessage.sender_id === user?.id &&
          isWithinMinutes(actionMessage.created_at, 60)
        }
        onClose={() => setActionMessage(null)}
        onAction={handleMessageAction}
      />

      <MomentChatPreview
        momentId={momentPreviewId}
        visible={!!momentPreviewId}
        onClose={() => setMomentPreviewId(null)}
      />

      <ForwardToChatPicker
        visible={!!forwardMessage}
        excludeChatId={chatId}
        excludeChatType={chatType}
        onClose={() => setForwardMessage(null)}
        onSelect={handleForwardTo}
      />

      <ReadReceiptSheet
        messageId={readReceiptMessageId}
        visible={!!readReceiptMessageId}
        onClose={() => setReadReceiptMessageId(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: chatTheme.chatBg,
  },
  chatBody: {
    flex: 1,
    backgroundColor: chatTheme.chatBg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: chatTheme.headerBg,
    height: 70,
    paddingHorizontal: 4,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
    flex: 1,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  headerText: {
    flexDirection: 'column',
    flex: 1,
    marginRight: 8,
  },
  headerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    flexShrink: 1,
  },
  headerStatus: {
    fontSize: 12,
    color: chatTheme.headerStatus,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 12,
  },
  sectionHeader: {
    alignItems: 'center',
    marginVertical: 10,
  },
  sectionHeaderContent: {
    backgroundColor: chatTheme.datePillBg,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  sectionHeaderText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: chatTheme.datePillText,
  },
  unreadDivider: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 122, 255, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    marginVertical: 10,
  },
  unreadDividerText: {
    fontSize: 12,
    fontWeight: '700',
    color: chatTheme.primary,
  },
  albumRow: {
    flexDirection: 'row',
    marginVertical: 2,
    paddingHorizontal: 4,
  },
  albumRowOut: { justifyContent: 'flex-end' },
  albumRowIn: { justifyContent: 'flex-start' },
  albumAvatarSlot: { width: 36, marginRight: 6, justifyContent: 'flex-end' },
  albumAvatar: { width: 32, height: 32, borderRadius: 16 },
  albumAvatarSpacer: { width: 32, height: 32 },
  albumContent: { maxWidth: '82%' },
  albumContentOut: { alignItems: 'flex-end' },
  albumContentIn: { alignItems: 'flex-start' },
  pinnedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  pinnedText: {
    flex: 1,
    fontSize: 13,
    color: '#444',
  },
  scrollFab: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: chatTheme.scrollFabBg,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  messageContainer: {
    flexDirection: 'row',
    marginVertical: 4,
    maxWidth: '80%',
  },
  currentUserContainer: {
    alignSelf: 'flex-end',
  },
  otherUserContainer: {
    alignSelf: 'flex-start',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
    alignSelf: 'flex-end',
    marginBottom: 4,
  },
  messageContent: {
    flex: 1,
  },
  currentUserContent: {
    alignItems: 'flex-end',
  },
  otherUserContent: {
    alignItems: 'flex-start',
  },
  messageWithAvatar: {
    marginLeft: 0,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 2,
    marginLeft: 8,
  },
  textBubble: {
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '100%',
  },
  currentTextBubble: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  otherTextBubble: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    color: '#000',
  },
  currentMessageText: {
    color: '#fff',
  },
  audioBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 160,
  },
  currentAudio: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  otherAudio: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
  },
  audioButton: {
    marginRight: 12,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    height: 24,
  },
  waveBar: {
    width: 2,
    backgroundColor: '#007AFF',
    marginHorizontal: 1,
    borderRadius: 1,
  },
  currentWaveBar: {
    backgroundColor: '#fff',
  },
  audioTime: {
    fontSize: 14,
    color: '#007AFF',
    marginLeft: 12,
    fontWeight: '500',
  },
  currentAudioTime: {
    color: '#fff',
  },
  imageContainer: {
    borderRadius: 18,
    overflow: 'hidden',
    maxWidth: 250,
  },
  imageMessage: {
    width: 250,
    height: 200,
    borderRadius: 18,
  },
  fileBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    maxWidth: 250,
  },
  currentFile: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  otherFile: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
  },
  fileName: {
    flex: 1,
    fontSize: 14,
    color: '#007AFF',
    marginLeft: 10,
  },
  currentFileName: {
    color: '#fff',
  },
  messageMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  currentMessageMeta: {
    justifyContent: 'flex-end',
  },
  otherMessageMeta: {
    justifyContent: 'flex-start',
  },
  textMessageMeta: {
    marginTop: 4,
  },
  audioMessageMeta: {
    position: 'absolute',
    right: 14,
    bottom: -16,
  },
  imageMessageMeta: {
    position: 'absolute',
    right: 12,
    bottom: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  fileMessageMeta: {
    position: 'absolute',
    right: 14,
    bottom: -16,
  },
  time: {
    fontSize: 11,
    color: 'rgba(0, 0, 0, 0.5)',
    marginRight: 4,
  },
  currentTime: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  loadingIndicator: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
  loadingMore: {
    marginVertical: 20,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 20,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
  },
  loadingMoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  loadingMoreText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#5b5b5bff',
  },
});
