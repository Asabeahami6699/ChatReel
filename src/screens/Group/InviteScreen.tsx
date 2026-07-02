// src/screens/Group/InviteScreen.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Image,
  TouchableOpacity,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { notifyRealtimeTopic } from '../../lib/realtimeHub';

export default function InviteScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [groupInfo, setGroupInfo] = useState<any>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const token = route.params?.token;
      if (!token) {
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
      const { group } = await api.groups.getInvite(token);
      setInviteToken(token);
      setGroupInfo(group);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to verify invite';
      Alert.alert('Error', message);
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const acceptInvite = async () => {
    if (!inviteToken || !groupInfo || !user) return;

    try {
      setLoading(true);
      await api.groups.joinByToken(inviteToken);
      notifyRealtimeTopic('groupMembers');
      notifyRealtimeTopic('groups');

      Alert.alert('Success', `You have joined "${groupInfo.name}"!`, [
        {
          text: 'Go to Group',
          onPress: () => {
            navigation.reset({
              index: 0,
              routes: [
                { name: 'MainTabs' },
                { name: 'ChatRoom', params: { groupId: groupInfo.id } },
              ],
            });
          },
        },
      ]);
    } catch {
      Alert.alert('Error', 'Failed to join group');
    } finally {
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
          source={{ uri: groupInfo?.avatar_url || 'https://via.placeholder.com/80' }}
          style={styles.groupAvatar}
        />

        <Text style={styles.groupName}>{groupInfo?.name}</Text>

        {groupInfo?.description && (
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
  loadingText: { marginTop: 12, fontSize: 14, color: '#666', textAlign: 'center' },
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
  infoTitle: { fontSize: 16, fontWeight: '600', color: '#000', marginBottom: 8 },
  infoText: { fontSize: 14, color: '#666', marginBottom: 12, lineHeight: 20 },
  featureList: { paddingLeft: 8 },
  feature: { fontSize: 14, color: '#666', marginBottom: 4, lineHeight: 20 },
  joinButton: {
    backgroundColor: '#007AFF',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  joinButtonDisabled: { backgroundColor: '#a6c8ff' },
  joinButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancelButton: { width: '100%', paddingVertical: 16, alignItems: 'center' },
  cancelButtonText: { color: '#666', fontSize: 16 },
});
