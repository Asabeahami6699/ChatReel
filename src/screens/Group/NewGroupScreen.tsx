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
  SafeAreaView,
  ScrollView,
  FlatList,
  Modal,
  Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../hooks/useAuth';
import { decode } from 'base64-arraybuffer';

export type Friend = {
  id: string;
  name: string;
  email?: string;
  avatar_url?: string;
};

type RootStackParamList = { NewGroup: undefined };
type Props = NativeStackScreenProps<RootStackParamList, 'NewGroup'>;

const useAcceptedFriends = () => {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => data && setCurrentProfileId(data.id));
  }, [user?.id]);

  const fetchFriends = useCallback(async () => {
    if (!currentProfileId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('friendships')
      .select(`
        id, user_id, friend_id, status,
        sender_profile:profiles!friendships_user_id_fkey (id, user_id, display_name, email, avatar_url),
        receiver_profile:profiles!friendships_friend_id_fkey (id, user_id, display_name, email, avatar_url)
      `)
      .or(`user_id.eq.${currentProfileId},friend_id.eq.${currentProfileId}`)
      .eq('status', 'accepted');

    if (error) {
      console.error('useAcceptedFriends → error', error);
      Alert.alert('Error', 'Could not load friends');
    } else {
      const mapped: Friend[] = data
        ?.map((row) => {
          const isSender = row.user_id === currentProfileId;
          const profile = isSender ? row.receiver_profile : row.sender_profile;
          if (!profile?.user_id) return null;
          return {
            id: profile.user_id,
            name: profile.display_name ?? profile.email ?? 'Unknown',
            email: profile.email,
            avatar_url: profile.avatar_url,
          };
        })
        .filter((f): f is Friend => f !== null) ?? [];

      const unique = Array.from(new Map(mapped.map((i) => [i.id, i])).values());
      setFriends(unique);
    }
    setLoading(false);
  }, [currentProfileId]);

  useEffect(() => { fetchFriends(); }, [fetchFriends]);

  return { friends, loading, refetch: fetchFriends };
};

