// D:\chatApp\chatApp\src\screens\Reel\ReelProfileSheet.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ReelProfileSheetProps {
  user: {
    username: string;
    avatar: string;
    bio: string;
    followers: number;
    following: number;
    posts: number;
  };
  onClose: () => void;
  onFollow: () => void;
}

export default function ReelProfileSheet({ user, onClose, onFollow }: ReelProfileSheetProps) {
  const [following, setFollowing] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.username}>@{user.username}</Text>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView>
        <View style={styles.profileHeader}>
          <Image source={{ uri: user.avatar }} style={styles.avatar} />
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statNumber}>{user.posts}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNumber}>{user.followers}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNumber}>{user.following}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </View>
          </View>
        </View>

        <Text style={styles.bio}>{user.bio}</Text>

        <TouchableOpacity
          style={[styles.followBtn, following && styles.followingBtn]}
          onPress={() => {
            setFollowing(!following);
            onFollow();
          }}
        >
          <Text style={[styles.followText, following && styles.followingText]}>
            {following ? 'Following' : 'Follow'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 0.5,
    borderColor: '#333',
  },
  username: { color: '#fff', fontWeight: '600', fontSize: 18 },
  profileHeader: { flexDirection: 'row', padding: 20, alignItems: 'flex-start' },
  avatar: { width: 80, height: 80, borderRadius: 40, marginRight: 20 },
  stats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center' },
  statNumber: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  statLabel: { color: '#888', fontSize: 12 },
  bio: { color: '#fff', paddingHorizontal: 20, marginBottom: 20 },
  followBtn: {
    marginHorizontal: 20,
    backgroundColor: '#0095f6',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  followingBtn: { backgroundColor: '#333' },
  followText: { color: '#fff', fontWeight: '600' },
  followingText: { color: '#fff' },
});