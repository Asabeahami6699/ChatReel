// src/screens/Group/JoinGroupScreen.tsx - Simplified version
import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Image, 
  TouchableOpacity, 
  Alert, 
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

export default function JoinGroupScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [groupInfo, setGroupInfo] = useState<any>(null);
  const [inviteInfo, setInviteInfo] = useState<any>(null);

  const verifyToken = async () => {
    if (!token.trim()) {
      Alert.alert('Error', 'Please enter an invite token');
      return;
    }

    try {
      setVerifying(true);

      // Check if invite exists and is valid
      const { data: invite, error: inviteError } = await supabase
        .from('group_invites')
        .select('*')
        .eq('token', token.trim())
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (inviteError || !invite) {
        Alert.alert('Invalid Invite', 'This invite token is invalid or has expired.');
        return;
      }

      // Get group details
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .select('*')
        .eq('id', invite.group_id)
        .single();

      if (groupError || !group) {
        Alert.alert('Error', 'Group not found');
        return;
      }

      setInviteInfo(invite);
      setGroupInfo(group);
      setVerifying(false);

    } catch (error) {
      console.error('Error verifying token:', error);
      Alert.alert('Error', 'Failed to verify invite token');
      setVerifying(false);
    }
  };

  const acceptInvite = async () => {
    if (!inviteInfo || !user) return;

    try {
      setLoading(true);

      // Check if user is already a member
      const { data: existingMember } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', inviteInfo.group_id)
        .eq('user_id', user.id)
        .single();

      if (existingMember) {
        Alert.alert('Already a Member', 'You are already a member of this group.');
        navigation.navigate('ChatRoom', { groupId: inviteInfo.group_id });
        return;
      }

      // Add user to group
      const { error: memberError } = await supabase
        .from('group_members')
        .insert({
          group_id: inviteInfo.group_id,
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
        .eq('id', inviteInfo.id);

      Alert.alert('Success', 'You have joined the group!', [
        { 
          text: 'Go to Group', 
          onPress: () => navigation.navigate('ChatRoom', { 
            groupId: inviteInfo.group_id 
          }) 
        }
      ]);

    } catch (error) {
      console.error('Error accepting invite:', error);
      Alert.alert('Error', 'Failed to join group');
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.title}>Join Group</Text>
          <Text style={styles.subtitle}>Enter the invite token shared with you</Text>
          
          <TextInput
            style={styles.input}
            placeholder="Enter invite token"
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            editable={!verifying}
          />
          
          <TouchableOpacity
            style={styles.verifyButton}
            onPress={verifyToken}
            disabled={verifying || !token.trim()}
          >
            {verifying ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.verifyButtonText}>Verify Token</Text>
            )}
          </TouchableOpacity>

          {groupInfo && (
            <View style={styles.groupCard}>
              <Image
                source={{ uri: groupInfo.avatar_url || 'https://via.placeholder.com/60' }}
                style={styles.groupAvatar}
              />
              <View style={styles.groupInfo}>
                <Text style={styles.groupName}>{groupInfo.name}</Text>
                {groupInfo.description && (
                  <Text style={styles.groupDescription} numberOfLines={2}>
                    {groupInfo.description}
                  </Text>
                )}
              </View>
            </View>
          )}

          {groupInfo && (
            <TouchableOpacity
              style={styles.joinButton}
              onPress={acceptInvite}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.joinButtonText}>Join Group</Text>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: '#fafafa',
    marginBottom: 16,
  },
  verifyButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  verifyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  groupAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#e0e0e0',
  },
  groupInfo: {
    flex: 1,
    marginLeft: 16,
  },
  groupName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  groupDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 18,
  },
  joinButton: {
    backgroundColor: '#34C759',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  joinButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
  },
});