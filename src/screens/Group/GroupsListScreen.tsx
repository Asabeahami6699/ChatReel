// src/screens/Group/GroupsListScreen.tsx
import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { FAB, IconButton } from 'react-native-paper'
import { Ionicons } from '@expo/vector-icons'
import { OfflineAvatar } from '../../components/OfflineAvatar'
import { useGroupList, type Group } from '../../hooks/useGroupList'

type Props = {
  setSelectedChat?: (chat: any) => void
}

const roleLabel = (role?: Group['user_role']) => {
  if (role === 'creator') return 'Created by you'
  if (role === 'admin') return 'Admin'
  return 'Member'
}

export default function GroupsListScreen({ setSelectedChat }: Props) {
  const navigation = useNavigation<any>()
  const [searchQuery, setSearchQuery] = useState('')
  const { groups, loading, refreshing, refresh, isOnline } = useGroupList(searchQuery)

  const { createdGroups, joinedGroups } = useMemo(() => {
    const created = groups.filter((g) => g.user_role === 'creator')
    const joined = groups.filter((g) => g.user_role !== 'creator')
    return { createdGroups: created, joinedGroups: joined }
  }, [groups])

  type Row =
    | { kind: 'header'; key: string; title: string }
    | { kind: 'group'; key: string; group: Group }

  const rows = useMemo(() => {
    const out: Row[] = []
    if (createdGroups.length) {
      out.push({ kind: 'header', key: 'header-created', title: 'Created by you' })
      createdGroups.forEach((g) => out.push({ kind: 'group', key: g.id, group: g }))
    }
    if (joinedGroups.length) {
      out.push({ kind: 'header', key: 'header-joined', title: 'Joined groups' })
      joinedGroups.forEach((g) => out.push({ kind: 'group', key: g.id, group: g }))
    }
    return out
  }, [createdGroups, joinedGroups])

  const handleOpenGroup = (group: Group) => {
    const params = {
      chatId: group.id,
      chatType: 'group' as const,
      chatName: group.name,
      avatarUrl: group.avatar_url ?? undefined,
    }
    if (Platform.OS === 'web' && setSelectedChat) {
      setSelectedChat(params)
    } else {
      navigation.navigate('ChatRoom', params)
    }
  }

  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === 'header') {
      return <Text style={styles.sectionHeader}>{item.title}</Text>
    }
    const group = item.group
    return (
      <TouchableOpacity
        style={styles.groupItem}
        onPress={() => handleOpenGroup(group)}
        activeOpacity={0.7}
      >
        <OfflineAvatar
          uri={group.avatar_url ?? undefined}
          name={group.name}
          size={44}
          style={styles.groupAvatar}
        />
        <View style={styles.groupInfo}>
          <Text style={styles.groupName} numberOfLines={1}>
            {group.name}
          </Text>
          <Text style={styles.groupMeta} numberOfLines={1}>
            {group.member_count} member{group.member_count !== 1 ? 's' : ''} · {roleLabel(group.user_role)}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#c4c4c4" />
      </TouchableOpacity>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <View style={styles.header}>
        <IconButton icon="arrow-left" size={24} onPress={() => navigation.goBack()} />
        <View style={styles.headerTitleContainer}>
          <Text style={styles.title}>Groups</Text>
          <Text style={styles.subtitle}>Groups you created or joined</Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search groups..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <FlatList
          data={rows}
          renderItem={renderRow}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          refreshing={refreshing}
          onRefresh={isOnline ? refresh : undefined}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No groups yet.</Text>
              <Text style={styles.emptySubtext}>Create a group or join one with an invite link</Text>
            </View>
          }
        />
      )}

      <FAB
        style={styles.fab}
        icon="plus"
        onPress={() => navigation.navigate('NewGroup')}
        color="#fff"
      />
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
  list: { paddingHorizontal: 16, paddingBottom: 96 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8a919c',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 16,
    marginBottom: 6,
  },
  groupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  groupAvatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12 },
  groupInfo: { flex: 1 },
  groupName: { fontSize: 15, fontWeight: '500', color: '#333' },
  groupMeta: { fontSize: 13, color: '#777', marginTop: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 16, color: '#666' },
  emptySubtext: { fontSize: 14, color: '#999', marginTop: 4, textAlign: 'center' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  fab: { position: 'absolute', margin: 16, right: 0, bottom: 0, backgroundColor: '#007AFF' },
})
