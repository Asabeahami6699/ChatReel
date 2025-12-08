import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  SafeAreaView,
  Image,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { TextInput, Button, IconButton } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

interface Profile {
  id: string; // This is the profile ID used in friendships
  user_id: string; // This is the auth user ID
  display_name: string;
  email: string;
  avatar_url?: string;
  region?: string;
  country?: string;
  mutual_friends_count?: number;
  reason?: string;
}

interface Friendship {
  id: string;
  user_id: string; // This is a PROFILE ID (from profiles.id)
  friend_id: string; // This is a PROFILE ID (from profiles.id)
  status: 'pending' | 'accepted' | 'blocked';
}

type SuggestionType = 'mutual_friends' | 'location' | 'new_users';

export default function AddFriendsListScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [suggestions, setSuggestions] = useState<{type: SuggestionType, data: Profile[], title: string}[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null); // Renamed for clarity
  const [loading, setLoading] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);

  // Fetch current user's profile ID (profiles.id)
  useEffect(() => {
    const fetchProfileId = async () => {
      if (!user?.id) return;
      
      console.log('Fetching profile for auth user:', user.id);
      
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, region, country')
          .eq('user_id', user.id) // Match auth user_id
          .single();

        if (error) {
          console.error('Profile load error:', error);
          Alert.alert('Error', `Unable to load your profile: ${error.message}`);
          return;
        }

        if (!data) {
          console.error('No profile found for user:', user.id);
          Alert.alert('Error', 'No profile found for your account');
          return;
        }

        console.log('Current profile found:', data);
        setCurrentProfileId(data.id);
        
      } catch (err) {
        console.error('Unexpected error fetching profile:', err);
        Alert.alert('Error', 'Unexpected error loading profile');
      }
    };
    
    fetchProfileId();
  }, [user?.id]);

  // Fetch existing friendships using PROFILE ID
  useEffect(() => {
    if (!currentProfileId) return;
    
    console.log('Fetching friendships for profile:', currentProfileId);
    
    const fetchFriendships = async () => {
      const { data, error } = await supabase
        .from('friendships')
        .select('id, user_id, friend_id, status')
        .or(`user_id.eq.${currentProfileId},friend_id.eq.${currentProfileId}`);
      
      if (error) {
        console.error('Friendships fetch error:', error);
      } else {
        console.log('Friendships loaded:', data?.length || 0);
        setFriendships(data || []);
      }
    };
    
    fetchFriendships();
  }, [currentProfileId]);

  // Fetch all suggestions
  useEffect(() => {
    if (!currentProfileId || !user?.id) return;

    console.log('Starting to fetch suggestions...');
    
    const fetchAllSuggestions = async () => {
      setLoadingSuggestions(true);
      try {
        const [mutualFriends, locationBased, newUsers] = await Promise.all([
          fetchMutualFriendSuggestions(),
          fetchLocationSuggestions(),
          fetchNewUserSuggestions(),
        ]);

        console.log('Suggestions results:', {
          mutual: mutualFriends.length,
          location: locationBased.length,
          newUsers: newUsers.length
        });

        const allSuggestions = [
          { type: 'mutual_friends' as SuggestionType, data: mutualFriends, title: 'People You May Know' },
          { type: 'location' as SuggestionType, data: locationBased, title: 'Near You' },
          { type: 'new_users' as SuggestionType, data: newUsers, title: 'New on Platform' },
        ].filter(section => section.data.length > 0);

        console.log('Final suggestions to display:', allSuggestions.length, 'sections');
        setSuggestions(allSuggestions);
      } catch (error) {
        console.error('Suggestions error:', error);
      } finally {
        setLoadingSuggestions(false);
      }
    };

    fetchAllSuggestions();
  }, [currentProfileId, user?.id]);

  // Search users (with debounce)
  useEffect(() => {
    if (!searchQuery.trim() || !user?.id) {
      setProfiles([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, user_id, display_name, email, avatar_url, region, country')
          .or(`display_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
          .neq('user_id', user.id) // Exclude current user by auth user_id
          .limit(20);

        if (error) throw error;
        setProfiles(data || []);
      } catch (err) {
        console.error('Search error:', err);
        Alert.alert('Error', 'Failed to fetch users');
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, user?.id]);

  // Suggestion Algorithms - CORRECTED VERSION
  const fetchMutualFriendSuggestions = async (): Promise<Profile[]> => {
    if (!currentProfileId) return [];

    try {
      console.log('Fetching mutual friends for profile:', currentProfileId);

      // Get user's friends (using profile IDs)
      const { data: userFriends, error } = await supabase
        .from('friendships')
        .select('friend_id, user_id')
        .or(`user_id.eq.${currentProfileId},friend_id.eq.${currentProfileId}`)
        .eq('status', 'accepted');

      if (error) {
        console.error('Error fetching user friends:', error);
        return [];
      }

      if (!userFriends?.length) {
        console.log('No friends found for mutual suggestions');
        return [];
      }

      // Extract friend profile IDs
      const friendProfileIds = userFriends.map(f => 
        f.user_id === currentProfileId ? f.friend_id : f.user_id
      );

      console.log('Friend profile IDs:', friendProfileIds);

      // Find friends of friends
      const { data: potentialFriends, error: pfError } = await supabase
        .from('friendships')
        .select(`
          user_id,
          friend_id,
          profiles:profiles!friendships_friend_id_fkey (
            id, user_id, display_name, email, avatar_url, region, country
          )
        `)
        .in('user_id', friendProfileIds)
        .neq('friend_id', currentProfileId) // Don't suggest current user
        .eq('status', 'accepted');

      if (pfError) {
        console.error('Error fetching potential friends:', pfError);
        return [];
      }

      // Count mutual friends and remove duplicates
      const friendCountMap = new Map();
      potentialFriends?.forEach(pf => {
        if (pf.profiles && pf.profiles.id !== currentProfileId) {
          const count = friendCountMap.get(pf.profiles.id) || 0;
          friendCountMap.set(pf.profiles.id, count + 1);
        }
      });

      const mutualSuggestions = Array.from(friendCountMap.entries())
        .map(([profileId, count]) => {
          const profile = potentialFriends?.find(pf => pf.profiles?.id === profileId)?.profiles;
          return profile ? { 
            ...profile, 
            mutual_friends_count: count, 
            reason: `${count} mutual friend${count !== 1 ? 's' : ''}` 
          } : null;
        })
        .filter(Boolean) as Profile[];

      console.log('Mutual suggestions found:', mutualSuggestions.length);
      return mutualSuggestions;

    } catch (error) {
      console.error('Mutual friends suggestions error:', error);
      return [];
    }
  };

  const fetchLocationSuggestions = async (): Promise<Profile[]> => {
    if (!currentProfileId || !user?.id) return [];

    try {
      console.log('Fetching location suggestions...');

      // Get current user's location
      const { data: currentUser, error } = await supabase
        .from('profiles')
        .select('region, country')
        .eq('id', currentProfileId) // Use profile ID here
        .single();

      if (error) {
        console.error('Error fetching current user location:', error);
        return [];
      }

      if (!currentUser?.region) {
        console.log('No region data for location suggestions');
        return [];
      }

      console.log('Looking for users in region:', currentUser.region);

      // Find users in same region (exclude current user by auth user_id)
      const { data, error: locationError } = await supabase
        .from('profiles')
        .select('id, user_id, display_name, email, avatar_url, region, country')
        .eq('region', currentUser.region)
        .neq('user_id', user.id) // Exclude current user by auth user_id
        .limit(8);

      if (locationError) {
        console.error('Error fetching location suggestions:', locationError);
        return [];
      }

      console.log('Location suggestions found:', data?.length);
      return data?.map(p => ({ ...p, reason: `Lives in ${p.region}` })) || [];
    } catch (error) {
      console.error('Location suggestions error:', error);
      return [];
    }
  };

  const fetchNewUserSuggestions = async (): Promise<Profile[]> => {
    if (!user?.id) return [];

    try {
      console.log('Fetching new user suggestions...');
      
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, display_name, email, avatar_url, region, country, created_at')
        .neq('user_id', user.id) // Exclude current user by auth user_id
        .order('created_at', { ascending: false })
        .limit(6);

      if (error) {
        console.error('Error fetching new users:', error);
        return [];
      }

      console.log('New user suggestions found:', data?.length);
      return data?.map(p => ({ ...p, reason: 'New to platform' })) || [];
    } catch (error) {
      console.error('New user suggestions error:', error);
      return [];
    }
  };

  // Determine friendship status with a profile (using PROFILE IDs)
  const getFriendshipStatus = (targetProfileId: string): Friendship['status'] | null => {
    const found = friendships.find(
      (f) =>
        (f.user_id === currentProfileId && f.friend_id === targetProfileId) ||
        (f.friend_id === currentProfileId && f.user_id === targetProfileId)
    );
    return found ? found.status : null;
  };

  // Send friend request (using PROFILE IDs)
  const handleAddFriend = async (targetProfileId: string) => {
    if (!currentProfileId) {
      Alert.alert('Error', 'Profile not loaded yet.');
      return;
    }

    if (targetProfileId === currentProfileId) {
      Alert.alert('Error', "You can't add yourself!");
      return;
    }

    const status = getFriendshipStatus(targetProfileId);
    if (status === 'pending') {
      Alert.alert('Info', 'Request already pending.');
      return;
    } else if (status === 'accepted') {
      Alert.alert('Info', 'You are already friends.');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('friendships')
        .insert({
          user_id: currentProfileId, // PROFILE ID
          friend_id: targetProfileId, // PROFILE ID
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      Alert.alert('Success', 'Friend request sent!');
      setFriendships((prev) => [...prev, data]);
      
    } catch (err: any) {
      console.error('Add friend error:', err);
      Alert.alert('Error', err.message || 'Failed to send request');
    }
  };

  // Render a user in the search results
  const renderUser = ({ item }: { item: Profile }) => {
    const status = getFriendshipStatus(item.id); // item.id is the PROFILE ID

    return (
      <View style={styles.userItem}>
        <Image 
          source={{ uri: item.avatar_url || 'https://via.placeholder.com/46' }} 
          style={styles.avatar} 
        />
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.display_name || 'Unnamed User'}</Text>
          <Text style={styles.userEmail}>{item.email}</Text>
          {item.reason && <Text style={styles.reasonText}>{item.reason}</Text>}
          {item.mutual_friends_count && item.mutual_friends_count > 0 && (
            <Text style={styles.mutualText}>
              {item.mutual_friends_count} mutual friend{item.mutual_friends_count !== 1 ? 's' : ''}
            </Text>
          )}
        </View>

        {status === 'accepted' ? (
          <Text style={styles.friendText}>Friends</Text>
        ) : status === 'pending' ? (
          <Text style={styles.pendingText}>Pending</Text>
        ) : (
          <Button
            mode="contained"
            onPress={() => handleAddFriend(item.id)} // item.id is PROFILE ID
            buttonColor="#007AFF"
            textColor="#fff"
            compact
          >
            Add
          </Button>
        )}
      </View>
    );
  };

  // Render suggestion section
  const renderSuggestionSection = ({ item }: { item: {type: SuggestionType, data: Profile[], title: string} }) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{item.title}</Text>
      <FlatList
        data={item.data}
        renderItem={renderUser}
        keyExtractor={(user) => `${item.type}-${user.id}`}
        scrollEnabled={false}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <IconButton icon="arrow-left" size={24} onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>Find Friends</Text>
      </View>

      {/* Search */}
      <View style={styles.searchWrapper}>
        <TextInput
          mode="outlined"
          placeholder="Search by name or email"
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchInput}
          left={<TextInput.Icon icon="magnify" />}
        />
      </View>

      {/* Debug Info */}
      {__DEV__ && currentProfileId && (
        <View style={styles.debugInfo}>
          <Text style={styles.debugText}>Profile ID: {currentProfileId}</Text>
          <Text style={styles.debugText}>Friendships: {friendships.length}</Text>
        </View>
      )}

      {/* Loading */}
      {loading && <ActivityIndicator style={{ marginTop: 10 }} />}

      {/* Content */}
      {searchQuery ? (
        // Search Results
        <FlatList
          data={profiles}
          renderItem={renderUser}
          keyExtractor={(item) => `search-${item.id}`}
          ListEmptyComponent={
            !loading && (
              <Text style={styles.emptyText}>
                {searchQuery ? 'No users found.' : 'Start typing to search for friends.'}
              </Text>
            )
          }
          contentContainerStyle={{ paddingBottom: 30 }}
        />
      ) : (
        // Suggestions
        <FlatList
          data={suggestions}
          renderItem={renderSuggestionSection}
          keyExtractor={(item) => item.type}
          ListEmptyComponent={
            loadingSuggestions ? (
              <ActivityIndicator size="large" style={{ marginTop: 50 }} />
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  No suggestions available right now.
                </Text>
                <Text style={styles.emptySubtext}>
                  Make sure you have other users in your database with region data.
                </Text>
              </View>
            )
          }
          contentContainerStyle={{ paddingBottom: 30 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignSelf: Platform.OS === 'web' ? 'center' : 'stretch',
    width: Platform.OS === 'web' ? 400 : '100%',
    borderRadius: Platform.OS === 'web' ? 12 : 0,
    marginTop: Platform.OS === 'web' ? 20 : 0,
    elevation: Platform.OS === 'web' ? 4 : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 8,
  },
  searchWrapper: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  searchInput: {
    backgroundColor: '#fff',
  },
  debugInfo: {
    padding: 8,
    backgroundColor: '#f0f0f0',
    marginHorizontal: 16,
    borderRadius: 4,
    marginTop: 8,
  },
  debugText: {
    fontSize: 10,
    color: '#666',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginHorizontal: 16,
    marginBottom: 12,
    color: '#333',
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f8f8',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  reasonText: {
    fontSize: 12,
    color: '#007AFF',
    fontStyle: 'italic',
  },
  mutualText: {
    fontSize: 12,
    color: '#28a745',
  },
  friendText: {
    color: '#0A8A0A',
    fontWeight: '600',
    fontSize: 12,
  },
  pendingText: {
    color: '#FFA500',
    fontWeight: '600',
    fontSize: 12,
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 40,
    fontSize: 16,
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptySubtext: {
    textAlign: 'center',
    color: '#999',
    marginTop: 8,
    fontSize: 14,
  },
});