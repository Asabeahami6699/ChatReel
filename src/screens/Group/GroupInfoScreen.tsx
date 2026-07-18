// src/screens/Chat/GroupInfoScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
  TextInput,
  Switch,
  Share,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconButton } from 'react-native-paper';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons, MaterialIcons, Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../../lib/supabase';
import { OfflineAvatar } from '../../components/OfflineAvatar';
import { api } from '../../lib/api';
import { setStringAsync as copyToClipboard } from '../../lib/clipboard';
import { uploadFromUri } from '../../lib/uploads';
import { useAuth } from '../../hooks/useAuth';
import { useRealtimeTopic } from '../../hooks/useRealtimeTopic';
import { notifyRealtimeTopic } from '../../lib/realtimeHub';
import { buildGroupInviteLink } from '../../lib/groupInviteLinks';
import * as ImagePicker from 'expo-image-picker';

// Storage keys
const GROUP_INFO_STORAGE_KEY = '@group_info_';
const GROUP_MEMBERS_STORAGE_KEY = '@group_members_';
const GROUP_INVITES_STORAGE_KEY = '@group_invites_';
const OFFLINE_ACTIONS_KEY = '@offline_actions';

type GroupMember = {
  id: string;
  user_id: string;
  group_id: string;
  role: 'admin' | 'member' | 'creator';
  joined_at: string;
  profiles?: {
    user_id: string;
    display_name: string;
    avatar_url: string;
    email: string;
  };
};

type GroupInfo = {
  id: string;
  name: string;
  description?: string;
  avatar_url?: string;
  created_at: string;
  creator_id: string;
  is_public: boolean;
  members_count: number;
};

type GroupInvite = {
  id: string;
  token: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
  created_by_profile?: {
    display_name: string;
    avatar_url: string;
  };
};

type OfflineAction = {
  id: string;
  type: 'update_description' | 'update_privacy' | 'update_role' | 'remove_member' | 'create_invite' | 'revoke_invite' | 'add_member' | 'update_avatar';
  data: any;
  timestamp: number;
  groupId: string;
};

export default function GroupInfoScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { groupId } = route.params;
  const { user } = useAuth();

  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [visibleMembers, setVisibleMembers] = useState<GroupMember[]>([]);
  const [showAllMembers, setShowAllMembers] = useState(false);
  const [invites, setInvites] = useState<GroupInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showInviteOptions, setShowInviteOptions] = useState(false);
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [notificationsMuted, setNotificationsMuted] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [description, setDescription] = useState('');
  const [selectedMember, setSelectedMember] = useState<GroupMember | null>(null);
  const [showMemberActions, setShowMemberActions] = useState(false);
  const [selectedInvite, setSelectedInvite] = useState<GroupInvite | null>(null);
  const [showInviteActions, setShowInviteActions] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isDataStale, setIsDataStale] = useState(false);
  const [hasPendingActions, setHasPendingActions] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  
  // Collapsible sections
  const [expandedSections, setExpandedSections] = useState({
    members: true,
    settings: false,
    invites: false,
    info: false
  });

  // Check network status and pending actions
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = state.isConnected || false;
      setIsOnline(online);
      
      if (online && hasPendingActions) {
        syncPendingActions();
      }
    });

    checkPendingActions();
    
    return () => unsubscribe();
  }, [groupId]);

  useEffect(() => {
    fetchGroupInfo();
  }, [groupId]);

  // Update visible members when members list changes
  useEffect(() => {
    if (showAllMembers) {
      setVisibleMembers(members);
    } else {
      setVisibleMembers(members.slice(0, 20));
    }
  }, [members, showAllMembers]);

 // Update your existing useEffect to include group updates
