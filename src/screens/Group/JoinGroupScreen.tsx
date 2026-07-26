// src/screens/Group/JoinGroupScreen.tsx
import React, { useState } from 'react';
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
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { OfflineAvatar } from '../../components/OfflineAvatar';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { useChatSettings } from '../../context/ChatSettingsContext';

export default function JoinGroupScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { theme } = useChatSettings();

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
      const { invite, group } = await api.groups.getInvite(token.trim());
      setInviteInfo(invite);
      setGroupInfo(group);
    } catch {
      Alert.alert('Invalid Invite', 'This invite token is invalid or has expired.');
    } finally {
      setVerifying(false);
    }
  };

  const acceptInvite = async () => {
    if (!inviteInfo || !user) return;

    try {
      setLoading(true);
      const { group_id, already_member } = await api.groups.joinByToken(token.trim());

      if (already_member) {
        Alert.alert('Already a Member', 'You are already a member of this group.');
      } else {
        Alert.alert('Success', 'You have joined the group!');
      }

      navigation.navigate('ChatRoom', { groupId: group_id });
    } catch {
      Alert.alert('Error', 'Failed to join group');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.listBg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: 20 + insets.bottom }]}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.listCardBg,
              borderColor: theme.listBorder,
              borderWidth: theme.isDark ? 1 : 0,
            },
          ]}
        >
          <Text style={[styles.title, { color: theme.listPrimaryText }]}>Join Group</Text>
          <Text style={[styles.subtitle, { color: theme.listSecondaryText }]}>
            Enter the invite token shared with you
          </Text>

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.searchBg,
                borderColor: theme.listBorder,
                color: theme.searchText,
              },
            ]}
            placeholder="Enter invite token"
            placeholderTextColor={theme.searchPlaceholder}
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            editable={!verifying}
          />

          <TouchableOpacity
            style={[styles.verifyButton, { backgroundColor: theme.primary }]}
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
            <View
              style={[
                styles.groupCard,
                {
                  backgroundColor: theme.listHeaderBg,
                  borderColor: theme.listBorder,
                  borderWidth: theme.isDark ? 1 : 0,
                },
              ]}
            >
              <OfflineAvatar
                uri={groupInfo.avatar_url}
                name={groupInfo.name}
                size={60}
                style={[styles.groupAvatar, { backgroundColor: theme.listBorder }]}
              />
              <View style={styles.groupInfo}>
                <Text style={[styles.groupName, { color: theme.listPrimaryText }]}>{groupInfo.name}</Text>
                {groupInfo.description && (
                  <Text
                    style={[styles.groupDescription, { color: theme.listSecondaryText }]}
                    numberOfLines={2}
                  >
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

          <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
            <Text style={[styles.cancelButtonText, { color: theme.listSecondaryText }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: {
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 16, textAlign: 'center', marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
  },
  verifyButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  verifyButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  groupAvatar: { width: 60, height: 60, borderRadius: 30 },
  groupInfo: { flex: 1, marginLeft: 16 },
  groupName: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  groupDescription: { fontSize: 14, lineHeight: 18 },
  joinButton: {
    backgroundColor: '#34C759',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  joinButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancelButton: { paddingVertical: 16, alignItems: 'center' },
  cancelButtonText: { fontSize: 16 },
});
