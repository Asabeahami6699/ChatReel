// src/screens/Chat/ChatListScreen.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  RefreshControl,
} from 'react-native'
import { TextInput, FAB, Button } from 'react-native-paper'
import { useAuth } from '../../hooks/useAuth'
import { TabView, SceneMap, TabBar } from 'react-native-tab-view'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../../lib/supabase'
import DropdownMenu from '../../components/DropdownMenu'
import { useNavigation, useIsFocused } from '@react-navigation/native'
import { useIndividualChats } from '../../hooks/useIndividualChats'
import FriendRequestsScreen from './FriendRequestsScreen'
import NetInfo from '@react-native-community/netinfo'

type Props = { setSelectedChat?: (chat: any) => void }

export default function ChatListScreen({ setSelectedChat }: Props) {
  const { user } = useAuth()
  const navigation = useNavigation<any>()
  const isFocused = useIsFocused()
  const [searchQuery, setSearchQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [routes] = useState([
    { key: 'individual', title: 'Individual' },
    { key: 'group', title: 'Groups' },
    { key: 'requests', title: 'Requests' },
  ])
  
  // Group list state
  const [groupChats, setGroupChats] = useState<any[]>([])
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [groupsRefreshing, setGroupsRefreshing] = useState(false)
  const [groupsOnline, setGroupsOnline] = useState(true)
  const [groupsStale, setGroupsStale] = useState(false)
  
  // Individual chats from hook
  const { 
    chats: individualChats, 
    loading: individualLoading, 
    refreshing: individualRefreshing, 
    refresh: refreshIndividuals,
    isOnline: individualOnline,
    isDataStale: individualStale,
    markMessagesAsRead 
  } = useIndividualChats(searchQuery)

  // Network connection check
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setGroupsOnline(state.isConnected ?? true)
    })
    
    return () => unsubscribe()
  }, [])

