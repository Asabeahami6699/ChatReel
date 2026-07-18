// src/screens/NewGroupScreen.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  FlatList,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Portal, Snackbar } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OfflineAvatar } from '../../components/OfflineAvatar';
import { api } from '../../lib/api';
import { uploadFromUri } from '../../lib/uploads';
import GroupInviteShareSheet from './GroupInviteShareSheet';
import { useAuth } from '../../hooks/useAuth';
import { useCurrentProfileId } from '../../hooks/useCurrentProfileId';
import { useFriendshipsRealtime } from '../../hooks/useFriendshipsRealtime';
import { notifyRealtimeTopic } from '../../lib/realtimeHub';
import { buildGroupInviteLink, INVITE_SCHEME } from '../../lib/groupInviteLinks';

export type Friend = {
  id: string;
  name: string;
  email?: string;
  avatar_url?: string;
};

type RootStackParamList = { NewGroup: undefined };
type Props = NativeStackScreenProps<RootStackParamList, 'NewGroup'>;

const useAcceptedFriends = () => {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const currentProfileId = useCurrentProfileId();

  const fetchFriends = useCallback(async () => {
    if (!currentProfileId) return;
    setLoading(true);

    try {
      const { friendships: data } = await api.friendships.list('accepted');
      const mapped: Friend[] = (data ?? [])
        .map((row: Record<string, unknown>) => {
          const isSender = row.user_id === currentProfileId;
          const profile = (isSender ? row.receiver_profile : row.sender_profile) as Record<
            string,
            unknown
          > | null;
          if (!profile?.user_id) return null;
          return {
            id: profile.user_id as string,
            name: (profile.display_name as string) ?? (profile.email as string) ?? 'Unknown',
            email: profile.email as string | undefined,
            avatar_url: profile.avatar_url as string | undefined,
          };
        })
        .filter((f): f is Friend => f !== null);

      setFriends(Array.from(new Map(mapped.map((i) => [i.id, i])).values()));
    } catch {
      Alert.alert('Error', 'Could not load friends');
    } finally {
      setLoading(false);
    }
  }, [currentProfileId]);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  useFriendshipsRealtime(currentProfileId, fetchFriends);

  return { friends, loading, refetch: fetchFriends };
};

