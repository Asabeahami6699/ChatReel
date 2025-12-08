// D:\chatApp\chatApp\src\screens\Explore\FeedScreen.tsx
import React, { useState, useRef } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Modal,
  Dimensions,
  StatusBar,
  TextInput,
  ScrollView,
  Alert,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

const { width, height } = Dimensions.get('window');

export default function FeedScreen() {
  const [statuses, setStatuses] = useState([
    {
      id: '1',
      type: 'myStatus',
      name: 'Your Story',
      time: 'Add to your story',
      avatar: require('../../../assets/images/iphone.jpg'),
      hasUnseen: false,
      isMe: true,
      stories: [],
      gradient: ['#667eea', '#764ba2'],
    },
    {
      id: '2',
      type: 'recent',
      name: 'Sarah Chen',
      time: 'Just now',
      avatar: require('../../../assets/images/foodecar.jpg'),
      hasUnseen: true,
      isMe: false,
      seen: false,
      stories: [
        { id: 's1', image: require('../../../assets/images/foodecar.jpg'), type: 'image', duration: 5, caption: 'Exploring new places! 🌍' }
      ],
      gradient: ['#f093fb', '#f5576c'],
    },
    {
      id: '3',
      type: 'recent',
      name: 'Mike Rodriguez',
      time: '15 min ago',
      avatar: require('../../../assets/images/sandwich.jpg'),
      hasUnseen: true,
      isMe: false,
      seen: false,
      stories: [
        { id: 's2', image: require('../../../assets/images/sandwich.jpg'), type: 'image', duration: 5, caption: 'Food adventures never end! 🍔' }
      ],
      gradient: ['#4facfe', '#00f2fe'],
    },
    {
      id: '4',
      type: 'viewed',
      name: 'Emma Watson',
      time: '1 hr ago',
      avatar: require('../../../assets/images/17pro.jpg'),
      hasUnseen: false,
      isMe: false,
      seen: true,
      stories: [
        { id: 's3', image: require('../../../assets/images/17pro.jpg'), type: 'image', duration: 5, caption: 'Tech dreams coming true! 📱' }
      ],
      gradient: ['#43e97b', '#38f9d7'],
    },
    {
      id: '5',
      type: 'viewed',
      name: 'John Smith',
      time: '3 hrs ago',
      avatar: require('../../../assets/images/bugatti.jpg'),
      hasUnseen: false,
      isMe: false,
      seen: true,
      stories: [
        { id: 's4', image: require('../../../assets/images/bugatti.jpg'), type: 'image', duration: 5, caption: 'Need for speed! 🏎️' }
      ],
      gradient: ['#fa709a', '#fee140'],
    },
  ]);

  const [selectedStatus, setSelectedStatus] = useState(null);
  const [showStatusViewer, setShowStatusViewer] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [newStatusCaption, setNewStatusCaption] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [9, 16],
      quality: 1,
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0].uri);
      setShowCamera(true);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Camera access is needed to take photos');
      return;
    }

    let result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [9, 16],
      quality: 1,
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0].uri);
      setShowCamera(true);
    }
  };

  const postStatus = () => {
    if (!selectedImage) {
      Alert.alert('Please add a photo or video');
      return;
    }

    const newStory = {
      id: Date.now().toString(),
      image: { uri: selectedImage },
      caption: newStatusCaption,
      type: 'image',
      duration: 5,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setStatuses(prev => prev.map(status => {
      if (status.isMe) {
        return {
          ...status,
          stories: [...status.stories, newStory],
          time: 'Just now',
          hasUnseen: true,
        };
      }
      return status;
    }));

    setSelectedImage(null);
    setNewStatusCaption('');
    setShowCamera(false);
    Alert.alert('Story posted!', 'Your story is now live for 24 hours');
  };

  const animatePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const renderStatusCircle = ({ item, index }) => {
    const isMyStatus = item.isMe;
    const hasStories = item.stories && item.stories.length > 0;

    return (
      <TouchableOpacity 
        style={styles.statusCircle}
        onPress={() => {
          animatePress();
          if (isMyStatus) {
            if (hasStories) {
              setSelectedStatus(item);
              setCurrentStoryIndex(0);
              setShowStatusViewer(true);
            } else {
              Alert.alert(
                'Create Story',
                'Share a moment with your friends',
                [
                  { text: '📸 Take Photo', onPress: takePhoto, style: 'default' },
                  { text: '🖼️ Choose from Gallery', onPress: pickImage, style: 'default' },
                  { text: 'Cancel', style: 'cancel' },
                ],
                { cancelable: true }
              );
            }
          } else if (hasStories) {
            setSelectedStatus(item);
            setCurrentStoryIndex(0);
            setShowStatusViewer(true);
          }
        }}
        activeOpacity={0.7}
      >
        <Animated.View style={[
          styles.circleContainer,
          !item.seen && !isMyStatus && styles.unseenCircle,
          isMyStatus && styles.myCircle,
          { transform: [{ scale: scaleAnim }] }
        ]}>
          <Image source={item.avatar} style={styles.circleAvatar} />
          {isMyStatus && (
            <View style={styles.addStoryButton}>
              <Ionicons name="add" size={20} color="#fff" />
            </View>
          )}
        </Animated.View>
        <Text style={styles.circleName} numberOfLines={1}>
          {isMyStatus ? 'Your Story' : item.name.split(' ')[0]}
        </Text>
        {!isMyStatus && !item.seen && (
          <View style={styles.liveIndicator}>
            <View style={styles.livePulse} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const StatusViewer = () => {
    if (!selectedStatus) return null;

    const currentStory = selectedStatus.stories[currentStoryIndex];

    return (
      <Modal
        visible={showStatusViewer}
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.statusViewer}>
          {/* Progress Bars */}
          <View style={styles.progressContainer}>
            {selectedStatus.stories.map((story, index) => (
              <View key={story.id} style={styles.progressBarBackground}>
                <View 
                  style={[
                    styles.progressBar,
                    { 
                      width: `${(index < currentStoryIndex ? 100 : index === currentStoryIndex ? 50 : 0)}%`,
                    }
                  ]} 
                />
              </View>
            ))}
          </View>

          {/* Status Header */}
          <View style={styles.statusHeader}>
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => setShowStatusViewer(false)}
            >
              <Ionicons name="chevron-down" size={28} color="#fff" />
            </TouchableOpacity>
            
            <View style={styles.statusUserInfo}>
              <Image source={selectedStatus.avatar} style={styles.statusViewerAvatar} />
              <View>
                <Text style={styles.statusViewerName}>{selectedStatus.name}</Text>
                <Text style={styles.statusViewerTime}>{currentStory?.timestamp}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.moreButton}>
              <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Status Content */}
          <View style={styles.statusContent}>
            {currentStory && (
              <Image 
                source={currentStory.image} 
                style={styles.statusImage} 
                resizeMode="cover"
              />
            )}
            
            {currentStory?.caption && (
              <View style={styles.captionOverlay}>
                <Text style={styles.captionText}>{currentStory.caption}</Text>
              </View>
            )}
          </View>

          {/* Interactive Areas */}
          <TouchableOpacity 
            style={[styles.navArea, styles.leftNav]}
            onPress={() => currentStoryIndex > 0 && setCurrentStoryIndex(currentStoryIndex - 1)}
          />
          <TouchableOpacity 
            style={[styles.navArea, styles.rightNav]}
            onPress={() => currentStoryIndex < selectedStatus.stories.length - 1 && setCurrentStoryIndex(currentStoryIndex + 1)}
          />

          {/* Reaction Bar */}
          <View style={styles.reactionBar}>
            <TextInput
              style={styles.replyInput}
              placeholder="Send message..."
              placeholderTextColor="rgba(255,255,255,0.7)"
            />
            <View style={styles.reactionIcons}>
              <TouchableOpacity style={styles.reactionIcon}>
                <Text style={styles.reactionEmoji}>❤️</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.reactionIcon}>
                <Text style={styles.reactionEmoji}>😂</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.reactionIcon}>
                <Text style={styles.reactionEmoji}>🔥</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.reactionIcon}>
                <Ionicons name="send" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const CameraModal = () => (
    <Modal
      visible={showCamera}
      animationType="slide"
      statusBarTranslucent
    >
      <View style={styles.cameraContainer}>
        {/* Camera Header */}
        <View style={styles.cameraHeader}>
          <TouchableOpacity 
            style={styles.cameraBackButton}
            onPress={() => setShowCamera(false)}
          >
            <Ionicons name="chevron-down" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.cameraTitle}>Create Story</Text>
          <TouchableOpacity style={styles.postButton} onPress={postStatus}>
            <Text style={styles.postButtonText}>Share</Text>
          </TouchableOpacity>
        </View>

        {/* Preview */}
        {selectedImage && (
          <View style={styles.previewContainer}>
            <Image source={{ uri: selectedImage }} style={styles.previewImage} />
            <View style={styles.captionContainer}>
              <TextInput
                style={styles.captionInput}
                placeholder="Add your story caption..."
                placeholderTextColor="rgba(255,255,255,0.7)"
                value={newStatusCaption}
                onChangeText={setNewStatusCaption}
                multiline
                textAlignVertical="center"
              />
              <Ionicons name="create-outline" size={20} color="rgba(255,255,255,0.7)" />
            </View>
          </View>
        )}

        {/* Camera Options */}
        <View style={styles.cameraOptions}>
          <TouchableOpacity style={styles.cameraOption} onPress={takePhoto}>
            <View style={styles.optionIcon}>
              <Ionicons name="camera" size={28} color="#007AFF" />
            </View>
            <Text style={styles.optionText}>Camera</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.cameraOption} onPress={pickImage}>
            <View style={styles.optionIcon}>
              <Ionicons name="images" size={28} color="#007AFF" />
            </View>
            <Text style={styles.optionText}>Gallery</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#fff" barStyle="dark-content" />
      
      {/* Status Circles - Directly at top without header */}
      <View style={styles.circlesSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.circlesScroll}>
          {statuses.map((status, index) => (
            <View key={status.id} style={styles.circleWrapper}>
              {renderStatusCircle({ item: status, index })}
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Quick Actions - Minimal design */}
      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.quickAction} onPress={takePhoto}>
          <View style={[styles.quickIcon, { backgroundColor: '#007AFF' }]}>
            <Ionicons name="camera" size={20} color="#fff" />
          </View>
          <Text style={styles.quickText}>Camera</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.quickAction} onPress={pickImage}>
          <View style={[styles.quickIcon, { backgroundColor: '#34C759' }]}>
            <Ionicons name="images" size={20} color="#fff" />
          </View>
          <Text style={styles.quickText}>Gallery</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.quickAction}>
          <View style={[styles.quickIcon, { backgroundColor: '#FF9500' }]}>
            <Ionicons name="videocam" size={20} color="#fff" />
          </View>
          <Text style={styles.quickText}>Video</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Stories Section */}
      <View style={styles.storiesSection}>
        <Text style={styles.sectionTitle}>Recent Updates</Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          {statuses.filter(s => !s.isMe && s.stories.length > 0).map((status) => (
            <TouchableOpacity 
              key={status.id}
              style={styles.storyItem}
              onPress={() => {
                setSelectedStatus(status);
                setCurrentStoryIndex(0);
                setShowStatusViewer(true);
              }}
            >
              <View style={styles.storyAvatarContainer}>
                <Image source={status.avatar} style={styles.storyAvatar} />
                {!status.seen && <View style={styles.unseenDot} />}
              </View>
              <View style={styles.storyInfo}>
                <Text style={styles.storyName}>{status.name}</Text>
                <Text style={styles.storyTime}>{status.time} • {status.stories.length} updates</Text>
              </View>
              <View style={styles.storyPreview}>
                <Image source={status.stories[0].image} style={styles.previewThumb} />
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <StatusViewer />
      <CameraModal />

      {/* Floating Create Button */}
      <TouchableOpacity 
        style={styles.floatingCreateButton}
        onPress={takePhoto}
      >
        <View style={styles.createButtonInner}>
          <Ionicons name="camera" size={24} color="#fff" />
        </View>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  circlesSection: {
    paddingVertical: 25,
    paddingHorizontal: 15,
    backgroundColor: '#fff',
  },
  circlesScroll: {
    paddingHorizontal: 5,
  },
  circleWrapper: {
    marginHorizontal: 8,
  },
  statusCircle: {
    alignItems: 'center',
    width: 80,
  },
  circleContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    position: 'relative',
    backgroundColor: '#f8f9fa',
  },
  unseenCircle: {
    borderWidth: 3,
    borderColor: '#007AFF',
  },
  myCircle: {
    borderWidth: 3,
    borderColor: '#007AFF',
  },
  circleAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  addStoryButton: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#007AFF',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  circleName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  liveIndicator: {
    position: 'absolute',
    top: -5,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF3B30',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  livePulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
    marginRight: 4,
  },
  liveText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#f8f9fa',
    marginHorizontal: 15,
    borderRadius: 16,
    marginBottom: 20,
  },
  quickAction: {
    alignItems: 'center',
  },
  quickIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  quickText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  storiesSection: {
    flex: 1,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  storyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  storyAvatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  storyAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  unseenDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#007AFF',
    borderWidth: 2,
    borderColor: '#fff',
  },
  storyInfo: {
    flex: 1,
  },
  storyName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  storyTime: {
    fontSize: 14,
    color: '#666',
  },
  storyPreview: {
    width: 60,
    height: 60,
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewThumb: {
    width: '100%',
    height: '100%',
  },
  statusViewer: {
    flex: 1,
    backgroundColor: '#000',
  },
  progressContainer: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingTop: 50,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  progressBarBackground: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: 2,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#fff',
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 12,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingTop: 60,
  },
  backButton: {
    padding: 8,
  },
  statusUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginLeft: 12,
  },
  statusViewerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  statusViewerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  statusViewerTime: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  moreButton: {
    padding: 8,
  },
  statusContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusImage: {
    width: width,
    height: height,
  },
  captionOverlay: {
    position: 'absolute',
    bottom: 120,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 16,
    borderRadius: 12,
  },
  captionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '500',
  },
  navArea: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '30%',
  },
  leftNav: {
    left: 0,
  },
  rightNav: {
    right: 0,
  },
  reactionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 40,
    flexDirection: 'row',
    alignItems: 'center',
  },
  replyInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    color: '#fff',
    marginRight: 12,
    fontSize: 16,
  },
  reactionIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reactionIcon: {
    padding: 8,
    marginLeft: 8,
  },
  reactionEmoji: {
    fontSize: 20,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  cameraHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 50,
    backgroundColor: '#fff',
  },
  cameraBackButton: {
    padding: 8,
  },
  cameraTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  postButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 16,
  },
  postButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  previewContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  previewImage: {
    width: '100%',
    height: '70%',
    borderRadius: 16,
  },
  captionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    width: '100%',
  },
  captionInput: {
    flex: 1,
    color: '#333',
    fontSize: 16,
    marginRight: 10,
  },
  cameraOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 20,
    paddingBottom: 40,
    backgroundColor: '#fff',
  },
  cameraOption: {
    alignItems: 'center',
  },
  optionIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  optionText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '500',
  },
  floatingCreateButton: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  createButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
});