const fetchGroups = async (isRefreshing = false) => {
  if (!user?.id) return
  
  console.log('🔍 Fetching groups for user:', user.id)

  try {
    if (isRefreshing) {
      setGroupsRefreshing(true)
    } else {
      setGroupsLoading(true)
    }

    // Use a single query that works with RLS policies
    const { data: groups, error } = await supabase
      .from('groups')
      .select(`
        *,
        group_members(
          role,
          joined_at,
          user_id
        )
      `)
      // RLS will automatically filter to groups the user has access to
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ Error fetching groups:', error)
      throw error
    }

    console.log('✅ Groups fetched:', groups?.length || 0)

    // Process groups
    const processedGroups = groups?.map(group => {
      const isCreator = group.creator_id === user.id
      const membership = group.group_members?.find((m: any) => m.user_id === user.id)
      
      return {
        ...group,
        id: group.id,
        name: group.name,
        description: group.description,
        avatar_url: group.avatar_url,
        creator_id: group.creator_id,
        created_at: group.created_at,
        user_role: isCreator ? 'creator' : (membership?.role || 'member'),
        member_count: group.group_members?.length || 0,
        joined_at: isCreator ? group.created_at : (membership?.joined_at || group.created_at),
        last_message_at: group.last_message_at,
        // Remove nested data
        group_members: undefined
      }
    }) || []

    console.log('✅ Processed groups:', processedGroups)

    // Apply search filter
    const filtered = searchQuery 
      ? processedGroups.filter(g => 
          g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (g.description && g.description.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      : processedGroups

    console.log('✅ Final filtered groups:', filtered.length)
    
    setGroupChats(filtered)
    setGroupsStale(false)
    
  } catch (error: any) {
    console.error('❌ FAILED to fetch groups:', error)
    
    // Check for permission errors
    if (error.message?.includes('permission denied') || error.code === '42501') {
      console.error('⚠️ RLS Policy Error: User lacks permission to view groups')
    }
    
    setGroupsStale(true)
  } finally {
    setGroupsLoading(false)
    setGroupsRefreshing(false)
  }
}

// Fallback function if single query fails
const fetchGroupsWithFallback = async () => {
  if (!user?.id) return
  
  console.log('🔄 Using fallback query method...')
  
  // Get all group IDs where user is a member
  const { data: memberships, error: membershipError } = await supabase
    .from('group_members')
    .select('group_id, role, joined_at')
    .eq('user_id', user.id)

  if (membershipError) {
    console.error('Error fetching memberships:', membershipError)
    return
  }

  console.log('✅ User memberships:', memberships)

  if (memberships.length === 0) {
    console.log('⚠️ No memberships found for user')
    setGroupChats([])
    return
  }

  // Get group details for each membership
  const groupIds = memberships.map(m => m.group_id)
  
  const { data: groups, error: groupsError } = await supabase
    .from('groups')
    .select('*')
    .in('id', groupIds)

  if (groupsError) {
    console.error('Error fetching groups by IDs:', groupsError)
    return
  }

  console.log('✅ Groups from memberships:', groups)

  // Combine membership info with group data
  const processedGroups = groups.map(group => {
    const membership = memberships.find(m => m.group_id === group.id)
    const isCreator = group.creator_id === user.id
    
    return {
      ...group,
      user_role: isCreator ? 'creator' : (membership?.role || 'member'),
      member_count: 0, // You can fetch this separately if needed
      joined_at: isCreator ? group.created_at : (membership?.joined_at || group.created_at),
    }
  })

  console.log('✅ Final processed groups:', processedGroups)
  
  setGroupChats(processedGroups)
}
  const refreshGroups = useCallback(() => {
    if (!groupsOnline) {
      console.log('Cannot refresh groups while offline')
      return
    }
    fetchGroups(true)
  }, [groupsOnline, user?.id])

  useEffect(() => {
    if (isFocused) {
      refreshIndividuals()
      fetchGroups()
    }
  }, [isFocused])

  useEffect(() => {
    // Debounced search
    const timeoutId = setTimeout(() => {
      if (user?.id) {
        fetchGroups()
      }
    }, 300)
    
    return () => clearTimeout(timeoutId)
  }, [searchQuery, user?.id])

  const onRefresh = useCallback(() => {
    if (!individualOnline || !groupsOnline) {
      console.log('Cannot refresh while offline')
      return
    }
    Promise.all([refreshIndividuals(), fetchGroups(true)])
  }, [refreshIndividuals, groupsOnline, individualOnline])

  const isRefreshing = individualRefreshing || groupsRefreshing
  const isOnline = individualOnline && groupsOnline

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

  const handleChatPress = async (item: any, isGroup = false) => {
    if (!isGroup && item.unread_count > 0) {
      await markMessagesAsRead(item.user_id)
    }
    navigation.navigate('ChatRoom', {
      chatId: isGroup ? item.id : item.user_id,
      chatType: isGroup ? 'group' : 'individual',
      chatName: item.name,
      avatarUrl: item.avatar_url,
    })
  }

  const AvatarComponent = ({ uri, name }: { uri?: string; name: string }) => {
    const [error, setError] = useState(false);
    
    if (error || !uri || uri.includes('placeholder.com')) {
      return (
        <View style={styles.avatarFallback}>
          <Text style={styles.avatarInitials}>
            {name ? name.charAt(0).toUpperCase() : '?'}
          </Text>
        </View>
      );
    }
    
    return (
      <Image 
        source={{ uri }} 
        style={styles.avatar}
        onError={() => setError(true)}
      />
    );
  };

  const renderChatItem = ({ item, isGroup = false }: { item: any; isGroup?: boolean }) => {
    return (
      <TouchableOpacity 
        style={styles.chatItem} 
        onPress={() => handleChatPress(item, isGroup)}
      >
        <View style={styles.avatarContainer}>
          <AvatarComponent uri={item.avatar_url} name={item.name} />
          {/* Show role badge for groups */}
          {isGroup && item.user_role && (item.user_role === 'creator' || item.user_role === 'admin') && (
            <View style={[
              styles.roleBadge, 
              item.user_role === 'creator' ? styles.creatorBadge : styles.adminBadge
            ]}>
              <Text style={styles.roleBadgeText}>
                {item.user_role === 'creator' ? '👑' : '⚡'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatName} numberOfLines={1}>{item.name}</Text>
            {item.last_message_at && <Text style={styles.time}>{formatTime(item.last_message_at)}</Text>}
          </View>

          <View style={styles.messageContainer}>
            <Text style={[styles.lastMessage, item.unread_count > 0 && styles.unreadMessage]} numberOfLines={1}>
              {item.last_message || 'Start a conversation'}
            </Text>
            <View style={styles.rightContainer}>
              {isGroup && item.member_count > 0 && (
                <View style={styles.memberBadge}>
                  <Text style={styles.memberCount}>{item.member_count}</Text>
                </View>
              )}
              {item.unread_count > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadCount}>
                    {item.unread_count > 99 ? '99+' : item.unread_count}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

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

  const IndividualRoute = () => (
    <FlatList
      data={individualChats}
      renderItem={({ item }) => renderChatItem({ item })}
      keyExtractor={item => item.user_id}
      refreshControl={
        <RefreshControl 
          refreshing={isRefreshing} 
          onRefresh={onRefresh}
          enabled={isOnline}
        />
      }
      ListEmptyComponent={
        individualLoading ? (
          <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
        ) : (
          <EmptyState
            title="No conversations yet"
            subtitle={individualChats.length === 0 ? "Add friends to start chatting" : "No chats match your search"}
            buttonText="Add Friends"
            onPress={() => navigation.navigate('FriendsList')}
            isOnline={isOnline}
          />
        )
      }
      ListHeaderComponent={
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
    />
  )

  const GroupRoute = () => (
    <FlatList
      data={groupChats}
      renderItem={({ item }) => renderChatItem({ item, isGroup: true })}
      keyExtractor={item => item.id}
      refreshControl={
        <RefreshControl 
          refreshing={isRefreshing} 
          onRefresh={onRefresh}
          enabled={isOnline}
        />
      }
      ListEmptyComponent={
        groupsLoading ? (
          <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
        ) : (
          <EmptyState
            title="No groups yet"
            subtitle="Create or join a group to start chatting"
            buttonText="Create New Group"
            onPress={() => navigation.navigate('NewGroup')}
            isOnline={isOnline}
          />
        )
      }
      ListHeaderComponent={
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
    />
  )

  const RequestsRoute = () => (
    <FriendRequestsScreen />
  )

  const renderScene = SceneMap({
    individual: IndividualRoute,
    group: GroupRoute,
    requests: RequestsRoute,
  })

  const renderTabBar = (props: any) => (
    <TabBar
      {...props}
      indicatorStyle={styles.tabIndicator}
      style={styles.tabBar}
      activeColor="#000"
      inactiveColor="#666"
      renderLabel={({ route, focused, color }) => (
        <View style={styles.tabLabelContainer}>
          <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>
            {route.title}
          </Text>
          {route.key === 'requests' && (
            <View style={styles.badgeContainer}>
              {/* Optional: Add notification badge count here if needed */}
            </View>
          )}
        </View>
      )}
    />
  )

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.navbar}>
        <Text style={styles.appName}>ChatApp</Text>
        <View style={styles.searchContainer}>
          <LinearGradient colors={['#4c8bf5', '#1c6dfd']} style={styles.gradientBorder}>
            <View style={styles.searchWrapper}>
              <TextInput
                placeholder="Search chats"
                value={searchQuery}
                onChangeText={setSearchQuery}
                mode="flat"
                style={styles.searchBar}
                underlineColor="transparent"
                theme={{ colors: { text: '#000', background: 'transparent' } }}
                left={<TextInput.Icon icon="magnify" color="#666" />}
              />
            </View>
          </LinearGradient>
        </View>
        <DropdownMenu triggerIcon="ellipsis-vertical" />
      </View>

      <TabView
        navigationState={{ index, routes }}
        renderScene={renderScene}
        onIndexChange={setIndex}
        initialLayout={{ width: Dimensions.get('window').width }}
        renderTabBar={renderTabBar}
        swipeEnabled
      />

      {index === 0 && (
        <FAB 
          style={[styles.fab, !isOnline && styles.disabledFab]} 
          icon="account-plus" 
          onPress={() => isOnline && navigation.navigate('FriendsList')} 
        />
      )}
      {index === 1 && (
        <FAB 
          style={[styles.fab, !isOnline && styles.disabledFab]} 
          icon="account-group" 
          onPress={() => isOnline && navigation.navigate('NewGroup')} 
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  navbar: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 16, 
    paddingVertical: 8, 
    backgroundColor: '#f8f9fa', 
    borderBottomWidth: 1, 
    borderBottomColor: '#e9ecef' 
  },
  appName: { 
    fontSize: 20, 
    fontWeight: '700', 
    color: '#1a1a1a', 
    marginRight: 16 
  },
  searchContainer: { 
    flex: 1, 
    marginHorizontal: 12 
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
    marginBottom: 4 
  },
  chatName: { 
    fontSize: 16, 
    fontWeight: '600', 
    color: '#1a1a1a', 
    flex: 1 
  },
  time: { 
    fontSize: 12, 
    color: '#666' 
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
    fontWeight: 'bold' 
  },
  memberBadge: { 
    backgroundColor: '#e3f2fd', 
    paddingHorizontal: 6, 
    paddingVertical: 2, 
    borderRadius: 8 
  },
  memberCount: { 
    fontSize: 10, 
    color: '#0066cc', 
    fontWeight: '600' 
  },
  tabBar: { 
    backgroundColor: '#fff' 
  },
  tabIndicator: { 
    backgroundColor: '#007AFF', 
    height: 3 
  },
  tabLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabLabel: { 
    fontWeight: '500', 
    fontSize: 14, 
    color: '#666' 
  },
  tabLabelActive: { 
    fontWeight: '700', 
    color: '#000' 
  },
  badgeContainer: {
    marginLeft: 4,
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
    right: 16, 
    bottom: 16, 
    backgroundColor: '#007AFF' 
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