const NewGroupScreen = ({ navigation }: Props) => {
  const { friends, loading: friendsLoading } = useAcceptedFriends();
  const { user } = useAuth();

  const [groupName, setGroupName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteLink, setInviteLink] = useState('');

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
      console.log('📤 Uploading avatar for group:', groupId);
      
      // Get file extension
      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `avatar.${fileExt}`;
      const filePath = `${groupId}/${fileName}`;

      console.log('File path:', filePath);
      
      // Convert the image to base64
      const response = await fetch(uri);
      const blob = await response.blob();
      
      // Convert blob to base64
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          // Remove the data URL prefix
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.readAsDataURL(blob);
      });

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('group_avatar')
        .upload(filePath, decode(base64), {
          contentType: `image/${fileExt === 'png' ? 'png' : 'jpeg'}`,
          upsert: true,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      console.log('✅ Upload successful');
      
      // Generate public URL
      const { data } = supabase.storage
        .from('group_avatar')
        .getPublicUrl(filePath);

      const publicUrl = `${data.publicUrl}?t=${Date.now()}`;
      console.log('Generated public URL:', publicUrl);
      
      return publicUrl;

    } catch (error: any) {
      console.error('uploadAvatarAndGetUrl failed:', error);
      Alert.alert('Upload Failed', error.message || 'Could not upload image');
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
        <Image source={{ uri: item.avatar_url || 'https://via.placeholder.com/36' }} style={styles.chipAvatar} />
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
      const groupData = { 
        name: groupName.trim(), 
        creator_id: user.id 
      };

      const { data: group, error: groupError } = await supabase
        .from('groups')
        .insert(groupData)
        .select()
        .single();

      if (groupError) {
        console.error('❌ Group creation failed:', groupError);
        throw groupError;
      }
      
      if (!group) {
        throw new Error('Group was not returned after creation');
      }

      const groupId = group.id;
      console.log('✅ Group created with ID:', groupId);

      // 2. Upload avatar if exists and update group
      let avatarUrl = '';
      if (avatarUri) {
        console.log('🖼️ Uploading avatar...');
        try {
          avatarUrl = await uploadAvatarAndGetUrl(avatarUri, groupId);
          
          if (avatarUrl) {
            console.log('✅ Avatar uploaded, URL:', avatarUrl);
            
            // Update the group with avatar URL
            console.log('🔄 Updating group with avatar URL...');
            const { error: updateError } = await supabase
              .from('groups')
              .update({ avatar_url: avatarUrl })
              .eq('id', groupId);

            if (updateError) {
              console.error('❌ Failed to update avatar URL:', updateError);
              console.log('⚠️ Continuing without avatar URL in database');
            } else {
              console.log('✅ Group updated with avatar URL');
            }
          }
        } catch (avatarError: any) {
          console.error('❌ Avatar upload failed:', avatarError);
          // Non-critical error, continue without avatar
        }
      }

      // 3. Add members
      console.log('👥 Adding members...');
      const members = [
        { group_id: groupId, user_id: user.id, role: 'admin' },
        ...selectedIds.map(id => ({ group_id: groupId, user_id: id, role: 'member' }))
      ];

      const { error: membersError } = await supabase
        .from('group_members')
        .insert(members);

      if (membersError) {
        console.error('❌ Failed to add members:', membersError);
        throw new Error('Failed to add members to group');
      }

      console.log('✅ Members added:', members.length);

      // 4. Generate invite link
      console.log('🔗 Generating invite link...');
      const { data: invite, error: inviteError } = await supabase
        .from('group_invites')
        .insert({ group_id: groupId, created_by: user.id })
        .select()
        .single();

      const link = invite 
        ? `chatapp://invite/${invite.token}` 
        : `chatapp://group/${groupId}`;

      if (inviteError) {
        console.warn('⚠️ Invite creation failed:', inviteError);
      }

      // 5. Verify the group was created with avatar URL
      console.log('🔍 Verifying group in database...');
      const { data: verifyGroup } = await supabase
        .from('groups')
        .select('id, name, avatar_url, created_at')
        .eq('id', groupId)
        .single();
      
      console.log('📊 VERIFICATION RESULTS:');
      console.log('Group ID:', verifyGroup?.id);
      console.log('Group Name:', verifyGroup?.name);
      console.log('Avatar URL:', verifyGroup?.avatar_url || 'NULL (if no avatar uploaded)');
      console.log('Created At:', verifyGroup?.created_at);

      if (!verifyGroup) {
        throw new Error('Failed to verify group creation');
      }

      setInviteLink(link);
      setShowInviteModal(true);
      
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

  const copyLink = () => {
    Alert.alert('Copied', 'Invite link copied to clipboard!');
  };

  const shareLink = async () => {
    try {
      await Linking.openURL(inviteLink);
    } catch (error) {
      console.error('Failed to open link:', error);
      Alert.alert('Error', 'Could not open the invite link');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
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
        visible={showInviteModal} 
        transparent 
        animationType="fade"
        onRequestClose={() => {
          setShowInviteModal(false);
          navigation.goBack();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="checkmark-circle" size={60} color="#4CAF50" style={styles.successIcon} />
            <Text style={styles.modalTitle}>Group Created!</Text>
            <Text style={styles.modalDesc}>
              Your group "{groupName}" has been created successfully.
              Share this link to invite others:
            </Text>
            
            <TouchableOpacity 
              style={styles.linkBox} 
              onPress={shareLink}
              activeOpacity={0.7}
            >
              <Text style={styles.linkText} numberOfLines={2}>
                {inviteLink}
              </Text>
            </TouchableOpacity>
            
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.copyBtn]} 
                onPress={copyLink}
              >
                <Ionicons name="copy-outline" size={20} color="#0066cc" />
                <Text style={styles.modalBtnText}>Copy Link</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalBtn, styles.shareBtn]} 
                onPress={shareLink}
              >
                <Ionicons name="share-outline" size={20} color="#0066cc" />
                <Text style={styles.modalBtnText}>Share</Text>
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity 
              style={styles.doneBtn} 
              onPress={() => {
                setShowInviteModal(false);
                navigation.goBack();
              }}
            >
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: 20 
  },
  modalContent: { 
    width: '100%', 
    backgroundColor: '#fff', 
    borderRadius: 16, 
    padding: 24, 
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  successIcon: {
    marginBottom: 16,
  },
  modalTitle: { 
    fontSize: 24, 
    fontWeight: '700', 
    color: '#0066cc', 
    marginBottom: 12,
    textAlign: 'center'
  },
  modalDesc: { 
    fontSize: 15, 
    color: '#555', 
    textAlign: 'center', 
    marginBottom: 20,
    lineHeight: 22
  },
  linkBox: { 
    borderWidth: 1, 
    borderColor: '#0066cc', 
    borderRadius: 8, 
    padding: 12, 
    width: '100%', 
    marginBottom: 20,
    backgroundColor: '#f0f8ff'
  },
  linkText: { 
    color: '#0066cc', 
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500'
  },
  modalActions: { 
    flexDirection: 'row', 
    marginBottom: 24,
    gap: 12
  },
  modalBtn: { 
    flexDirection: 'row', 
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0066cc',
    backgroundColor: '#fff'
  },
  copyBtn: {
    backgroundColor: '#f0f8ff'
  },
  shareBtn: {
    backgroundColor: '#e6f2ff'
  },
  modalBtnText: { 
    color: '#0066cc', 
    marginLeft: 6, 
    fontWeight: '600',
    fontSize: 14
  },
  doneBtn: { 
    backgroundColor: '#0066cc', 
    paddingHorizontal: 32, 
    paddingVertical: 12, 
    borderRadius: 8,
    width: '100%',
    alignItems: 'center'
  },
  doneBtnText: { 
    color: '#fff', 
    fontWeight: '700',
    fontSize: 16
  },
});

export default NewGroupScreen;