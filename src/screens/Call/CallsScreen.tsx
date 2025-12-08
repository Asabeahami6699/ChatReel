// D:\chatApp\chatApp\src\screens\Call\CallsScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

interface CallItem {
  id: string;
  name: string;
  avatar: string;
  time: string;
  type: 'video' | 'voice';
  incoming: boolean;
  missed: boolean;
  duration?: number; // duration in seconds (optional)
}

const mockCalls: CallItem[] = [
  {
    id: '1',
    name: 'Alex Morgan',
    avatar: 'https://randomuser.me/api/portraits/women/44.jpg',
    time: '10:32 AM',
    type: 'video',
    incoming: true,
    missed: false,
    duration: 135, // 2:15
  },
  {
    id: '2',
    name: 'Jordan Lee',
    avatar: 'https://randomuser.me/api/portraits/men/32.jpg',
    time: 'Yesterday',
    type: 'voice',
    incoming: false,
    missed: true,
  },
  {
    id: '3',
    name: 'Sam Rivera',
    avatar: 'https://randomuser.me/api/portraits/women/65.jpg',
    time: 'Oct 28',
    type: 'video',
    incoming: true,
    missed: false,
    duration: 3754, // 1:02:34
  },
];

// Helper: Format seconds → MM:SS or H:MM:SS
const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function CallsScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'all' | 'missed'>('all');

  const filteredCalls = activeTab === 'missed'
    ? mockCalls.filter(c => c.missed)
    : mockCalls;

  const renderCallItem = ({ item }: { item: CallItem }) => (
    <TouchableOpacity style={styles.callItem}>
      <View style={styles.avatarContainer}>
        <Image source={{ uri: item.avatar }} style={styles.avatar} />
        <View style={[
          styles.callTypeIcon,
          item.type === 'video' ? styles.videoIcon : styles.voiceIcon,
        ]}>
          <Ionicons
            name={item.type === 'video' ? 'videocam' : 'call'}
            size={12}
            color="#fff"
          />
        </View>
      </View>

      <View style={styles.callInfo}>
        <Text style={[
          styles.callName,
          item.missed && styles.missedCallName,
        ]}>
          {item.name}
        </Text>
        <View style={styles.callMeta}>
          <Ionicons
            name={item.incoming ? 'arrow-down' : 'arrow-up'}
            size={14}
            color={item.missed ? '#ff3b30' : '#8e8e93'}
          />
          <Text style={[
            styles.callTime,
            item.missed && styles.missedCallTime,
          ]}>
            {item.missed ? item.time : `${item.time} · ${formatDuration(item.duration || 0)}`}
          </Text>
        </View>
      </View>

      <TouchableOpacity style={styles.infoButton}>
        <Ionicons name="information-circle-outline" size={22} color="#007aff" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#f2f2f7" />

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'all' && styles.activeTab]}
          onPress={() => setActiveTab('all')}
        >
          <Text style={[styles.tabText, activeTab === 'all' && styles.activeTabText]}>
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'missed' && styles.activeTab]}
          onPress={() => setActiveTab('missed')}
        >
          <Text style={[styles.tabText, activeTab === 'missed' && styles.activeTabText]}>
            Missed
          </Text>
          {mockCalls.filter(c => c.missed).length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {mockCalls.filter(c => c.missed).length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredCalls}
        keyExtractor={(item) => item.id}
        renderItem={renderCallItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="call-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No calls yet</Text>
            <Text style={styles.emptySubtext}>Start a conversation!</Text>
          </View>
        }
      />

      <TouchableOpacity style={[
        styles.fab,
        { bottom: insets.bottom + 30 }
      ]}>
        <View style={styles.fabInner}>
          <Ionicons name="add" size={28} color="#fff" />
        </View>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffffff',
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 8,
    backgroundColor: '#f7f7f7ff',
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#e5e5ea',
    marginRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#007aff',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8e8e93',
  },
  activeTabText: {
    color: '#fff',
  },
  badge: {
    backgroundColor: '#ff3b30',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  listContent: {
    paddingHorizontal: 10,
    paddingBottom: 100,
  },
  callItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
   
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 28,
  },
  callTypeIcon: {
    position: 'absolute',
    bottom: 0,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#f2f2f7',
  },
  videoIcon: {
    backgroundColor: '#34c759',
  },
  voiceIcon: {
    backgroundColor: '#007aff',
  },
  callInfo: {
    flex: 1,
    marginLeft: 16,
  },
  callName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  missedCallName: {
    color: '#ff3b30',
  },
  callMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  callTime: {
    fontSize: 14,
    color: '#8e8e93',
    marginLeft: 4,
  },
  missedCallTime: {
    color: '#ff3b30',
  },
  infoButton: {
    padding: 8,
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabInner: {
    flex: 1,
    backgroundColor: '#007aff',
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#8e8e93',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#aaa',
    marginTop: 4,
  },
});