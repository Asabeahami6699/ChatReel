// src/screens/Chat/ChatListScreen.tsx
import React, { useState, useEffect, useMemo, useCallback, useLayoutEffect, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  useWindowDimensions,
  Platform,
  Modal,
  Pressable,
  ScrollView,
  Animated,
  Easing,
  StatusBar,
} from 'react-native'
import { ChatListAvatar } from '../../components/ChatListAvatar'
import { ChatListRow, ChatListScrollPane } from '../../components/ChatListRow'
import { useChatReminders } from '../../hooks/useChatReminders'
import {
  formatReminderWhen,
  pickChatReminder,
  reminderUrgency,
} from '../../lib/chatReminders'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { TextInput, FAB, Button } from 'react-native-paper'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuth } from '../../hooks/useAuth'
import { withoutGhostSelfChats } from '../../lib/chatListSanitize'
import { promptSignIn } from '../../lib/requireSignedIn'
import { TabView } from 'react-native-tab-view'
import { LinearGradient } from 'expo-linear-gradient'
import { useIndividualChats, type IndividualChat } from '../../hooks/useIndividualChats'
import DropdownMenu from '../../components/DropdownMenu'
import Portal from '../../components/Portal'
import { useNavigation, useFocusEffect, useIsFocused } from '@react-navigation/native'
import { useGroupList, type Group } from '../../hooks/useGroupList'
import { useIncomingFriendRequestCount } from '../../hooks/useIncomingFriendRequestCount'
import { useCurrentProfileId } from '../../hooks/useCurrentProfileId'
import { useFriendshipsRealtime } from '../../hooks/useFriendshipsRealtime'
import { useChatSettings } from '../../context/ChatSettingsContext'
import { useChatLock } from '../../context/ChatLockContext'
import { api } from '../../lib/api'
import { scheduleChatThreadsPrefetch } from '../../lib/chatThreadsPrefetch'
import FriendRequestsScreen from './FriendRequestsScreen'
import {
  registerMobileChatOpener,
  unregisterMobileChatOpener,
} from '../../navigation/chatNavigationBridge'
import { FloatingActionMenu } from '../../components/FloatingActionMenu'
import {
  chatListKey,
  loadHiddenChatKeys,
  type ChatListEntryKind,
} from '../../lib/chatListHidden'
import {
  hasVaultPin,
  hideChatInVault,
  looksLikeVaultCode,
  loadVaultEntries,
  verifyVaultPin,
  type VaultChatEntry,
} from '../../lib/chatVault'
import { SecretSpaceSheet } from '../../components/SecretSpaceSheet'
import { loadChatListMeta, patchChatListMeta, type ChatListMeta } from '../../lib/chatListMeta'
import { subscribeLocalStore } from '../../lib/localMessageBus'
import { messageStorage } from '../../utils/messageStorage'
import { rememberChatThread, recallChatThread } from '../../lib/chatThreadCache'
import { useAppBadge } from '../../hooks/useAppBadge'
import { showAppToast } from '../../lib/appToast'
import { MOBILE_BREAKPOINT } from '../../navigation/navigationUtils'

type Props = { setSelectedChat?: (chat: any) => void }

const APP_LOGO = require('../../../assets/favIconChat.png')
const APP_NAME = 'ChatReel'
const SEARCH_HISTORY_KEY = 'chat_list_search_history'
const MAX_SEARCH_HISTORY = 8

const ALL_FAB_ACTIONS = [
  { key: 'add-friend', label: 'Add friend', icon: 'person-add' as const, route: 'AddFriend' },
  { key: 'friends-list', label: 'Friends list', icon: 'people-circle' as const, route: 'FriendsList' },
] as const

const GROUP_FAB_ACTIONS = [
  { key: 'create-group', label: 'Create group', icon: 'people' as const, route: 'NewGroup' },
  { key: 'group-list', label: 'Group list', icon: 'list' as const, route: 'GroupsList' },
] as const

type FabAction = {
  key: string
  label: string
  icon: React.ComponentProps<typeof Ionicons>['name']
  route: string
}

type FriendSearchRow = {
  user_id: string
  name: string
  email?: string
  avatar_url?: string
}

type SearchSuggestion =
  | {
      kind: 'chat'
      key: string
      userId: string
      name: string
      avatar?: string
      subtitle: string
    }
  | {
      kind: 'group'
      key: string
      groupId: string
      name: string
      avatar?: string | null
      subtitle: string
    }
  | {
      kind: 'friend'
      key: string
      userId: string
      name: string
      avatar?: string
      subtitle: string
    }

type IncomingRequestRow = {
  friendshipId: string
  id: string
  display_name: string
  email?: string
  avatar_url?: string
  created_at: string
}

type AllFeedItem =
  | { kind: 'chat'; key: string; sortAt: string; item: IndividualChat }
  | { kind: 'group'; key: string; sortAt: string; item: Group }
  | { kind: 'request'; key: string; sortAt: string; item: IncomingRequestRow }

type ListFilter = 'all' | 'unread' | 'muted'

const HIDDEN_LIST_FILTERS: { key: Exclude<ListFilter, 'all'>; label: string }[] = [
  { key: 'unread', label: 'Unread' },
  { key: 'muted', label: 'Muted' },
]