useEffect(() => {
  if (!groupId || !isOnline) return;

  // Sort function for consistent ordering
  const sortMembers = (membersList: GroupMember[]): GroupMember[] => {
    const rolePriority: Record<string, number> = {
      'creator': 3,
      'admin': 2,
      'member': 1
    };
    
    return [...membersList].sort((a, b) => {
      const priorityA = rolePriority[a.role] || 0;
      const priorityB = rolePriority[b.role] || 0;
      
      if (priorityB !== priorityA) {
        return priorityB - priorityA;
      }
      
      const nameA = a.profiles?.display_name || '';
      const nameB = b.profiles?.display_name || '';
      return nameA.localeCompare(nameB);
    });
  };

  // Subscribe to group members changes
  const membersChannel = supabase
    .channel(`group-members-${groupId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'group_members',
        filter: `group_id=eq.${groupId}`
      },
      async (payload) => {
        const newMember = payload.new as GroupMember;
        
        if (members.some(m => m.id === newMember.id || m.user_id === newMember.user_id)) {
          return;
        }

        const { profile } = await api.profiles.getByUserId(newMember.user_id);

        const processedMember: GroupMember = {
          ...newMember,
          role: newMember.user_id === groupInfo?.creator_id ? 'creator' : newMember.role,
          profiles: profile 
            ? {
                user_id: profile.user_id,
                display_name: profile.display_name || `User ${profile.user_id?.slice(0, 8)}`,
                avatar_url: profile.avatar_url,
                email: profile.email || 'No email'
              }
            : {
                user_id: newMember.user_id,
                display_name: 'New Member',
                avatar_url: null,
                email: 'No email'
              }
        };

        const updatedMembers = sortMembers([...members, processedMember]);
        setMembers(updatedMembers);
        
        if (groupInfo) {
          const updatedGroupInfo = {
            ...groupInfo,
            members_count: (groupInfo.members_count || 0) + 1
          };
          setGroupInfo(updatedGroupInfo);
          await saveToStorage(GROUP_INFO_STORAGE_KEY, updatedGroupInfo);
        }

        await saveToStorage(GROUP_MEMBERS_STORAGE_KEY, updatedMembers);
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'group_members',
        filter: `group_id=eq.${groupId}`
      },
      (payload) => {
        const oldMember = payload.old as GroupMember;
        const updatedMembers = sortMembers(
          members.filter(m => m.id !== oldMember.id)
        );
        setMembers(updatedMembers);
        
        if (groupInfo) {
          const updatedGroupInfo = {
            ...groupInfo,
            members_count: Math.max(0, (groupInfo.members_count || 0) - 1)
          };
          setGroupInfo(updatedGroupInfo);
          saveToStorage(GROUP_INFO_STORAGE_KEY, updatedGroupInfo);
        }

        saveToStorage(GROUP_MEMBERS_STORAGE_KEY, updatedMembers);
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'group_members',
        filter: `group_id=eq.${groupId}`
      },
      async (payload) => {
        const updatedMember = payload.new as GroupMember;
        const updatedMembers = sortMembers(
          members.map(member => 
            member.id === updatedMember.id ? {
              ...member,
              role: updatedMember.role
            } : member
          )
        );
        
        setMembers(updatedMembers);
        
        if (updatedMember.role === 'creator' && groupInfo) {
          const updatedGroupInfo = {
            ...groupInfo,
            creator_id: updatedMember.user_id
          };
          setGroupInfo(updatedGroupInfo);
          await saveToStorage(GROUP_INFO_STORAGE_KEY, updatedGroupInfo);
        }

        await saveToStorage(GROUP_MEMBERS_STORAGE_KEY, updatedMembers);
      }
    )
    .subscribe();

  // Subscribe to group updates (for privacy changes, avatar, description, etc.)
  const groupChannel = supabase
    .channel(`group-updates-${groupId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'groups',
        filter: `id=eq.${groupId}`
      },
      async (payload) => {
        const updatedGroup = payload.new as GroupInfo;
        
        // Update local state
        if (groupInfo) {
          const updatedGroupInfo = {
            ...groupInfo,
            ...updatedGroup
          };
          setGroupInfo(updatedGroupInfo);
          
          // Update derived states
          setIsPublic(updatedGroup.is_public || false);
          setDescription(updatedGroup.description || '');
          
          // Save to storage
          await saveToStorage(GROUP_INFO_STORAGE_KEY, updatedGroupInfo);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(membersChannel);
    supabase.removeChannel(groupChannel);
  };
}, [groupId, isOnline, members, groupInfo]);

  // Storage utilities
  const saveToStorage = async (key: string, data: any) => {
    try {
      await AsyncStorage.setItem(key + groupId, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (error) {
      
    }
  };

  const loadFromStorage = async (key: string) => {
    try {
      const storedData = await AsyncStorage.getItem(key + groupId);
      if (storedData) {
        const parsed = JSON.parse(storedData);
        return parsed.data;
      }
    } catch (error) {
      
    }
    return null;
  };

  const isStaleData = async (key: string) => {
    try {
      const storedData = await AsyncStorage.getItem(key + groupId);
      if (storedData) {
        const parsed = JSON.parse(storedData);
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        return parsed.timestamp < fiveMinutesAgo;
      }
    } catch (error) {
      
    }
    return true;
  };

  // Offline actions queue
  const addOfflineAction = async (action: Omit<OfflineAction, 'id'>) => {
    try {
      const storedActions = await AsyncStorage.getItem(OFFLINE_ACTIONS_KEY);
      const actions: OfflineAction[] = storedActions ? JSON.parse(storedActions) : [];
      const newAction = {
        ...action,
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9)
      };
      actions.push(newAction);
      await AsyncStorage.setItem(OFFLINE_ACTIONS_KEY, JSON.stringify(actions));
      setHasPendingActions(true);
    } catch (error) {
      
    }
  };

  const removeOfflineAction = async (actionId: string) => {
    try {
      const storedActions = await AsyncStorage.getItem(OFFLINE_ACTIONS_KEY);
      const actions: OfflineAction[] = storedActions ? JSON.parse(storedActions) : [];
      const filteredActions = actions.filter(action => action.id !== actionId);
      await AsyncStorage.setItem(OFFLINE_ACTIONS_KEY, JSON.stringify(filteredActions));
      setHasPendingActions(filteredActions.length > 0);
    } catch (error) {
      
    }
  };

  const checkPendingActions = async () => {
    try {
      const storedActions = await AsyncStorage.getItem(OFFLINE_ACTIONS_KEY);
      const actions: OfflineAction[] = storedActions ? JSON.parse(storedActions) : [];
      const groupActions = actions.filter(action => action.groupId === groupId);
      setHasPendingActions(groupActions.length > 0);
    } catch (error) {
      
    }
  };

  // Helper to immediately update UI state and cache
  const updateLocalState = async (updates: {
    groupInfo?: Partial<GroupInfo>,
    members?: GroupMember[],
    invites?: GroupInvite[]
  }) => {
    try {
      if (updates.groupInfo && groupInfo) {
        const newGroupInfo = { ...groupInfo, ...updates.groupInfo };
        setGroupInfo(newGroupInfo);
        await saveToStorage(GROUP_INFO_STORAGE_KEY, newGroupInfo);
      }
      
      if (updates.members) {
        setMembers(updates.members);
        await saveToStorage(GROUP_MEMBERS_STORAGE_KEY, updates.members);
      }
      
      if (updates.invites) {
        setInvites(updates.invites);
        await saveToStorage(GROUP_INVITES_STORAGE_KEY, updates.invites);
      }
    } catch (error) {
      
    }
  };

  const syncPendingActions = async () => {
    if (!isOnline) {
      Alert.alert('Offline', 'Cannot sync while offline.');
      return;
    }

    try {
      setLoading(true);
      const storedActions = await AsyncStorage.getItem(OFFLINE_ACTIONS_KEY);
      const actions: OfflineAction[] = storedActions ? JSON.parse(storedActions) : [];
      const groupActions = actions.filter(action => action.groupId === groupId);
      
      let successCount = 0;
      let errorCount = 0;

      for (const action of groupActions) {
        try {
          switch (action.type) {
            case 'update_description':
              await api.groups.update(groupId, { description: action.data.description });
              break;
            case 'update_privacy':
              await api.groups.update(groupId, { is_public: action.data.is_public });
              break;
            case 'update_role':
              await api.groups.updateMemberRole(groupId, action.data.memberId, action.data.newRole);
              break;
            case 'remove_member':
              await api.groups.removeMember(groupId, action.data.memberId);
              break;
            case 'create_invite':
              await api.groups.createInvite(groupId);
              break;
            case 'revoke_invite':
              await api.groups.revokeInvite(groupId, action.data.inviteId);
              break;
            case 'update_avatar':
              await api.groups.update(groupId, { avatar_url: action.data.avatar_url });
              break;
            case 'add_member':
              await api.groups.addMembers(
                groupId,
                (action.data.members as { user_id: string }[]).map((m) => m.user_id)
              );
              break;
          }
          await removeOfflineAction(action.id);
          successCount++;
        } catch (error) {
          errorCount++;
        }
      }
      
      await fetchGroupInfo(true);
      
      Alert.alert(
        'Sync Complete',
        `Successfully synced ${successCount} action(s).${errorCount > 0 ? ` ${errorCount} failed.` : ''}`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      Alert.alert('Sync Error', 'Failed to sync changes.');
    } finally {
      setLoading(false);
    }
  };

  const fetchGroupInfo = async (forceRefresh = false) => {
    try {
      if (!forceRefresh) setLoading(true);
      
      const netInfo = await NetInfo.fetch();
      const online = netInfo.isConnected;
      setIsOnline(online || false);

      const [cachedGroup, cachedMembers, cachedInvites] = await Promise.all([
        loadFromStorage(GROUP_INFO_STORAGE_KEY),
        loadFromStorage(GROUP_MEMBERS_STORAGE_KEY),
        loadFromStorage(GROUP_INVITES_STORAGE_KEY)
      ]);

      if (cachedGroup || cachedMembers || cachedInvites) {
        if (cachedGroup) {
          setGroupInfo(cachedGroup);
          setDescription(cachedGroup.description || '');
          setIsPublic(cachedGroup.is_public || false);
        }
        if (cachedMembers) setMembers(cachedMembers);
        if (cachedInvites) setInvites(cachedInvites);
        
        if (!forceRefresh) setLoading(false);
      }

      if (!online) {
        if (!cachedGroup && !cachedMembers && !cachedInvites) {
          Alert.alert(
            'Offline Mode',
            'You are offline. Using cached data if available.',
            [{ text: 'OK' }]
          );
        }
        if (!forceRefresh) setLoading(false);
        return;
      }

      const { group: groupData, members: sortedMembers, invites: processedInvites } =
        await api.groups.details(groupId);

      if (!groupData) {
        Alert.alert('Error', 'Group not found');
        navigation.goBack();
        return;
      }

      await Promise.all([
        saveToStorage(GROUP_INFO_STORAGE_KEY, groupData),
        saveToStorage(GROUP_MEMBERS_STORAGE_KEY, sortedMembers),
        saveToStorage(GROUP_INVITES_STORAGE_KEY, processedInvites),
      ]);

      setGroupInfo(groupData);
      setMembers(sortedMembers as GroupMember[]);
      setInvites(processedInvites as GroupInvite[]);
      setDescription((groupData.description as string) || '');
      setIsPublic(Boolean(groupData.is_public));
      setIsDataStale(false);

      try {
        const { preferences } = await api.chatSettings.get('group', groupId);
        const mutedUntil = preferences.muted_until as string | null;
        setNotificationsMuted(Boolean(mutedUntil && new Date(mutedUntil) > new Date()));
      } catch {
        /* optional */
      }
      
    } catch (error: any) {
      if (groupInfo || members.length > 0 || invites.length > 0) {
        // Using cached data despite error
      } else {
        if (error?.message?.includes('404') || error?.message?.includes('not found')) {
          Alert.alert('Error', 'Group not found. It may have been deleted.');
          navigation.goBack();
        } else if (error?.message?.includes('permission')) {
          Alert.alert('Error', 'You do not have permission to view this group.');
        } else {
          Alert.alert('Error', 'Failed to load group information. Please try again.');
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const refreshData = async () => {
    if (!isOnline) {
      Alert.alert('Offline', 'Cannot refresh while offline.');
      return;
    }
    setRefreshing(true);
    await fetchGroupInfo(true);
  };

  useRealtimeTopic('groupInvites', () => {
    if (isOnline) void fetchGroupInfo(true);
  }, Boolean(groupId));

  const generateInviteLink = async () => {
    try {
      setGeneratingInvite(true);

      if (!isOnline) {
        const tempId = Date.now().toString();
        const newInvite = {
          id: tempId,
          token: `offline_${tempId}`,
          created_by: user?.id || '',
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          used_at: null,
          used_by: null,
          created_by_profile: {
            display_name: user?.email?.split('@')[0] || 'You',
            avatar_url: null
          }
        };
        
        const updatedInvites = [...invites, newInvite];
        setInvites(updatedInvites);
        await saveToStorage(GROUP_INVITES_STORAGE_KEY, updatedInvites);
        
        await addOfflineAction({
          type: 'create_invite',
          data: {
            group_id: groupId,
            created_by: user?.id,
          },
          timestamp: Date.now(),
          groupId
        });

        setShowInviteOptions(false);
        Alert.alert(
          'Saved Locally',
          'Invite link saved. It will be created on the server when you reconnect.',
          [{ text: 'OK' }]
        );
        return;
      }

      const { invite: data } = await api.groups.createInvite(groupId);

      const newInvite = {
        ...data,
        created_by_profile: {
          display_name: user?.email?.split('@')[0] || 'You',
          avatar_url: null
        }
      };
      
      const updatedInvites = [...invites, newInvite];
      setInvites(updatedInvites);
      await saveToStorage(GROUP_INVITES_STORAGE_KEY, updatedInvites);
      notifyRealtimeTopic('groupInvites');

      const inviteLink = buildGroupInviteLink(String(data.token));
      
      setShowInviteOptions(false);
      
      Alert.alert(
        'Invite Link Created',
        'Choose how you want to share the invite link:',
        [
          {
            text: 'Share Link',
            onPress: () => shareInviteLink(inviteLink)
          },
          {
            text: 'Copy Link',
            onPress: () => copyInviteLink(inviteLink)
          },
          {
            text: 'Cancel',
            style: 'cancel'
          }
        ]
      );
      
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to generate invite link');
    } finally {
      setGeneratingInvite(false);
    }
  };

  const shareInviteLink = async (deepLink: string) => {
    try {
      await Share.share({
        message: `Join my group "${groupInfo?.name}"\n${deepLink}`,
        url: Platform.OS === 'ios' ? deepLink : undefined,
        title: `Join ${groupInfo?.name}`,
      });
    } catch (error) {
      copyInviteLink(deepLink);
    }
  };

  const copyInviteLink = async (link: string) => {
    await copyToClipboard(link);
    Alert.alert('Success', 'Invite link copied to clipboard!');
  };

  const revokeInvite = async (inviteId: string) => {
    try {
      if (!isOnline) {
        Alert.alert('Offline', 'Cannot revoke invites while offline.');
        return;
      }

      await api.groups.revokeInvite(groupId, inviteId);

      const updatedInvites = invites.filter(inv => inv.id !== inviteId);
      setInvites(updatedInvites);
      await saveToStorage(GROUP_INVITES_STORAGE_KEY, updatedInvites);
      notifyRealtimeTopic('groupInvites');

      Alert.alert('Success', 'Invite link revoked');
    } catch (error) {
      Alert.alert('Error', 'Failed to revoke invite');
    }
  };

  const updateGroupDescription = async () => {
    try {
      const updatedGroupInfo = groupInfo ? { 
        ...groupInfo, 
        description 
      } : null;
      
      if (updatedGroupInfo) {
        await updateLocalState({ groupInfo: updatedGroupInfo });
      }
      
      setEditingDescription(false);

      if (!isOnline) {
        await addOfflineAction({
          type: 'update_description',
          data: { description },
          timestamp: Date.now(),
          groupId
        });
        
        Alert.alert('Saved Locally', 'Description updated. Will sync when online.');
        return;
      }

      await api.groups.update(groupId, { description });

      Alert.alert('Success', 'Description updated');
    } catch (error) {
      Alert.alert('Error', 'Failed to update description');
    }
  };

 const updateGroupPrivacy = async (value: boolean) => {
  try {
    setIsPublic(value);

    const updatedGroupInfo = groupInfo ? { ...groupInfo, is_public: value } : null;
    if (updatedGroupInfo) {
      setGroupInfo(updatedGroupInfo);
      await saveToStorage(GROUP_INFO_STORAGE_KEY, updatedGroupInfo);
    }

    if (!isOnline) {
      await addOfflineAction({
        type: 'update_privacy',
        data: { is_public: value },
        timestamp: Date.now(),
        groupId,
      });
      return;
    }

    await api.groups.update(groupId, { is_public: value });
  } catch {
    setIsPublic(!value);
    const revertedGroupInfo = groupInfo ? { ...groupInfo, is_public: !value } : null;
    if (revertedGroupInfo) {
      setGroupInfo(revertedGroupInfo);
      await saveToStorage(GROUP_INFO_STORAGE_KEY, revertedGroupInfo);
    }
    if (isOnline) {
      Alert.alert('Error', 'Failed to update privacy settings. Please try again.');
    }
  }
};

  const toggleGroupNotifications = async (muted: boolean) => {
    setNotificationsMuted(muted);
    try {
      await api.chatSettings.update('group', groupId, {
        muted_until: muted
          ? new Date(Date.now() + 365 * 86400_000).toISOString()
          : null,
      });
    } catch {
      setNotificationsMuted(!muted);
      Alert.alert('Error', 'Could not update notification settings');
    }
  };
  const updateMemberRole = async (memberId: string, newRole: 'admin' | 'member') => {
    try {
      const updatedMembers = members.map(member =>
        member.id === memberId ? { ...member, role: newRole } : member
      );
      
      await updateLocalState({ members: updatedMembers });
      
      setShowMemberActions(false);

      if (!isOnline) {
        await addOfflineAction({
          type: 'update_role',
          data: { memberId, newRole },
          timestamp: Date.now(),
          groupId
        });
        
        Alert.alert('Saved Locally', 'Role updated. Will sync when online.');
        return;
      }

      await api.groups.updateMemberRole(groupId, memberId, newRole);
      
      Alert.alert('Success', 'Member role updated');
    } catch (error) {
      Alert.alert('Error', 'Failed to update member role');
    }
  };

  const removeMember = async (memberId: string, memberUserId: string) => {
    const memberToRemove = members.find(m => m.id === memberId);
    if (memberToRemove?.role === 'creator') {
      Alert.alert('Error', 'Cannot remove the group creator');
      return;
    }

    try {
      const updatedMembers = members.filter(member => member.id !== memberId);
      const updatedGroupInfo = groupInfo ? { 
        ...groupInfo, 
        members_count: groupInfo.members_count - 1 
      } : null;
      
      await Promise.all([
        updateLocalState({ 
          members: updatedMembers,
          groupInfo: updatedGroupInfo 
        })
      ]);
      
      setShowMemberActions(false);

      if (!isOnline) {
        await addOfflineAction({
          type: 'remove_member',
          data: { memberId, memberUserId },
          timestamp: Date.now(),
          groupId
        });
        
        Alert.alert('Saved Locally', 'Member removed. Will sync when online.');
        return;
      }

      await api.groups.removeMember(groupId, memberId);
      
      Alert.alert('Success', 'Member removed');
    } catch (error) {
      Alert.alert('Error', 'Failed to remove member');
    }
  };

  const leaveGroup = async () => {
    Alert.alert(
      'Leave Group',
      'Are you sure you want to leave this group?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              const currentMember = members.find(m => m.user_id === user?.id);
              
              if (currentMember?.role === 'creator') {
                Alert.alert(
                  'Cannot Leave Group',
                  'As the group creator, you cannot leave the group. You must either:\n\n1. Transfer ownership to another member\n2. Delete the group',
                  [{ text: 'OK' }]
                );
                return;
              }

              if (!isOnline) {
                Alert.alert('Offline', 'Cannot leave group while offline.');
                return;
              }

              await api.groups.leave(groupId);

              Alert.alert('Success', 'You have left the group');
              navigation.navigate('ChatList');
            } catch (error) {
              Alert.alert('Error', 'Failed to leave group');
            }
          },
        },
      ]
    );
  };

  const deleteGroup = async () => {
    const userRole = members.find(m => m.user_id === user?.id)?.role;
    
    if (userRole !== 'creator') {
      Alert.alert('Error', 'Only the group creator can delete the group');
      return;
    }

    if (!isOnline) {
      Alert.alert('Offline', 'Cannot delete group while offline.');
      return;
    }

    Alert.alert(
      'Delete Group',
      'Are you sure you want to delete this group? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.groups.delete(groupId);

              await Promise.all([
                AsyncStorage.removeItem(GROUP_INFO_STORAGE_KEY + groupId),
                AsyncStorage.removeItem(GROUP_MEMBERS_STORAGE_KEY + groupId),
                AsyncStorage.removeItem(GROUP_INVITES_STORAGE_KEY + groupId),
              ]);

              Alert.alert('Success', 'Group deleted successfully');
              navigation.navigate('ChatList');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete group');
            }
          },
        },
      ]
    );
  };

  // Function to pick and update group avatar
  const pickGroupAvatar = async () => {
    try {
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please grant camera roll permissions to change your avatar.');
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setUploadingAvatar(true);
        
        const imageUri = result.assets[0].uri;
        
        const fileName = `${groupId}/avatar_${Date.now()}.jpg`;
        const publicUrl = await uploadFromUri('group_avatar', fileName, imageUri, 'image/jpeg');

        const updatedGroupInfo = groupInfo ? { ...groupInfo, avatar_url: publicUrl } : null;

        if (updatedGroupInfo) {
          setGroupInfo(updatedGroupInfo);
          await saveToStorage(GROUP_INFO_STORAGE_KEY, updatedGroupInfo);
        }

        if (!isOnline) {
          await addOfflineAction({
            type: 'update_avatar',
            data: { avatar_url: publicUrl },
            timestamp: Date.now(),
            groupId,
          });

          Alert.alert('Saved Locally', 'Avatar updated. Will sync when online.');
          return;
        }

        await api.groups.update(groupId, { avatar_url: publicUrl });

        Alert.alert('Success', 'Group avatar updated!');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update avatar');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const currentUserRole = members.find(m => m.user_id === user?.id)?.role;
  const isCreator = currentUserRole === 'creator';
  const isAdmin = isCreator || currentUserRole === 'admin';

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const renderMemberItem = ({ item }: { item: GroupMember }) => {
    const isCurrentUser = item.user_id === user?.id;
    const canManage = isAdmin && !isCurrentUser && item.role !== 'creator';
    
    const displayName = item.profiles?.display_name || 'Unknown User';
    const truncatedName = displayName.length > 15 
      ? `${displayName.substring(0, 15)}...` 
      : displayName;
    
    const getRoleBadge = () => {
      switch(item.role) {
        case 'creator':
          return { text: '👑 Creator', color: '#FFD700', bgColor: '#FFF8E1' };
        case 'admin':
          return { text: '⚡ Admin', color: '#007AFF', bgColor: '#E3F2FD' };
        default:
          return { text: '👤 Member', color: '#666', bgColor: '#F5F5F5' };
      }
    };
    
    const roleBadge = getRoleBadge();
    
    return (
      <TouchableOpacity
        style={styles.memberItem}
        onPress={() => {
          // Navigate to chat with this member
          navigation.navigate('ChatRoom', {
            chatType: 'individual',
            chatId: item.user_id,
            chatName: item.profiles?.display_name || 'User',
            avatarUrl: item.profiles?.avatar_url,
          });
        }}
      >
        <View style={styles.memberInfo}>
          <OfflineAvatar
            uri={item.profiles?.avatar_url}
            name={displayName}
            size={40}
            style={styles.memberAvatar}
          />
          <View style={styles.memberDetails}>
            <View style={styles.nameRow}>
              <Text style={styles.memberName} numberOfLines={1}>
                {truncatedName}
                {isCurrentUser && ' (You)'}
              </Text>
              <View style={[styles.roleBadge, { backgroundColor: roleBadge.bgColor }]}>
                <Text style={[styles.roleBadgeText, { color: roleBadge.color }]}>
                  {roleBadge.text}
                </Text>
              </View>
            </View>
            <Text style={styles.memberEmail} numberOfLines={1}>
              {item.profiles?.email || 'No email'}
            </Text>
          </View>
        </View>
        
        {canManage && (
          <TouchableOpacity 
            onPress={(e) => {
              e.stopPropagation();
              setSelectedMember(item);
              setShowMemberActions(true);
            }}
            style={styles.manageButton}
          >
            <Feather name="more-vertical" size={20} color="#666" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const renderInviteItem = ({ item }: { item: GroupInvite }) => {
    const expiresDate = new Date(item.expires_at);
    const now = new Date();
    const timeLeft = Math.ceil((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    return (
      <TouchableOpacity
        style={styles.inviteItem}
        onPress={() => {
          setSelectedInvite(item);
          setShowInviteActions(true);
        }}
      >
        <View style={styles.inviteInfo}>
          <Feather name="link" size={24} color="#007AFF" />
          <View style={styles.inviteDetails}>
            <Text style={styles.inviteToken} numberOfLines={1}>
              Token: ...{item.token.slice(-8)}
            </Text>
            <Text style={styles.inviteMeta}>
              Created by {item.created_by_profile?.display_name || 'Unknown'} • 
              Expires in {timeLeft} day{timeLeft !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
        <Feather name="more-vertical" size={20} color="#666" />
      </TouchableOpacity>
    );
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <View style={styles.header}>
          <IconButton icon="arrow-left" size={24} onPress={() => navigation.goBack()} />
          <Text style={styles.headerTitle}>Group Info</Text>
          <View style={{ width: 48 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading group information...</Text>
          {!isOnline && (
            <Text style={styles.offlineText}>You are offline</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshData}
            enabled={isOnline}
            colors={['#007AFF']}
            tintColor="#007AFF"
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <IconButton icon="arrow-left" size={24} onPress={() => navigation.goBack()} />
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Group Info</Text>
            {!isOnline && (
              <View style={styles.offlineBadge}>
                <Feather name="wifi-off" size={12} color="#fff" />
                <Text style={styles.offlineBadgeText}>Offline</Text>
              </View>
            )}
            {hasPendingActions && (
              <TouchableOpacity onPress={syncPendingActions} style={styles.pendingBadge}>
                <Feather name="upload-cloud" size={12} color="#fff" />
                <Text style={styles.pendingBadgeText}>Sync Pending</Text>
              </TouchableOpacity>
            )}
          </View>
          <IconButton 
            icon="dots-vertical" 
            size={24} 
            onPress={() => {
              Alert.alert(
                'Group Actions',
                '',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Refresh Data', onPress: refreshData, disabled: !isOnline },
                  hasPendingActions && { text: 'Sync Pending Actions', onPress: syncPendingActions },
                  { text: 'Leave Group', style: 'destructive', onPress: leaveGroup },
                  isCreator && { text: 'Delete Group', style: 'destructive', onPress: deleteGroup },
                ].filter(Boolean) as any
              );
            }}
          />
        </View>

        {/* Offline Notice */}
        {!isOnline && (
          <View style={styles.offlineNotice}>
            <Feather name="wifi-off" size={16} color="#fff" />
            <Text style={styles.offlineNoticeText}>
              You are offline. Some features may be limited.
            </Text>
          </View>
        )}

        {/* Group Header Section */}
        <View style={styles.groupHeader}>
          <View style={styles.avatarContainer}>
            <OfflineAvatar
              uri={groupInfo?.avatar_url}
              name={groupInfo?.name}
              size={60}
              style={styles.groupAvatar}
            />
            {isAdmin && (
              <TouchableOpacity 
                style={styles.editAvatarButton}
                onPress={pickGroupAvatar}
                disabled={uploadingAvatar}
              >
                {uploadingAvatar ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="camera" size={16} color="#fff" />
                )}
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.groupName}>{groupInfo?.name}</Text>
          <View style={styles.groupStats}>
            <View style={styles.statItem}>
              <Ionicons name="people" size={20} color="#666" />
              <Text style={styles.statText}>{groupInfo?.members_count} members</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name={isPublic ? "globe" : "lock-closed"} size={20} color="#666" />
              <Text style={styles.statText}>{isPublic ? 'Public' : 'Private'}</Text>
            </View>
          </View>
        </View>

        {/* Description Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Description</Text>
            {isAdmin && !editingDescription && (
              <TouchableOpacity onPress={() => setEditingDescription(true)}>
                <Feather name="edit-2" size={18} color="#007AFF" />
              </TouchableOpacity>
            )}
          </View>
          
          {editingDescription ? (
            <View style={styles.editDescriptionContainer}>
              <TextInput
                style={styles.descriptionInput}
                value={description}
                onChangeText={setDescription}
                placeholder="Add a description for your group..."
                multiline
                numberOfLines={3}
              />
              <View style={styles.editActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setEditingDescription(false);
                    setDescription(groupInfo?.description || '');
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={updateGroupDescription}
                >
                  <Text style={styles.saveButtonText}>
                    {isOnline ? 'Save' : 'Save Locally'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <Text style={styles.description}>
              {description || 'No description yet'}
            </Text>
          )}
        </View>

        {/* Members Section - Always visible */}
        <View style={styles.section}>
          <TouchableOpacity 
            style={styles.collapsibleHeader}
            onPress={() => toggleSection('members')}
            activeOpacity={0.7}
          >
            <View style={styles.collapsibleHeaderLeft}>
              <Feather 
                name={expandedSections.members ? "chevron-down" : "chevron-right"} 
                size={20} 
                color="#666" 
              />
              <Text style={styles.collapsibleTitle}>Members ({members.length})</Text>
            </View>
            {isAdmin && expandedSections.members && (
              <TouchableOpacity
                style={styles.addMemberButton}
                onPress={() => {
                  navigation.navigate('FriendsList', { 
                    mode: 'select',
                    groupId: groupId,
                    groupName: groupInfo?.name,
                    existingMembers: members.map(m => m.user_id)
                  });
                }}
              >
                <Feather name="user-plus" size={18} color="#007AFF" />
                <Text style={styles.addMemberText}>Add</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
          
          {expandedSections.members && (
            <>
              <FlatList
                data={visibleMembers}
                renderItem={renderMemberItem}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
              />
              
              {members.length > 20 && !showAllMembers && (
                <TouchableOpacity
                  style={styles.showMoreButton}
                  onPress={() => setShowAllMembers(true)}
                >
                  <Text style={styles.showMoreText}>
                    Show {members.length - 20} more members...
                  </Text>
                </TouchableOpacity>
              )}
              
              {showAllMembers && members.length > 20 && (
                <TouchableOpacity
                  style={styles.showMoreButton}
                  onPress={() => setShowAllMembers(false)}
                >
                  <Text style={styles.showMoreText}>
                    Show less
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* Group Settings Section - Collapsible */}
        <View style={styles.section}>
          <TouchableOpacity 
            style={styles.collapsibleHeader}
            onPress={() => toggleSection('settings')}
            activeOpacity={0.7}
          >
            <View style={styles.collapsibleHeaderLeft}>
              <Feather 
                name={expandedSections.settings ? "chevron-down" : "chevron-right"} 
                size={20} 
                color="#666" 
              />
              <Text style={styles.collapsibleTitle}>Group Settings</Text>
            </View>
          </TouchableOpacity>
          
          {expandedSections.settings && (
            <>
              <View style={styles.settingItem}>
                <View style={styles.settingInfo}>
                  <Ionicons name="notifications-off" size={24} color="#007AFF" />
                  <View style={styles.settingDetails}>
                    <Text style={styles.settingTitle}>Mute notifications</Text>
                    <Text style={styles.settingDescription}>
                      Stop alerts for new messages in this group
                    </Text>
                  </View>
                </View>
                <Switch
                  value={notificationsMuted}
                  onValueChange={toggleGroupNotifications}
                  trackColor={{ false: '#ddd', true: '#007AFF' }}
                />
              </View>
              {isAdmin && (
                <View style={styles.settingItem}>
                  <View style={styles.settingInfo}>
                    <Ionicons name="globe" size={24} color="#007AFF" />
                    <View style={styles.settingDetails}>
                      <Text style={styles.settingTitle}>Public Group</Text>
                      <Text style={styles.settingDescription}>
                        Anyone can find and join this group
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={isPublic}
                    onValueChange={updateGroupPrivacy}
                    trackColor={{ false: '#ddd', true: '#007AFF' }}
                    disabled={!isOnline}
                  />
                </View>
              )}
            </>
          )}
        </View>

        {/* Invite Links Section - Collapsible */}
        {isAdmin && (
          <View style={styles.section}>
            <TouchableOpacity 
              style={styles.collapsibleHeader}
              onPress={() => toggleSection('invites')}
              activeOpacity={0.7}
            >
              <View style={styles.collapsibleHeaderLeft}>
                <Feather 
                  name={expandedSections.invites ? "chevron-down" : "chevron-right"} 
                  size={20} 
                  color="#666" 
                />
                <Text style={styles.collapsibleTitle}>Invite Links ({invites.length})</Text>
              </View>
              {expandedSections.invites && (
                <TouchableOpacity
                  style={[styles.addButton, !isOnline && styles.disabledButton]}
                  onPress={() => setShowInviteOptions(true)}
                  disabled={!isOnline && invites.some(inv => inv.token.startsWith('offline_'))}
                >
                  <Feather name="link" size={16} color="#fff" />
                  <Text style={styles.addButtonText}>Create</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
            
            {expandedSections.invites && (
              <>
                {invites.length > 0 ? (
                  <FlatList
                    data={invites}
                    renderItem={renderInviteItem}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={false}
                    ItemSeparatorComponent={() => (
                      <View style={[styles.separator, { marginLeft: invites.length > 0 ? 36 : 60 }]} />
                    )}
                  />
                ) : (
                  <View style={styles.emptyState}>
                    <Feather name="link" size={40} color="#ddd" />
                    <Text style={styles.emptyStateText}>No active invite links</Text>
                    <Text style={styles.emptyStateSubtext}>
                      {isOnline 
                        ? 'Create an invite link to share with others'
                        : 'Cannot create invite links while offline'}
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* Group Information Section - Collapsible and Horizontal */}
        <View style={styles.section}>
          <TouchableOpacity 
            style={styles.collapsibleHeader}
            onPress={() => toggleSection('info')}
            activeOpacity={0.7}
          >
            <View style={styles.collapsibleHeaderLeft}>
              <Feather 
                name={expandedSections.info ? "chevron-down" : "chevron-right"} 
                size={20} 
                color="#666" 
              />
              <Text style={styles.collapsibleTitle}>Group Information</Text>
            </View>
          </TouchableOpacity>
          
          {expandedSections.info && (
            <View style={styles.infoGrid}>
              <View style={styles.infoCard}>
                <Feather name="calendar" size={24} color="#007AFF" />
                <Text style={styles.infoCardTitle}>Created</Text>
                <Text style={styles.infoCardValue}>
                  {new Date(groupInfo?.created_at || '').toLocaleDateString()}
                </Text>
              </View>
              
              <View style={styles.infoCard}>
                <Feather name="user" size={24} color="#007AFF" />
                <Text style={styles.infoCardTitle}>Created By</Text>
                <Text style={styles.infoCardValue} numberOfLines={1}>
                  {members.find(m => m.role === 'creator')?.profiles?.display_name || 'Unknown'}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Danger Actions - No title, in a row */}
        <View style={[styles.section, { paddingBottom: 30 }]}>
          <View style={styles.dangerActionsRow}>
            <TouchableOpacity 
              style={[styles.dangerActionButton, styles.leaveButton, !isOnline && styles.disabledButton]} 
              onPress={leaveGroup}
              disabled={!isOnline}
            >
              <Feather name="log-out" size={18} color="#FF3B30" />
              <Text style={styles.leaveButtonText}>Leave Group</Text>
            </TouchableOpacity>
            
            {isCreator && (
              <TouchableOpacity 
                style={[styles.dangerActionButton, styles.deleteButton, !isOnline && styles.disabledButton]} 
                onPress={deleteGroup}
                disabled={!isOnline}
              >
                <Feather name="trash-2" size={18} color="#FF3B30" />
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Spacer */}
        <View style={{ height: 50 }} />
      </ScrollView>

      {/* Invite Options Modal */}
      <Modal visible={showInviteOptions} transparent animationType="slide">
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowInviteOptions(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Invite Link</Text>
              <IconButton icon="close" size={24} onPress={() => setShowInviteOptions(false)} />
            </View>
            
            <View style={styles.inviteOptions}>
              <TouchableOpacity
                style={[styles.inviteOption, (generatingInvite || !isOnline) && { opacity: 0.7 }]}
                onPress={generateInviteLink}
                disabled={generatingInvite || !isOnline}
              >
                <View style={styles.inviteOptionIcon}>
                  <Feather name="link" size={28} color="#007AFF" />
                </View>
                <View style={styles.inviteOptionDetails}>
                  <Text style={styles.inviteOptionTitle}>
                    {isOnline ? 'Generate New Link' : 'Offline - Save Locally'}
                  </Text>
                  <Text style={styles.inviteOptionDescription}>
                    {isOnline 
                      ? 'Creates a unique invite link that expires in 7 days'
                      : 'Save invite locally. It will be created when you reconnect.'}
                  </Text>
                </View>
                {generatingInvite && <ActivityIndicator color="#007AFF" />}
              </TouchableOpacity>
              
              <View style={styles.inviteInfo}>
                <Ionicons name="information-circle" size={20} color="#666" />
                <Text style={styles.inviteInfoText}>
                  {isOnline
                    ? 'Anyone with the link can join this group. You can revoke links at any time.'
                    : 'You are offline. Invite links will be created when you reconnect.'}
                </Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Member Actions Modal */}
      <Modal visible={showMemberActions} transparent animationType="fade">
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowMemberActions(false)}
        >
          <View style={styles.actionsModalContent}>
            <Text style={styles.actionsModalTitle}>
              Manage {selectedMember?.profiles?.display_name}
            </Text>
            
            {selectedMember?.role === 'member' && (
              <TouchableOpacity
                style={[styles.actionButton, !isOnline && styles.disabledAction]}
                onPress={() => updateMemberRole(selectedMember.id, 'admin')}
                disabled={!isOnline}
              >
                <Ionicons name="shield-checkmark" size={20} color="#007AFF" />
                <Text style={styles.actionButtonText}>Make Admin</Text>
              </TouchableOpacity>
            )}
            
            {selectedMember?.role === 'admin' && (
              <TouchableOpacity
                style={[styles.actionButton, !isOnline && styles.disabledAction]}
                onPress={() => updateMemberRole(selectedMember.id, 'member')}
                disabled={!isOnline}
              >
                <Ionicons name="shield-outline" size={20} color="#FFA500" />
                <Text style={styles.actionButtonText}>Remove Admin</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              style={[styles.actionButton, { borderTopWidth: 1, borderTopColor: '#eee' }, !isOnline && styles.disabledAction]}
              onPress={() => removeMember(selectedMember?.id || '', selectedMember?.user_id || '')}
              disabled={!isOnline}
            >
              <Feather name="user-x" size={20} color="#FF3B30" />
              <Text style={[styles.actionButtonText, { color: '#FF3B30' }]}>Remove from Group</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.actionButton, { borderTopWidth: 1, borderTopColor: '#eee' }]}
              onPress={() => setShowMemberActions(false)}
            >
              <Text style={[styles.actionButtonText, { color: '#666' }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Invite Actions Modal */}
      <Modal visible={showInviteActions} transparent animationType="fade">
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowInviteActions(false)}
        >
          <View style={styles.actionsModalContent}>
            <Text style={styles.actionsModalTitle}>
              Invite Link Actions
            </Text>
            
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => {
                if (selectedInvite) {
                  const inviteLink = buildGroupInviteLink(String(selectedInvite.token));
                  copyInviteLink(inviteLink);
                }
                setShowInviteActions(false);
              }}
            >
              <Feather name="copy" size={20} color="#007AFF" />
              <Text style={styles.actionButtonText}>Copy Link</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => {
                if (selectedInvite) {
                  const inviteLink = buildGroupInviteLink(String(selectedInvite.token));
                  shareInviteLink(inviteLink);
                }
                setShowInviteActions(false);
              }}
            >
              <Feather name="share-2" size={20} color="#007AFF" />
              <Text style={styles.actionButtonText}>Share Link</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.actionButton, { borderTopWidth: 1, borderTopColor: '#eee' }, !isOnline && styles.disabledAction]}
              onPress={() => {
                if (selectedInvite) {
                  revokeInvite(selectedInvite.id);
                }
                setShowInviteActions(false);
              }}
              disabled={!isOnline}
            >
              <Feather name="x-circle" size={20} color="#FF3B30" />
              <Text style={[styles.actionButtonText, { color: '#FF3B30' }]}>Revoke Link</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.actionButton, { borderTopWidth: 1, borderTopColor: '#eee' }]}
              onPress={() => setShowInviteActions(false)}
            >
              <Text style={[styles.actionButtonText, { color: '#666' }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF3B30',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 2,
    gap: 4,
  },
  offlineBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 2,
    gap: 4,
  },
  pendingBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  offlineNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF3B30',
    padding: 8,
    gap: 8,
  },
  offlineNoticeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  offlineText: {
    marginTop: 8,
    fontSize: 14,
    color: '#FF3B30',
    fontWeight: '500',
  },
  disabledButton: {
    backgroundColor: '#ccc',
    opacity: 0.7,
  },
  disabledAction: {
    opacity: 0.5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  groupHeader: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: '#f8f9fa',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  groupAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: '#fff',
    backgroundColor: '#e0e0e0',
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#007AFF',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  groupName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 16,
  },
  groupStats: {
    flexDirection: 'row',
    gap: 24,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statText: {
    fontSize: 14,
    color: '#666',
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  collapsibleHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  collapsibleTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  memberActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  addMemberButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addMemberText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '500',
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
  editDescriptionContainer: {
    gap: 12,
  },
  descriptionInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  settingDetails: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 14,
    color: '#666',
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  manageButton: {
    padding: 4,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  memberAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e0e0e0',
  },
  memberDetails: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    flexWrap: 'nowrap',
  },
  memberName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
    flexShrink: 1,
    maxWidth: '60%',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  memberEmail: {
    fontSize: 12,
    color: '#999',
  },
  inviteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  inviteInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  inviteDetails: {
    flex: 1,
  },
  inviteToken: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000',
    marginBottom: 2,
  },
  inviteMeta: {
    fontSize: 12,
    color: '#666',
  },
  separator: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginLeft: 60,
  },
  showMoreButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  showMoreText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
    marginBottom: 4,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  infoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  infoCard: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginHorizontal: 4,
  },
  infoCardTitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    marginBottom: 4,
    textAlign: 'center',
  },
  infoCardValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000',
    textAlign: 'center',
  },
  dangerActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  dangerActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
  },
  leaveButton: {
    borderWidth: 1,
    borderColor: '#FF3B30',
    backgroundColor: '#fff',
  },
  leaveButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FF3B30',
  },
  deleteButton: {
    backgroundColor: '#FF3B3010',
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FF3B30',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 30,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  inviteOptions: {
    gap: 16,
  },
  inviteOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
  },
  inviteOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#007AFF15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteOptionDetails: {
    flex: 1,
  },
  inviteOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  inviteOptionDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 18,
  },
  inviteInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    backgroundColor: '#f0f7ff',
    borderRadius: 8,
  },
  inviteInfoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 18,
    flex: 1,
  },
  actionsModalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    margin: 20,
    overflow: 'hidden',
  },
  actionsModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    padding: 20,
    textAlign: 'center',
    backgroundColor: '#f8f9fa',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  actionButtonText: {
    fontSize: 16,
    color: '#000',
  },
});