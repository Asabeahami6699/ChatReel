// src/screens/Friends/FriendsListScreen.tsx
import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Platform,
  Alert,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation, useRoute } from '@react-navigation/native'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'
import { useCurrentProfileId } from '../../hooks/useCurrentProfileId'
import { useFriendshipsRealtime } from '../../hooks/useFriendshipsRealtime'
import { FAB, IconButton, Button, Portal, Snackbar } from 'react-native-paper'
import { Ionicons } from '@expo/vector-icons'
import { FloatingActionMenu } from '../../components/FloatingActionMenu'
import { useChatSettings } from '../../context/ChatSettingsContext'
import {
  getAcceptedFriendsCache,
  mapFriendshipsToRows,
  scheduleFriendsPrefetch,
  upsertAcceptedFriendsCache,
  type AcceptedFriendRow,
} from '../../lib/friendsPrefetch'

type Friend = AcceptedFriendRow

type Props = {
  setSelectedChat?: (chat: any) => void
}

export default function FriendsListScreen({ setSelectedChat }: Props) {
  const { user } = useAuth()
  const { theme } = useChatSettings()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation()
  const route = useRoute<any>()

  const { mode, groupId, groupName, existingMembers = [] } = route.params || {}
  const isSelectionMode = mode === 'select'
  const isPrivacyMode = mode === 'privacy'

  const cachedFriends = getAcceptedFriendsCache({ allowStale: true })?.friends ?? []
  const [friendsList, setFriendsList] = useState<Friend[]>(() => cachedFriends)
  const [filteredFriends, setFilteredFriends] = useState<Friend[]>(() => cachedFriends)
  const [blockedList, setBlockedList] = useState<Friend[]>([])
  const [selectedFriends, setSelectedFriends] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(() => cachedFriends.length === 0)
  const currentProfilesId = useCurrentProfileId()
  const [addingToGroup, setAddingToGroup] = useState(false)
  const [friendMenu, setFriendMenu] = useState<{
    x: number
    y: number
    friend: Friend
  } | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const fetchFriendsList = async () => {
    if (!currentProfilesId) return
    if (friendsList.length === 0) setLoading(true)
    try {
      const [{ friendships: accepted }, blockedRes] = await Promise.all([
        api.friendships.list('accepted'),
        isPrivacyMode
          ? api.friendships.list('blocked')
          : Promise.resolve({ friendships: [] as Record<string, unknown>[] }),
      ])
      const uniqueFriends = mapFriendshipsToRows(
        (accepted ?? []) as Record<string, unknown>[],
        currentProfilesId
      )
      upsertAcceptedFriendsCache(uniqueFriends)
      setFriendsList(uniqueFriends)
      setFilteredFriends(uniqueFriends)
      if (isPrivacyMode) {
        // Only rows I created as blocker (not people who blocked me).
        const mine = ((blockedRes.friendships ?? []) as Record<string, unknown>[]).filter(
          (f) => f.user_id === currentProfilesId
        )
        const blocked = mapFriendshipsToRows(mine, currentProfilesId).filter((b) => b.user_id)
        setBlockedList(blocked)
      }
    } catch (err) {
      console.error('Fetch friends error:', err)
      const stale = getAcceptedFriendsCache({ allowStale: true })?.friends
      if (stale?.length) {
        setFriendsList(stale)
        setFilteredFriends(stale)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    scheduleFriendsPrefetch(0)
  }, [])

  useEffect(() => {
    fetchFriendsList()
  }, [currentProfilesId])

  useFriendshipsRealtime(currentProfilesId, fetchFriendsList)

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredFriends(friendsList)
    } else {
      const query = searchQuery.toLowerCase()
      const filtered = friendsList.filter(
        (f) => f.name.toLowerCase().includes(query) || f.email?.toLowerCase().includes(query)
      )
      setFilteredFriends(filtered)
    }
  }, [searchQuery, friendsList])

  const isFriendAlreadyMember = (friendUserId: string) => existingMembers.includes(friendUserId)

  const toggleFriendSelection = (friendUserId: string) => {
    if (isFriendAlreadyMember(friendUserId)) return

    if (selectedFriends.includes(friendUserId)) {
      setSelectedFriends(selectedFriends.filter((id) => id !== friendUserId))
    } else {
      setSelectedFriends([...selectedFriends, friendUserId])
    }
  }

  const handleAddToGroup = async () => {
    if (selectedFriends.length === 0) {
      Alert.alert('No Selection', 'Please select friends to add to the group.')
      return
    }

    try {
      setAddingToGroup(true)

      const friendsToAdd = selectedFriends.filter((friendId) => !existingMembers.includes(friendId))

      if (friendsToAdd.length === 0) {
        Alert.alert('Already Members', 'Selected friends are already in the group.')
        return
      }

      await api.groups.addMembers(groupId, friendsToAdd)

      Alert.alert('Success', `${friendsToAdd.length} friend(s) added to the group!`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ])
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to add friends to group'
      Alert.alert('Error', message)
    } finally {
      setAddingToGroup(false)
    }
  }

  const handleBlockFriend = (friend: Friend) => {
    Alert.alert(
      'Block user',
      `Block ${friend.name}? They won’t be able to message you, call you, or see your moments and reels — and you won’t see theirs.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await api.friendships.block(friend.user_id)
                setFriendsList((prev) => prev.filter((f) => f.user_id !== friend.user_id))
                setFilteredFriends((prev) => prev.filter((f) => f.user_id !== friend.user_id))
                setBlockedList((prev) => {
                  if (prev.some((b) => b.user_id === friend.user_id)) return prev
                  return [...prev, friend]
                })
                setToast(`${friend.name} blocked`)
              } catch (err) {
                const message = err instanceof ApiError ? err.message : 'Could not block user'
                Alert.alert('Block', message)
              }
            })()
          },
        },
      ]
    )
  }

  const handleUnblock = (friend: Friend) => {
    Alert.alert('Unblock user', `Unblock ${friend.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: () => {
          void (async () => {
            try {
              await api.friendships.unblock(friend.user_id)
              setBlockedList((prev) => prev.filter((f) => f.user_id !== friend.user_id))
              setToast(`${friend.name} unblocked`)
            } catch (err) {
              const message = err instanceof ApiError ? err.message : 'Could not unblock'
              Alert.alert('Unblock', message)
            }
          })()
        },
      },
    ])
  }

  const handleOpenChat = (item: Friend) => {
    if (isSelectionMode) {
      toggleFriendSelection(item.user_id)
      return
    }
    if (isPrivacyMode) {
      handleBlockFriend(item)
      return
    }

    const params = {
      chatType: 'individual',
      chatId: item.user_id,
      chatName: item.name,
      avatarUrl: item.avatar_url,
    }
    if (Platform.OS === 'web' && setSelectedChat) {
      setSelectedChat(params)
    } else {
      navigation.navigate('ChatRoom', params)
    }
  }

  const handleUnfriend = async (friend: Friend) => {
    try {
      await api.friendships.cancel(friend.id)
      setFriendsList((prev) => prev.filter((f) => f.user_id !== friend.user_id))
      setFilteredFriends((prev) => prev.filter((f) => f.user_id !== friend.user_id))
      setToast(`${friend.name} removed. They can send a new friend request.`)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not unfriend'
      Alert.alert('Friends', message)
    }
  }

  const renderFriend = ({ item }: { item: Friend }) => {
    const isSelected = selectedFriends.includes(item.user_id)
    const isAlreadyMember = isFriendAlreadyMember(item.user_id)
    const isDisabled = isAlreadyMember

    return (
      <TouchableOpacity
        style={[
          styles.friendItem,
          { borderBottomColor: theme.listBorder },
          isSelected && { backgroundColor: theme.isDark ? '#0d2137' : '#E3F2FD' },
          isDisabled && styles.friendItemDisabled,
        ]}
        onPress={() => handleOpenChat(item)}
        onLongPress={(e) => {
          if (isSelectionMode || isDisabled || isPrivacyMode) return
          setFriendMenu({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, friend: item })
        }}
        delayLongPress={400}
        disabled={isDisabled}
      >
        <View style={styles.friendContent}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.friendAvatar} />
          ) : (
            <View style={[styles.friendAvatar, { backgroundColor: theme.listBorder }]} />
          )}
          <View style={styles.friendInfo}>
            <View style={styles.friendNameRow}>
              <Text
                style={[
                  styles.friendName,
                  { color: theme.listPrimaryText },
                  isDisabled && styles.disabledText,
                ]}
              >
                {item.name}
              </Text>
              {isAlreadyMember && (
                <View style={styles.alreadyMemberBadge}>
                  <Text style={styles.alreadyMemberText}>Already in group</Text>
                </View>
              )}
            </View>
            {item.email && (
              <Text
                style={[
                  styles.friendEmail,
                  { color: theme.listSecondaryText },
                  isDisabled && styles.disabledText,
                ]}
              >
                {item.email}
              </Text>
            )}
          </View>
        </View>

        {isSelectionMode && !isDisabled && (
          <View style={styles.selectionCircle}>
            {isSelected && <View style={styles.selectionInnerCircle} />}
          </View>
        )}
      </TouchableOpacity>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.listBg }]} edges={['left', 'right', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: theme.listBorder }]}>
        <IconButton
          icon="arrow-left"
          size={24}
          iconColor={theme.listPrimaryText}
          onPress={() => navigation.goBack()}
        />
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.title, { color: theme.listPrimaryText }]}>
            {isSelectionMode
              ? `Add to ${groupName || 'Group'}`
              : isPrivacyMode
                ? 'Friends and blocked'
                : 'Accepted Friends'}
          </Text>
          {isSelectionMode && (
            <Text style={[styles.subtitle, { color: theme.listSecondaryText }]}>
              Select friends to add to the group
            </Text>
          )}
          {isPrivacyMode && (
            <Text style={[styles.subtitle, { color: theme.listSecondaryText }]}>
              Tap a friend to block them
            </Text>
          )}
        </View>
        {isSelectionMode && selectedFriends.length > 0 && (
          <Button
            mode="contained"
            loading={addingToGroup}
            disabled={addingToGroup}
            onPress={handleAddToGroup}
            style={styles.addButton}
          >
            Add {selectedFriends.length}
          </Button>
        )}
      </View>

      <View style={[styles.searchContainer, { backgroundColor: theme.searchBg }]}>
        <Ionicons name="search" size={20} color={theme.searchPlaceholder} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: theme.searchText }]}
          placeholder="Search friends..."
          placeholderTextColor={theme.searchPlaceholder}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {isSelectionMode && selectedFriends.length > 0 && (
        <View style={styles.selectionInfo}>
          <Text style={styles.selectionInfoText}>
            {selectedFriends.length} friend{selectedFriends.length !== 1 ? 's' : ''} selected
          </Text>
          <TouchableOpacity onPress={() => setSelectedFriends([])}>
            <Text style={styles.clearSelectionText}>Clear</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <FlatList
          data={filteredFriends}
          renderItem={renderFriend}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            isPrivacyMode ? (
              <Text style={[styles.sectionLabel, { color: theme.listSecondaryText }]}>
                Friends
              </Text>
            ) : null
          }
          ListFooterComponent={
            isPrivacyMode ? (
              <View style={styles.blockedSection}>
                <Text style={[styles.sectionLabel, { color: theme.listSecondaryText }]}>
                  Blocked
                </Text>
                {blockedList.length === 0 ? (
                  <Text style={[styles.emptySubtext, { color: theme.listSecondaryText }]}>
                    No blocked users
                  </Text>
                ) : (
                  blockedList.map((item) => (
                    <TouchableOpacity
                      key={item.user_id}
                      style={[styles.friendItem, { borderBottomColor: theme.listBorder }]}
                      onPress={() => handleUnblock(item)}
                    >
                      <View style={styles.friendContent}>
                        {item.avatar_url ? (
                          <Image source={{ uri: item.avatar_url }} style={styles.friendAvatar} />
                        ) : (
                          <View
                            style={[styles.friendAvatar, { backgroundColor: theme.listBorder }]}
                          />
                        )}
                        <View style={styles.friendInfo}>
                          <Text style={[styles.friendName, { color: theme.listPrimaryText }]}>
                            {item.name}
                          </Text>
                          <Text style={[styles.friendEmail, { color: theme.listSecondaryText }]}>
                            Tap to unblock
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: theme.listPrimaryText }]}>
                {isPrivacyMode ? 'No friends to manage.' : 'No accepted friends found.'}
              </Text>
              <Text style={[styles.emptySubtext, { color: theme.listSecondaryText }]}>
                {isPrivacyMode
                  ? 'Blocked people appear below.'
                  : 'Add friends first to invite them to groups'}
              </Text>
            </View>
          }
        />
      )}

      {!isSelectionMode && !isPrivacyMode && (
        <FAB
          style={[styles.fab, { bottom: Math.max(16, insets.bottom + 12) }]}
          icon="plus"
          onPress={() => navigation.navigate('AddFriend')}
          color="#fff"
        />
      )}

      <FloatingActionMenu
        visible={Boolean(friendMenu)}
        x={friendMenu?.x ?? 0}
        y={friendMenu?.y ?? 0}
        onClose={() => setFriendMenu(null)}
        actions={
          friendMenu
            ? [
                {
                  key: 'block',
                  label: 'Block',
                  destructive: true,
                  onPress: () => handleBlockFriend(friendMenu.friend),
                },
                {
                  key: 'unfriend',
                  label: 'Unfriend',
                  destructive: true,
                  onPress: () => void handleUnfriend(friendMenu.friend),
                },
              ]
            : []
        }
      />

      <Portal>
        <Snackbar visible={Boolean(toast)} onDismiss={() => setToast(null)} duration={3000}>
          {toast}
        </Snackbar>
      </Portal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    minHeight: 60,
  },
  headerTitleContainer: { flex: 1, marginLeft: 8 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#000' },
  subtitle: { fontSize: 12, color: '#666', marginTop: 2 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 8,
    backgroundColor: '#f3f3f3',
    paddingHorizontal: 12,
    height: 40,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#333', height: '100%' },
  selectionInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  selectionInfoText: { fontSize: 14, color: '#007AFF', fontWeight: '500' },
  clearSelectionText: { fontSize: 14, color: '#007AFF', fontWeight: '500' },
  addButton: { marginLeft: 8, borderRadius: 20, backgroundColor: '#007AFF' },
  list: { paddingHorizontal: 16 },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  friendItemSelected: { backgroundColor: '#E3F2FD' },
  friendItemDisabled: { opacity: 0.5 },
  friendContent: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  friendAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  friendInfo: { flex: 1 },
  friendNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  friendName: { fontSize: 15, fontWeight: '500', color: '#333', flexShrink: 1 },
  friendEmail: { fontSize: 13, color: '#777', marginTop: 1 },
  disabledText: { color: '#999' },
  alreadyMemberBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  alreadyMemberText: { fontSize: 10, color: '#2E7D32', fontWeight: '500' },
  selectionCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  selectionInnerCircle: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#007AFF' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 16, color: '#666' },
  emptySubtext: { fontSize: 14, color: '#999', marginTop: 4, textAlign: 'center' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  fab: { position: 'absolute', margin: 16, right: 0, bottom: 16, backgroundColor: '#007AFF' },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 4,
  },
  blockedSection: { paddingBottom: 40 },
})
