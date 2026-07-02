// D:\chatApp\chatApp\src\screens\Chat\FriendRequestsScreen.tsx
import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button, IconButton, Divider, Card, Title, Paragraph } from 'react-native-paper'
import { api } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'
import { useCurrentProfileId } from '../../hooks/useCurrentProfileId'
import { useFriendshipsRealtime } from '../../hooks/useFriendshipsRealtime'
import { notifyFriendshipsListenersImmediate } from '../../lib/friendshipsRealtime'
import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import { TouchableOpacity } from 'react-native';

// Storage keys
const REQUESTS_STORAGE_KEY = '@friend_requests'
const REQUESTS_TIMESTAMP_KEY = '@friend_requests_timestamp'

export default function FriendRequestsScreen() {
  const { user } = useAuth()
  const [incomingRequests, setIncomingRequests] = useState<any[]>([])
  const [outgoingRequests, setOutgoingRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const currentProfilesId = useCurrentProfileId()
  const [isOnline, setIsOnline] = useState(true)
  const [isDataStale, setIsDataStale] = useState(false)

  // Check network status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected || false);
    });
    return () => unsubscribe();
  }, []);

  // Save requests to storage
  const saveRequestsToStorage = async (incoming: any[], outgoing: any[]) => {
    try {
      const data = { incoming, outgoing, timestamp: Date.now() };
      await AsyncStorage.setItem(REQUESTS_STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Error saving requests to storage:', error);
    }
  };

  // Load requests from storage
  const loadRequestsFromStorage = async () => {
    try {
      const storedData = await AsyncStorage.getItem(REQUESTS_STORAGE_KEY);
      if (storedData) {
        const parsed = JSON.parse(storedData);
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        const isStale = parsed.timestamp < fiveMinutesAgo;
        setIsDataStale(isStale);
        
        setIncomingRequests(parsed.incoming || []);
        setOutgoingRequests(parsed.outgoing || []);
        return true;
      }
    } catch (error) {
      console.error('Error loading requests from storage:', error);
    }
    return false;
  };

  // Fetch incoming and outgoing pending requests
  const fetchRequests = async (forceRefresh = false) => {
    if (!user?.id || !currentProfilesId) {
      setLoading(false);
      return;
    }

    try {
      // Load cached data first (unless forcing refresh)
      if (!forceRefresh) {
        const hasCachedData = await loadRequestsFromStorage();
        if (hasCachedData) {
          setIsDataStale(false);
        }

        // If offline, don't try to fetch from network
        if (!isOnline) {
          console.log('Offline mode - using cached requests');
          setLoading(false);
          return;
        }
      }

      setLoading(true);

      const { incoming, outgoing } = await api.friendships.requests()

      await saveRequestsToStorage(incoming, outgoing);
      setIncomingRequests(incoming)
      setOutgoingRequests(outgoing)
      setIsDataStale(false)

    } catch (err) {
      console.error('Error fetching requests:', err)
      // Try to load from cache if fetch failed
      await loadRequestsFromStorage();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (currentProfilesId) {
      fetchRequests();
    }
  }, [currentProfilesId])

  useFriendshipsRealtime(isOnline ? currentProfilesId : null, () => {
    fetchRequests(true);
  });

  // Accept incoming request
  const handleAccept = async (friendshipId: string, _senderProfilesId: string) => {
    if (!currentProfilesId) return
    const previousIncoming = incomingRequests
    setIncomingRequests((prev) => prev.filter((r) => r.friendshipId !== friendshipId))
    try {
      await api.friendships.accept(friendshipId)
      notifyFriendshipsListenersImmediate()
      fetchRequests(true)
    } catch (err) {
      setIncomingRequests(previousIncoming)
      console.error('Accept error:', err)
      Alert.alert('Error', 'Failed to accept request')
    }
  }

  // Reject incoming request (set to blocked)
  const handleReject = async (friendshipId: string) => {
    const previousIncoming = incomingRequests
    setIncomingRequests((prev) => prev.filter((r) => r.friendshipId !== friendshipId))
    try {
      await api.friendships.reject(friendshipId)
      notifyFriendshipsListenersImmediate()
      fetchRequests(true)
    } catch (err) {
      setIncomingRequests(previousIncoming)
      console.error('Reject error:', err)
      Alert.alert('Error', 'Failed to reject request')
    }
  }

  // Cancel outgoing request
  const handleCancel = async (friendshipId: string) => {
    const previousOutgoing = outgoingRequests
    setOutgoingRequests((prev) => prev.filter((r) => r.friendshipId !== friendshipId))
    try {
      await api.friendships.cancel(friendshipId)
      notifyFriendshipsListenersImmediate()
      fetchRequests(true)
    } catch (err) {
      setOutgoingRequests(previousOutgoing)
      console.error('Cancel error:', err)
      Alert.alert('Error', 'Failed to cancel request')
    }
  }

  const onRefresh = () => {
    if (!isOnline) {
      Alert.alert('Offline', 'Cannot refresh while offline.');
      return;
    }
    setRefreshing(true);
    fetchRequests(true);
  };

  const renderRequestCard = (request: any, isIncoming: boolean) => (
    <Card style={styles.requestCard}>
      <Card.Content>
        <View style={styles.cardHeader}>
          {request.avatar_url ? (
            <Image source={{ uri: request.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: '#ddd' }]} />
          )}
          <View style={styles.userInfo}>
            <Title style={styles.requestName}>{request.display_name}</Title>
            <Paragraph style={styles.requestEmail}>{request.email}</Paragraph>
            <Text style={styles.requestTime}>
              {new Date(request.created_at).toLocaleDateString()} • 
              {isIncoming ? ' Incoming' : ' Outgoing'}
            </Text>
          </View>
        </View>
        <View style={styles.actionsContainer}>
          {isIncoming ? (
            <View style={styles.incomingActions}>
              <Button
                mode="contained"
                onPress={() => handleAccept(request.friendshipId, request.id)}
                buttonColor="#4CAF50"
                textColor="#fff"
                style={styles.acceptButton}
                labelStyle={styles.buttonLabel}
                disabled={!isOnline}
              >
                Accept
              </Button>
              <Button
                mode="outlined"
                onPress={() => handleReject(request.friendshipId)}
                textColor="#F44336"
                style={styles.rejectButton}
                labelStyle={styles.buttonLabel}
                disabled={!isOnline}
              >
                Reject
              </Button>
            </View>
          ) : (
            <Button
              mode="outlined"
              onPress={() => handleCancel(request.friendshipId)}
              textColor="#757575"
              style={styles.cancelButton}
              labelStyle={styles.buttonLabel}
              disabled={!isOnline}
            >
              Cancel Request
            </Button>
          )}
        </View>
      </Card.Content>
    </Card>
  )

  const allRequests = [...incomingRequests, ...outgoingRequests].sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const hasRequests = allRequests.length > 0

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading requests...</Text>
        </View>
      ) : (
        <FlatList
          data={allRequests}
          renderItem={({ item, index }) => (
            <View key={item.friendshipId}>
              {renderRequestCard(item, incomingRequests.some(r => r.id === item.id))}
              {index < allRequests.length - 1 && <Divider />}
            </View>
          )}
          keyExtractor={(item) => item.friendshipId}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh}
              enabled={isOnline}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={styles.emptyTitle}>No pending requests</Text>
              <Text style={styles.emptySubtitle}>
                {!isOnline 
                  ? "You're offline. Cannot load new requests."
                  : "You'll see friend requests here when someone sends one to you."}
              </Text>
              {!isOnline && (
                <Text style={styles.offlineText}>📡 Offline Mode</Text>
              )}
            </View>
          }
          ListHeaderComponent={
            !isOnline ? (
              <View style={styles.offlineNotice}>
                <Text style={styles.offlineNoticeText}>Showing cached data</Text>
              </View>
            ) : isDataStale ? (
              <TouchableOpacity style={styles.staleNotice} onPress={() => fetchRequests(true)}>
                <Text style={styles.staleNoticeText}>🔄 Data may be outdated. Tap to refresh.</Text>
              </TouchableOpacity>
            ) : null
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  listContent: {
    padding: 16,
  },
  requestCard: {
    marginBottom: 12,
    elevation: 2,
    borderRadius: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  userInfo: {
    flex: 1,
  },
  requestName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  requestEmail: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  requestTime: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  actionsContainer: {
    marginTop: 8,
  },
  incomingActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  acceptButton: {
    flex: 1,
    marginRight: 8,
  },
  rejectButton: {
    flex: 1,
    marginLeft: 8,
  },
  cancelButton: {
    alignSelf: 'flex-start',
  },
  buttonLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  offlineText: {
    marginTop: 12,
    fontSize: 14,
    color: '#FFA500',
    fontWeight: '500',
  },
  offlineNotice: {
    backgroundColor: '#FFA500',
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  offlineNoticeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  staleNotice: {
    backgroundColor: '#f0f7ff',
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  staleNoticeText: {
    color: '#007AFF',
    fontSize: 12,
  },
});

