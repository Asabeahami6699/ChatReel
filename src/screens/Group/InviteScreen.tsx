// src/screens/Group/InviteScreen.tsx
import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  Alert, 
  ActivityIndicator, 
  StyleSheet,
  Image,
  TouchableOpacity
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

export default function InviteScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [groupInfo, setGroupInfo] = useState<any>(null);
  const [inviteData, setInviteData] = useState<any>(null);

  useEffect(() => {
    // SAFE: Wait a moment for route to be ready
    const timer = setTimeout(() => {
      // Extract token from route params (from deep link)
      const token = route.params?.token;
      
      console.log('InviteScreen - Token from params:', token);
      console.log('Full route params:', route.params);
      
      if (!token) {
        console.log('No token found, going back');
        navigation.goBack();
        return;
      }

      verifyInvite(token);
    }, 100);

    return () => clearTimeout(timer);
  }, [route.params]);

  const verifyInvite = async (token: string) => {
    try {
      setLoading(true);
      
      console.log('Verifying token:', token);
      
      // 1. Get invite from database
      const { data: invite, error: inviteError } = await supabase
        .from('group_invites')
        .select('*')
        .eq('token', token)
        .single();

      if (inviteError || !invite) {
        throw new Error('Invite not found or invalid');
      }

      console.log('Invite found:', invite);

      // 2. Check if already used
      if (invite.used_at) {
        throw new Error('This invite has already been used');
      }

      // 3. Check if expired
      const expiresAt = new Date(invite.expires_at);
      if (expiresAt < new Date()) {
        throw new Error('This invite has expired');
      }

      // 4. Get group info
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .select('*')
        .eq('id', invite.group_id)
        .single();

      if (groupError || !group) {
        throw new Error('Group not found');
      }

      console.log('Group found:', group);

      // 5. Check if user is already a member
      if (user) {
        const { data: existingMember } = await supabase
          .from('group_members')
          .select('id')
          .eq('group_id', invite.group_id)
          .eq('user_id', user.id)
          .single();

        if (existingMember) {
          Alert.alert('Already a Member', 'You are already a member of this group.');
          navigation.navigate('ChatRoom', { groupId: invite.group_id });
          return;
        }
      }

      setInviteData(invite);
      setGroupInfo(group);
      setLoading(false);

    } catch (error: any) {
      console.error('Error verifying invite:', error);
      Alert.alert('Error', error.message || 'Failed to verify invite');
      navigation.goBack();
    }
  };

  const acceptInvite = async () => {
    if (!inviteData || !groupInfo || !user) return;

    try {
      setLoading(true);

      // Add user to group
      const { error: memberError } = await supabase
        .from('group_members')
        .insert({
          group_id: inviteData.group_id,
          user_id: user.id,
          role: 'member',
        });

      if (memberError) throw memberError;

      // Mark invite as used
      await supabase
        .from('group_invites')
        .update({
          used_at: new Date().toISOString(),
          used_by: user.id,
        })
        .eq('id', inviteData.id);

      Alert.alert('Success', `You have joined "${groupInfo.name}"!`, [
        { 
          text: 'Go to Group', 
          onPress: () => {
            // Navigate to ChatRoom and reset navigation stack
            navigation.reset({
              index: 0,
              routes: [
                { name: 'MainTabs' },
                { name: 'ChatRoom', params: { groupId: groupInfo.id } }
              ],
            });
          }
        }
      ]);

    } catch (error) {
      console.error('Error accepting invite:', error);
      Alert.alert('Error', 'Failed to join group');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Processing invite...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Image
          source={{ uri: groupInfo.avatar_url || 'https://via.placeholder.com/80' }}
          style={styles.groupAvatar}
        />
        
        <Text style={styles.groupName}>{groupInfo.name}</Text>
        
        {groupInfo.description && (
          <Text style={styles.groupDescription}>{groupInfo.description}</Text>
        )}
        
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>You're invited to join this group</Text>
          <Text style={styles.infoText}>
            This invite was created by the group admin. By joining, you'll be able to:
          </Text>
          <View style={styles.featureList}>
            <Text style={styles.feature}>• Send and receive messages</Text>
            <Text style={styles.feature}>• See group members</Text>
            <Text style={styles.feature}>• Participate in group chats</Text>
          </View>
        </View>
        
        <TouchableOpacity
          style={[styles.joinButton, loading && styles.joinButtonDisabled]}
          onPress={acceptInvite}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.joinButtonText}>Join Group</Text>
          )}
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
          disabled={loading}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  groupAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 16,
    backgroundColor: '#e0e0e0',
  },
  groupName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
    textAlign: 'center',
  },
  groupDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  infoSection: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    width: '100%',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    lineHeight: 20,
  },
  featureList: {
    paddingLeft: 8,
  },
  feature: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    lineHeight: 20,
  },
  joinButton: {
    backgroundColor: '#007AFF',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  joinButtonDisabled: {
    backgroundColor: '#a6c8ff',
  },
  joinButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    width: '100%',
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
  },
});