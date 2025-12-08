// D:\chatApp\chatApp\src\screens\Reel\ReelsScreen.tsx
import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  TouchableOpacity,
  Image,
  StatusBar,
  ActivityIndicator,
  Animated,
  PanResponder,
} from 'react-native';
import { Video, AVPlaybackStatus } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
const { width: SCREEN_WIDTH, height: WINDOW_HEIGHT } = Dimensions.get('window');
const SCREEN_HEIGHT = WINDOW_HEIGHT;
interface ReelItem {
  id: string;
  videoUrl: string;
  avatar: string;
  username: string;
  caption: string;
  likes: number;
  comments: number;
  shares: number;
  music: string;
}
const mockReels: ReelItem[] = [
  {
    id: '1',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    avatar: 'https://randomuser.me/api/portraits/women/44.jpg',
    username: 'alexmorgan',
    caption: 'Morning coffee vibes',
    likes: 1234,
    comments: 89,
    shares: 23,
    music: 'Original Audio - alexmorgan',
  },
  {
    id: '2',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    avatar: 'https://randomuser.me/api/portraits/men/32.jpg',
    username: 'jordanlee',
    caption: 'Coding all night',
    likes: 567,
    comments: 45,
    shares: 12,
    music: 'Lo-fi Beats',
  },
  {
    id: '3',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    avatar: 'https://randomuser.me/api/portraits/women/65.jpg',
    username: 'samrivera',
    caption: 'Sunset from my balcony',
    likes: 8901,
    comments: 234,
    shares: 67,
    music: 'Chill Vibes - Sunset Mix',
  },
];
export default function ReelsScreen() {
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [liked, setLiked] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const heartScale = useRef(new Animated.Value(0)).current;
  const tapCount = useRef(0);
  const lastTap = useRef(0);
  const isFocused = useIsFocused();
  const videos = useRef<(Video | null)[]>([]);
  const heartOpacity = useRef(new Animated.Value(0)).current;
  const navigation = useNavigation();
  // Double tap detection
  const handleVideoPress = (id: string) => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      tapCount.current += 1;
      if (tapCount.current === 2) {
        toggleLike(id);
        tapCount.current = 0;
      }
    } else {
      tapCount.current = 1;
    }
    lastTap.current = now;
    setTimeout(() => {
      if (tapCount.current === 1) {
        togglePlayPause();
      }
      tapCount.current = 0;
    }, 300);
  };
  const togglePlayPause = async () => {
    const video = videos.current[currentIndex];
    if (video) {
      if (isPlaying) {
        await video.pauseAsync();
      } else {
        await video.playAsync();
      }
      setIsPlaying(!isPlaying);
    }
  };
  const toggleLike = (id: string) => {
    setLiked(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
    animateHeart();
  };
  const animateHeart = () => {
    heartScale.setValue(0);
    heartOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(heartScale, {
        toValue: 1.3,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(heartOpacity, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(heartScale, {
            toValue: 1.0,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(heartOpacity, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ]).start();
      }, 300);
    });
  };
  // Pause all videos when screen is not focused
  useEffect(() => {
    if (!isFocused) {
      videos.current.forEach(video => {
        if (video) {
          video.pauseAsync();
        }
      });
      setIsPlaying(false);
    } else if (isPlaying) {
      // Resume current video when screen comes back
      const currentVideo = videos.current[currentIndex];
      if (currentVideo) {
        currentVideo.playAsync();
      }
    }
  }, [isFocused, currentIndex, isPlaying]);
  useEffect(() => {
    videos.current.forEach((video, index) => {
      if (video) {
        if (index === currentIndex && isPlaying) {
          video.playAsync();
        } else {
          video.pauseAsync();
        }
      }
    });
  }, [currentIndex, isPlaying]);
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index);
      setProgress(0);
      setIsPlaying(true);
    }
  }).current;
  // Draggable Progress Bar
  const progressPan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gesture) => {
      const video = videos.current[currentIndex];
      if (video && video._loaded) {
        const duration = video._playbackStatus?.durationMillis || 1;
        const newProgress = gesture.moveX / SCREEN_WIDTH;
        const clamped = Math.max(0, Math.min(1, newProgress));
        video.setPositionAsync(clamped * duration);
        setProgress(clamped);
      }
    },
  });
  const renderReel = ({ item, index }: { item: ReelItem; index: number }) => {
    const isLiked = liked.includes(item.id);
    return (
      <View style={styles.reelContainer}>
        {/* Full-Screen Video */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => handleVideoPress(item.id)}
          style={StyleSheet.absoluteFill}
        >
          <Video
            ref={(ref) => (videos.current[index] = ref)}
            source={{ uri: item.videoUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            isLooping
            shouldPlay={index === currentIndex && isPlaying}
            isMuted={isMuted}
            progressUpdateIntervalMillis={100}
            onPlaybackStatusUpdate={(status: AVPlaybackStatus) => {
              if (status.isLoaded) {
                if (status.didJustFinish && index === currentIndex) {
                  videos.current[index]?.replayAsync();
                }
                if (status.positionMillis && status.durationMillis) {
                  setProgress(status.positionMillis / status.durationMillis);
                }
              }
            }}
          />
          {isLiked && index === currentIndex && (
            <Animated.View
              style={[
                styles.heartAnimation,
                {
                  transform: [{ scale: heartScale }],
                  opacity: heartOpacity,
                },
              ]}
              pointerEvents="none"
            >
              <Ionicons name="heart" size={100} color="#ff3b30" />
            </Animated.View>
          )}
        </TouchableOpacity>
        {/* Mute Button */}
        <TouchableOpacity
          style={[styles.muteButton, { top: insets.top + 16 }]}
          onPress={() => setIsMuted(!isMuted)}
        >
          <Ionicons
            name={isMuted ? 'volume-mute' : 'volume-medium'}
            size={24}
            color="#fff"
          />
        </TouchableOpacity>
        {/* Draggable Progress Bar */}
        {index === currentIndex && (
          <View style={[styles.progressContainer, { bottom: 10 }]} {...progressPan.panHandlers}>
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
          </View>
        )}
        {/* Bottom Gradient + Caption */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.7)']}
          style={styles.bottomGradient}
        >
          <View style={styles.captionContainer}>
            <View style={styles.userInfo}>
              <Image source={{ uri: item.avatar }} style={styles.avatar} />
              <Text style={styles.username}>@{item.username}</Text>
              <TouchableOpacity style={styles.followButton}>
                <Text style={styles.followText}>Follow</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.caption} numberOfLines={2}>
              {item.caption}
            </Text>
            <View style={styles.musicContainer}>
              <Ionicons name="musical-notes" size={16} color="#fff" />
              <Text style={styles.music}>{item.music}</Text>
            </View>
          </View>
        </LinearGradient>
        {/* Right Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.profileButton}>
            <Image source={{ uri: item.avatar }} style={styles.profileAvatar} />
            <View style={styles.plusIcon}>
              <Ionicons name="add" size={14} color="#fff" />
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => toggleLike(item.id)}>
            <Ionicons
              name={isLiked ? 'heart' : 'heart-outline'}
              size={32}
              color={isLiked ? '#ff3b30' : '#fff'}
            />
            <Text style={styles.actionText}>{item.likes}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="chatbubble-outline" size={32} color="#fff" />
            <Text style={styles.actionText}>{item.comments}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="paper-plane-outline" size={32} color="#fff" />
            <Text style={styles.actionText}>{item.shares}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      {/* Back Arrow Button */}
      <TouchableOpacity
        style={[styles.backButton, { top: insets.top + 16 }]}
        onPress={() => navigation.navigate('Chats')}
      >
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>
      <FlatList
        ref={flatListRef}
        data={mockReels}
        renderItem={renderReel}
        keyExtractor={(item) => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 80 }}
        snapToInterval={SCREEN_HEIGHT}
        decelerationRate="fast"
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.emptyText}>Loading Reels...</Text>
          </View>
        }
      />
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  reelContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    position: 'relative',
  },
  backButton: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 8,
  },
  muteButton: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 8,
  },
  progressContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    zIndex: 9,
  },
  progressBg: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  heartAnimation: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -50,
    marginTop: -50,
    zIndex: 10,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 220,
    justifyContent: 'flex-end',
    padding: 16,
  },
  captionContainer: {
    marginBottom: 20,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 8,
  },
  username: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
    marginRight: 12,
  },
  followButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  followText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 14,
  },
  caption: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 8,
  },
  musicContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  music: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 4,
  },
  actionButtons: {
    position: 'absolute',
    right: 12,
    bottom: 80,
    alignItems: 'center',
  },
  profileButton: {
    marginBottom: 24,
    alignItems: 'center',
  },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#fff',
  },
  plusIcon: {
    position: 'absolute',
    bottom: -4,
    backgroundColor: '#ff3b30',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  actionButton: {
    alignItems: 'center',
    marginBottom: 24,
  },
  actionText: {
    color: '#fff',
    fontSize: 12,
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
  },
});