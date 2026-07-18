// src/screens/Group/InviteScreen.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Alert,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { OfflineAvatar } from '../../components/OfflineAvatar';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { notifyRealtimeTopic } from '../../lib/realtimeHub';
import { openChat } from '../../navigation/chatNavigationBridge';

export default function InviteScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [groupInfo, setGroupInfo] = useState<any>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);

  useEffect(() => {
    const token = route.params?.token;
    if (!token) {
      navigation.goBack();
      return;
    }
    void verifyInvite(token);
  }, [route.params?.token]);

  const verifyInvite = async (token: string) => {
    try {
      setLoading(true);
      const { group } = await api.groups.getInvite(token);
      setInviteToken(token);
      setGroupInfo(group);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to verify invite';
      Alert.alert('Invalid invite', message, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } finally {
      setLoading(false);
    }
  };

  const goToGroup = (groupId: string) => {
    openChat({
      chatId: groupId,
      chatType: 'group',
      chatName: groupInfo?.name ?? 'Group',
      avatarUrl: groupInfo?.avatar_url ?? undefined,
    });
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  const acceptInvite = async () => {
    if (!inviteToken || !groupInfo || !user || joining) return;

    try {
      setJoining(true);
      const { group_id, already_member } = await api.groups.joinByToken(inviteToken);
      notifyRealtimeTopic('groupMembers');
      notifyRealtimeTopic('groups');

      if (already_member) {
        goToGroup(group_id);
        return;
      }

      goToGroup(group_id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to join group';
      Alert.alert('Error', message);
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading invite…</Text>
      </View>
    );
  }

  if (!groupInfo) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <OfflineAvatar
          uri={groupInfo?.avatar_url}
          name={groupInfo?.name}
          size={80}
          style={styles.groupAvatar}
        />

        <Text style={styles.groupName}>{groupInfo?.name}</Text>

        {groupInfo?.description ? (
          <Text style={styles.groupDescription}>{groupInfo.description}</Text>
        ) : null}

        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>You're invited to join this group</Text>
          <Text style={styles.infoText}>
            Tap Join to enter the group chat and start messaging with members.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.joinButton, joining && styles.joinButtonDisabled]}
          onPress={acceptInvite}
          disabled={joining}
        >
          {joining ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.joinButtonText}>Join Group</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
          disabled={joining}
        >
          <Text style={styles.cancelButtonText}>Not now</Text>
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
  infoText: { fontSize: 14, color: '#666', lineHeight: 20 },
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
