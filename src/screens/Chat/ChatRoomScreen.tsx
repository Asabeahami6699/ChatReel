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
  StatusBar,
  ImageBackground,
  RefreshControl,
} from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { api, ApiError } from '../../lib/api';
import { setLocalActiveChatFocus } from '../../lib/activeChatFocus';
import { cancelChatThreadsPrefetch } from '../../lib/chatThreadsPrefetch';
import { flushMessageOutbox, flushOutboxItem } from '../../lib/flushMessageOutbox';
import { WallpaperPickerSheet } from '../../components/WallpaperPickerSheet';
import { ChatSharedMediaSheet } from '../../components/ChatSharedMediaSheet';
import { showAppToast } from '../../lib/appToast';
import { disappearLabel } from '../../lib/disappearOptions';
import { DisappearTimerSheet } from './DisappearTimerSheet';
import NetInfo from '@react-native-community/netinfo';
import { uploadFromUri } from '../../lib/uploads';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialIcons, Feather } from '@expo/vector-icons';
import ChatMenuDropdown, { MenuItem } from '../../components/ChatMenuDropdown';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ChatInput from './ChatInput';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { messageStorage } from '../../utils/messageStorage';
import { ensureChatReelTree, persistChatMedia, cacheRemoteChatMedia } from '../../lib/chatMediaStore';
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
import { ChatRoomLockCover } from '../../components/ChatRoomLockCover';
import { navigateToReelPreview } from '../../navigation/navigateToChat';
import { ensureSupabaseSession } from '../../lib/ensureSupabaseSession';
import { useChatTyping } from '../../hooks/useChatTyping';
import { usePartnerPresence } from '../../hooks/usePartnerPresence';
import { setStringAsync } from '../../lib/clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GroupCallBanner } from '../../components/GroupCallBanner';
import { useActiveGroupCall } from '../../hooks/useActiveGroupCall';
import { ChatSearchOverlay } from './ChatSearchOverlay';
import { MessageActionSheet, type MessageAction } from './MessageActionSheet';
import { ReplyPreviewBar } from './ReplyPreviewBar';
import { MomentChatPreview } from './MomentChatPreview';
import { isWithinMinutes, buildForwardPayload, isValidUuid, isWallpaperImageUri, resolveWallpaperColor } from './chatMessageUtils';
import { ForwardToChatPicker, type ForwardTarget } from './ForwardToChatPicker';
import { ReadReceiptSheet } from './ReadReceiptSheet';
import {
  type ChatMessage as Message,
  type AttachmentFile,
  type ChatRouteParams as RouteParams,
  generateTempId,
  generateClientMessageId,
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
import { useChatSettings } from '../../context/ChatSettingsContext';
import {
  decryptChatMessage,
  decryptChatMessages,
  getMessageDisplayText,
  preserveSenderCleartext,
  rememberDecryptedText,
  tryEncryptChatText,
} from '../../lib/messageCrypto';
import {
  ensureGroupSenderKeyDistributed,
  syncGroupSenderKeysForMe,
} from '../../lib/groupSenderKeys';
import { rememberChatThread, recallChatThread, clearChatThread } from '../../lib/chatThreadCache';
import { patchChatListMeta } from '../../lib/chatListMeta';

/** First paint: recent window only. Older history is pull-to-load (WhatsApp-style). */
const INITIAL_MESSAGE_PAGE = 30;
const OLDER_MESSAGE_PAGE = 40;
import { ChatLoadingSkeleton } from './ChatLoadingSkeleton';

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
  const activeGroupCall = useActiveGroupCall(
    chatType === 'group' ? chatId : undefined,
    chatType === 'group'
  );

  const insets = useSafeAreaInsets();
  const { theme } = useChatSettings();
  const roomKind = chatType === 'group' ? 'group' : 'individual';

  const cachedThread = chatId ? recallChatThread<Message>(chatId) : null;
  const [messages, setMessages] = useState<Message[]>(() =>
    cachedThread && cachedThread.length > 0
      ? cachedThread.slice(-INITIAL_MESSAGE_PAGE)
      : []
  );
  const [loading, setLoading] = useState(() => !(cachedThread && cachedThread.length > 0));
  const [loadingMore, setLoadingMore] = useState(false);
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;
  // Header sits outside KeyboardAvoidingView.
  const keyboardVerticalOffset = Platform.OS === 'ios' ? 70 + insets.top : 0;

  const [hasMore, setHasMore] = useState(true);
  const [isPlayingAudio, setIsPlayingAudio] = useState<string | null>(null);
  const [sound, setSound] = useState<AudioPlayer | null>(null);
  const [composerDraft, setComposerDraft] = useState('');
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(
    () => !!(cachedThread && cachedThread.length > 0)
  );
  const [hasAudioPermission, setHasAudioPermission] = useState<boolean>(false);
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentFile[]>([]);
  const [showAttachmentPreview, setShowAttachmentPreview] = useState(false);
  const [mediaViewer, setMediaViewer] = useState<{
    visible: boolean;
    index: number;
    /** Frozen list so view-once URI stripping cannot crash the viewer mid-open. */
    items: ChatMediaItem[];
    consumeId: string | null;
  }>({
    visible: false,
    index: 0,
    items: [],
    consumeId: null,
  });
  const [sharedMediaOpen, setSharedMediaOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchHitId, setSearchHitId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [momentPreviewId, setMomentPreviewId] = useState<string | null>(null);
  const [wallpaper, setWallpaper] = useState<string | null>(null);
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const [chatMuted, setChatMuted] = useState(false);
  const [disappearAfterSeconds, setDisappearAfterSeconds] = useState<number | null>(null);
  const [disappearSheetOpen, setDisappearSheetOpen] = useState(false);
  const [wallpaperPickerOpen, setWallpaperPickerOpen] = useState(false);
  const [clearedAt, setClearedAt] = useState<string | null>(null);
  const [settingsReady, setSettingsReady] = useState(false);
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [pinFocusIdx, setPinFocusIdx] = useState(0);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [readReceiptMessageId, setReadReceiptMessageId] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<
    Array<{ display_name: string; user_id?: string }>
  >([]);
  const groupMemberUserIds = useMemo(
    () =>
      groupMembers
        .map((m) => m.user_id)
        .filter((id): id is string => Boolean(id)),
    [groupMembers]
  );
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
    const id = setInterval(() => setExpiryTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [messages]);

  const visibleMessages = useMemo(() => {
    const now = Date.now();
    return filterByClearedAt(messages).filter((m) => !isMessageExpired(m, now));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, filterByClearedAt, expiryTick]);
  const listTailId = visibleMessages[visibleMessages.length - 1]?.id ?? '';

  const chatBgColor = resolveWallpaperColor(wallpaper, theme.chatBg);
  const wallpaperImageUri = isWallpaperImageUri(wallpaper) ? wallpaper : null;

  const pendingRetryRef = useRef<boolean>(false);
  const syncInProgressRef = useRef<boolean>(false);
  /** IDs of view-once messages already opened — ignore realtime resurrection. */
  const consumedViewOnceIdsRef = useRef<Set<string>>(new Set());
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
    nearTop,
    isKeyboardVisible,
    keyboardHeight: _keyboardHeight,
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
  });

  // Android uses softwareKeyboardLayoutMode: 'resize' — do not also pad by
  // keyboardHeight or the composer gets an extra upward lift above the IME.
  // iOS uses KeyboardAvoidingView below.
  const androidKeyboardPad = 0;

  const persistMessages = useCallback(
    (updater: (prev: Message[]) => Message[]) => {
      setMessages((prev) => {
        const next = deduplicateMessages(updater(prev));
        rememberChatThread(chatId, next);
        void messageStorage.saveMessages(chatId, next, { chatType });
        return next;
      });
    },
    [chatId, chatType]
  );

  const loadChatSettings = useCallback(async () => {
    if (!chatId) {
      setSettingsReady(true);
      return;
    }
    const localKey = `chat_wallpaper:${chatType}:${chatId}`;
    try {
      const localWallpaper = await AsyncStorage.getItem(localKey);
      if (isWallpaperImageUri(localWallpaper)) {
        setWallpaper(localWallpaper);
      } else if (localWallpaper) {
        setWallpaper(localWallpaper);
      } else if (localWallpaper === '') {
        setWallpaper(null);
      }
    } catch {
      // optional local cache
    }
    try {
      const { preferences } = await api.chatSettings.get(chatType, chatId);
      const remoteWallpaper = (preferences.wallpaper as string) ?? null;
      const localWallpaper = await AsyncStorage.getItem(localKey).catch(() => null);
      // Keep a local photo wallpaper even if the server only stores color ids.
      if (isWallpaperImageUri(localWallpaper)) {
        setWallpaper(localWallpaper);
      } else if (remoteWallpaper) {
        setWallpaper(remoteWallpaper);
        void AsyncStorage.setItem(localKey, remoteWallpaper).catch(() => undefined);
      } else if (!localWallpaper) {
        setWallpaper(null);
      }
      setClearedAt((preferences.cleared_at as string) ?? null);
      setStarredIds((preferences.starred_message_ids as string[]) ?? []);
      const mutedUntil = preferences.muted_until as string | null;
      const isMutedNow = Boolean(mutedUntil && new Date(mutedUntil) > new Date());
      setChatMuted(isMutedNow);
      void patchChatListMeta(chatType === 'group' ? 'group' : 'individual', chatId, {
        mutedUntil: isMutedNow ? mutedUntil : null,
      });
      const disappear = preferences.disappear_after_seconds;
      setDisappearAfterSeconds(
        typeof disappear === 'number' && disappear > 0 ? disappear : null
      );
    } catch {
      // Preferences are optional until migration is applied.
    }
    try {
      const { pinned } = await api.chatSettings.pinned(chatType, chatId);
      const localThread = ((await messageStorage.getMessages(chatId)) as Message[]) ?? [];
      const list = (pinned ?? [])
        .map((row) => {
          const nested = (row as { messages?: Message | Message[] | null }).messages;
          const fromApi = Array.isArray(nested) ? nested[0] : nested;
          if (fromApi?.id) return fromApi;
          const mid = (row as { message_id?: string }).message_id;
          if (!mid) return null;
          // Fallback: resolve from local thread when the join is empty.
          return localThread.find((m) => m.id === mid) ?? null;
        })
        .filter((m): m is Message => Boolean(m?.id));
      setPinnedMessages(list);
      setPinFocusIdx(0);
    } catch {
      setPinnedMessages([]);
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

  // Prefetch group sender keys so first send / decrypt is fast.
  useEffect(() => {
    if (chatType !== 'group' || !chatId || !user?.id) return;
    void syncGroupSenderKeysForMe(chatId, user.id);
    if (groupMemberUserIds.length) {
      void ensureGroupSenderKeyDistributed(chatId, user.id, groupMemberUserIds);
    }
  }, [chatType, chatId, user?.id, groupMemberUserIds]);

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
      const idx = chatRows.findIndex((r) => {
        if (r.kind === 'message') return r.message.id === messageId;
        if (r.kind === 'media_album') {
          return r.messages.some((m) => m.id === messageId);
        }
        return false;
      });
      if (idx < 0) {
        showAppToast('Message not found in the loaded chat');
        return;
      }
      try {
        flatListRef.current?.scrollToIndex?.({
          index: idx,
          animated: true,
          viewPosition: 0.35,
        });
      } catch {
        flatListRef.current?.scrollToOffset?.({ offset: Math.max(0, idx * 72), animated: true });
      }
      setSearchHitId(messageId);
      setTimeout(() => setSearchHitId(null), 2800);
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
          msg.message_type === 'text'
            ? getMessageDisplayText(msg)
            : msg.file_name || getMessageDisplayText(msg) || '';
        await setStringAsync(text);
        return;
      }
      if (action === 'translate') {
        const text = getMessageDisplayText(msg)?.trim();
        if (!text || text === 'Message') {
          showAppToast('Nothing to translate');
          return;
        }
        // Toggle off if this bubble already shows a translation.
        if (translations[msg.id]) {
          setTranslations((prev) => {
            const next = { ...prev };
            delete next[msg.id];
            return next;
          });
          return;
        }
        try {
          const me = await api.profiles.me();
          const { normalizeLanguageValue } = await import('../../lib/profileLocaleOptions');
          const rawLang =
            typeof me.profile?.language === 'string' ? me.profile.language : null;
          const lang = normalizeLanguageValue(rawLang) || 'en';
          const to = lang.split(/[-_]/)[0] || 'en';
          const { translatedText } = await api.translate.text({ text, to });
          if (!translatedText?.trim()) {
            showAppToast('Could not translate', { isError: true });
            return;
          }
          setTranslations((prev) => ({ ...prev, [msg.id]: translatedText.trim() }));
          showAppToast('Translated');
        } catch (err) {
          showAppToast(
            err instanceof ApiError ? err.message : 'Could not translate',
            { isError: true }
          );
        }
        return;
      }
      if (action === 'edit') {
        setEditingMessage(msg);
        setComposerDraft(getMessageDisplayText(msg));
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
      if (action === 'pin' && !msg.id.startsWith('temp-')) {
        try {
          await api.chatSettings.pin(chatType, chatId, msg.id);
          setPinnedMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [msg, ...prev];
          });
          setPinFocusIdx(0);
          showAppToast('Message pinned');
        } catch (err) {
          const detail =
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Could not pin message';
          Alert.alert('Could not pin message', detail);
        }
        return;
      }
      if (action === 'unpin' && !msg.id.startsWith('temp-')) {
        try {
          await api.chatSettings.unpin(chatType, chatId, msg.id);
          setPinnedMessages((prev) => prev.filter((m) => m.id !== msg.id));
        } catch (err) {
          const detail =
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Could not unpin message';
          Alert.alert('Could not unpin message', detail);
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
      translations,
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
            ...buildForwardPayload({
              ...msg,
              content: getMessageDisplayText(msg),
            }),
            ...(target.chatType === 'individual'
              ? { receiver_id: target.chatId }
              : { group_id: target.chatId }),
          };

          // Re-encrypt forwarded text for DM / group targets when possible.
          if (msg.message_type === 'text' || !msg.message_type) {
            const clear = String(payload.content ?? '');
            const enc = await tryEncryptChatText({
              chatType: target.chatType,
              senderUserId: user?.id,
              chatId: target.chatId,
              cleartext: clear,
            });
            if (enc) Object.assign(payload, enc);
          }

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

  const syncWithServer = async (
    localMessages: Message[],
    loadMore: boolean = false,
    beforeCursor?: string
  ) => {
    if (!isOnline || syncInProgressRef.current || !user?.id) return;

    try {
      syncInProgressRef.current = true;
      if (loadMore) {
        beginLoadMore();
        setLoadingMore(true);
      } else {
        setSyncing(true);
      }

      const pageSize = loadMore ? OLDER_MESSAGE_PAGE : INITIAL_MESSAGE_PAGE;
      const before =
        beforeCursor ||
        (loadMore && localMessages.length > 0 ? localMessages[0].created_at : undefined);
      const { messages: rawMessages } = await api.messages.list(
        chatId,
        chatType === 'group',
        pageSize,
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
              localMsg.client_message_id &&
              serverMsg.client_message_id &&
              localMsg.client_message_id === serverMsg.client_message_id
            ) {
              return true;
            }
            if (
              localMsg.file_name === serverMsg.file_name &&
              localMsg.file_type === serverMsg.file_type &&
              localMsg.message_type === serverMsg.message_type &&
              Math.abs(new Date(localMsg.created_at).getTime() - new Date(serverMsg.created_at).getTime()) < 5000
            ) return true;
            return false;
          });

          const merged: Message = {
            ...serverMsg,
            profiles: profilesData[serverMsg.sender_id] || {
              display_name: serverMsg.sender_id === user.id ? 'You' : 'Unknown User',
              avatar_url: null,
              user_id: serverMsg.sender_id
            },
            _status: 'sent' as const,
            local_file_uri: localMatch?.local_file_uri || serverMsg.local_file_uri,
            file_url: serverMsg.file_url || localMatch?.file_url,
            local_audio_uri: localMatch?.local_audio_uri || serverMsg.local_audio_uri,
            decrypted: localMatch?.decrypted,
          };
          return preserveSenderCleartext(merged, localMatch, user.id);
        });

        const decryptedServer = await decryptChatMessages(messagesWithProfiles, user.id);
        const serverMessages = decryptedServer.map((m) => {
          if (m.decrypted) rememberDecryptedText(m.id, m.decrypted);
          return m;
        });

        let finalMessages: Message[];

        if (loadMore) {
          finalMessages = deduplicateMessages([
            ...serverMessages,
            ...sanitizeChatMessages(localMessages),
          ]);
        } else {
          const localPending = localMessages.filter(m =>
            (m.id.startsWith('temp-') || m.client_message_id) &&
            ['pending', 'failed', 'sending'].includes(m._status || '')
          );

          const serverIds = new Set(serverMessages.map(m => m.id));
          const serverClientIds = new Set(
            serverMessages.map((m) => m.client_message_id).filter(Boolean) as string[]
          );
          const uniquePending = localPending.filter(
            (m) =>
              !serverIds.has(m.id) &&
              !(m.client_message_id && serverClientIds.has(m.client_message_id))
          );

          // Keep any previously decrypted cleartext when server rows lack it.
          const localById = new Map(localMessages.map((m) => [m.id, m]));
          const withKeptCleartext = serverMessages.map((m) => {
            const local = localById.get(m.id);
            const kept = m.decrypted || local?.decrypted;
            if (kept && !m.decrypted) {
              rememberDecryptedText(m.id, kept);
              return { ...m, decrypted: kept };
            }
            return m;
          });

          finalMessages = deduplicateMessages([...withKeptCleartext, ...uniquePending]);
        }

        setMessages(finalMessages);
        rememberChatThread(chatId, finalMessages);
        setHasMore(messagesData.length >= pageSize);

        // Persist full thread when loading more; on first page keep prior older locals.
        if (loadMore) {
          await messageStorage.saveMessages(chatId, finalMessages);
        } else {
          const priorLocal = sanitizeChatMessages(localMessages);
          const mergedStore = deduplicateMessages([...priorLocal, ...finalMessages]);
          await messageStorage.saveMessages(chatId, mergedStore);
        }

        // Warm ChatReel local cache for recent media (offline open).
        for (const m of finalMessages.slice(-20)) {
          if (
            m.message_type === 'image' ||
            m.message_type === 'video' ||
            m.message_type === 'audio' ||
            m.message_type === 'file'
          ) {
            const key = m.client_message_id || m.id;
            const remote =
              (m.file_url && /^https?:\/\//i.test(m.file_url) && m.file_url) ||
              (m.audio_url && /^https?:\/\//i.test(m.audio_url) && m.audio_url) ||
              null;
            if (!key || key.startsWith('temp-') || !remote) continue;
            void cacheRemoteChatMedia({
              chatId,
              clientMessageId: key,
              remoteUrl: remote,
              messageType: m.message_type,
              fileName: m.file_name,
              mime: m.file_type,
            }).then((localUri) => {
              if (!localUri) return;
              setMessages((prev) =>
                prev.map((row) => {
                  if (row.id !== m.id && row.client_message_id !== m.client_message_id) {
                    return row;
                  }
                  if (m.message_type === 'audio') {
                    return { ...row, local_audio_uri: localUri };
                  }
                  return { ...row, local_file_uri: localUri };
                })
              );
              // Don't rewrite full storage from the visible page — older history
              // must stay available for pull-to-load.
            });
          }
        }
      }
      else if (messagesData && messagesData.length === 0 && !loadMore) {
        const kept = deduplicateMessages(
          filterByClearedAt(sanitizeChatMessages(localMessages)).filter((m) =>
            messageBelongsToChat(m)
          )
        );
        if (kept.length > 0) {
          const recent = kept.slice(-INITIAL_MESSAGE_PAGE);
          setMessages(recent);
          setHasMore(kept.length > recent.length);
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
          const recent = deduped.slice(-INITIAL_MESSAGE_PAGE);
          setMessages(recent);
          setHasMore(deduped.length > recent.length);
        }
      }
    } catch (err: any) {
      console.error('Sync error:', err);
      if (!loadMore) {
        const deduped = deduplicateMessages(localMessages);
        if (deduped.length > 0) {
          const recent = deduped.slice(-INITIAL_MESSAGE_PAGE);
          setMessages(recent);
          setHasMore(deduped.length > recent.length);
        }
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
      beginLoadMore();
    } else if (!initialLoadComplete && messages.length === 0) {
      setLoading(true);
    }

    try {
      const localMessages = await messageStorage.getMessages(chatId);
      const dedupedLocalMessages = deduplicateMessages(
        filterByClearedAt(sanitizeChatMessages(localMessages))
      ).filter((m) => messageBelongsToChat(m));

      if (!loadMore) {
        // Fast first paint: only the recent window (decrypt that slice, not the whole archive).
        const recentSlice = dedupedLocalMessages.slice(-INITIAL_MESSAGE_PAGE);
        const localReady = await decryptChatMessages(recentSlice, user.id);
        for (const m of localReady) {
          if (m.decrypted) rememberDecryptedText(m.id, m.decrypted);
        }
        if (localReady.length > 0) {
          setMessages(localReady);
          rememberChatThread(chatId, localReady);
          setHasMore(
            dedupedLocalMessages.length > recentSlice.length || isOnline
          );
          setLoading(false);
        }

        if (isOnline) {
          await syncWithServer(dedupedLocalMessages, false);
        } else {
          if (localReady.length === 0) setMessages([]);
          setHasMore(dedupedLocalMessages.length > recentSlice.length);
          setLoading(false);
          setInitialLoadComplete(true);
        }
        return;
      }

      // ---- Pull-to-load older messages ----
      const oldestDisplayed = messagesRef.current[0]?.created_at;
      if (!oldestDisplayed) {
        setHasMore(false);
        setLoadingMore(false);
        endLoadMore();
        return;
      }

      const olderLocal = dedupedLocalMessages.filter(
        (m) => new Date(m.created_at).getTime() < new Date(oldestDisplayed).getTime()
      );
      const localPage = olderLocal.slice(-OLDER_MESSAGE_PAGE);
      if (localPage.length > 0) {
        const decryptedOlder = await decryptChatMessages(localPage, user.id);
        for (const m of decryptedOlder) {
          if (m.decrypted) rememberDecryptedText(m.id, m.decrypted);
        }
        setMessages((prev) => {
          const next = deduplicateMessages([...decryptedOlder, ...prev]);
          rememberChatThread(chatId, next);
          return next;
        });
        setHasMore(
          olderLocal.length > localPage.length || isOnline
        );
      }

      if (isOnline) {
        await syncWithServer(messagesRef.current, true, oldestDisplayed);
      } else {
        setHasMore(olderLocal.length > localPage.length);
        setLoadingMore(false);
        endLoadMore();
      }
    } catch (error) {
      console.error('Fetch messages error:', error);
      if (!loadMore) {
        setLoading(false);
        setInitialLoadComplete(true);
      }
      setLoadingMore(false);
      endLoadMore();
    }
  }, [
    user?.id,
    chatId,
    isOnline,
    initialLoadComplete,
    filterByClearedAt,
    clearedAt,
    beginLoadMore,
    endLoadMore,
    messageBelongsToChat,
  ]);

  const markMessagesAsRead = useCallback(async () => {
    if (!user?.id || !isValidUuid(chatId)) return;

    try {
      void import('../../lib/chatIndex').then((m) => m.resetChatIndexUnread(chatId));
      const expiresAt =
        disappearAfterSeconds && disappearAfterSeconds > 0
          ? new Date(Date.now() + disappearAfterSeconds * 1000).toISOString()
          : null;

      if (chatType === 'individual') {
        const result = (await api.messages.markRead({ partner_user_id: chatId })) as {
          expires_at?: string;
          message_ids?: string[];
        };
        const stamp = result?.expires_at || expiresAt;
        persistMessages((prev) =>
          prev.map((msg) =>
            msg.sender_id === chatId && msg.receiver_id === user.id
              ? {
                  ...msg,
                  is_read: true,
                  ...(stamp && !msg.expires_at ? { expires_at: stamp } : {}),
                }
              : msg
          )
        );
      } else {
        await api.messages.markRead({ group_id: chatId });
        persistMessages((prev) =>
          prev.map((msg) =>
            msg.sender_id !== user.id && msg.group_id === chatId
              ? {
                  ...msg,
                  is_read: true,
                  ...(expiresAt && !msg.expires_at ? { expires_at: expiresAt } : {}),
                }
              : msg
          )
        );
      }
    } catch (error) {
      console.error('Mark as read error:', error);
    }
  }, [user?.id, chatId, chatType, disappearAfterSeconds, persistMessages]);

  const postDisappearNotice = useCallback(
    async (seconds: number | null) => {
      if (!user?.id) return;
      const who =
        user.user_metadata?.display_name ||
        user.email?.split('@')[0] ||
        'Someone';
      const content = seconds
        ? `${who} turned on disappearing messages. New messages will disappear ${disappearLabel(seconds).toLowerCase()} after they are read.`
        : `${who} turned off disappearing messages.`;

      try {
        const payload: Record<string, unknown> = {
          content,
          message_type: 'system',
          plaintext: true,
          client_message_id: generateClientMessageId(),
        };
        if (chatType === 'individual') payload.receiver_id = chatId;
        else payload.group_id = chatId;

        const { message: raw } = await api.messages.send(payload);
        const inserted = raw as unknown as Message;
        const local: Message = {
          ...inserted,
          content,
          decrypted: content,
          message_type: 'system',
          plaintext: true,
          profiles: {
            display_name: 'You',
            avatar_url: null,
            user_id: user.id,
          },
          _status: 'sent',
        };
        persistMessages((prev) => deduplicateMessages([...prev, local]));
        stickBeforeSend();
        setTimeout(() => scrollToBottom(), 50);
      } catch (err) {
        console.warn('Failed to post disappear notice', err);
      }
    },
    [user?.id, chatType, chatId, persistMessages, stickBeforeSend, scrollToBottom]
  );

  const handleDisappearingMessages = useCallback(() => {
    setDisappearSheetOpen(true);
  }, []);

  const saveDisappearingMessages = useCallback(
    async (seconds: number | null) => {
      setDisappearSheetOpen(false);
      if ((disappearAfterSeconds ?? null) === (seconds ?? null)) return;
      try {
        await api.chatSettings.update(chatType, chatId, {
          disappear_after_seconds: seconds,
        });
        setDisappearAfterSeconds(seconds);
        showAppToast(
          seconds
            ? `Disappear after read: ${disappearLabel(seconds)}`
            : 'Disappearing messages off'
        );
        await postDisappearNotice(seconds);
      } catch (err) {
        const detail =
          err instanceof ApiError
            ? err.message
            : 'Could not update disappearing messages';
        showAppToast(detail, { isError: true });
      }
    },
    [chatType, chatId, disappearAfterSeconds, postDisappearNotice]
  );

  const markSingleMessageAsRead = useCallback(async (messageId: string) => {
    if (!user?.id || !isValidUuid(messageId)) return;

    const expiresAt =
      disappearAfterSeconds && disappearAfterSeconds > 0
        ? new Date(Date.now() + disappearAfterSeconds * 1000).toISOString()
        : null;

    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? {
              ...msg,
              is_read: true,
              ...(expiresAt && !msg.expires_at ? { expires_at: expiresAt } : {}),
            }
          : msg
      )
    );

    try {
      const result = (await api.messages.markRead({ message_id: messageId })) as {
        success?: boolean;
        expires_at?: string;
        message_ids?: string[];
      };
      if (result?.expires_at) {
        persistMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId || result.message_ids?.includes(msg.id)
              ? { ...msg, is_read: true, expires_at: msg.expires_at || result.expires_at }
              : msg
          )
        );
      }
    } catch (error) {
      console.error('Mark single as read error:', error);
    }
  }, [user?.id, disappearAfterSeconds, persistMessages]);

  const retryPendingMessages = useCallback(async () => {
    if (!isOnline || pendingRetryRef.current) return;

    try {
      pendingRetryRef.current = true;

      // Durable outbox (text + media upload jobs).
      const flushed = await flushMessageOutbox(chatId, user?.id);
      if (flushed.length) {
        setMessages((prev) => {
          let updated = prev;
          for (const item of flushed) {
            updated = updated.map((msg) =>
              msg.client_message_id === item.client_message_id ||
              msg.id === `temp-${item.client_message_id}`
                ? ({
                    ...(item.message as unknown as Message),
                    client_message_id: item.client_message_id,
                    profiles: msg.profiles,
                    _status: 'sent' as const,
                    local_file_uri: msg.local_file_uri ?? item.local_file_uri,
                    local_audio_uri: msg.local_audio_uri ?? item.local_audio_uri,
                  } as Message)
                : msg
            );
          }
          const deduped = deduplicateMessages(updated);
          void messageStorage.saveMessages(chatId, deduped);
          return deduped;
        });
      }

      // In-memory pending text that never hit the outbox.
      const pendingMessages = messages.filter(
        (msg) =>
          (msg._status === 'pending' || msg._status === 'failed') &&
          (msg.message_type || 'text') === 'text' &&
          !flushed.some((f) => f.client_message_id === msg.client_message_id)
      );

      const batchSize = 6;
      for (let i = 0; i < pendingMessages.length; i += batchSize) {
        const batch = pendingMessages.slice(i, i + batchSize);
        await Promise.allSettled(batch.map((msg) => sendMessageToServer(msg)));
      }
    } catch (error) {
      console.error('Retry pending messages error:', error);
    } finally {
      pendingRetryRef.current = false;
    }
  }, [messages, isOnline, chatId]);

  const sendMessageToServer = async (message: Message) => {
    const clientMessageId = message.client_message_id || generateClientMessageId();
    try {
      const cleartext = message.decrypted || message.content;
      const payload = buildChatSendPayload(chatType, chatId, {
        content: cleartext,
        message_type: message.message_type || 'text',
        client_message_id: clientMessageId,
        // Plaintext preview for push (E2E ciphertext is not readable on the server).
        ...((message.message_type || 'text') === 'text' && cleartext
          ? { push_preview: String(cleartext).slice(0, 120) }
          : {}),
        ...(message.reply_to_id ? { reply_to_id: message.reply_to_id } : {}),
      });

      // Text: encrypt when ready (DM ECDH or group sender keys); never block send.
      if ((message.message_type || 'text') === 'text') {
        try {
          const enc = await tryEncryptChatText({
            chatType,
            senderUserId: user?.id,
            chatId,
            cleartext,
            memberUserIds:
              chatType === 'group' ? groupMemberUserIds : undefined,
          });
          if (enc) Object.assign(payload, enc);
        } catch (encErr) {
          console.warn('[e2e] encrypt ignored, sending plaintext:', encErr);
        }
      }

      if (message.message_type === 'audio') {
        payload.audio_url = message.audio_url;
        payload.audio_duration = message.audio_duration;
        payload.file_name = message.file_name;
        payload.file_type = message.file_type;
      }

      if (message.message_type === 'image' || message.message_type === 'file' || message.message_type === 'video') {
        const cleanFileUrl = message.file_url ? message.file_url.split('?')[0] : message.file_url;
        // Don't POST local file:// URIs as remote urls — retry after upload separately.
        if (cleanFileUrl && /^https?:\/\//i.test(cleanFileUrl)) {
          payload.file_url = cleanFileUrl;
        }
        payload.file_name = message.file_name;
        payload.file_type = message.file_type;
        if (message.expires_at) payload.expires_at = message.expires_at;
        if (message.view_once) payload.view_once = true;
      }

      // Text/media with remote URL can live in the durable outbox.
      const canOutbox =
        (message.message_type || 'text') === 'text' ||
        (typeof payload.file_url === 'string' && /^https?:\/\//i.test(payload.file_url)) ||
        (typeof payload.audio_url === 'string' && /^https?:\/\//i.test(String(payload.audio_url)));
      if (canOutbox) {
        // Don't await outbox before the network send — persistence is best-effort.
        void messageStorage
          .enqueueOutbox({
            client_message_id: clientMessageId,
            chatId,
            chatType,
            payload,
            created_at: message.created_at || new Date().toISOString(),
          })
          .catch((outboxErr) => {
            console.warn('[outbox] enqueue failed (send continues):', outboxErr);
          });
      }

      const { message: rawData } = await api.messages.send(payload);
      const data = rawData as unknown as Message;
      await messageStorage.removeOutbox(clientMessageId);

      setMessages(prevMessages => {
        const updated: Message[] = prevMessages.map(msg =>
          msg.id === message.id ||
          (msg.client_message_id && msg.client_message_id === clientMessageId)
            ? ({
                ...data,
                client_message_id: clientMessageId,
                profiles: message.profiles,
                _status: 'sent' as const,
                decrypted: cleartext,
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

      // Network / 5xx → keep queued for retry. Only hard-fail validation (4xx).
      const networkish =
        !(error instanceof ApiError) ||
        error.isNetworkError ||
        error.status === 0 ||
        error.status >= 500;
      const nextStatus = networkish ? ('pending' as const) : ('failed' as const);

      persistMessages((prev) =>
        prev.map((msg) =>
          msg.id === message.id || msg.client_message_id === clientMessageId
            ? { ...msg, client_message_id: clientMessageId, _status: nextStatus }
            : msg
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

    const clientMessageId = message.client_message_id || generateClientMessageId();
    const outbox = await messageStorage.getOutbox(chatId);
    const queued = outbox.find((x) => x.client_message_id === clientMessageId);

    if (queued?.upload) {
      const result = await flushOutboxItem(queued, user?.id);
      if (result) {
        persistMessages((prev) =>
          prev.map((msg) =>
            msg.id === message.id || msg.client_message_id === clientMessageId
              ? ({
                  ...(result.message as unknown as Message),
                  client_message_id: clientMessageId,
                  profiles: msg.profiles,
                  _status: 'sent' as const,
                  local_file_uri: msg.local_file_uri,
                  local_audio_uri: msg.local_audio_uri,
                } as Message)
              : msg
          )
        );
      } else {
        persistMessages((prev) =>
          prev.map((m) =>
            m.id === message.id ? { ...m, _status: 'pending' as const } : m
          )
        );
      }
      return;
    }

    // Pending media without outbox row — rebuild upload job from local URI.
    const localAudio = message.local_audio_uri;
    const localFile = message.local_file_uri;
    if (message.message_type === 'audio' && localAudio) {
      const item = {
        client_message_id: clientMessageId,
        chatId,
        chatType,
        payload: {},
        created_at: message.created_at || new Date().toISOString(),
        upload: {
          kind: 'audio' as const,
          localUri: localAudio,
          mime: message.file_type || (Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a'),
          fileName: message.file_name || 'voice.m4a',
          audioDuration: message.audio_duration || 0,
        },
      };
      await messageStorage.enqueueOutbox(item);
      const result = await flushOutboxItem(item, user?.id);
      if (result) {
        persistMessages((prev) =>
          prev.map((msg) =>
            msg.id === message.id || msg.client_message_id === clientMessageId
              ? ({
                  ...(result.message as unknown as Message),
                  client_message_id: clientMessageId,
                  profiles: msg.profiles,
                  _status: 'sent' as const,
                  local_audio_uri: msg.local_audio_uri,
                } as Message)
              : msg
          )
        );
      } else {
        persistMessages((prev) =>
          prev.map((m) =>
            m.id === message.id ? { ...m, _status: 'pending' as const } : m
          )
        );
      }
      return;
    }
    if (
      (message.message_type === 'image' ||
        message.message_type === 'video' ||
        message.message_type === 'file') &&
      localFile
    ) {
      const kind =
        message.message_type === 'image'
          ? ('image' as const)
          : message.message_type === 'video'
            ? ('video' as const)
            : ('file' as const);
      const item = {
        client_message_id: clientMessageId,
        chatId,
        chatType,
        payload: {},
        created_at: message.created_at || new Date().toISOString(),
        upload: {
          kind,
          localUri: localFile,
          mime: message.file_type || 'application/octet-stream',
          fileName: message.file_name || 'file',
          expires_at: message.expires_at,
          view_once: message.view_once,
        },
      };
      await messageStorage.enqueueOutbox(item);
      const result = await flushOutboxItem(item, user?.id);
      if (result) {
        persistMessages((prev) =>
          prev.map((msg) =>
            msg.id === message.id || msg.client_message_id === clientMessageId
              ? ({
                  ...(result.message as unknown as Message),
                  client_message_id: clientMessageId,
                  profiles: msg.profiles,
                  _status: 'sent' as const,
                  local_file_uri: msg.local_file_uri,
                  local_thumb_uri: msg.local_thumb_uri,
                } as Message)
              : msg
          )
        );
      } else {
        persistMessages((prev) =>
          prev.map((m) =>
            m.id === message.id ? { ...m, _status: 'pending' as const } : m
          )
        );
      }
      return;
    }

    await sendMessageToServer(message);
  };

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || !user?.id) return;

    if (editingMessage && !editingMessage.id.startsWith('temp-')) {
      try {
        const clear = messageText.trim();
        let editBody: {
          content: string;
          plaintext?: boolean;
          iv?: string;
          ephemeral_public_key?: string;
        } = { content: clear };

        const enc = await tryEncryptChatText({
          chatType,
          senderUserId: user?.id,
          chatId,
          cleartext: clear,
          memberUserIds: chatType === 'group' ? groupMemberUserIds : undefined,
        });
        if (enc) editBody = enc;

        const { message: updated } = await api.messages.edit(editingMessage.id, editBody);
        persistMessages((prev) =>
          prev.map((m) =>
            m.id === editingMessage.id
              ? {
                  ...m,
                  ...(updated as Message),
                  decrypted: clear,
                  _status: 'sent' as const,
                }
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
    const clientMessageId = generateClientMessageId();
    const tempId = generateTempId(clientMessageId);
    const replyId = replyTo?.id.startsWith('temp-') ? undefined : replyTo?.id;

    setComposerDraft('');
    setReplyTo(null);
    void messageStorage.clearDraft(chatId);

    const optimisticMessage: Message = {
      id: tempId,
      client_message_id: clientMessageId,
      content: messageContent,
      decrypted: messageContent,
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

    // Don't block send on a slow NetInfo round-trip — race a short probe with
    // the cached connectivity flag so encryption/network can start immediately.
    const onlineNow = await Promise.race([
      NetInfo.fetch()
        .then(
          (net) =>
            Boolean(net.isConnected) && net.isInternetReachable !== false
        )
        .catch(() => isOnline),
      new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(isOnline), 120);
      }),
    ]);

    if (!onlineNow) {
      const payload = buildChatSendPayload(chatType, chatId, {
        content: messageContent,
        message_type: 'text',
        client_message_id: clientMessageId,
        push_preview: messageContent.slice(0, 120),
        ...(replyId ? { reply_to_id: replyId } : {}),
      });
      // Encrypt now if keys are ready; flush will retry encrypt if still plaintext.
      {
        const enc = await tryEncryptChatText({
          chatType,
          senderUserId: user?.id,
          chatId,
          cleartext: messageContent,
          memberUserIds: chatType === 'group' ? groupMemberUserIds : undefined,
        });
        if (enc) Object.assign(payload, enc);
      }
      await messageStorage.enqueueOutbox({
        client_message_id: clientMessageId,
        chatId,
        chatType,
        payload,
        created_at: optimisticMessage.created_at,
      });
      persistMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId ? { ...msg, _status: 'pending' as const } : msg
        )
      );
      return;
    }

    await sendMessageToServer(optimisticMessage);
  };

  const sendVoiceMessage = async (audioUri: string, duration: number) => {
    if (!user?.id) return;

    const clientMessageId = generateClientMessageId();
    const tempId = generateTempId(clientMessageId);
    const fileName = `voice_message_${Date.now()}.${Platform.OS === 'web' ? 'webm' : 'm4a'}`;
    const mimeType = Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a';
    const localAudio = await persistChatMedia({
      chatId,
      clientMessageId,
      fromUri: audioUri,
      messageType: 'audio',
      fileName,
      mime: mimeType,
    });

    const optimisticMessage: Message = {
      id: tempId,
      client_message_id: clientMessageId,
      content: 'Voice message',
      created_at: new Date().toISOString(),
      sender_id: user.id,
      ...(chatType === 'individual'
        ? { receiver_id: chatId }
        : { group_id: chatId }),
      message_type: 'audio',
      audio_url: localAudio,
      audio_duration: Math.round(duration),
      file_name: fileName,
      file_type: mimeType,
      local_audio_uri: localAudio,
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

    const net = await NetInfo.fetch();
    const onlineNow =
      Boolean(net.isConnected) && net.isInternetReachable !== false;

    if (!onlineNow) {
      await messageStorage.enqueueOutbox({
        client_message_id: clientMessageId,
        chatId,
        chatType,
        payload: {},
        created_at: optimisticMessage.created_at,
        upload: {
          kind: 'audio',
          localUri: localAudio,
          mime: mimeType,
          fileName,
          audioDuration: Math.round(duration),
        },
      });
      persistMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId ? { ...msg, _status: 'pending' as const } : msg
        )
      );
      return;
    }

    await uploadAndSendVoiceMessage(optimisticMessage, localAudio, Math.round(duration));
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

      const clientMessageId = message.client_message_id || generateClientMessageId();
      const payload: Record<string, unknown> = {
        content: 'Voice message',
        message_type: 'audio',
        audio_url: publicUrl,
        audio_duration: duration,
        file_name: `voice_message_${Date.now()}.${Platform.OS === 'web' ? 'webm' : 'm4a'}`,
        file_type: mimeType,
        client_message_id: clientMessageId,
      };

      if (chatType === 'individual') {
        payload.receiver_id = chatId;
      } else {
        payload.group_id = chatId;
      }

      const { message: rawInsertedData } = await api.messages.send(payload);
      const insertedData = rawInsertedData as unknown as Message;
      await messageStorage.removeOutbox(clientMessageId);

      setMessages(prevMessages => {
        const updated: Message[] = prevMessages.map(msg =>
          msg.id === message.id || msg.client_message_id === clientMessageId
            ? ({
                ...insertedData,
                client_message_id: clientMessageId,
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

      const networkish =
        !(error instanceof ApiError) ||
        error.isNetworkError ||
        error.status === 0 ||
        error.status >= 500;

      persistMessages((prev) =>
        prev.map((msg) =>
          msg.id === message.id
            ? { ...msg, _status: networkish ? ('pending' as const) : ('failed' as const) }
            : msg
        )
      );

      if (networkish) {
        const clientMessageId = message.client_message_id || generateClientMessageId();
        await messageStorage.enqueueOutbox({
          client_message_id: clientMessageId,
          chatId,
          chatType,
          payload: {},
          created_at: message.created_at || new Date().toISOString(),
          upload: {
            kind: 'audio',
            localUri: audioUri,
            mime: Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a',
            fileName: message.file_name || 'voice.m4a',
            audioDuration: duration,
          },
        });
      } else {
        Alert.alert('Error', 'Failed to send voice message');
      }
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
    options?: {
      localThumbUri?: string;
      expiresAt?: string | null;
      viewOnce?: boolean;
      viewOnceAutoCloseSec?: number | null;
      caption?: string;
    }
  ) => {
    if (!user?.id) return;

    const clientMessageId = generateClientMessageId();
    const tempId = generateTempId(clientMessageId);
    const cleanFileName = name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const captionText = (options?.caption || '').trim();
    // Images/videos use caption as content; documents keep the file name as fallback.
    const displayContent =
      messageType === 'file' ? captionText || cleanFileName : captionText;

    // Paint the bubble immediately with the picked URI (WhatsApp-style).
    const optimisticMessage: Message = {
      id: tempId,
      client_message_id: clientMessageId,
      content: displayContent,
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
      ...(options?.viewOnce && options.viewOnceAutoCloseSec
        ? { view_once_auto_close_sec: options.viewOnceAutoCloseSec }
        : {}),
      profiles: {
        display_name: 'You',
        avatar_url: null,
        user_id: user.id,
      },
      _status: 'sending' as const,
      _uploadProgress: 0.05,
    };

    persistMessages((prev) => [...prev, optimisticMessage]);
    stickBeforeSend();
    setTimeout(() => scrollToBottom(), 50);

    // Persist to device storage in the background; update local URIs when ready.
    const localPersisted = await persistChatMedia({
      chatId,
      clientMessageId,
      fromUri: uri,
      messageType,
      fileName: cleanFileName,
      mime: type,
    });
    const localThumb = options?.localThumbUri
      ? await persistChatMedia({
          chatId,
          clientMessageId: `${clientMessageId}_thumb`,
          fromUri: options.localThumbUri,
          messageType: 'image',
          fileName: `${cleanFileName}_thumb.jpg`,
          mime: 'image/jpeg',
        })
      : undefined;

    if (localPersisted || localThumb) {
      persistMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? {
                ...m,
                local_file_uri: localPersisted || m.local_file_uri,
                file_url: localPersisted || m.file_url,
                local_thumb_uri: localThumb || m.local_thumb_uri,
              }
            : m
        )
      );
    }

    const net = await NetInfo.fetch();
    const onlineNow =
      Boolean(net.isConnected) && net.isInternetReachable !== false;

    if (!onlineNow) {
      await messageStorage.enqueueOutbox({
        client_message_id: clientMessageId,
        chatId,
        chatType,
        payload: {},
        created_at: optimisticMessage.created_at,
        upload: {
          kind: messageType,
          localUri: localPersisted || uri,
          mime: type,
          fileName: cleanFileName,
          expires_at: options?.expiresAt,
          view_once: options?.viewOnce,
          view_once_auto_close_sec: options?.viewOnce
            ? options.viewOnceAutoCloseSec ?? null
            : null,
          content: displayContent,
        },
      });
      persistMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, _status: 'pending' as const, _uploadProgress: undefined }
            : m
        )
      );
      return;
    }

    try {
      const storagePath = `${user.id}/files/${Date.now()}_${cleanFileName}`;
      const publicUrl = await uploadFromUri(
        'chat-files',
        storagePath,
        localPersisted || uri,
        type,
        (progress) => {
          persistMessages((prev) =>
            prev.map((m) =>
              m.id === tempId
                ? { ...m, _uploadProgress: progress, _status: 'sending' as const }
                : m
            )
          );
        }
      );

      const payload: Record<string, unknown> = {
        content: displayContent,
        message_type: messageType,
        file_url: publicUrl,
        file_name: cleanFileName,
        file_type: type,
        client_message_id: clientMessageId,
        ...(displayContent ? { push_preview: displayContent.slice(0, 120) } : {}),
      };

      if (options?.expiresAt) payload.expires_at = options.expiresAt;
      if (options?.viewOnce) payload.view_once = true;
      if (options?.viewOnce && options.viewOnceAutoCloseSec) {
        payload.view_once_auto_close_sec = options.viewOnceAutoCloseSec;
      }

      if (chatType === 'individual') {
        payload.receiver_id = chatId;
      } else {
        payload.group_id = chatId;
      }

      const { message: rawInsertedData } = await api.messages.send(payload);
      const insertedData = rawInsertedData as unknown as Message;
      await messageStorage.removeOutbox(clientMessageId);

      setMessages((prev) => {
        const updated = prev.map((msg) =>
          msg.id === tempId || msg.client_message_id === clientMessageId
            ? ({
                ...insertedData,
                content: displayContent || insertedData.content,
                client_message_id: clientMessageId,
                profiles: optimisticMessage.profiles,
                _status: 'sent' as const,
                _uploadProgress: undefined,
                local_file_uri: localPersisted || optimisticMessage.local_file_uri,
                local_thumb_uri: localThumb || optimisticMessage.local_thumb_uri,
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

      const networkish =
        !(error instanceof ApiError) ||
        error.isNetworkError ||
        error.status === 0 ||
        error.status >= 500;

      persistMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId
            ? {
                ...msg,
                _status: networkish ? ('pending' as const) : ('failed' as const),
                _uploadProgress: undefined,
              }
            : msg
        )
      );

      if (networkish) {
        await messageStorage.enqueueOutbox({
          client_message_id: clientMessageId,
          chatId,
          chatType,
          payload: {},
          created_at: optimisticMessage.created_at,
          upload: {
            kind: messageType,
            localUri: localPersisted || uri,
            mime: type,
            fileName: cleanFileName,
            expires_at: options?.expiresAt,
            view_once: options?.viewOnce,
            content: displayContent,
          },
        });
      } else {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        Alert.alert('Upload Failed', `Could not send ${messageType}. ${errMsg}`);
      }
    }
  };

  /* ------------------------------------------------------------------ */
  /*  ATTACHMENT HANDLING FUNCTIONS                                     */
  /* ------------------------------------------------------------------ */
  const handleSendFiles = useCallback(
    (files: AttachmentFile[]) => {
      if (!user?.id || files.length === 0) return;

      // Close preview immediately and show bubbles in the room.
      setPendingAttachments([]);
      setShowAttachmentPreview(false);

      void (async () => {
        await Promise.allSettled(
          files.map(async (file) => {
            try {
              let messageType: 'image' | 'video' | 'file' = 'file';

              if (file.type === 'photo') {
                messageType = 'image';
              } else if (file.type === 'video') {
                messageType = 'video';
              } else if (file.type === 'audio') {
                await sendVoiceMessage(file.uri, file.duration || 0);
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
                  viewOnceAutoCloseSec: file.viewOnceAutoCloseSec,
                  caption: file.caption,
                }
              );
            } catch (error) {
              console.error('Failed to send file:', error);
              Alert.alert('Error', `Failed to send ${file.type}`);
            }
          })
        );
      })();
    },
    [user?.id, sendVoiceMessage, uploadFile]
  );

  const handleSendSingleFile = useCallback(
    (file: AttachmentFile) => {
      if (!user?.id) return;
      setShowAttachmentPreview(false);
      setPendingAttachments((prev) => prev.filter((a) => a.id !== file.id));

      void (async () => {
        try {
          let messageType: 'image' | 'video' | 'file' = 'file';

          if (file.type === 'photo') {
            messageType = 'image';
          } else if (file.type === 'video') {
            messageType = 'video';
          } else if (file.type === 'audio') {
            await sendVoiceMessage(file.uri, file.duration || 0);
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
              viewOnceAutoCloseSec: file.viewOnceAutoCloseSec,
              caption: file.caption,
            }
          );
        } catch (error) {
          console.error('Failed to send single file:', error);
          Alert.alert('Error', `Failed to send ${file.type}`);
        }
      })();
    },
    [user?.id, sendVoiceMessage, uploadFile]
  );

  // Add function to handle attachments from ChatInput
  const handleAttachmentsSelected = useCallback((attachments: AttachmentFile[]) => {
    if (!attachments.length) return;
    setPendingAttachments((prev) => [...prev, ...attachments]);
    // Open on next tick so state has the files before the modal mounts.
    requestAnimationFrame(() => setShowAttachmentPreview(true));
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
    if (!user?.id || !chatId) return;
    resetForChat();
    void ensureChatReelTree();
    void fetchMessages();
  }, [user?.id, chatId, chatType]);

  // Apply clear-chat cutoff once preferences arrive (without blocking first paint).
  useEffect(() => {
    if (!settingsReady || !clearedAt) return;
    setMessages((prev) => {
      const next = filterByClearedAt(prev);
      if (next.length === prev.length) return prev;
      rememberChatThread(chatId, next);
      return next;
    });
  }, [settingsReady, clearedAt, chatId, filterByClearedAt]);

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

  /** Download remote media into Documents/ChatReel/{Images|Videos|Audio|Files}/ for offline open. */
  const ensureLocalMediaForMessage = useCallback(
    (msg: Message) => {
      if (Platform.OS === 'web') return;
      const key = msg.client_message_id || msg.id;
      if (!key || key.startsWith('temp-')) return;

      const remote =
        (msg.file_url && /^https?:\/\//i.test(msg.file_url) && msg.file_url) ||
        (msg.audio_url && /^https?:\/\//i.test(msg.audio_url) && msg.audio_url) ||
        null;
      if (!remote) return;
      if (msg.local_file_uri?.includes('/ChatReel/') || msg.local_audio_uri?.includes('/ChatReel/')) {
        return;
      }

      void cacheRemoteChatMedia({
        chatId,
        clientMessageId: key,
        remoteUrl: remote,
        messageType: msg.message_type,
        fileName: msg.file_name,
        mime: msg.file_type,
      }).then((localUri) => {
        if (!localUri) return;
        setMessages((prev) => {
          const next = prev.map((m) => {
            if (m.id !== msg.id && m.client_message_id !== msg.client_message_id) return m;
            if (msg.message_type === 'audio') {
              return { ...m, local_audio_uri: localUri };
            }
            return { ...m, local_file_uri: localUri };
          });
          void messageStorage.saveMessages(chatId, next);
          return next;
        });
      });
    },
    [chatId]
  );

  const upsertRealtimeMessage = useCallback(
    (raw: Message, event: 'INSERT' | 'UPDATE') => {
      if (!user?.id) return;

      const normalized = normalizeRealtimeMessage(raw, chatId, chatType, user.id);
      if (!messageBelongsToChat(normalized)) return;

      // View-once was opened / soft-deleted: remove for everyone.
      if (
        (normalized.view_once && normalized.viewed_at) ||
        (normalized.view_once && (normalized as { deleted_at?: string | null }).deleted_at)
      ) {
        consumedViewOnceIdsRef.current.add(normalized.id);
        persistMessages((prev) =>
          prev
            .filter((m) => m.id !== normalized.id)
            .map((m) =>
              m.id === normalized.id
                ? { ...m, file_url: undefined, local_file_uri: undefined, viewed_at: normalized.viewed_at }
                : m
            )
        );
        return;
      }

      // Disappearing timer started (or message already expired).
      if (isMessageExpired(normalized)) {
        persistMessages((prev) => prev.filter((m) => m.id !== normalized.id));
        return;
      }

      // Don't resurrect a view-once message the recipient already opened.
      if (consumedViewOnceIdsRef.current.has(normalized.id)) return;

      const isOutgoing = isOutgoingChatMessage(normalized, user.id);
      const isIncoming = isIncomingChatMessage(normalized, chatId, chatType, user.id);

      const fallbackProfile: Message['profiles'] = {
        display_name: isOutgoing ? 'You' : 'Unknown User',
        avatar_url: '',
        user_id: normalized.sender_id,
      };

      const incomingBase: Message = {
        ...normalized,
        profiles: normalized.profiles ?? fallbackProfile,
        _status: 'sent',
      };

      void (async () => {
        let incoming = await decryptChatMessage(incomingBase, user.id);

        // Preserve sender cleartext from optimistic/local rows when we can't re-decrypt.
        setMessages((prev) => {
          const existingById = prev.find((m) => m.id === incoming.id);
          const existingTemp =
            event === 'INSERT' && isOutgoing
              ? prev.find((m) => matchesOptimisticTemp(m, incoming, user.id))
              : undefined;
          const localHint = existingById || existingTemp;
          if (localHint) {
            incoming = preserveSenderCleartext(incoming, localHint, user.id);
          }

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
              decrypted: incoming.decrypted ?? existing.decrypted,
              // Realtime rows omit delivery flags — never let them wipe ticks.
              delivered: Boolean(existing.delivered || incoming.delivered) ||
                (isOutgoing && !String(incoming.id).startsWith('temp-')),
              is_read: Boolean(existing.is_read || incoming.is_read),
              _status:
                existing._status === 'pending' || existing._status === 'failed'
                  ? existing._status
                  : incoming._status ?? existing._status ?? 'sent',
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
                decrypted: incoming.decrypted ?? temp.decrypted ?? temp.content,
                _status: 'sent',
                delivered: true,
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

          // Soft catch-up only for partner inserts; avoid re-merging outbound ticks.
          setTimeout(() => void pullLatestMessagesRef.current(), 1200);
        }

        if (
          incoming.message_type === 'image' ||
          incoming.message_type === 'video' ||
          incoming.message_type === 'audio' ||
          incoming.message_type === 'file'
        ) {
          ensureLocalMediaForMessage(incoming);
        }

        if (!normalized.profiles && normalized.sender_id && isIncoming) {
          void api.profiles
            .getByUserId(normalized.sender_id)
            .then(({ profile: p }) => {
              if (!p) return;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === normalized.id ? { ...m, profiles: p as Message['profiles'] } : m
                )
              );
            })
            .catch(() => undefined);
        }
      })();
    },
    [
      messageBelongsToChat,
      user?.id,
      chatId,
      chatType,
      scrollToBottom,
      markSingleMessageAsRead,
      ensureLocalMediaForMessage,
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
      const incomingRaw = sanitizeChatMessages([...(raw as Message[])]).filter(
        messageBelongsToChat
      );
      if (incomingRaw.length === 0) return;

      const incoming = await decryptChatMessages(incomingRaw, user.id);

      setMessages((prev) => {
        const prevIds = new Set(prev.map((m) => m.id));
        const hasNew = incoming.some((m) => !prevIds.has(m.id));
        if (!hasNew) {
          // Still refresh decrypted / fields for existing encrypted rows.
          let changed = false;
          const next = prev.map((m) => {
            const fresh = incoming.find((x) => x.id === m.id);
            if (!fresh) return m;
            const expiresChanged =
              Boolean(fresh.expires_at) && fresh.expires_at !== m.expires_at;
            const readChanged = Boolean(fresh.is_read) && !m.is_read;
            const deliveredChanged = Boolean(fresh.delivered) && !m.delivered;
            const viewedChanged =
              Boolean(fresh.viewed_at) && fresh.viewed_at !== m.viewed_at;
            const decryptChanged =
              Boolean(fresh.decrypted) && fresh.decrypted !== m.decrypted;
            if (
              expiresChanged ||
              readChanged ||
              deliveredChanged ||
              viewedChanged ||
              decryptChanged
            ) {
              changed = true;
              return {
                ...m,
                ...fresh,
                decrypted: fresh.decrypted ?? m.decrypted,
                expires_at: fresh.expires_at ?? m.expires_at,
                is_read: Boolean(m.is_read || fresh.is_read),
                delivered:
                  Boolean(m.delivered || fresh.delivered) ||
                  (m.sender_id === user.id && !String(m.id).startsWith('temp-')),
                viewed_at: fresh.viewed_at ?? m.viewed_at,
                local_file_uri: m.local_file_uri ?? fresh.local_file_uri,
                local_audio_uri: m.local_audio_uri ?? fresh.local_audio_uri,
                _status: m._status === 'pending' || m._status === 'failed' ? m._status : m._status ?? 'sent',
              };
            }
            return m;
          });
          if (changed) {
            void messageStorage.saveMessages(chatId, next);
            return next;
          }
          return prev;
        }

        const pending = prev.filter(
          (m) =>
            m.id.startsWith('temp-') ||
            m._status === 'sending' ||
            m._status === 'pending' ||
            m._status === 'failed'
        );
        const incomingIds = new Set(incoming.map((m) => m.id));
        const incomingClientIds = new Set(
          incoming.map((m) => m.client_message_id).filter(Boolean) as string[]
        );
        const kept = prev.filter(
          (m) =>
            !incomingIds.has(m.id) &&
            !(m.client_message_id && incomingClientIds.has(m.client_message_id))
        );
        const uniquePending = pending.filter(
          (m) =>
            !incomingIds.has(m.id) &&
            !(m.client_message_id && incomingClientIds.has(m.client_message_id))
        );
        const merged = deduplicateMessages([...kept, ...incoming, ...uniquePending]);

        const readIds = new Set(prev.filter((m) => m.is_read).map((m) => m.id));
        const deliveredIds = new Set(prev.filter((m) => m.delivered).map((m) => m.id));
        const withReadState = merged.map((m) => ({
          ...m,
          is_read: readIds.has(m.id) || Boolean(m.is_read),
          delivered:
            deliveredIds.has(m.id) ||
            Boolean(m.delivered) ||
            (m.sender_id === user.id && !String(m.id).startsWith('temp-')),
        }));

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

  // Realtime-first while open: focus catch-up + rare safety poll (not a 2s heartbeat).
  useFocusEffect(
    useCallback(() => {
      void ensureSupabaseSession().then(() => {
        void pullLatestMessages();
        markMessagesAsRead();
      });

      // Suppress Expo message push while this room is open (Realtime delivers).
      setLocalActiveChatFocus({ chatId, chatType });
      // Give this room the full network/JS budget.
      cancelChatThreadsPrefetch();
      void api.profiles.setActiveChat(chatId, chatType).catch(() => undefined);

      const chatKey =
        chatType === 'group'
          ? `group:${chatId}`
          : user?.id && user.id < chatId
            ? `dm:${user.id}:${chatId}`
            : `dm:${chatId}:${user?.id}`;
      void import('../../lib/chatSocket').then((m) => {
        if (chatKey.includes('undefined')) return;
        m.subscribeChatSocket(chatKey);
      });

      const poll = setInterval(() => {
        void pullLatestMessages();
      }, 45_000);
      return () => {
        clearInterval(poll);
        setLocalActiveChatFocus(null);
        void api.profiles.setActiveChat(null).catch(() => undefined);
        void import('../../lib/chatSocket').then((m) => {
          if (!chatKey.includes('undefined')) m.unsubscribeChatSocket(chatKey);
        });
      };
    }, [markMessagesAsRead, pullLatestMessages, chatId, chatType, user?.id])
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
    await fetchMessages(true);
  }, [loadingMore, hasMore, fetchMessages, initialLoadComplete]);

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
      const nextUntil = isMuted ? null : new Date(Date.now() + 365 * 86400_000).toISOString();
      await api.chatSettings.update(chatType, chatId, {
        muted_until: nextUntil,
      });
      setChatMuted(!isMuted);
      void patchChatListMeta(chatType === 'group' ? 'group' : 'individual', chatId, {
        mutedUntil: nextUntil,
      });
      showAppToast(isMuted ? 'Chat unmuted' : 'Chat muted');
    } catch {
      showAppToast('Could not update mute setting', { isError: true });
    }
  }, [chatType, chatId]);

  const handleOpenSettings = useCallback(() => {
    navigation.navigate('Settings');
  }, [navigation]);

  const handleAddMembers = useCallback(() => {
    if (chatType !== 'group') return;
    navigation.navigate('FriendsList', {
      mode: 'select',
      groupId: chatId,
      groupName: chatName,
      existingMembers: groupMemberUserIds,
    });
  }, [chatType, chatId, chatName, groupMemberUserIds, navigation]);

  const handleBlockContact = useCallback(() => {
    if (chatType !== 'individual') return;
    Alert.alert(
      `Block ${chatName}?`,
      'They will no longer be able to call or message you.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await api.friendships.block(chatId);
                showAppToast(`${chatName} blocked`);
                navigation.goBack();
              } catch {
                showAppToast('Could not block user', { isError: true });
              }
            })();
          },
        },
      ]
    );
  }, [chatType, chatId, chatName, navigation]);

  const handleExportChat = useCallback(() => {
    const lines = visibleMessages
      .slice(-200)
      .map((m) => {
        const who = m.sender_id === user?.id ? 'You' : m.profiles?.display_name || 'Them';
        const body = m.content || m.file_name || `[${m.message_type}]`;
        return `${who}: ${body}`;
      })
      .join('\n');
    if (!lines) {
      showAppToast('No messages to copy');
      return;
    }
    void (async () => {
      try {
        const { setStringAsync } = await import('expo-clipboard');
        await setStringAsync(lines);
        showAppToast('Chat copied to clipboard');
      } catch {
        showAppToast('Could not copy chat', { isError: true });
      }
    })();
  }, [visibleMessages, user?.id]);

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
          clearChatThread(chatId);
          setMessages([]);
        },
      },
    ]);
  }, [chatType, chatId]);

  const handleWallpaper = useCallback(() => {
    // Wait for the ⋮ menu modal to finish closing before opening the picker.
    setTimeout(() => setWallpaperPickerOpen(true), 120);
  }, []);

  const wallpaperStorageKey = `chat_wallpaper:${chatType}:${chatId}`;

  const applyWallpaper = useCallback(
    (id: string | null) => {
      const persist = async () => {
        let value = id;
        if (isWallpaperImageUri(id) && id && Platform.OS !== 'web') {
          try {
            const root = FileSystem.documentDirectory;
            if (root) {
              const dir = `${root}wallpapers/`;
              const info = await FileSystem.getInfoAsync(dir);
              if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
              const ext = id.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
              const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext) ? ext : 'jpg';
              const dest = `${dir}${chatType}_${chatId}.${safeExt}`;
              await FileSystem.copyAsync({ from: id, to: dest });
              value = dest;
            }
          } catch {
            // Keep original picker URI if copy fails.
          }
        }
        setWallpaper(value);
        showAppToast(
          !value ? 'Default wallpaper' : isWallpaperImageUri(value) ? 'Photo wallpaper set' : 'Wallpaper updated'
        );
        void AsyncStorage.setItem(wallpaperStorageKey, value ?? '').catch(() => undefined);
        // Color ids sync to server; photo URIs stay on this device.
        if (!isWallpaperImageUri(value)) {
          void api.chatSettings
            .update(chatType, chatId, { wallpaper: value })
            .catch(() => {
              showAppToast('Saved on this device only');
            });
        }
      };
      void persist();
    },
    [chatType, chatId, wallpaperStorageKey]
  );

  const startChatCall = useCallback(
    async (type: 'voice' | 'video') => {
      if (!chatId) return;
      if (chatType === 'individual') {
        if (!user?.id) {
          showAppToast('You must be signed in to place a call', { isError: true });
          return;
        }
        if (chatId === user.id) {
          showAppToast('Cannot call yourself', { isError: true });
          return;
        }
      }
      try {
        // Individual chats use auth user id as chatId (see ChatListScreen).
        const body =
          chatType === 'group'
            ? { type, group_id: chatId }
            : { type, callee_id: chatId };
        const { startCallGuarded } = await import('../../lib/startCallGuarded');
        const { call, live_kit } = await startCallGuarded(body, {
          peerName: chatName,
          peerAvatar: avatarUrl ?? null,
        });
        if (!live_kit?.token || !live_kit?.url) {
          showAppToast('Call started but media token was missing — try again', {
            isError: true,
          });
          return;
        }
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
        showAppToast(String(message), { isError: true });
      }
    },
    [avatarUrl, chatId, chatName, chatType, user?.id]
  );

  const joinGroupCall = useCallback(async () => {
    const call = activeGroupCall.call;
    if (!call) return;
    try {
      const { call: accepted, live_kit } = await api.calls.accept(call.id);
      const { replaceWithActiveCall } = await import('../../navigation/rootNavigation');
      replaceWithActiveCall({
        call: accepted,
        token: live_kit.token,
        url: live_kit.url,
      });
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? (err as { message: string }).message
          : 'Could not join call';
      showAppToast(String(message), { isError: true });
    }
  }, [activeGroupCall.call]);

  /* ------------------------------------------------------------------ */
  /*  UTILITY FUNCTIONS                                                 */
  /* ------------------------------------------------------------------ */
  const getImageUri = getMediaUri;

  const chatMediaItems = useMemo((): ChatMediaItem[] => {
    return visibleMessages
      .filter((m) => m.message_type === 'image' || m.message_type === 'video')
      .filter((m) => {
        if (!m.view_once) return true;
        return !m.viewed_at;
      })
      .map((m) => {
        const captionText = (m.decrypted || m.content || '').trim();
        const showCaption =
          Boolean(captionText) &&
          captionText !== (m.file_name || '') &&
          !/^[a-zA-Z0-9._-]+\.(jpe?g|png|gif|webp|heic|mp4|mov|mkv|pdf|docx?)$/i.test(
            captionText
          );
        return {
          id: m.id,
          type: m.message_type as 'image' | 'video',
          uri: getImageUri(m),
          senderName: m.profiles?.display_name,
          createdAt: m.created_at,
          caption: showCaption ? captionText : undefined,
          viewOnce: Boolean(m.view_once),
          autoCloseSec: m.view_once_auto_close_sec ?? null,
        };
      })
      .filter((item) => Boolean(item.uri));
  }, [visibleMessages, getImageUri]);

  const handleViewMedia = useCallback(() => {
    setSharedMediaOpen(true);
  }, []);

  const menuItems: MenuItem[] = useMemo(() => {
    const items: MenuItem[] = [
      {
        title: chatType === 'individual' ? 'View contact' : 'Group info',
        icon: chatType === 'individual' ? 'person-outline' : 'people-outline',
        onPress: handleInfoPress,
      },
      { title: 'Search', icon: 'search-outline', onPress: () => setSearchVisible(true) },
      {
        title: 'Media, links & docs',
        icon: 'images-outline',
        onPress: handleViewMedia,
      },
      {
        title: chatMuted ? 'Unmute notifications' : 'Mute notifications',
        icon: chatMuted ? 'notifications-outline' : 'notifications-off-outline',
        onPress: () => void handleMuteChat(),
      },
      {
        title: 'Wallpaper',
        icon: 'color-palette-outline',
        onPress: handleWallpaper,
      },
      {
        title: disappearAfterSeconds
          ? `Disappearing · ${disappearLabel(disappearAfterSeconds)}`
          : 'Disappearing messages',
        icon: 'timer-outline',
        onPress: handleDisappearingMessages,
      },
      {
        title: 'Copy chat',
        icon: 'copy-outline',
        onPress: handleExportChat,
      },
      {
        title: 'Chat settings',
        icon: 'settings-outline',
        onPress: handleOpenSettings,
      },
    ];

    if (chatType === 'group') {
      items.splice(1, 0, {
        title: 'Add members',
        icon: 'person-add-outline',
        onPress: handleAddMembers,
      });
    }

    if (chatType === 'individual') {
      items.push({
        title: 'Block',
        icon: 'ban-outline',
        onPress: handleBlockContact,
        destructive: true,
      });
    }

    items.push({
      title: 'Clear chat',
      icon: 'trash-outline',
      onPress: handleClearChat,
      destructive: true,
    });

    return items;
  }, [
    chatType,
    chatMuted,
    disappearAfterSeconds,
    handleInfoPress,
    handleMuteChat,
    handleClearChat,
    handleWallpaper,
    handleDisappearingMessages,
    handleViewMedia,
    handleOpenSettings,
    handleAddMembers,
    handleBlockContact,
    handleExportChat,
  ]);

  const openMediaViewer = useCallback(
    (messageId: string) => {
      const msg = replyLookup.get(messageId);
      if (!msg) return;

      const uri = getImageUri(msg);
      if (!uri) return;

      const captionText = (msg.decrypted || msg.content || '').trim();
      const showCaption =
        Boolean(captionText) &&
        captionText !== (msg.file_name || '') &&
        !/^[a-zA-Z0-9._-]+\.(jpe?g|png|gif|webp|heic|mp4|mov|mkv|pdf|docx?)$/i.test(
          captionText
        );

      const snapshotItem: ChatMediaItem = {
        id: msg.id,
        type: (msg.message_type === 'video' ? 'video' : 'image') as 'image' | 'video',
        uri,
        senderName: msg.profiles?.display_name,
        createdAt: msg.created_at,
        caption: showCaption ? captionText : undefined,
        viewOnce: Boolean(msg.view_once),
        autoCloseSec: msg.view_once_auto_close_sec ?? null,
      };

      // Freeze a session copy — never strip URI before the viewer mounts (crash fix).
      let items = chatMediaItems.map((item) =>
        item.id === messageId
          ? {
              ...item,
              uri,
              caption: snapshotItem.caption,
              autoCloseSec: snapshotItem.autoCloseSec,
            }
          : item
      );
      let idx = items.findIndex((item) => item.id === messageId);
      if (idx < 0) {
        items = [snapshotItem];
        idx = 0;
      }

      let consumeId: string | null = null;
      if (msg.view_once && msg.sender_id !== user?.id && !msg.viewed_at) {
        consumeId = messageId;
        void api.messages.markViewed(messageId).catch(() => undefined);
      }

      setMediaViewer({
        visible: true,
        index: Math.max(0, idx),
        items,
        consumeId,
      });
    },
    [chatMediaItems, replyLookup, user?.id, getImageUri]
  );

  const closeMediaViewer = useCallback(() => {
    setMediaViewer((prev) => {
      const consumed = prev.consumeId;
      if (consumed) {
        // Strip + remove only after the viewer closes.
        persistMessages((list) =>
          list
            .map((m) =>
              m.id === consumed
                ? {
                    ...m,
                    viewed_at: m.viewed_at || new Date().toISOString(),
                    file_url: undefined,
                    local_file_uri: undefined,
                  }
                : m
            )
            .filter((m) => m.id !== consumed)
        );
      }
      return { visible: false, index: 0, items: [], consumeId: null };
    });
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
                  source={
                    profile?.avatar_url
                      ? { uri: profile.avatar_url }
                      : undefined
                  }
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
        translatedText={translations[msg.id] ?? null}
      />
    );
  };


  /* ------------------------------------------------------------------ */
  /*  MAIN RENDER                                                       */
  /* ------------------------------------------------------------------ */
  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: chatBgColor }]}
      edges={['left', 'right']}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor={theme.headerBg}
        translucent={false}
      />
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.headerBg,
            marginTop: -insets.top,
            paddingTop: insets.top,
            height: 70 + insets.top,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.headerIconBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={theme.headerText} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerInfo} onPress={handleInfoPress}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.headerAvatar} />
            ) : (
              <View style={[styles.headerAvatar, styles.headerAvatarFallback]}>
                <Ionicons name="person" size={22} color={theme.headerStatus} />
              </View>
            )}
            <View style={styles.headerText}>
              <Text style={[styles.headerName, { color: theme.headerText }]} numberOfLines={1}>
                {chatName}
              </Text>
              <Text style={[styles.headerStatus, { color: theme.headerStatus }]} numberOfLines={1}>
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
          <TouchableOpacity
            onPress={() => void startChatCall('video')}
            style={styles.headerIconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Video call"
          >
            <Ionicons name="videocam" size={24} color={theme.headerText} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => void startChatCall('voice')}
            style={styles.headerIconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Voice call"
          >
            <Ionicons name="call" size={22} color={theme.headerText} />
          </TouchableOpacity>
          <ChatMenuDropdown items={menuItems} iconColor={theme.headerText} />
        </View>
      </View>

      {chatType === 'group' && activeGroupCall.canJoin && activeGroupCall.call && (
        <GroupCallBanner
          call={activeGroupCall.call}
          joinedCount={activeGroupCall.joinedCount}
          onJoin={() => void joinGroupCall()}
        />
      )}

      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: chatBgColor, paddingBottom: androidKeyboardPad }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={keyboardVerticalOffset}
        enabled={Platform.OS === 'ios'}
      >
        <View style={[styles.chatBody, { backgroundColor: chatBgColor }]}>
          {wallpaperImageUri ? (
            <ImageBackground
              source={{ uri: wallpaperImageUri }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            >
              <View style={styles.wallpaperDim} />
            </ImageBackground>
          ) : null}
          {pinnedMessages.length > 0 ? (
            <TouchableOpacity
              style={[
                styles.pinnedBar,
                {
                  backgroundColor: theme.isDark ? theme.listCardBg : '#fff',
                  borderBottomColor: theme.listBorder,
                },
              ]}
              onPress={() => {
                const idx = pinFocusIdx % pinnedMessages.length;
                const target = pinnedMessages[idx];
                if (target) scrollToMessage(target.id);
                setPinFocusIdx((i) => i + 1);
              }}
            >
              <Ionicons name="pin" size={16} color={chatTheme.primary} />
              <Text
                style={[
                  styles.pinnedText,
                  { color: theme.isDark ? theme.listPrimaryText : '#444' },
                ]}
                numberOfLines={1}
              >
                {(pinnedMessages[pinFocusIdx % pinnedMessages.length]?.content ||
                  pinnedMessages[pinFocusIdx % pinnedMessages.length]?.file_name ||
                  'Pinned message')}
              </Text>
              {pinnedMessages.length > 1 ? (
                <Text
                  style={[
                    styles.pinnedCount,
                    { color: theme.isDark ? theme.listSecondaryText : '#888' },
                  ]}
                >
                  {pinnedMessages.length} pinned
                </Text>
              ) : null}
            </TouchableOpacity>
          ) : null}
          <FlatList
            ref={flatListRef}
            data={chatRows}
            extraData={`${visibleMessages.length}:${listTailId}:${chatRows.length}:${isPlayingAudio ?? ''}:${searchHitId ?? ''}:${wallpaper ?? ''}:${Object.keys(translations).length}`}
            renderItem={renderChatRow}
            keyExtractor={(item) => item.key}
            style={{ flex: 1, backgroundColor: 'transparent' }}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onScrollToIndexFailed={(info) => {
              const approx = Math.max(0, info.averageItemLength * info.index);
              flatListRef.current?.scrollToOffset?.({ offset: approx, animated: true });
              setTimeout(() => {
                flatListRef.current?.scrollToIndex?.({
                  index: info.index,
                  animated: true,
                  viewPosition: 0.35,
                });
              }, 120);
            }}
            ListEmptyComponent={
              !initialLoadComplete ? (
                <ChatLoadingSkeleton theme={theme} />
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
              ) : hasMore && nearTop ? (
                <View style={styles.loadingMoreContainer}>
                  <Text style={styles.loadingMoreText}>Pull down for older messages</Text>
                </View>
              ) : hasMore ? (
                <View style={styles.loadingMoreContainer}>
                  <Text style={[styles.loadingMoreText, { opacity: 0.55 }]}>
                    Scroll up · pull to load older
                  </Text>
                </View>
              ) : null
            }
            refreshControl={
              hasMore && initialLoadComplete ? (
                <RefreshControl
                  refreshing={loadingMore}
                  onRefresh={() => {
                    void loadMoreMessages();
                  }}
                  tintColor={chatTheme.primary}
                  colors={[chatTheme.primary]}
                  progressViewOffset={8}
                />
              ) : undefined
            }
            initialNumToRender={20}
            maxToRenderPerBatch={12}
            windowSize={11}
            removeClippedSubviews={false}
            maintainVisibleContentPosition={
              Platform.OS === 'web'
                ? undefined
                : { minIndexForVisible: 0 }
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
          style={{ paddingBottom: isKeyboardVisible ? 6 : insets.bottom }}
          disabled={!user?.id}
        />
      </KeyboardAvoidingView>

      <DisappearTimerSheet
        visible={disappearSheetOpen}
        currentSeconds={disappearAfterSeconds}
        onClose={() => setDisappearSheetOpen(false)}
        onSave={(seconds) => void saveDisappearingMessages(seconds)}
      />

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
        onBeginSend={() => setShowAttachmentPreview(false)}
        onSendSingle={handleSendSingleFile}
      />

      <ChatMediaViewer
        items={mediaViewer.items}
        initialIndex={mediaViewer.index}
        visible={mediaViewer.visible}
        onClose={closeMediaViewer}
      />

      <ChatSharedMediaSheet
        visible={sharedMediaOpen}
        messages={visibleMessages}
        chatName={chatName}
        onClose={() => setSharedMediaOpen(false)}
        onOpenMedia={(messageId) => {
          setSharedMediaOpen(false);
          openMediaViewer(messageId);
        }}
        onJumpToMessage={(messageId) => {
          setSharedMediaOpen(false);
          setTimeout(() => scrollToMessage(messageId), 80);
        }}
      />

      <ChatSearchOverlay
        visible={searchVisible}
        messages={visibleMessages}
        onClose={() => setSearchVisible(false)}
        onSelect={(messageId) => {
          setSearchVisible(false);
          // Allow the popup to close before scrolling.
          setTimeout(() => scrollToMessage(messageId), 60);
        }}
      />

      <WallpaperPickerSheet
        visible={wallpaperPickerOpen}
        selectedId={wallpaper}
        onClose={() => setWallpaperPickerOpen(false)}
        onSelect={applyWallpaper}
      />

      <MessageActionSheet
        visible={!!actionMessage}
        message={actionMessage}
        isOutgoing={actionMessage?.sender_id === user?.id}
        isGroup={chatType === 'group'}
        isStarred={actionMessage ? starredIds.includes(actionMessage.id) : false}
        isPinned={
          !!actionMessage && pinnedMessages.some((m) => m.id === actionMessage.id)
        }
        canEdit={
          !!actionMessage &&
          actionMessage.sender_id === user?.id &&
          actionMessage.message_type === 'text' &&
          !actionMessage.id.startsWith('temp-') &&
          isWithinMinutes(actionMessage.created_at, 5)
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

      <ChatRoomLockCover
        kind={roomKind}
        chatId={chatId}
        chatName={chatName}
        onBack={() => navigation.goBack()}
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
    overflow: 'hidden',
  },
  wallpaperDim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: chatTheme.headerBg,
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
  headerAvatarFallback: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
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
    gap: 2,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
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
  pinnedCount: {
    fontSize: 12,
    fontWeight: '600',
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
