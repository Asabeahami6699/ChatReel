import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { FAB, IconButton } from 'react-native-paper'

type Friend = {
  id: string
  name: string
  email?: string
  avatar_url?: string
}

type Props = {
  setSelectedChat?: (chat: any) => void
}

export default function FriendsListScreen({ setSelectedChat }: Props) {
  const { user } = useAuth()
  const navigation = useNavigation()
  const [friendsList, setFriendsList] = useState<Friend[]>([])
  const [filteredFriends, setFilteredFriends] = useState<Friend[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [currentProfilesId, setCurrentProfilesId] = useState<string | null>(null)

  // Fetch current profile ID
  useEffect(() => {
    const fetchCurrentProfilesId = async () => {
      if (!user?.id) return
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()
      if (data) setCurrentProfilesId(data.id)
    }
    fetchCurrentProfilesId()
  }, [user?.id])

  // Fetch accepted friends
  const fetchFriendsList = async () => {
    if (!currentProfilesId) return
    setLoading(true)
    try {
      const { data } = await supabase
        .from('friendships')
        .select(`
          id,
          user_id,
          friend_id,
          profiles_sender:profiles!friendships_user_id_fkey (id, display_name, email, avatar_url),
          profiles_receiver:profiles!friendships_friend_id_fkey (id, display_name, email, avatar_url)
        `)
        .or(`user_id.eq.${currentProfilesId},friend_id.eq.${currentProfilesId}`)
        .eq('status', 'accepted')

      const friends = data
        ?.map((f) => {
          const profile = f.user_id === currentProfilesId ? f.profiles_receiver : f.profiles_sender
          return {
            id: profile?.id || '',
            name: profile?.display_name || profile?.email || 'Unknown',
            email: profile?.email,
            avatar_url: profile?.avatar_url,
          }
        })
        .filter((f) => f.id) || []

      const uniqueFriends = Array.from(new Map(friends.map((i) => [i.id, i])).values())
      setFriendsList(uniqueFriends)
      setFilteredFriends(uniqueFriends)
    } catch (err) {
      console.error('Fetch friends error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFriendsList()
  }, [currentProfilesId])

  // Subscribe for updates
  useEffect(() => {
    if (!currentProfilesId) return

    const friendsChannel = supabase
      .channel('friends-list-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships', filter: `user_id=eq.${currentProfilesId}` },
        fetchFriendsList
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships', filter: `friend_id=eq.${currentProfilesId}` },
        fetchFriendsList
      )
      .subscribe()

    return () => supabase.removeChannel(friendsChannel)
  }, [currentProfilesId])

  // Filter friends by search query
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

  const handleOpenChat = (item: Friend) => {
    const params = {
      chatType: 'individual',
      chatId: item.id,
      chatName: item.name,
      avatarUrl: item.avatar_url,
    }
    if (Platform.OS === 'web' && setSelectedChat) {
      setSelectedChat(params)
    } else {
      navigation.navigate('ChatRoom', params)
    }
  }

  const renderFriend = ({ item }: { item: Friend }) => (
    <TouchableOpacity
      style={styles.friendItem}
      onPress={() => handleOpenChat(item)}
    >
      {item.avatar_url ? (
        <Image source={{ uri: item.avatar_url }} style={styles.friendAvatar} />
      ) : (
        <View style={[styles.friendAvatar, { backgroundColor: '#ddd' }]} />
      )}
      <View style={styles.friendInfo}>
        <Text style={styles.friendName}>{item.name}</Text>
        {item.email && <Text style={styles.friendEmail}>{item.email}</Text>}
      </View>
    </TouchableOpacity>
  )

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <IconButton icon="arrow-left" size={24} onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Accepted Friends</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search friends..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <FlatList
          data={filteredFriends}
          renderItem={renderFriend}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No accepted friends found.</Text>
            </View>
          }
        />
      )}

      <FAB
        style={styles.fab}
        icon="plus"
        onPress={() => navigation.navigate('AddFriend')}
        color="#fff"
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 1, borderBottomWidth: 3, borderBottomColor: '#eee' },
  title: { fontSize: 18, fontWeight: 'bold', marginLeft: 50 },
  searchContainer: { marginHorizontal: 16, marginTop: 8, marginBottom: 4, borderRadius: 8, backgroundColor: '#f3f3f3', paddingHorizontal: 12, height: 40, justifyContent: 'center' },
  searchInput: { fontSize: 14, color: '#333' },
  list: { paddingHorizontal: 16 },
  friendItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  friendAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  friendInfo: { flex: 1 },
  friendName: { fontSize: 15, fontWeight: '500', color: '#333' },
  friendEmail: { fontSize: 13, color: '#777', marginTop: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 16, color: '#666' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  fab: { position: 'absolute', margin: 16, right: 0, bottom: 0, backgroundColor: '#007AFF' },
})