const NewGroupScreen = ({ navigation }: Props) => {
  const { friends, loading: friendsLoading } = useAcceptedFriends();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [groupName, setGroupName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [showInviteShare, setShowInviteShare] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [createdGroupName, setCreatedGroupName] = useState('');
  const [createdGroupAvatarUrl, setCreatedGroupAvatarUrl] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const filteredFriends = useMemo(() => {
    if (!searchQuery) return friends;
    const q = searchQuery.trim().toLowerCase();
    return friends.filter(f => f.name.toLowerCase().includes(q) || (f.email && f.email.toLowerCase().includes(q)));
  }, [friends, searchQuery]);

  const pickAvatar = async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      Alert.alert('Permission needed', 'Please allow photo library access.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const uploadAvatarAndGetUrl = async (uri: string, groupId: string): Promise<string> => {
    if (!uri) return '';
    try {
      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const filePath = `${groupId}/avatar.${fileExt}`;
      return await uploadFromUri(
        'group_avatar',
        filePath,
        uri,
        `image/${fileExt === 'png' ? 'png' : 'jpeg'}`
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not upload image';
      Alert.alert('Upload Failed', message);
      return '';
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const renderChip = ({ item }: { item: Friend }) => {
    const isSel = selectedIds.includes(item.id);
    return (
      <TouchableOpacity style={[styles.chip, isSel && styles.chipSel]} onPress={() => toggleSelect(item.id)}>
        <OfflineAvatar uri={item.avatar_url} name={item.name} size={36} style={styles.chipAvatar} />
        <View style={styles.chipInfo}>
          <Text style={[styles.chipName, isSel && styles.chipNameSel]}>{item.name}</Text>
          {item.email && <Text style={[styles.chipEmail, isSel && styles.chipEmailSel]}>{item.email}</Text>}
        </View>
        {isSel && <View style={styles.blueCheck}><Ionicons name="checkmark" size={14} color="#fff" /></View>}
      </TouchableOpacity>
    );
  };

  const createGroup = async () => {
    if (!groupName.trim()) return Alert.alert('Validation', 'Enter a group name');
    if (selectedIds.length === 0) return Alert.alert('Validation', 'Select at least one friend');
    if (!user?.id) return Alert.alert('Error', 'Not authenticated');

    setCreating(true);
    
    try {
      console.log('🚀 Starting group creation...');

      // 1. Create the group first
      console.log('📝 Creating group...');
      const { group, invite } = await api.groups.create({
        name: groupName.trim(),
        member_user_ids: selectedIds,
      });

      notifyRealtimeTopic('groups');
      notifyRealtimeTopic('groupMembers');

      const groupId = group.id as string;
      let avatarUrl = '';

      if (avatarUri) {
        avatarUrl = await uploadAvatarAndGetUrl(avatarUri, groupId);
        if (avatarUrl) {
          await api.groups.update(groupId, { avatar_url: avatarUrl });
        }
      }

      const link = invite
        ? buildGroupInviteLink(String((invite as Record<string, unknown>).token))
        : `${INVITE_SCHEME}://group/${groupId}`;

      setCreatedGroupName(groupName.trim());
      setCreatedGroupAvatarUrl(avatarUrl || avatarUri || null);
      setInviteLink(link);
      setSuccessToast(`Group "${groupName.trim()}" created!`);
      setShowInviteShare(true);
      
      console.log('🎉 GROUP CREATION COMPLETED SUCCESSFULLY!');
      console.log('Invite Link:', link);

    } catch (error: any) {
      console.error('❌ GROUP CREATION FAILED:', error);
      
      let errorMessage = 'Failed to create group. Please try again.';
      if (error.message.includes('permission denied')) {
        errorMessage = 'Permission denied. Please check your RLS policies.';
      } else if (error.message.includes('JWT')) {
        errorMessage = 'Authentication error. Please log in again.';
      }
      
      Alert.alert('Error', errorMessage);
    } finally {
      setCreating(false);
    }
  };

  const closeInviteShare = () => {
    setShowInviteShare(false);
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Group</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <TouchableOpacity onPress={pickAvatar} style={styles.avatarPicker}>
            <View style={styles.gradientBorder}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatar} />
              ) : (
                <View style={styles.placeholder}>
                  <Text style={styles.placeholderTxt}>+</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
          <TextInput
            placeholder="Group Name"
            style={styles.input}
            value={groupName}
            onChangeText={setGroupName}
            placeholderTextColor="#999"
          />
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color="#999" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search friends..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#999"
          />
        </View>

        {selectedIds.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countTxt}>{selectedIds.length} selected</Text>
          </View>
        )}

        {friendsLoading ? (
          <ActivityIndicator size="large" color="#0066cc" style={{ marginTop: 30 }} />
        ) : (
          <FlatList
            data={filteredFriends}
            renderItem={renderChip}
            keyExtractor={i => i.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipList}
          />
        )}
      </ScrollView>

      <View style={styles.fab}>
        <TouchableOpacity
          style={[styles.createBtn, (creating || selectedIds.length === 0) && styles.createBtnDisabled]}
          onPress={createGroup}
          disabled={creating || selectedIds.length === 0}
        >
          {creating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={22} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.createBtnTxt}>Create Group</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={showInviteShare}
        animationType="slide"
        transparent
        onRequestClose={closeInviteShare}
      >
        <View style={styles.shareBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={closeInviteShare}
          />
          <View style={[styles.shareSheet, { paddingBottom: insets.bottom }]}>
            {showInviteShare && (
              <GroupInviteShareSheet
                groupName={createdGroupName || groupName}
                inviteLink={inviteLink}
                avatarUrl={createdGroupAvatarUrl}
                onClose={closeInviteShare}
              />
            )}
          </View>
        </View>
      </Modal>

      <Portal>
        <Snackbar
          visible={Boolean(successToast)}
          onDismiss={() => setSuccessToast(null)}
          duration={3500}
        >
          {successToast}
        </Snackbar>
      </Portal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f8f9fa' 
  },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 16, 
    paddingTop: 12, 
    paddingBottom: 16, 
    backgroundColor: '#0066cc',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  headerTitle: { 
    fontSize: 20, 
    fontWeight: '700', 
    color: '#fff' 
  },
  scroll: { 
    padding: 16, 
    paddingBottom: 100 
  },
  card: { 
    backgroundColor: '#fff', 
    borderRadius: 20, 
    padding: 20, 
    alignItems: 'center', 
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    marginBottom: 16 
  },
  avatarPicker: { 
    marginBottom: 16 
  },
  gradientBorder: { 
    width: 90, 
    height: 90, 
    borderRadius: 45, 
    padding: 4, 
    backgroundColor: '#fff', 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderWidth: 3, 
    borderColor: '#0066cc',
    overflow: 'hidden'
  },
  avatar: { 
    width: 80, 
    height: 80, 
    borderRadius: 40 
  },
  placeholder: { 
    width: 80, 
    height: 80, 
    borderRadius: 40, 
    backgroundColor: '#e3f2fd', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  placeholderTxt: { 
    fontSize: 36, 
    color: '#0066cc', 
    fontWeight: '300' 
  },
  input: { 
    width: '100%', 
    borderWidth: 1.5, 
    borderColor: '#ddd', 
    borderRadius: 12, 
    padding: 14, 
    fontSize: 16, 
    backgroundColor: '#fafafa', 
    marginTop: 12,
    color: '#333'
  },
  searchBox: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    borderWidth: 1.5, 
    borderColor: '#ddd', 
    borderRadius: 12, 
    paddingHorizontal: 12, 
    backgroundColor: '#f9f9f9', 
    height: 48, 
    marginBottom: 12 
  },
  searchInput: { 
    flex: 1, 
    fontSize: 15,
    color: '#333'
  },
  countBadge: { 
    alignItems: 'center', 
    marginBottom: 12 
  },
  countTxt: { 
    fontSize: 14, 
    color: '#0066cc', 
    fontWeight: '600', 
    backgroundColor: '#e3f2fd', 
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: 20 
  },
  chipList: { 
    paddingHorizontal: 4 
  },
  chip: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#fff', 
    paddingHorizontal: 12, 
    paddingVertical: 10, 
    borderRadius: 25, 
    marginHorizontal: 6, 
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    borderWidth: 1.5, 
    borderColor: '#eee' 
  },
  chipSel: { 
    backgroundColor: '#0066cc', 
    borderColor: '#0066cc' 
  },
  chipAvatar: { 
    width: 36, 
    height: 36, 
    borderRadius: 18, 
    marginRight: 10 
  },
  chipInfo: { 
    flex: 1 
  },
  chipName: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: '#333' 
  },
  chipNameSel: { 
    color: '#fff' 
  },
  chipEmail: { 
    fontSize: 12, 
    color: '#777' 
  },
  chipEmailSel: { 
    color: '#e0f7ff' 
  },
  blueCheck: { 
    backgroundColor: '#fff', 
    width: 22, 
    height: 22, 
    borderRadius: 11, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginLeft: 6 
  },
  fab: { 
    position: 'absolute', 
    bottom: 20, 
    left: 20, 
    right: 20 
  },
  createBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    backgroundColor: '#0066cc', 
    padding: 16, 
    borderRadius: 14, 
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  createBtnDisabled: { 
    backgroundColor: '#a6c8ff' 
  },
  createBtnTxt: { 
    color: '#fff', 
    fontWeight: '700', 
    fontSize: 16 
  },
  shareBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  shareSheet: {
    height: '78%',
    backgroundColor: '#111',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
});

export default NewGroupScreen;