export default function ChatListScreen({ setSelectedChat }: Props) {
  const { user, isGuest, exitGuest } = useAuth()
  const { theme, settings, updateSettings } = useChatSettings()
  const { locked, unlock, isChatProtected, scope } = useChatLock()
  const isFocused = useIsFocused()
  const myProfileId = useCurrentProfileId()
  const navigation = useNavigation<any>()
  const { width, height: windowHeight } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const isNarrow = width < 400
  const isWebDesktop = Platform.OS === 'web' && width >= MOBILE_BREAKPOINT
  const fabBottom = Math.max(16, insets.bottom + 12) + (setSelectedChat ? 4 : 20)
  /** Modal FAB is viewport-absolute; on desktop keep it aligned with the list panel. */
  const listHostRef = useRef<View>(null)
  const [fabMenuRight, setFabMenuRight] = useState(12)
  const { reminders, reload: reloadReminders } = useChatReminders()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchAnchor, setSearchAnchor] = useState({ top: 56, left: 12, width: 320 })
  const [listFilter, setListFilter] = useState<ListFilter>('all')
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [searchHistory, setSearchHistory] = useState<string[]>([])
  const [friends, setFriends] = useState<FriendSearchRow[]>([])
  const [hiddenChatKeys, setHiddenChatKeys] = useState<Set<string>>(new Set())
  const [listMeta, setListMeta] = useState<Record<string, ChatListMeta>>({})
  const [chatMenu, setChatMenu] = useState<{
    x: number
    y: number
    kind: ChatListEntryKind
    id: string
    name: string
    avatarUrl?: string | null
  } | null>(null)
  const [secretSpaceOpen, setSecretSpaceOpen] = useState(false)
  const [secretPreUnlocked, setSecretPreUnlocked] = useState(false)
  const [pendingHide, setPendingHide] = useState<{
    kind: ChatListEntryKind
    id: string
    name: string
    avatarUrl?: string | null
  } | null>(null)
  const [vaultCount, setVaultCount] = useState(0)
  const vaultSessionUntilRef = useRef(0)
  const [incomingRequests, setIncomingRequests] = useState<IncomingRequestRow[]>([])
  const [requestsLoading, setRequestsLoading] = useState(false)
  const searchInputRef = useRef<React.ComponentRef<typeof TextInput>>(null)
  const searchToggleRef = useRef<View>(null)
  const fabMenuAnim = useRef(new Animated.Value(0)).current
  const [fabMenuOpen, setFabMenuOpen] = useState(false)
  const [index, setIndex] = useState(0)

  // Track unread counts per tab (stored in state to persist between renders)
  const [individualUnreadCount, setIndividualUnreadCount] = useState(0)
  const [groupUnreadCount, setGroupUnreadCount] = useState(0)
  const incomingRequestCount = useIncomingFriendRequestCount()
  const [requestsUnreadCount, setRequestsUnreadCount] = useState(0)

  useEffect(() => {
    if (!user?.id) return
    AsyncStorage.getItem(`${SEARCH_HISTORY_KEY}:${user.id}`)
      .then((raw) => {
        if (!raw) return
        const parsed = JSON.parse(raw) as unknown
        if (Array.isArray(parsed)) {
          setSearchHistory(parsed.filter((item): item is string => typeof item === 'string'))
        }
      })
      .catch(() => undefined)
  }, [user?.id])

  const persistSearchHistory = useCallback(
    (items: string[]) => {
      setSearchHistory(items)
      if (!user?.id) return
      void AsyncStorage.setItem(`${SEARCH_HISTORY_KEY}:${user.id}`, JSON.stringify(items))
    },
    [user?.id]
  )

  const addToSearchHistory = useCallback(
    (query: string) => {
      const trimmed = query.trim()
      if (!trimmed) return
      const next = [trimmed, ...searchHistory.filter((q) => q !== trimmed)].slice(0, MAX_SEARCH_HISTORY)
      persistSearchHistory(next)
    },
    [persistSearchHistory, searchHistory]
  )

  const removeFromSearchHistory = useCallback(
    (query: string) => {
      persistSearchHistory(searchHistory.filter((q) => q !== query))
    },
    [persistSearchHistory, searchHistory]
  )

  const clearSearchHistory = useCallback(() => {
    persistSearchHistory([])
  }, [persistSearchHistory])

  const visibleSearchHistory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return searchHistory
    return searchHistory.filter((item) => item.toLowerCase().includes(q))
  }, [searchHistory, searchQuery])

  useEffect(() => {
    setRequestsUnreadCount(incomingRequestCount)
  }, [incomingRequestCount])

  // Register cross-tab chat opener (reel share, etc.).
  useLayoutEffect(() => {
    if (setSelectedChat) return;
    const tabNav = navigation.getParent();
    if (!tabNav) return;
    registerMobileChatOpener((params) => {
      tabNav.navigate('Chats', {
        screen: 'ChatRoom',
        params,
      });
    });
    return () => unregisterMobileChatOpener();
  }, [navigation, setSelectedChat]);

  const routes = useMemo(
    () => [
      { key: 'all', title: 'All' },
      { key: 'friends', title: 'Friends' },
      { key: 'group', title: 'Groups' },
      { key: 'requests', title: 'Requests' },
    ],
    []
  )

  const totalUnreadCount = individualUnreadCount + groupUnreadCount
  useAppBadge(totalUnreadCount)

  const getTabBadgeCount = useCallback(
    (tabKey: string) => {
      if (tabKey === 'all') return totalUnreadCount + requestsUnreadCount
      if (tabKey === 'friends') return individualUnreadCount
      if (tabKey === 'group') return groupUnreadCount
      if (tabKey === 'requests') return requestsUnreadCount
      return 0
    },
    [groupUnreadCount, individualUnreadCount, requestsUnreadCount, totalUnreadCount]
  )

  
  // Use the custom hooks
  const { 
    chats: individualChats, 
    loading: individualLoading, 
    refreshing: individualRefreshing, 
    refresh: refreshIndividuals,
    softRefresh: softRefreshIndividuals,
    isOnline: individualOnline,
    isDataStale: individualStale,
    markMessagesAsRead 
  } = useIndividualChats(searchQuery)

  const {
    groups: groupChats,
    loading: groupsLoading,
    refreshing: groupsRefreshing,
    refresh: refreshGroups,
    softRefresh: softRefreshGroups,
    isOnline: groupsOnline,
    isDataStale: groupsStale,
    markGroupMessagesAsRead
  } = useGroupList(searchQuery)

  const reloadHiddenChats = useCallback(async () => {
    const [keys, meta, vault] = await Promise.all([
      loadHiddenChatKeys(),
      loadChatListMeta(),
      loadVaultEntries(),
    ])
    setHiddenChatKeys(keys)
    setListMeta(meta)
    setVaultCount(vault.length)
  }, [])

  useFocusEffect(
    useCallback(() => {
      void reloadHiddenChats()
    }, [reloadHiddenChats])
  )

  // Live-update muted/archived meta when another screen patches chat list meta.
  useEffect(() => {
    return subscribeLocalStore((event) => {
      if (event.reason === 'index') {
        void reloadHiddenChats()
      }
    })
  }, [reloadHiddenChats])

  const visibleIndividualChats = useMemo(
    () =>
      withoutGhostSelfChats(individualChats, user?.id).filter((c) => {
        const key = chatListKey('individual', c.user_id)
        return !hiddenChatKeys.has(key) && !listMeta[key]?.archived
      }),
    [individualChats, hiddenChatKeys, listMeta, user?.id]
  )

  const visibleGroupChats = useMemo(
    () =>
      groupChats.filter((g) => {
        const key = chatListKey('group', g.id)
        return !hiddenChatKeys.has(key) && !listMeta[key]?.archived
      }),
    [groupChats, hiddenChatKeys, listMeta]
  )

  const isMutedEntry = useCallback(
    (kind: ChatListEntryKind, id: string) => {
      const until = listMeta[chatListKey(kind, id)]?.mutedUntil
      return Boolean(until && new Date(until) > new Date())
    },
    [listMeta]
  )

  const filteredIndividualChats = useMemo(() => {
    let list = visibleIndividualChats
    if (listFilter === 'unread') list = list.filter((c) => (c.unread_count ?? 0) > 0)
    if (listFilter === 'muted') list = list.filter((c) => isMutedEntry('individual', c.user_id))
    return list
  }, [visibleIndividualChats, listFilter, isMutedEntry])

  const filteredGroupChats = useMemo(() => {
    let list = visibleGroupChats
    if (listFilter === 'unread') list = list.filter((g) => (g.unread_count ?? 0) > 0)
    if (listFilter === 'muted') list = list.filter((g) => isMutedEntry('group', g.id))
    return list
  }, [visibleGroupChats, listFilter, isMutedEntry])

  const fetchFriends = useCallback(async () => {
    if (!myProfileId) return
    try {
      const { friendships: data } = await api.friendships.list('accepted')
      const rows =
        (data ?? [])
          .map((f: Record<string, unknown>) => {
            const isSender = f.user_id === myProfileId
            const profile = (isSender ? f.receiver_profile : f.sender_profile) as {
              user_id?: string
              display_name?: string | null
              email?: string | null
              avatar_url?: string | null
            } | null
            if (!profile?.user_id) return null
            return {
              user_id: profile.user_id,
              name:
                profile.display_name?.trim() ||
                profile.email?.split('@')[0] ||
                'Friend',
              email: profile.email ?? undefined,
              avatar_url: profile.avatar_url ?? undefined,
            }
          })
          .filter((f): f is FriendSearchRow => Boolean(f)) ?? []

      const unique = Array.from(new Map(rows.map((f) => [f.user_id, f])).values())
      setFriends(unique)
    } catch {
      /* ignore */
    }
  }, [myProfileId])

  const fetchIncomingRequests = useCallback(async () => {
    if (!myProfileId) return
    setRequestsLoading(true)
    try {
      const { incoming } = await api.friendships.requests()
      const rows =
        (incoming ?? [])
          .map((r: Record<string, unknown>) => ({
            friendshipId: String(r.friendshipId ?? r.id ?? ''),
            id: String(r.id ?? ''),
            display_name: String(r.display_name ?? r.email ?? 'User'),
            email: r.email ? String(r.email) : undefined,
            avatar_url: r.avatar_url ? String(r.avatar_url) : undefined,
            created_at: String(r.created_at ?? ''),
          }))
          .filter((r) => r.friendshipId) ?? []
      setIncomingRequests(rows)
    } catch {
      /* ignore */
    } finally {
      setRequestsLoading(false)
    }
  }, [myProfileId])

  const refreshFriendData = useCallback(() => {
    void fetchFriends()
    void fetchIncomingRequests()
  }, [fetchFriends, fetchIncomingRequests])

  useFriendshipsRealtime(myProfileId, refreshFriendData)

  const searchSuggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return null

    const chatUserIds = new Set(individualChats.map((c) => c.user_id))

    const chats: SearchSuggestion[] = individualChats.slice(0, 6).map((c) => ({
      kind: 'chat',
      key: `chat-${c.user_id}`,
      userId: c.user_id,
      name: c.name,
      avatar: c.avatar_url,
      subtitle: c.last_message || 'Direct chat',
    }))

    const groups: SearchSuggestion[] = groupChats.slice(0, 6).map((g) => ({
      kind: 'group',
      key: `group-${g.id}`,
      groupId: g.id,
      name: g.name,
      avatar: g.avatar_url,
      subtitle: g.last_message || `${g.member_count} members`,
    }))

    const friendRows: SearchSuggestion[] = friends
      .filter((f) => !chatUserIds.has(f.user_id))
      .filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          (f.email?.toLowerCase().includes(q) ?? false)
      )
      .slice(0, 6)
      .map((f) => ({
        kind: 'friend',
        key: `friend-${f.user_id}`,
        userId: f.user_id,
        name: f.name,
        avatar: f.avatar_url,
        subtitle: f.email || 'Friend',
      }))

    return { chats, groups, friends: friendRows }
  }, [friends, groupChats, individualChats, searchQuery])

  const filteredIncomingRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return incomingRequests
    return incomingRequests.filter(
      (r) =>
        r.display_name.toLowerCase().includes(q) ||
        (r.email?.toLowerCase().includes(q) ?? false)
    )
  }, [incomingRequests, searchQuery])

  const allFeedItems = useMemo(() => {
    const items: AllFeedItem[] = [
      ...visibleIndividualChats.map((chat) => ({
        kind: 'chat' as const,
        key: `chat-${chat.user_id}`,
        sortAt: chat.last_message_at ?? '',
        item: chat,
      })),
      ...visibleGroupChats.map((group) => ({
        kind: 'group' as const,
        key: `group-${group.id}`,
        sortAt: group.last_message_at ?? '',
        item: group,
      })),
      ...filteredIncomingRequests.map((request) => ({
        kind: 'request' as const,
        key: `request-${request.friendshipId}`,
        sortAt: request.created_at,
        item: request,
      })),
    ]
    return items.sort((a, b) => b.sortAt.localeCompare(a.sortAt))
  }, [visibleIndividualChats, visibleGroupChats, filteredIncomingRequests])

  const filteredAllFeedItems = useMemo(() => {
    return allFeedItems.filter((item) => {
      if (item.kind === 'request') return listFilter === 'all'
      if (item.kind === 'chat') {
        if (listFilter === 'unread') return (item.item.unread_count ?? 0) > 0
        if (listFilter === 'muted') return isMutedEntry('individual', item.item.user_id)
        return true
      }
      if (listFilter === 'unread') return (item.item.unread_count ?? 0) > 0
      if (listFilter === 'muted') return isMutedEntry('group', item.item.id)
      return true
    })
  }, [allFeedItems, listFilter, isMutedEntry])

  const hasSearchSuggestions = Boolean(
    searchSuggestions &&
      (searchSuggestions.chats.length > 0 ||
        searchSuggestions.groups.length > 0 ||
        searchSuggestions.friends.length > 0)
  )

  const friendsTabIndex = routes.findIndex((r) => r.key === 'friends')
  const groupsTabIndex = routes.findIndex((r) => r.key === 'group')
  const requestsTabIndex = routes.findIndex((r) => r.key === 'requests')
  const allTabIndex = routes.findIndex((r) => r.key === 'all')

  useEffect(() => {
    // Calculate individual chats unread count
    const individualTotal = individualChats.reduce((sum, chat) => sum + (chat.unread_count || 0), 0)
    setIndividualUnreadCount(individualTotal)
    
    // Calculate group chats unread count
    const groupTotal = groupChats.reduce((sum, group) => sum + (group.unread_count || 0), 0)
    setGroupUnreadCount(groupTotal)
    
    // Note: For requests, you might need to fetch this separately from your friend requests hook
    // For now, we'll set it to 0 or you can integrate with your friend requests system
    // setRequestsUnreadCount(/* calculate from friend requests */)
  }, [individualChats, groupChats])

  // After the list has painted, quietly warm the top unread/recent threads.
  const chatPrefetchKey = useMemo(() => {
    const ind = visibleIndividualChats
      .map((c) => `${c.user_id}:${c.unread_count || 0}:${c.last_message_at || ''}`)
      .join(',')
    const grp = visibleGroupChats
      .map((g) => `${g.id}:${g.unread_count || 0}:${g.last_message_at || ''}`)
      .join(',')
    return `${ind}|${grp}`
  }, [visibleIndividualChats, visibleGroupChats])

  useEffect(() => {
    if (individualLoading || groupsLoading) return
    if (!user?.id) return
    if (!chatPrefetchKey || chatPrefetchKey === '|') return

    const targets = [
      ...visibleIndividualChats.map((c) => ({
        chatId: c.user_id,
        chatType: 'individual' as const,
        lastMessageAt: c.last_message_at,
        unreadCount: c.unread_count || 0,
      })),
      ...visibleGroupChats.map((g) => ({
        chatId: g.id,
        chatType: 'group' as const,
        lastMessageAt: g.last_message_at,
        unreadCount: g.unread_count || 0,
      })),
    ]

    scheduleChatThreadsPrefetch(targets, 1200)
  }, [
    chatPrefetchKey,
    individualLoading,
    groupsLoading,
    user?.id,
    visibleGroupChats,
    visibleIndividualChats,
  ])

  const handleTabPress = (newIndex: number) => {
    setIndex(newIndex)
  }

  const refreshOnFocusRef = useRef<() => void>(() => {})
  const lastFocusRefreshAt = useRef(0)
  refreshOnFocusRef.current = () => {
    const now = Date.now()
    if (now - lastFocusRefreshAt.current < 4000) return
    lastFocusRefreshAt.current = now
    softRefreshIndividuals()
    softRefreshGroups()
    void fetchFriends()
    void fetchIncomingRequests()
    void reloadReminders()
  }

  useFocusEffect(
    useCallback(() => {
      refreshOnFocusRef.current()
    }, [])
  )

  const onRefresh = useCallback(() => {
    if (!individualOnline || !groupsOnline) {
      console.log('Cannot refresh while offline')
      return
    }
    Promise.all([refreshIndividuals(), refreshGroups(), fetchIncomingRequests(), reloadReminders()])
  }, [
    fetchIncomingRequests,
    refreshGroups,
    refreshIndividuals,
    groupsOnline,
    individualOnline,
    reloadReminders,
  ])

  // Friend-request fetches must not drive the pull spinner (looks like a stuck circle).
  const isRefreshing = individualRefreshing || groupsRefreshing
  const isOnline = individualOnline && groupsOnline

  const closeFabMenu = useCallback(() => {
    setFabMenuOpen(false)
    Animated.timing(fabMenuAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [fabMenuAnim])

  const syncFabMenuAnchor = useCallback(() => {
    if (!isWebDesktop) {
      setFabMenuRight(12)
      return
    }
    const node = listHostRef.current as
      | (View & { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void })
      | null
    if (!node?.measureInWindow) {
      // Desktop sidebar: 72px nav rail + 320px list (WebDesktopMain).
      setFabMenuRight(Math.max(12, width - 392 + 12))
      return
    }
    node.measureInWindow((x, _y, w) => {
      setFabMenuRight(Math.max(12, width - (x + w) + 12))
    })
  }, [isWebDesktop, width])

  const toggleFabMenu = useCallback(() => {
    const next = !fabMenuOpen
    if (next) syncFabMenuAnchor()
    setFabMenuOpen(next)
    Animated.spring(fabMenuAnim, {
      toValue: next ? 1 : 0,
      friction: 7,
      tension: 120,
      useNativeDriver: true,
    }).start()
  }, [fabMenuAnim, fabMenuOpen, syncFabMenuAnchor])

  useEffect(() => {
    if (!fabMenuOpen) return
    syncFabMenuAnchor()
  }, [fabMenuOpen, syncFabMenuAnchor, width])

  const requireAuth = useCallback(
    (message?: string) => {
      if (!isGuest) return true
      promptSignIn({
        title: 'Sign in required',
        message: message ?? 'Sign in to continue, or keep exploring as a guest.',
        onLogin: exitGuest,
      })
      return false
    },
    [isGuest, exitGuest]
  )

  const runFabAction = useCallback(
    (route: string) => {
      closeFabMenu()
      if (!requireAuth('Sign in to use friends, groups, and chat tools.')) return
      if (!isOnline) return
      if (route === 'AddFriend') {
        void import('../../lib/addFriendPrefetch').then((m) => m.prefetchAddFriend())
      }
      navigation.navigate(route)
    },
    [closeFabMenu, isOnline, navigation, requireAuth]
  )

  const prevFabTabRef = useRef(index)
  useEffect(() => {
    if (prevFabTabRef.current !== index) {
      prevFabTabRef.current = index
      if (fabMenuOpen) closeFabMenu()
    }
  }, [closeFabMenu, fabMenuOpen, index])

  useEffect(() => {
    if (searchOpen && fabMenuOpen) {
      closeFabMenu()
    }
  }, [closeFabMenu, fabMenuOpen, searchOpen])

  const openSearch = useCallback(() => {
    const finishOpen = () => {
      setSearchOpen(true)
      requestAnimationFrame(() => {
        setTimeout(() => searchInputRef.current?.focus(), 80)
      })
    }
    if (!searchToggleRef.current) {
      setSearchAnchor({ top: insets.top + 54, left: 12, width: Math.min(360, width - 24) })
      finishOpen()
      return
    }
    searchToggleRef.current.measureInWindow((x, y, w, h) => {
      // Keep the panel inside the chat-list sidebar on desktop (~320px).
      const panelWidth = isWebDesktop
        ? Math.min(300, Math.max(220, x + w - 8))
        : Math.min(360, width - 24)
      const left = Math.max(8, Math.min(x + w - panelWidth, width - panelWidth - 8))
      const top = Math.min(y + h + 6, windowHeight - 320)
      setSearchAnchor({
        top: Math.max(insets.top + 4, top),
        left,
        width: panelWidth,
      })
      finishOpen()
    })
  }, [insets.top, isWebDesktop, width, windowHeight])

  const closeSearchPopup = useCallback(() => {
    const trimmed = searchQuery.trim()
    if (trimmed) addToSearchHistory(trimmed)
    searchInputRef.current?.blur()
    setSearchOpen(false)
  }, [addToSearchHistory, searchQuery])

  const toggleSearch = useCallback(() => {
    if (searchOpen) closeSearchPopup()
    else openSearch()
  }, [closeSearchPopup, openSearch, searchOpen])

  const applyHistorySearch = useCallback(
    (query: string) => {
      setSearchQuery(query)
      addToSearchHistory(query)
      searchInputRef.current?.focus()
    },
    [addToSearchHistory]
  )

  const clearActiveSearch = useCallback(() => {
    setSearchQuery('')
    searchInputRef.current?.focus()
  }, [])

  const formatTime = (ts: string) => {
    if (!ts) return ''
    const date = new Date(ts)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (86400000))
    if (days === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    if (days === 1) return 'Yesterday'
    if (days < 7) return date.toLocaleDateString([], { weekday: 'short' })
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  const formatLastMessage = (item: any, isGroup: boolean) => {
    if (!item.last_message) return 'Start a conversation'
    
    if (isGroup && item.last_message_sender_display_name) {
      // Check if the sender is the current user
      const isCurrentUser = item.last_message_sender === user?.id
      const senderName = isCurrentUser ? 'You' : item.last_message_sender_display_name
      return `${senderName}: ${item.last_message}`
    }
    
    return item.last_message
  }

  const openChatParams = useCallback(
    async (params: {
      chatId: string
      chatType: 'group' | 'individual'
      chatName: string
      avatarUrl?: string | null
    }) => {
      if (!recallChatThread(params.chatId)) {
        try {
          const local = await messageStorage.getMessages(params.chatId)
          if (Array.isArray(local) && local.length > 0) {
            rememberChatThread(params.chatId, local)
          }
        } catch {
          /* open anyway */
        }
      }

      if (setSelectedChat) {
        setSelectedChat(params)
      } else {
        navigation.navigate('ChatRoom', params)
      }
    },
    [navigation, setSelectedChat]
  )

  const handleChatPress = async (item: any, isGroup = false) => {
    if (!requireAuth('Sign in to open chats.')) return
    // All-chats gate: prompt unlock instead of opening.
    if (locked && scope === 'all') {
      void unlock()
      return
    }

    const params = {
      chatId: isGroup ? item.id : item.user_id,
      chatType: (isGroup ? 'group' : 'individual') as 'group' | 'individual',
      chatName: item.name,
      avatarUrl: item.avatar_url,
    }

    await openChatParams(params)

    if (!isGroup && item.unread_count > 0) {
      setIndividualUnreadCount((prev) => Math.max(0, prev - item.unread_count))
      void markMessagesAsRead(item.user_id)
    }
    if (isGroup && item.unread_count > 0) {
      setGroupUnreadCount((prev) => Math.max(0, prev - item.unread_count))
      void markGroupMessagesAsRead(item.id)
    }
  }

  const commitHideChat = useCallback(
    async (kind: ChatListEntryKind, id: string, name: string, avatarUrl?: string | null) => {
      const entries = await hideChatInVault({ kind, id, name, avatarUrl })
      setHiddenChatKeys(new Set(entries.map((e) => chatListKey(e.kind, e.id))))
      setVaultCount(entries.length)
      showAppToast('Hidden in Secret Space · hold the ChatReel logo')
    },
    []
  )

  const handleHideChat = useCallback(
    async (kind: ChatListEntryKind, id: string, name: string, avatarUrl?: string | null) => {
      const hasPin = await hasVaultPin()
      if (!hasPin) {
        setPendingHide({ kind, id, name, avatarUrl })
        setSecretPreUnlocked(false)
        setSecretSpaceOpen(true)
        return
      }
      await commitHideChat(kind, id, name, avatarUrl)
    },
    [commitHideChat]
  )

  const handleDeleteChat = useCallback(
    async (kind: ChatListEntryKind, id: string, name: string, avatarUrl?: string | null) => {
      // Delete clears local history and parks the row in Secret Space (same as hide).
      const entries = await hideChatInVault({ kind, id, name, avatarUrl })
      setHiddenChatKeys(new Set(entries.map((e) => chatListKey(e.kind, e.id))))
      setVaultCount(entries.length)
      try {
        await api.chatSettings.update(kind, id, { cleared_at: new Date().toISOString() })
        await messageStorage.clearMessages(id)
      } catch {
        /* still hidden locally */
      }
    },
    []
  )

  const openSecretSpace = useCallback(async (opts?: { preUnlocked?: boolean }) => {
    if (!requireAuth('Sign in to open Secret Space.')) return
    const sessionFresh = Date.now() < vaultSessionUntilRef.current
    setSecretPreUnlocked(Boolean(opts?.preUnlocked || sessionFresh))
    setPendingHide(null)
    setSecretSpaceOpen(true)
  }, [requireAuth])

  const trySearchVaultUnlock = useCallback(
    async (text: string) => {
      if (!looksLikeVaultCode(text)) return
      if (!(await hasVaultPin())) return
      const ok = await verifyVaultPin(text.trim())
      if (!ok) return
      vaultSessionUntilRef.current = Date.now() + 3 * 60 * 1000
      setSearchQuery('')
      setSearchOpen(false)
      setSecretPreUnlocked(true)
      setPendingHide(null)
      setSecretSpaceOpen(true)
      showAppToast('Secret Space unlocked')
    },
    []
  )

  const handleArchiveChat = useCallback(async (kind: ChatListEntryKind, id: string) => {
    setListMeta(await patchChatListMeta(kind, id, { archived: true }))
    void api.chatSettings.update(kind, id, { is_archived: true }).catch(() => undefined)
  }, [])

  const handleToggleChatLock = useCallback(
    async (kind: ChatListEntryKind, id: string, name: string) => {
      if (!settings.chatLockEnabled) {
        showAppToast('Turn on Chat lock in Settings first', { isError: true })
        return
      }
      const key = chatListKey(kind, id)
      if (settings.chatLockScope === 'all') {
        await updateSettings({
          chatLockScope: 'selected',
          chatLockedKeys: [key],
        })
        showAppToast(`${name} locked · other chats stay open`)
        return
      }
      const has = settings.chatLockedKeys.includes(key)
      const nextKeys = has
        ? settings.chatLockedKeys.filter((k) => k !== key)
        : [...settings.chatLockedKeys, key]
      await updateSettings({ chatLockedKeys: nextKeys })
      showAppToast(has ? `${name} unlocked` : `${name} locked`)
    },
    [settings.chatLockEnabled, settings.chatLockScope, settings.chatLockedKeys, updateSettings]
  )

  const handleMuteChat = useCallback(
    async (kind: ChatListEntryKind, id: string) => {
      const key = chatListKey(kind, id)
      const prevUntil = listMeta[key]?.mutedUntil ?? null
      const currentlyMuted = Boolean(prevUntil && new Date(prevUntil) > new Date())
      const nextUntil = currentlyMuted
        ? null
        : new Date(Date.now() + 365 * 86400_000).toISOString()
      try {
        setListMeta(await patchChatListMeta(kind, id, { mutedUntil: nextUntil }))
        await api.chatSettings.update(kind, id, { muted_until: nextUntil })
        showAppToast(currentlyMuted ? 'Chat unmuted' : 'Chat muted')
      } catch {
        setListMeta(await patchChatListMeta(kind, id, { mutedUntil: prevUntil }))
        showAppToast('Could not update mute setting', { isError: true })
      }
    },
    [listMeta]
  )

  const openChatMenu = useCallback(
    (e: { nativeEvent: { pageX: number; pageY: number } }, item: any, isGroup: boolean) => {
      const kind: ChatListEntryKind = isGroup ? 'group' : 'individual'
      const id = isGroup ? item.id : item.user_id
      setChatMenu({
        x: e.nativeEvent.pageX,
        y: e.nativeEvent.pageY,
        kind,
        id,
        name: item.name ?? 'Chat',
        avatarUrl: item.avatar_url ?? null,
      })
    },
    []
  )

  const selectSearchSuggestion = useCallback(
    (item: SearchSuggestion) => {
      if (!requireAuth('Sign in to open chats.')) return
      const label = item.name.trim()
      if (label) addToSearchHistory(label)

      const params =
        item.kind === 'group'
          ? {
              chatId: item.groupId,
              chatType: 'group' as const,
              chatName: item.name,
              avatarUrl: item.avatar ?? undefined,
            }
          : {
              chatId: item.userId,
              chatType: 'individual' as const,
              chatName: item.name,
              avatarUrl: item.avatar ?? undefined,
            }

      if (setSelectedChat) {
        setSelectedChat(params)
      } else {
        navigation.navigate('ChatRoom', params)
      }

      setSearchOpen(false)
      searchInputRef.current?.blur()
    },
    [addToSearchHistory, navigation, setSelectedChat, requireAuth]
  )

  const suggestionIcon = (kind: SearchSuggestion['kind']) => {
    if (kind === 'group') return 'people'
    if (kind === 'friend') return 'person-add-outline'
    return 'chatbubble-outline'
  }

  const renderSuggestionSection = (title: string, items: SearchSuggestion[]) => {
    if (!items.length) return null
    return (
      <View style={styles.suggestionSection}>
        <Text style={[styles.suggestionSectionTitle, { color: theme.listSecondaryText }]}>{title}</Text>
        {items.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={styles.suggestionRow}
            onPress={() => selectSearchSuggestion(item)}
            activeOpacity={0.7}
          >
            <View style={styles.suggestionAvatarWrap}>
              {item.avatar ? (
                <Image source={{ uri: item.avatar }} style={styles.suggestionAvatar} />
              ) : (
                <View style={[styles.suggestionAvatar, styles.suggestionAvatarFallback]}>
                  <Text style={styles.suggestionAvatarLetter}>
                    {item.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.suggestionMeta}>
              <Text style={[styles.suggestionName, { color: theme.listPrimaryText }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={[styles.suggestionSubtitle, { color: theme.listSecondaryText }]} numberOfLines={1}>
                {item.subtitle}
              </Text>
            </View>
            <Ionicons name={suggestionIcon(item.kind)} size={16} color={theme.listSecondaryText} />
          </TouchableOpacity>
        ))}
      </View>
    )
  }

  const renderChatItem = ({ item, isGroup = false }: { item: any; isGroup?: boolean }) => {
    const entryId = isGroup ? String(item.id) : String(item.user_id)
    const rem = pickChatReminder(
      reminders,
      isGroup ? 'group' : 'individual',
      entryId
    )
    const urgency = rem ? reminderUrgency(rem.remind_at) : null
    return (
      <ChatListRow
        item={item}
        isGroup={isGroup}
        muted={isMutedEntry(isGroup ? 'group' : 'individual', entryId)}
        chatLocked={
          settings.chatLockEnabled &&
          settings.chatLockScope === 'selected' &&
          isChatProtected(isGroup ? 'group' : 'individual', entryId)
        }
        reminderLabel={rem ? formatReminderWhen(rem.remind_at) : null}
        reminderUrgency={urgency}
        listBg={theme.listBg}
        primaryText={theme.listPrimaryText}
        secondaryText={theme.listSecondaryText}
        preview={formatLastMessage(item, isGroup)}
        timeLabel={item.last_message_at ? formatTime(item.last_message_at) : ''}
        onPress={() => handleChatPress(item, isGroup)}
        onLongPress={(e) => openChatMenu(e, item, isGroup)}
      />
    );
  };

  const filterEmptySubtitle =
    listFilter === 'unread'
      ? 'No unread chats'
      : listFilter === 'muted'
        ? 'No muted chats — mute a chat from its menu'
        : undefined

  const EmptyState = ({ title, subtitle, buttonText, onPress, isOnline }: any) => (
    <View style={styles.emptyContainer}>
      {!isOnline && (
        <View style={styles.offlineIndicator}>
          <Text style={styles.offlineText}>You are offline</Text>
        </View>
      )}
      <Text style={styles.emptyText}>{title}</Text>
      <Text style={styles.emptySubtext}>{subtitle}</Text>
      <Button 
        mode="contained" 
        onPress={onPress} 
        style={styles.addFriendsButton}
        disabled={!isOnline}
      >
        {buttonText}
      </Button>
    </View>
  )

  const renderAllFeedItem = ({ item }: { item: AllFeedItem }) => {
    if (item.kind === 'request') {
      const request = item.item
      return (
        <TouchableOpacity
          style={styles.chatItem}
          onPress={() => handleTabPress(requestsTabIndex)}
          activeOpacity={0.75}
        >
          <View style={styles.avatarContainer}>
            <ChatListAvatar uri={request.avatar_url} name={request.display_name} previewOnPress />
            <View style={[styles.callTypeIcon, styles.requestIcon]}>
              <Ionicons name="person-add" size={12} color="#fff" />
            </View>
          </View>
          <View style={styles.chatInfo}>
            <View style={styles.chatHeader}>
              <Text style={styles.chatName} numberOfLines={1}>
                {request.display_name}
              </Text>
              {request.created_at ? (
                <Text style={styles.time}>{formatTime(request.created_at)}</Text>
              ) : null}
            </View>
            <View style={styles.messageContainer}>
              <Text style={[styles.lastMessage, styles.requestPreview]} numberOfLines={1}>
                Sent you a friend request
              </Text>
              <View style={styles.requestBadge}>
                <Text style={styles.requestBadgeText}>Request</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      )
    }

    if (item.kind === 'group') {
      return renderChatItem({ item: item.item, isGroup: true })
    }

    return renderChatItem({ item: item.item })
  }

  const offlineOrStaleHeader = (
    <>
      {reminders.length > 0 ? (
        <TouchableOpacity
          style={[
            styles.remindersBanner,
            {
              backgroundColor: theme.isDark ? 'rgba(21,101,192,0.18)' : 'rgba(21,101,192,0.08)',
              borderBottomColor: theme.listBorder,
            },
          ]}
          onPress={() => navigation.navigate('Reminders')}
          activeOpacity={0.75}
        >
          <Ionicons name="notifications-outline" size={18} color={theme.primary} />
          <Text style={[styles.remindersBannerText, { color: theme.listPrimaryText }]}>
            Reminders · {reminders.length}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={theme.listSecondaryText} />
        </TouchableOpacity>
      ) : null}
      {!isOnline ? (
        <View style={styles.offlineNotice}>
          <Text style={styles.offlineNoticeText}>📡 Offline Mode - Showing cached data</Text>
        </View>
      ) : individualStale || groupsStale ? (
        <TouchableOpacity style={styles.staleNotice} onPress={onRefresh}>
          <Text style={styles.staleNoticeText}>🔄 Data may be outdated. Tap to refresh.</Text>
        </TouchableOpacity>
      ) : null}
    </>
  )

  const renderScene = ({ route }: { route: { key: string } }) => {
    switch (route.key) {
      case 'all':
        return (
          <ChatListScrollPane
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            isOnline={isOnline}
            header={offlineOrStaleHeader}
            empty={
              filteredAllFeedItems.length === 0 &&
              (individualLoading || groupsLoading || requestsLoading) ? null : (
                <EmptyState
                  title={listFilter === 'all' ? 'Nothing here yet' : 'Nothing matches'}
                  subtitle={
                    searchQuery.trim()
                      ? 'No chats or requests match your search'
                      : filterEmptySubtitle ||
                        'Start chatting, join a group, or accept a friend request'
                  }
                  buttonText="Add Friends"
                  onPress={() => {
                    if (!requireAuth('Sign in to add friends.')) return
                    navigation.navigate('FriendsList')
                  }}
                  isOnline={isOnline}
                />
              )
            }
          >
            {filteredAllFeedItems.map((feedItem) => (
              <View key={feedItem.key}>{renderAllFeedItem({ item: feedItem })}</View>
            ))}
          </ChatListScrollPane>
        )
      case 'friends':
        return (
          <ChatListScrollPane
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            isOnline={isOnline}
            header={
              !isOnline ? (
                <View style={styles.offlineNotice}>
                  <Text style={styles.offlineNoticeText}>📡 Offline Mode - Showing cached data</Text>
                </View>
              ) : individualStale ? (
                <TouchableOpacity style={styles.staleNotice} onPress={refreshIndividuals}>
                  <Text style={styles.staleNoticeText}>🔄 Data may be outdated. Tap to refresh.</Text>
                </TouchableOpacity>
              ) : null
            }
            empty={
              individualLoading && filteredIndividualChats.length === 0 ? null : (
                <EmptyState
                  title={listFilter === 'all' ? 'No conversations yet' : 'Nothing matches'}
                  subtitle={
                    filterEmptySubtitle ||
                    (individualChats.length === 0
                      ? 'Add friends to start chatting'
                      : 'No chats match your search')
                  }
                  buttonText="Add Friends"
                  onPress={() => {
                    if (!requireAuth('Sign in to add friends.')) return
                    navigation.navigate('FriendsList')
                  }}
                  isOnline={isOnline}
                />
              )
            }
          >
            {filteredIndividualChats.map((chat) => (
              <View key={chat.user_id}>{renderChatItem({ item: chat })}</View>
            ))}
          </ChatListScrollPane>
        )
      case 'group':
        return (
          <ChatListScrollPane
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            isOnline={isOnline}
            header={
              !isOnline ? (
                <View style={styles.offlineNotice}>
                  <Text style={styles.offlineNoticeText}>📡 Offline Mode - Showing cached data</Text>
                </View>
              ) : groupsStale ? (
                <TouchableOpacity style={styles.staleNotice} onPress={refreshGroups}>
                  <Text style={styles.staleNoticeText}>🔄 Data may be outdated. Tap to refresh.</Text>
                </TouchableOpacity>
              ) : null
            }
            empty={
              groupsLoading && filteredGroupChats.length === 0 ? null : (
                <EmptyState
                  title={listFilter === 'all' ? 'No groups yet' : 'Nothing matches'}
                  subtitle={
                    filterEmptySubtitle || 'Create or join a group to start chatting'
                  }
                  buttonText="Create New Group"
                  onPress={() => {
                    if (!requireAuth('Sign in to create a group.')) return
                    navigation.navigate('NewGroup')
                  }}
                  isOnline={isOnline}
                />
              )
            }
          >
            {filteredGroupChats.map((group) => (
              <View key={group.id}>{renderChatItem({ item: group, isGroup: true })}</View>
            ))}
          </ChatListScrollPane>
        )
      case 'requests':
        return <FriendRequestsScreen />
      default:
        return null
    }
  }

  const renderTabBar = () => (
    <View style={[styles.tabStripContainer, { backgroundColor: theme.listBg, borderBottomColor: theme.listBorder }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabStrip}
      >
        {routes.map((route, routeIndex) => {
          const focused = index === routeIndex && listFilter === 'all'
          const badge = getTabBadgeCount(route.key)
          return (
            <TouchableOpacity
              key={route.key}
              style={[
                styles.tabStripItem,
                {
                  backgroundColor: theme.isDark ? '#1a1a1a' : '#eef2f7',
                  borderWidth: theme.isDark ? 1 : 0,
                  borderColor: theme.listBorder,
                },
                focused && { backgroundColor: theme.primary, borderColor: theme.primary },
              ]}
              onPress={() => {
                setListFilter('all')
                handleTabPress(routeIndex)
              }}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.tabStripLabel,
                  { color: theme.listSecondaryText },
                  focused && { color: '#fff', fontWeight: '700' },
                ]}
              >
                {route.title}
              </Text>
              {badge > 0 ? (
                <View style={[styles.tabStripBadge, focused && styles.tabStripBadgeActive]}>
                  <Text style={[styles.tabStripBadgeText, focused && styles.tabStripBadgeTextActive]}>
                    {badge > 99 ? '99+' : badge}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          )
        })}

        {index !== requestsTabIndex ? (
          <>
            {(filtersExpanded || listFilter !== 'all') &&
              HIDDEN_LIST_FILTERS.map((filter) => {
                const focused = listFilter === filter.key
                return (
                  <TouchableOpacity
                    key={filter.key}
                    style={[
                      styles.tabStripItem,
                      {
                        backgroundColor: theme.isDark ? '#1a1a1a' : '#eef2f7',
                        borderWidth: theme.isDark ? 1 : 0,
                        borderColor: theme.listBorder,
                      },
                      focused && { backgroundColor: theme.primary, borderColor: theme.primary },
                    ]}
                    onPress={() => {
                      setListFilter((prev) => (prev === filter.key ? 'all' : filter.key))
                      setFiltersExpanded(true)
                    }}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.tabStripLabel,
                        { color: theme.listSecondaryText },
                        focused && { color: '#fff', fontWeight: '700' },
                      ]}
                    >
                      {filter.label}
                    </Text>
                  </TouchableOpacity>
                )
              })}

            <TouchableOpacity
              style={[
                styles.tabStripMore,
                {
                  backgroundColor: theme.isDark ? '#1a1a1a' : '#eef2f7',
                  borderColor: theme.listBorder,
                },
                (filtersExpanded || listFilter !== 'all') && {
                  borderColor: theme.primary,
                },
              ]}
              onPress={() => setFiltersExpanded((v) => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={filtersExpanded ? 'Hide filters' : 'More filters'}
              accessibilityRole="button"
            >
              <Ionicons
                name={filtersExpanded ? 'chevron-back' : 'chevron-forward'}
                size={16}
                color={listFilter !== 'all' ? theme.primary : theme.listSecondaryText}
              />
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
    </View>
  )

  const renderFabMenu = (actions: readonly FabAction[]) => (
    <>
      <Modal
        visible={fabMenuOpen}
        transparent
        animationType="none"
        onRequestClose={closeFabMenu}
        statusBarTranslucent
      >
        <View style={styles.fabModalRoot}>
          <Pressable
            style={styles.fabDismissOverlay}
            onPress={closeFabMenu}
            accessibilityLabel="Dismiss action menu"
          />
          {actions.map((action, actionIndex) => {
            const lift = (actionIndex + 1) * 64
            return (
              <Animated.View
                key={action.key}
                pointerEvents="auto"
                style={[
                  styles.fabActionRow,
                  {
                    right: fabMenuRight,
                    bottom: fabBottom + 8,
                    opacity: fabMenuAnim.interpolate({
                      inputRange: [0, 0.35, 1],
                      outputRange: [0, 0.7, 1],
                    }),
                    transform: [
                      {
                        translateY: fabMenuAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [16, -lift],
                        }),
                      },
                      {
                        scale: fabMenuAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.6, 1],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.fabActionLabel,
                    {
                      backgroundColor: theme.listCardBg,
                      borderColor: theme.listBorder,
                      borderWidth: theme.isDark ? 1 : 0,
                    },
                  ]}
                  onPress={() => runFabAction(action.route)}
                  activeOpacity={0.85}
                  disabled={!isOnline}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                >
                  <Text style={[styles.fabActionLabelText, { color: theme.listPrimaryText }]}>
                    {action.label}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.fabMini, !isOnline && styles.fabMiniDisabled]}
                  onPress={() => runFabAction(action.route)}
                  activeOpacity={0.9}
                  disabled={!isOnline}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                >
                  <Ionicons name={action.icon} size={24} color="#fff" />
                </TouchableOpacity>
              </Animated.View>
            )
          })}
          <FAB
            style={[
              styles.fab,
              { bottom: fabBottom, right: fabMenuRight },
              !isOnline && styles.disabledFab,
              styles.fabOpen,
            ]}
            color="#FFFFFF"
            icon="close"
            onPress={closeFabMenu}
            accessibilityLabel="Close action menu"
          />
        </View>
      </Modal>

      {!fabMenuOpen ? (
        <FAB
          style={[styles.fab, { bottom: fabBottom }, !isOnline && styles.disabledFab]}
          color="#FFFFFF"
          icon="plus"
          onPress={() => {
            if (isOnline) toggleFabMenu()
          }}
          accessibilityLabel="Open action menu"
        />
      ) : null}
    </>
  )

  const searchDropdownPanel = (
    <View
      style={[
        styles.searchDropdown,
        {
          top: searchAnchor.top,
          left: searchAnchor.left,
          width: searchAnchor.width,
          maxHeight: Math.min(400, windowHeight - searchAnchor.top - 16),
          backgroundColor: theme.listCardBg,
          borderWidth: theme.isDark || isWebDesktop ? 1 : 0,
          borderColor: theme.listBorder,
        },
      ]}
    >
      <View style={styles.searchDropdownHeader}>
        <Text style={[styles.searchDropdownTitle, { color: theme.listPrimaryText }]}>Search</Text>
        <TouchableOpacity
          onPress={closeSearchPopup}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Close search"
        >
          <Ionicons name="close" size={22} color={theme.listPrimaryText} />
        </TouchableOpacity>
      </View>
      <LinearGradient colors={[theme.accent, theme.primary]} style={styles.gradientBorder}>
        <View style={[styles.searchWrapper, { backgroundColor: theme.searchBg }]}>
          <TextInput
            ref={searchInputRef}
            placeholder="Search chats, groups & friends"
            placeholderTextColor={theme.searchPlaceholder}
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text)
              void trySearchVaultUnlock(text)
            }}
            onSubmitEditing={() => {
              const trimmed = searchQuery.trim()
              if (trimmed) addToSearchHistory(trimmed)
            }}
            returnKeyType="search"
            mode="flat"
            style={[styles.searchBar, { color: theme.searchText }]}
            underlineColor="transparent"
            theme={{ colors: { text: theme.searchText, background: 'transparent' } }}
            left={<TextInput.Icon icon="magnify" color={theme.searchPlaceholder} />}
            right={
              searchQuery.length > 0 ? (
                <TextInput.Icon icon="close" color={theme.searchPlaceholder} onPress={clearActiveSearch} />
              ) : (
                <TextInput.Icon icon="close" color={theme.searchPlaceholder} onPress={closeSearchPopup} />
              )
            }
          />
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.searchDropdownList}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        {searchQuery.trim() ? (
          hasSearchSuggestions && searchSuggestions ? (
            <>
              {renderSuggestionSection('Chats', searchSuggestions.chats)}
              {renderSuggestionSection('Groups', searchSuggestions.groups)}
              {renderSuggestionSection('Friends', searchSuggestions.friends)}
            </>
          ) : (
            <Text style={[styles.searchHistoryEmpty, { color: theme.listSecondaryText }]}>
              No chats or friends found
            </Text>
          )
        ) : (
          <>
            <View style={styles.searchHistoryHeader}>
              <Text style={[styles.searchHistoryTitle, { color: theme.listPrimaryText }]}>
                Recent searches
              </Text>
              {searchHistory.length > 0 ? (
                <TouchableOpacity
                  onPress={clearSearchHistory}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.searchHistoryClear, { color: theme.primary }]}>Clear all</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {visibleSearchHistory.length > 0 ? (
              visibleSearchHistory.map((item) => (
                <View key={item} style={styles.searchHistoryRow}>
                  <TouchableOpacity
                    style={styles.searchHistoryMain}
                    onPress={() => applyHistorySearch(item)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="time-outline" size={18} color={theme.listSecondaryText} />
                    <Text
                      style={[styles.searchHistoryText, { color: theme.listPrimaryText }]}
                      numberOfLines={1}
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => removeFromSearchHistory(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel={`Remove ${item}`}
                  >
                    <Ionicons name="close" size={18} color={theme.listSecondaryText} />
                  </TouchableOpacity>
                </View>
              ))
            ) : (
              <Text style={[styles.searchHistoryEmpty, { color: theme.listSecondaryText }]}>
                Start typing to search chats and friends
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </View>
  )

  return (
    <SafeAreaView
      ref={listHostRef}
      style={[styles.container, { backgroundColor: theme.listBg }]}
      edges={['left', 'right']}
      onLayout={() => {
        if (fabMenuOpen) syncFabMenuAnchor()
      }}
    >
      {isFocused ? (
        <StatusBar
          barStyle={theme.isDark ? 'light-content' : 'dark-content'}
          backgroundColor={theme.listHeaderBg}
        />
      ) : null}
      <View
        style={[
          styles.navbar,
          isNarrow && styles.navbarNarrow,
          {
            backgroundColor: theme.listHeaderBg,
            borderBottomColor: theme.listBorder,
            marginTop: -insets.top,
            paddingTop: insets.top,
          },
        ]}
      >
        <Pressable
          style={styles.brandRow}
          onLongPress={() => void openSecretSpace()}
          delayLongPress={480}
          accessibilityLabel="ChatReel — hold for Secret Space"
        >
          <View>
            <Image source={APP_LOGO} style={styles.appLogo} resizeMode="contain" />
            {vaultCount > 0 ? <View style={styles.vaultDot} /> : null}
          </View>
          <Text style={[styles.appName, { color: theme.listHeaderText }]}>{APP_NAME}</Text>
        </Pressable>

        <View style={styles.navbarSpacer} />

        <View ref={searchToggleRef} collapsable={false}>
          <TouchableOpacity
            style={[
              styles.searchToggle,
              {
                backgroundColor: theme.isDark ? '#1a1a1a' : '#eef2f7',
                borderWidth: theme.isDark ? 1 : 0,
                borderColor: theme.listBorder,
              },
              (searchOpen || searchQuery.length > 0) && {
                backgroundColor: theme.isDark ? '#1a2a3a' : '#e8f2ff',
                borderColor: theme.primary,
              },
            ]}
            onPress={toggleSearch}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Search chats"
          >
            <Ionicons
              name={searchOpen ? 'close' : 'search'}
              size={22}
              color={searchOpen || searchQuery.length > 0 ? theme.primary : theme.listHeaderText}
            />
          </TouchableOpacity>
        </View>

        <DropdownMenu triggerIcon="ellipsis-vertical" />
      </View>

      {searchOpen ? (
        isWebDesktop ? (
          <Portal>
            <View style={styles.searchWebFloatRoot} pointerEvents="box-none">
              <Pressable style={styles.searchBackdropClear} onPress={closeSearchPopup} />
              {searchDropdownPanel}
            </View>
          </Portal>
        ) : (
          <Modal
            visible={searchOpen}
            transparent
            animationType="fade"
            onRequestClose={closeSearchPopup}
            statusBarTranslucent
          >
            <View style={styles.searchModalRoot} pointerEvents="box-none">
              <Pressable style={[styles.searchBackdrop, styles.searchBackdropDim]} onPress={closeSearchPopup} />
              {searchDropdownPanel}
            </View>
          </Modal>
        )
      ) : null}


      <TabView
        navigationState={{ index, routes }}
        renderScene={renderScene}
        onIndexChange={handleTabPress}
        initialLayout={{ width }}
        renderTabBar={renderTabBar}
        swipeEnabled
      />

      {index === allTabIndex && !searchOpen && renderFabMenu(ALL_FAB_ACTIONS)}

      {index === friendsTabIndex && !searchOpen && (
        <FAB
          style={[styles.fab, { bottom: fabBottom }, !isOnline && styles.disabledFab]}
          color="#FFFFFF"
          icon="account-plus"
          onPress={() => {
            if (!requireAuth('Sign in to open your friend list.')) return
            if (isOnline) navigation.navigate('FriendsList')
          }}
        />
      )}
      {index === groupsTabIndex && !searchOpen && renderFabMenu(GROUP_FAB_ACTIONS)}
      {index === requestsTabIndex && !searchOpen && (
        <FAB
          style={[styles.fab, { bottom: fabBottom }, !isOnline && styles.disabledFab]}
          color="#FFFFFF"
          icon="account-plus"
          onPress={() => {
            if (!requireAuth('Sign in to add friends.')) return
            if (isOnline) {
              void import('../../lib/addFriendPrefetch').then((m) => m.prefetchAddFriend())
              navigation.navigate('AddFriend')
            }
          }}
        />
      )}

      <FloatingActionMenu
        visible={Boolean(chatMenu)}
        x={chatMenu?.x ?? 0}
        y={chatMenu?.y ?? 0}
        onClose={() => setChatMenu(null)}
        actions={
          chatMenu
            ? [
                {
                  key: 'mute',
                  label: isMutedEntry(chatMenu.kind, chatMenu.id) ? 'Unmute' : 'Mute',
                  onPress: () => void handleMuteChat(chatMenu.kind, chatMenu.id),
                },
                ...(settings.chatLockEnabled
                  ? [
                      {
                        key: 'chat-lock',
                        label:
                          settings.chatLockScope === 'all'
                            ? 'Lock only this chat'
                            : isChatProtected(chatMenu.kind, chatMenu.id)
                              ? 'Remove chat lock'
                              : 'Lock this chat',
                        onPress: () =>
                          void handleToggleChatLock(
                            chatMenu.kind,
                            chatMenu.id,
                            chatMenu.name
                          ),
                      },
                    ]
                  : []),
                {
                  key: 'archive',
                  label: 'Archive',
                  onPress: () => void handleArchiveChat(chatMenu.kind, chatMenu.id),
                },
                {
                  key: 'hide',
                  label: 'Hide in Secret Space',
                  onPress: () =>
                    void handleHideChat(
                      chatMenu.kind,
                      chatMenu.id,
                      chatMenu.name,
                      chatMenu.avatarUrl
                    ),
                },
                {
                  key: 'delete',
                  label: 'Delete chat',
                  destructive: true,
                  onPress: () =>
                    void handleDeleteChat(
                      chatMenu.kind,
                      chatMenu.id,
                      chatMenu.name,
                      chatMenu.avatarUrl
                    ),
                },
              ]
            : []
        }
      />

      <SecretSpaceSheet
        visible={secretSpaceOpen}
        preUnlocked={secretPreUnlocked}
        pendingHide={pendingHide}
        onClose={() => {
          setSecretSpaceOpen(false)
          setPendingHide(null)
          setSecretPreUnlocked(false)
        }}
        onSetupComplete={() => {
          if (!pendingHide) return
          const target = pendingHide
          setPendingHide(null)
          void commitHideChat(target.kind, target.id, target.name, target.avatarUrl)
        }}
        onOpenChat={(entry: VaultChatEntry) => {
          vaultSessionUntilRef.current = Date.now() + 3 * 60 * 1000
          void openChatParams({
            chatId: entry.id,
            chatType: entry.kind === 'group' ? 'group' : 'individual',
            chatName: entry.name,
            avatarUrl: entry.avatarUrl,
          })
        }}
        onEntriesChanged={(entries) => {
          setHiddenChatKeys(new Set(entries.map((e) => chatListKey(e.kind, e.id))))
          setVaultCount(entries.length)
        }}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
    gap: 8,
  },
  navbarNarrow: {
    paddingHorizontal: 8,
  },
  vaultDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#5c6bc0',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  remindersBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  remindersBannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  appLogo: {
    width: 36,
    height: 36,
    borderRadius: 10,
    flexShrink: 0,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 8,
  },
  appName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: -0.3,
    flexShrink: 0,
  },
  searchModalRoot: {
    flex: 1,
  },
  searchWebFloatRoot: {
    ...Platform.select({
      web: {
        position: 'fixed' as any,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10040,
      },
      default: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 10040,
        elevation: 10040,
      },
    }),
  },
  searchBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  searchBackdropDim: {
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  searchBackdropClear: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  searchDropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  searchDropdownTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  searchDropdown: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    maxHeight: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
    zIndex: 10041,
  },
  searchDropdownList: {
    maxHeight: 300,
    marginTop: 10,
  },
  suggestionSection: {
    marginBottom: 8,
  },
  suggestionSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 10,
    borderRadius: 10,
  },
  suggestionAvatarWrap: {
    flexShrink: 0,
  },
  suggestionAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  suggestionAvatarFallback: {
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionAvatarLetter: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  suggestionMeta: {
    flex: 1,
    minWidth: 0,
  },
  suggestionName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  suggestionSubtitle: {
    fontSize: 13,
    color: '#8e8e93',
    marginTop: 1,
  },
  searchHistoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  searchHistoryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  searchHistoryClear: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007AFF',
  },
  searchHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  searchHistoryMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  searchHistoryText: {
    flex: 1,
    fontSize: 15,
    color: '#1a1a1a',
  },
  searchHistoryEmpty: {
    fontSize: 14,
    color: '#9ca3af',
    paddingHorizontal: 4,
    paddingVertical: 12,
  },
  searchToggle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2f7',
  },
  searchToggleActive: {
    backgroundColor: '#e8f2ff',
  },
  navbarSpacer: {
    flex: 1,
  },
  gradientBorder: { 
    borderRadius: 25, 
    padding: 2 
  },
  searchWrapper: { 
    borderRadius: 23, 
    backgroundColor: '#fff', 
    overflow: 'hidden' 
  },
  searchBar: { 
    height: 40, 
    backgroundColor: 'transparent', 
    fontSize: 14, 
    paddingHorizontal: 12 
  },
  chatItem: { 
    flexDirection: 'row', 
    padding: 10, 
    borderBottomWidth: 0.5, 
    borderBottomColor: '#f0f0f0', 
    alignItems: 'center' 
  },
  avatarContainer: { 
    position: 'relative', 
    width: 52, 
    height: 52, 
    marginRight: 12 
  },
  avatar: { 
    width: 52, 
    height: 52, 
    borderRadius: 26 
  },
  avatarFallback: { 
    position: 'absolute', 
    top: 0, 
    left: 0, 
    width: 52, 
    height: 52, 
    borderRadius: 26, 
    backgroundColor: '#007AFF', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  avatarInitials: { 
    color: '#fff', 
    fontSize: 20, 
    fontWeight: 'bold' 
  },
  chatInfo: { 
    flex: 1 
  },
  chatHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginBottom: 4 
  },
  chatName: { 
    fontSize: 16, 
    fontWeight: '600', 
    color: '#1a1a1a', 
    flex: 1 
  },
  memberCountText: {
    fontSize: 12,
    color: '#666',
    fontWeight: 'normal',
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  time: { 
    fontSize: 12, 
    color: '#666',
  },
  messageContainer: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  lastMessage: { 
    fontSize: 14, 
    color: '#666', 
    flex: 1, 
    marginRight: 8 
  },
  unreadMessage: { 
    color: '#1a1a1a', 
    fontWeight: '500' 
  },
  rightContainer: { 
    flexDirection: 'row', 
    gap: 6 
  },
  unreadBadge: { 
    backgroundColor: '#007AFF', 
    borderRadius: 12, 
    minWidth: 20, 
    height: 20, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  unreadCount: { 
    color: '#fff', 
    fontSize: 10, 
    fontWeight: 'bold',
    paddingHorizontal: 4,
  },
  tabStripContainer: {
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
    paddingVertical: 10,
  },
  tabStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  tabStripMore: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabStripItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#eef2f7',
    gap: 6,
  },
  tabStripItemActive: {
    backgroundColor: '#007AFF',
  },
  tabStripLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4a5568',
  },
  tabStripLabelActive: {
    color: '#fff',
    fontWeight: '700',
  },
  tabStripBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabStripBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  tabStripBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  tabStripBadgeTextActive: {
    color: '#007AFF',
  },
  requestIcon: {
    backgroundColor: '#FF9500',
  },
  requestPreview: {
    color: '#FF9500',
    fontWeight: '500',
  },
  requestBadge: {
    backgroundColor: '#fff3e0',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  requestBadgeText: {
    color: '#e65100',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyContainer: { 
    alignItems: 'center', 
    justifyContent: 'center', 
    paddingTop: 80, 
    paddingHorizontal: 40 
  },
  emptyText: { 
    fontSize: 16, 
    fontWeight: '500', 
    color: '#666', 
    marginBottom: 8, 
    textAlign: 'center' 
  },
  emptySubtext: { 
    fontSize: 14, 
    color: '#999', 
    textAlign: 'center', 
    marginBottom: 20, 
    lineHeight: 20 
  },
  centeredContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    paddingHorizontal: 40 
  },
  requestsText: { 
    fontSize: 16, 
    color: '#666', 
    textAlign: 'center', 
    marginBottom: 20 
  },
  addFriendsButton: { 
    backgroundColor: '#007AFF', 
    marginTop: 10 
  },
  loader: { 
    marginTop: 40 
  },
  fab: {
    position: 'absolute',
    right: 12,
    backgroundColor: '#007AFF',
    zIndex: 40,
    elevation: 40,
  },
  fabOpen: {
    backgroundColor: '#007AFF',
  },
  fabModalRoot: {
    flex: 1,
  },
  fabDismissOverlay: {
    ...StyleSheet.absoluteFillObject,
    // Tiny alpha so web reliably hits the dismiss layer.
    backgroundColor: 'rgba(0,0,0,0.01)',
    zIndex: 20,
    elevation: 20,
  },
  fabActionRow: {
    position: 'absolute',
    right: 12,
    zIndex: 30,
    elevation: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  fabActionLabel: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  fabActionLabelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1c1c1e',
  },
  fabMini: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#007AFF',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  fabMiniDisabled: {
    backgroundColor: '#b0b7c3',
    shadowOpacity: 0,
  },
  disabledFab: {
    backgroundColor: '#ccc',
  },
  roleBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fff',
  },
  callTypeIcon: {
    position: 'absolute',
    bottom: 0,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  creatorBadge: {
    backgroundColor: '#FFD700',
  },
  adminBadge: {
    backgroundColor: '#007AFF',
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  offlineNotice: {
    backgroundColor: '#FFA500',
    padding: 8,
    alignItems: 'center',
  },
  offlineNoticeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  staleNotice: {
    backgroundColor: '#f0f7ff',
    padding: 8,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  staleNoticeText: {
    color: '#007AFF',
    fontSize: 12,
  },
  offlineIndicator: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
  },
  offlineText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
});