// ChatInput.tsx
import React, { useState, useRef, forwardRef } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Animated,
  LayoutAnimation,
  Modal,
  Text,
  Alert,
  Image,
  Dimensions,
  TouchableWithoutFeedback,
  ScrollView,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioRecorder, RecordingPresets } from 'expo-audio';
import {
  configurePlaybackAudio,
  configureRecordingAudio,
  configureVoicePreviewAudio,
  createPlaybackPlayer,
  ensureMicPermission,
  releasePlayer,
  resetRecordingAudio,
  type AudioPlayer,
} from '../../lib/appAudio';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as VideoThumbnails from 'expo-video-thumbnails';
import AttachmentPreview from '../../components/AttachmentPreview'; // Adjust the path as necessary
import { USE_NATIVE_DRIVER } from '../../lib/animation';
import { mergeVoiceSegments } from '../../lib/mergeVoiceSegments';
import { chatTheme } from './chatTheme';

type ChatInputProps = {
  onSend?: (text: string) => void;
  onSendVoice?: (voiceUri: string, duration: number) => void;
  onSendAttachment?: (uri: string, mimeType: string | undefined, name: string | null, size?: number) => void;
  onSendMultipleAttachments?: (attachments: Array<{
    uri: string;
    mimeType: string | undefined;
    name: string | null;
    size?: number;
  }>) => void;
  /** Called when the user picks attachments via the inner attachment menu (image/video/audio/doc). */
  onAttachmentsSelected?: (
    attachments: Array<{
      id: string;
      uri: string;
      mimeType?: string;
      name?: string | null;
      size?: number;
      type: 'photo' | 'video' | 'audio' | 'document';
      thumbnail?: string;
      duration?: number;
    }>
  ) => void;
  placeholder?: string;
  style?: any;
  /** Disables the composer (e.g. while user.id isn't ready). */
  disabled?: boolean;
  onAttachmentPress?: () => void;
  /** When the parent owns attachment preview (e.g. ChatRoomScreen). */
  pendingAttachmentCount?: number;
  onPendingAttachmentsPress?: () => void;
  /** Persisted draft text (controlled). */
  draft?: string;
  onDraftChange?: (text: string) => void;
  /** Group @mention suggestions */
  mentionMembers?: Array<{ display_name: string; user_id?: string }>;
};

type RecordingMode = 'text' | 'recording' | 'paused' | 'playing';

type AttachmentFile = {
  id: string;
  uri: string;
  mimeType: string | undefined;
  name: string | null;
  size?: number;
  type: 'photo' | 'video' | 'audio' | 'document';
  thumbnail?: string;
  duration?: number; // For videos
};

const commonEmojis = [
  '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
  '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
  '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩',
  '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣',
  '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬',
  '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗',
  '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯',
  '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐',
  '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈',
  '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾',
  '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿',
  '😾'
];

const VOICE_RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
};

const ChatInput = forwardRef<TextInput, ChatInputProps>(({
  onSend = (text) => console.log('send:', text),
  onSendVoice = (uri, duration) => console.log('voice:', uri, duration),
  onSendAttachment,
  onSendMultipleAttachments,
  onAttachmentsSelected,
  placeholder = 'Send a message...',
  style,
  onAttachmentPress,
  pendingAttachmentCount = 0,
  onPendingAttachmentsPress,
  disabled = false,
  draft,
  onDraftChange,
  mentionMembers = [],
}, ref) => {
  const [text, setText] = useState('');
  const isDraftControlled = onDraftChange != null;
  const inputText = isDraftControlled ? (draft ?? '') : text;
  const setInputText = isDraftControlled ? onDraftChange : setText;
  const [inputHeight, setInputHeight] = useState(40);
  const [inputFocused, setInputFocused] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [mode, setMode] = useState<RecordingMode>('text');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [selectedAttachments, setSelectedAttachments] = useState<AttachmentFile[]>([]);
  const [showAttachmentPreview, setShowAttachmentPreview] = useState(false);
  
  const inputRef = useRef<TextInput>(null);
  const audioRecorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const soundRef = useRef<AudioPlayer | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const waveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordedDurationRef = useRef(0);
  const recordingPreviewUriRef = useRef<string | null>(null);
  const recorderNeedsPrepareRef = useRef(false);
  const modeRef = useRef<RecordingMode>('text');
  /** Completed clips when a session was finalized (web multi-segment). */
  const recordingSegmentsRef = useRef<{ uri: string; duration: number }[]>([]);
  const segmentBaseDurationRef = useRef(0);

  const sendScale = useRef(new Animated.Value(1)).current;
  const waveAnimations = useRef<Animated.Value[]>([]).current;

  React.useImperativeHandle(ref, () => inputRef.current!);

  React.useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const getRecordingUri = () =>
    recordingPreviewUriRef.current ??
    audioRecorder.uri ??
    audioRecorder.getStatus().url ??
    null;

  const finalizeRecordingForPreview = async (): Promise<string | null> => {
    if (audioRecorder.isRecording) {
      await audioRecorder.stop();
      await new Promise((resolve) => setTimeout(resolve, 120));
      recorderNeedsPrepareRef.current = true;
    }

    const uri =
      audioRecorder.uri ??
      audioRecorder.getStatus().url ??
      recordingPreviewUriRef.current ??
      recordingSegmentsRef.current[recordingSegmentsRef.current.length - 1]?.uri ??
      null;
    if (uri) {
      recordingPreviewUriRef.current = uri;
    }
    return uri;
  };

  const commitCurrentSegment = async (): Promise<string | null> => {
    const uri = await finalizeRecordingForPreview();
    if (!uri) return null;
    const segDuration = Math.max(0, recordedDurationRef.current - segmentBaseDurationRef.current);
    if (segDuration > 0) {
      recordingSegmentsRef.current.push({ uri, duration: segDuration });
    }
    segmentBaseDurationRef.current = recordedDurationRef.current;
    recordingPreviewUriRef.current = uri;
    return uri;
  };

  const resolveSendUri = async (): Promise<string | null> => {
    if (Platform.OS === 'web') {
      if (audioRecorder.isRecording) {
        await audioRecorder.stop();
        await new Promise((resolve) => setTimeout(resolve, 120));
        recorderNeedsPrepareRef.current = true;
      }

      const finalUri =
        audioRecorder.uri ??
        audioRecorder.getStatus().url ??
        recordingPreviewUriRef.current ??
        recordingSegmentsRef.current[recordingSegmentsRef.current.length - 1]?.uri ??
        null;
      if (finalUri) {
        const segDuration = Math.max(
          0,
          recordedDurationRef.current - segmentBaseDurationRef.current
        );
        if (segDuration > 0) {
          recordingSegmentsRef.current.push({ uri: finalUri, duration: segDuration });
        }
      }

      const segments = recordingSegmentsRef.current;
      if (segments.length === 0) return finalUri;
      if (segments.length === 1) return segments[0].uri;
      return mergeVoiceSegments(segments.map((seg) => seg.uri));
    }

    // Native: one MediaRecorder session — pause/resume keeps the full clip in one file.
    if (audioRecorder.isRecording) {
      await audioRecorder.stop();
    } else {
      const status = audioRecorder.getStatus();
      if (status.canRecord) {
        await audioRecorder.stop();
      }
    }

    return (
      audioRecorder.uri ??
      audioRecorder.getStatus().url ??
      recordingPreviewUriRef.current
    );
  };

  const resolvePreviewUri = async (): Promise<string | null> => {
    if (Platform.OS === 'web') {
      if (audioRecorder.isRecording) {
        await finalizeRecordingForPreview();
      }
      const segments = recordingSegmentsRef.current;
      if (segments.length > 0) {
        return segments[segments.length - 1].uri;
      }
      return recordingPreviewUriRef.current ?? getRecordingUri();
    }

    const sourceUri = getRecordingUri();
    if (!sourceUri) return null;

    // Native paused session: play the in-progress file directly (no copy/finalize).
    if (Platform.OS !== 'web' && modeRef.current === 'paused' && !recorderNeedsPrepareRef.current) {
      return sourceUri;
    }

    const status = audioRecorder.getStatus();
    const sessionStillOpen =
      modeRef.current === 'paused' && status.canRecord && !recorderNeedsPrepareRef.current;

    if (!sessionStillOpen || Platform.OS === 'web' || !FileSystem.cacheDirectory) {
      return sourceUri;
    }

    try {
      const extension = sourceUri.includes('.') ? sourceUri.split('.').pop() : 'm4a';
      const previewPath = `${FileSystem.cacheDirectory}voice-preview-${Date.now()}.${extension}`;
      await FileSystem.copyAsync({ from: sourceUri, to: previewPath });
      return previewPath;
    } catch {
      return sourceUri;
    }
  };

  // Initialize wave animations
  React.useEffect(() => {
    waveAnimations.length = 0;
    for (let i = 0; i < 20; i++) {
      waveAnimations[i] = new Animated.Value(5);
    }

    return () => {
      cleanupRecording();
      cleanupPlayback();
    };
  }, []);

  // Cleanup recording resources
  const cleanupRecording = async () => {
    try {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }

      if (waveIntervalRef.current) {
        clearInterval(waveIntervalRef.current);
        waveIntervalRef.current = null;
      }

      if (audioRecorder.isRecording) {
        try {
          await audioRecorder.stop();
        } catch (error) {
          console.log('Error stopping recording during cleanup:', error);
        }
      } else if (modeRef.current !== 'text') {
        const status = audioRecorder.getStatus();
        if (status.canRecord) {
          try {
            await audioRecorder.stop();
          } catch (error) {
            console.log('Error finalizing recording during cleanup:', error);
          }
        }
      }

      recordingPreviewUriRef.current = null;
      recorderNeedsPrepareRef.current = false;
      recordingSegmentsRef.current = [];
      segmentBaseDurationRef.current = 0;
      await resetRecordingAudio();
    } catch (error) {
      console.log('Cleanup error:', error);
    }
  };

  // Cleanup playback resources
  const cleanupPlayback = async () => {
    try {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }

      if (soundRef.current) {
        await releasePlayer(soundRef.current);
        soundRef.current = null;
      }
    } catch (error) {
      console.log('Playback cleanup error:', error);
    }
  };

  // ==================== MEDIA HANDLERS ====================
  const mapPickerAsset = async (
    asset: ImagePicker.ImagePickerAsset
  ): Promise<AttachmentFile> => {
    const isVideo =
      asset.type === 'video' || (asset.mimeType?.startsWith('video/') ?? false);
    let thumbnail: string | undefined;

    if (isVideo && Platform.OS !== 'web') {
      try {
        const { uri } = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 0 });
        thumbnail = uri;
      } catch {
        /* thumbnail optional */
      }
    }

    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      uri: asset.uri,
      mimeType: asset.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'),
      name:
        asset.fileName ||
        (isVideo ? `video_${Date.now()}.mp4` : `photo_${Date.now()}.jpg`),
      size: asset.fileSize,
      type: isVideo ? 'video' : 'photo',
      duration: asset.duration ?? undefined,
      thumbnail,
    };
  };

  const appendAttachments = (newAttachments: AttachmentFile[]) => {
    if (newAttachments.length === 0) return;

    if (onAttachmentsSelected) {
      onAttachmentsSelected(newAttachments);
      setShowAttachmentMenu(false);
      return;
    }

    setSelectedAttachments((prev) => {
      const next = [...prev, ...newAttachments];
      return next;
    });
    setShowAttachmentMenu(false);
    setShowAttachmentPreview(true);
  };

  const handleTakePhotos = async () => {
    setShowAttachmentMenu(false);
    
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please grant camera permission to take photos.');
      return;
    }
    
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
      allowsMultipleSelection: true,
    });
    
    if (!result.canceled && result.assets) {
      const newAttachments = await Promise.all(result.assets.map(mapPickerAsset));
      appendAttachments(newAttachments);
    }
  };

  const handleSelectGallery = async () => {
    setShowAttachmentMenu(false);

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please grant photo library permission.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.8,
      allowsMultipleSelection: true,
      videoMaxDuration: 300,
    });

    if (!result.canceled && result.assets) {
      const newAttachments = await Promise.all(result.assets.map(mapPickerAsset));
      appendAttachments(newAttachments);
    }
  };

  const handleRecordVideo = async () => {
    setShowAttachmentMenu(false);
    
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please grant camera permission to record videos.');
      return;
    }
    
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.8,
      videoMaxDuration: 60,
      allowsMultipleSelection: false,
    });
    
    if (!result.canceled && result.assets) {
      const newAttachments = await Promise.all(result.assets.map(mapPickerAsset));
      appendAttachments(newAttachments);
    }
  };

  const handleSelectVideos = async () => {
    setShowAttachmentMenu(false);
    
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please grant photo library permission to select videos.');
      return;
    }
    
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.8,
      videoMaxDuration: 300,
      allowsMultipleSelection: true,
    });
    
    if (!result.canceled && result.assets) {
      const newAttachments = await Promise.all(result.assets.map(mapPickerAsset));
      appendAttachments(newAttachments);
    }
  };

  const handleSelectAudio = async () => {
    setShowAttachmentMenu(false);
    
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
        multiple: true,
      });
      
      if (!result.canceled && result.assets) {
        const newAttachments: AttachmentFile[] = result.assets.map(asset => ({
          id: Date.now() + Math.random().toString(),
          uri: asset.uri,
          mimeType: asset.mimeType || 'audio/mpeg',
          name: asset.name || `audio_${Date.now()}.mp3`,
          size: asset.size,
          type: 'audio',
        }));
        
        appendAttachments(newAttachments);
      }
    } catch (error) {
      console.error('Error selecting audio:', error);
      Alert.alert('Error', 'Failed to select audio files. Please try again.');
    }
  };

  const handleSelectDocuments = async () => {
    setShowAttachmentMenu(false);
    
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          '*/*', // Allow any file type
        ],
        copyToCacheDirectory: true,
        multiple: true,
      });
      
      if (!result.canceled && result.assets) {
        const newAttachments: AttachmentFile[] = result.assets.map(asset => ({
          id: Date.now() + Math.random().toString(),
          uri: asset.uri,
          mimeType: asset.mimeType || 'application/octet-stream',
          name: asset.name || `document_${Date.now()}`,
          size: asset.size,
          type: 'document',
        }));
        
        appendAttachments(newAttachments);
      }
    } catch (error) {
      console.error('Error selecting documents:', error);
      Alert.alert('Error', 'Failed to select documents. Please try again.');
    }
  };

  // ==================== PREVIEW HANDLERS ====================
  const removeAttachment = (id: string) => {
    setSelectedAttachments(prev => prev.filter(att => att.id !== id));
  };

  const clearAllAttachments = () => {
    setSelectedAttachments([]);
    setShowAttachmentPreview(false);
  };

  const sendAllAttachments = (attachmentsToSend?: AttachmentFile[]) => {
    const batch = attachmentsToSend ?? selectedAttachments;
    if (batch.length === 0) return;

    if (onSendMultipleAttachments) {
      onSendMultipleAttachments(batch.map(({ id, ...rest }) => rest));
    } else if (onSendAttachment) {
      batch.forEach((attachment) => {
        const { id, ...rest } = attachment;
        onSendAttachment(rest.uri, rest.mimeType, rest.name, rest.size);
      });
    }

    clearAllAttachments();
  };

  const sendSingleAttachment = (attachment: AttachmentFile) => {
    if (onSendAttachment) {
      const { id, ...rest } = attachment;
      onSendAttachment(rest.uri, rest.mimeType, rest.name, rest.size);
    }
    
    setSelectedAttachments(prev => prev.filter(att => att.id !== attachment.id));
    if (selectedAttachments.length === 1) {
      setShowAttachmentPreview(false);
    }
  };

  // ==================== ATTACHMENT MENU (3x2 GRID) ====================
  const renderAttachmentMenu = () => {
    const attachmentOptions = [
      {
        title: 'Take Photo',
        subtitle: 'Camera',
        icon: 'camera-outline',
        onPress: handleTakePhotos,
        color: '#4CAF50',
      },
      {
        title: 'Gallery',
        subtitle: 'Photos & videos',
        icon: 'images-outline',
        onPress: handleSelectGallery,
        color: '#2196F3',
      },
      {
        title: 'Record Video',
        subtitle: 'Camera',
        icon: 'videocam-outline',
        onPress: handleRecordVideo,
        color: '#FF9800',
      },
      {
        title: 'Choose Video',
        subtitle: 'Videos only',
        icon: 'film-outline',
        onPress: handleSelectVideos,
        color: '#E91E63',
      },
      {
        title: 'Choose Audio',
        subtitle: 'Files',
        icon: 'musical-notes-outline',
        onPress: handleSelectAudio,
        color: '#9C27B0',
      },
      {
        title: 'Choose Document',
        subtitle: 'Files',
        icon: 'folder-outline',
        onPress: handleSelectDocuments,
        color: '#795548',
      },
    ];

    return (
      <Modal
        visible={showAttachmentMenu}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowAttachmentMenu(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowAttachmentMenu(false)}>
          <View style={styles.attachmentMenuOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.attachmentMenuContainer}>
                <View style={styles.attachmentMenuHeader}>
                  <Text style={styles.attachmentMenuTitle}>Attach File</Text>
                  <TouchableOpacity
                    style={styles.attachmentCloseButton}
                    onPress={() => setShowAttachmentMenu(false)}
                  >
                    <Ionicons name="close" size={24} color="#333" />
                  </TouchableOpacity>
                </View>
                
                {/* 3x2 Grid */}
                <View style={styles.attachmentGrid}>
                  {attachmentOptions.map((option, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.attachmentOption}
                      onPress={option.onPress}
                    >
                      <View style={[styles.attachmentIconContainer, { backgroundColor: option.color }]}>
                        <Ionicons name={option.icon as any} size={22} color="#fff" />
                      </View>
                      <Text style={styles.attachmentOptionTitle}>{option.title}</Text>
                      <Text style={styles.attachmentOptionSubtitle}>{option.subtitle}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    );
  };

  // ==================== REST OF THE COMPONENT (Text Input & Recording) ====================
 // Add these functions inside the component, after the media handlers and before the render functions

const startRecording = async () => {
  try {
    await cleanupRecording();
    await cleanupPlayback();

    recordingPreviewUriRef.current = null;
    recorderNeedsPrepareRef.current = false;
    recordingSegmentsRef.current = [];
    segmentBaseDurationRef.current = 0;

    const granted = await ensureMicPermission();
    if (!granted) {
      Alert.alert('Permission required', 'Please grant microphone permission to record voice messages.');
      return;
    }

    await configureRecordingAudio();

    await audioRecorder.prepareToRecordAsync();
    audioRecorder.record();

    setMode('recording');
    setRecordingDuration(0);
    recordedDurationRef.current = 0;

    recordingIntervalRef.current = setInterval(() => {
      setRecordingDuration(prev => {
        const newDuration = prev + 0.1;
        recordedDurationRef.current = newDuration;
        return newDuration;
      });
    }, 100);

    startWaveAnimation();
  } catch (error) {
    console.error('Failed to start recording', error);
    Alert.alert('Error', 'Failed to start recording. Please try again.');
    await cleanupRecording();
    setMode('text');
  }
};

const pauseRecording = async () => {
  try {
    if (modeRef.current === 'playing') {
      await stopPlayback();
    }

    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    if (waveIntervalRef.current) {
      clearInterval(waveIntervalRef.current);
      waveIntervalRef.current = null;
    }

    if (Platform.OS === 'web') {
      await commitCurrentSegment();
    } else if (audioRecorder.isRecording) {
      audioRecorder.pause();
      recordingPreviewUriRef.current = getRecordingUri();
    }

    setMode('paused');
    stopWaveAnimation();
  } catch (error) {
    console.error('Failed to pause recording', error);
    Alert.alert('Error', 'Failed to pause recording');
  }
};

const resumeRecording = async () => {
  try {
    if (modeRef.current === 'playing') {
      await stopPlayback();
    }

    if (Platform.OS === 'web') {
      await configureRecordingAudio();
      await audioRecorder.prepareToRecordAsync();
      recorderNeedsPrepareRef.current = false;
    } else {
      const status = audioRecorder.getStatus();
      const canResumeSameSession =
        !recorderNeedsPrepareRef.current && status.canRecord && !audioRecorder.isRecording;

      if (!canResumeSameSession) {
        await configureRecordingAudio();
        await audioRecorder.prepareToRecordAsync();
        recorderNeedsPrepareRef.current = false;
      }
    }

    audioRecorder.record();

    recordingIntervalRef.current = setInterval(() => {
      setRecordingDuration(prev => {
        const newDuration = prev + 0.1;
        recordedDurationRef.current = newDuration;
        return newDuration;
      });
    }, 100);

    startWaveAnimation();
    setMode('recording');
  } catch (error) {
    console.error('Failed to resume recording', error);
    Alert.alert('Error', 'Failed to resume recording');
  }
};

const playRecording = async () => {
  try {
    if (recordedDurationRef.current < 0.3) {
      Alert.alert('Too short', 'Hold to record a longer voice message.');
      return;
    }

    if (modeRef.current === 'recording') {
      await pauseRecording();
    }

    const uri = await resolvePreviewUri();

    if (!uri) {
      Alert.alert('Error', 'No recording found to play');
      return;
    }

    await startPreviewPlayback(uri);
  } catch (error) {
    console.error('Failed to play recording', error);
    Alert.alert('Error', 'Failed to play recording');
    setMode('paused');
  }
};

const startPreviewPlayback = async (uri: string) => {
  await cleanupPlayback();

  const recorderStillActive =
    Platform.OS !== 'web' &&
    (audioRecorder.isRecording || audioRecorder.getStatus().canRecord);
  if (recorderStillActive) {
    await configureVoicePreviewAudio();
  } else {
    await configurePlaybackAudio();
  }

  const player = createPlaybackPlayer(uri);
  soundRef.current = player;

  setPlaybackPosition(0);
  setMode('playing');

  const startPlayback = () => {
    try {
      player.play();
    } catch (err) {
      console.error('Voice preview play failed:', err);
    }
  };

  if (Platform.OS === 'web') {
    requestAnimationFrame(startPlayback);
  } else {
    startPlayback();
  }

  playbackIntervalRef.current = setInterval(() => {
    const active = soundRef.current;
    if (!active) return;
    setPlaybackPosition(active.currentTime);
  }, 100);

  const endSub = player.addListener('playbackStatusUpdate', (status) => {
    if (status.duration > 0 && status.currentTime >= status.duration - 0.05) {
      void cleanupPlayback();
      setMode('paused');
      setPlaybackPosition(0);
      endSub.remove();
    }
  });
};

const stopPlayback = async () => {
  await cleanupPlayback();
  setMode('paused');
  setPlaybackPosition(0);
};

const cancelRecording = async () => {
  try {
    await cleanupRecording();
    await cleanupPlayback();
    resetRecording();
    setMode('text');
  } catch (error) {
    console.error('Failed to cancel recording', error);
    Alert.alert('Error', 'Failed to cancel recording');
  }
};

const handleSendVoiceMessage = async () => {
  try {
    if (recordedDurationRef.current < 0.5) return;

    await cleanupPlayback();

    if (modeRef.current === 'recording') {
      await pauseRecording();
    }

    const uri = await resolveSendUri();

    if (uri) {
      onSendVoice(uri, recordedDurationRef.current);
    }

    recordingPreviewUriRef.current = null;
    recorderNeedsPrepareRef.current = false;
    recordingSegmentsRef.current = [];
    segmentBaseDurationRef.current = 0;
    await cleanupRecording();
    resetRecording();
    setMode('text');
  } catch (error) {
    console.error('Failed to send voice message', error);
    Alert.alert('Error', 'Failed to send voice message');
  }
};

const resetRecording = () => {
  setRecordingDuration(0);
  setPlaybackPosition(0);
  recordedDurationRef.current = 0;
  recordingPreviewUriRef.current = null;
  recorderNeedsPrepareRef.current = false;
  recordingSegmentsRef.current = [];
  segmentBaseDurationRef.current = 0;
  stopWaveAnimation();
  waveAnimations.forEach(anim => anim.setValue(5));
};

const startWaveAnimation = () => {
  waveIntervalRef.current = setInterval(() => {
    waveAnimations.forEach((anim, index) => {
      const newHeight = 5 + Math.random() * 25;
      Animated.spring(anim, {
        toValue: newHeight,
        tension: 50,
        friction: 7,
        useNativeDriver: false,
      }).start();
    });
  }, 200);
};

const stopWaveAnimation = () => {
  waveAnimations.forEach(anim => {
    Animated.timing(anim, {
      toValue: 5,
      duration: 200,
      useNativeDriver: false,
    }).start();
  });
};

const formatDuration = (seconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

  // WhatsApp-like behavior: grow up to ~6 lines then start scrolling internally
  const MIN_INPUT_HEIGHT = 40;
  const MAX_INPUT_HEIGHT = 140;

  function handleContentSizeChange(e: any) {
    const height = e.nativeEvent.contentSize.height;
    const newHeight = Math.max(MIN_INPUT_HEIGHT, Math.min(MAX_INPUT_HEIGHT, Math.ceil(height) + 8));
    if (newHeight === inputHeight) return;
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setInputHeight(newHeight);
  }

  function handleSend() {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInputText('');
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setInputHeight(MIN_INPUT_HEIGHT);
  }

  function animateSendButton(active: boolean) {
    Animated.spring(sendScale, {
      toValue: active ? 1.06 : 1,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }

  function handleEmojiSelect(emoji: string) {
    const { start, end } = selection;
    const newText = inputText.slice(0, start) + emoji + inputText.slice(end);
    setInputText(newText);
    const newCursorPos = start + emoji.length;
    setSelection({ start: newCursorPos, end: newCursorPos });
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  }

  // ... (All recording functions remain the same)

  const sendButtonEnabled = inputText.trim().length > 0 || selectedAttachments.length > 0;
  const canSendVoice = mode !== 'text' && recordingDuration >= 0.5;

  const renderRecordingUI = () => {
    if (mode === 'text') return null;

    const isRecording = mode === 'recording';
    const isPlaying = mode === 'playing';
    const displayTime = isPlaying ? playbackPosition : recordingDuration;

    return (
      <View style={styles.recordingContainer}>
        <View style={styles.recordingLeft}>
          {isRecording ? (
            <View style={styles.timerContainer}>
              <View style={styles.recordingDot} />
              <Text style={styles.timerText}>{formatDuration(displayTime)}</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.voiceIconBtn}
              onPress={cancelRecording}
              accessibilityLabel="Delete recording"
            >
              <Ionicons name="trash-outline" size={22} color="#e53935" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.recordingCenter}>
          {isRecording ? (
            <View style={styles.waveContainer}>
              {waveAnimations.map((anim, index) => (
                <Animated.View key={index} style={[styles.waveBar, { height: anim }]} />
              ))}
            </View>
          ) : (
            <TouchableOpacity
              style={styles.previewRow}
              onPress={isPlaying ? stopPlayback : playRecording}
              accessibilityLabel={isPlaying ? 'Pause preview' : 'Play preview'}
            >
              <Ionicons
                name={isPlaying ? 'pause-circle' : 'play-circle'}
                size={28}
                color={chatTheme.primary}
              />
              <Text style={styles.previewTime}>{formatDuration(displayTime)}</Text>
              {!isPlaying && (
                <Text style={styles.previewHint}> / {formatDuration(recordingDuration)}</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.recordingRight}>
          {isRecording ? (
            <TouchableOpacity
              style={styles.voiceIconBtn}
              onPress={pauseRecording}
              accessibilityLabel="Pause recording"
            >
              <Ionicons name="pause-circle-outline" size={28} color="#555" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.voiceIconBtn}
              onPress={resumeRecording}
              accessibilityLabel="Continue recording"
            >
              <Ionicons name="mic-circle" size={28} color={chatTheme.primary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              styles.sendButton,
              canSendVoice ? styles.sendButtonActive : styles.sendButtonMuted,
            ]}
            onPress={handleSendVoiceMessage}
            disabled={!canSendVoice}
            accessibilityLabel="Send voice message"
          >
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderTextInputUI = () => {
    const mentionMatch = inputText.match(/@([\w.-]*)$/);
    const mentionQuery = mentionMatch?.[1]?.toLowerCase() ?? '';
    const mentionSuggestions =
      mentionMatch && mentionMembers.length
        ? mentionMembers
            .filter((m) => m.display_name.toLowerCase().includes(mentionQuery))
            .slice(0, 6)
        : [];

    const insertMention = (name: string) => {
      const base = inputText.replace(/@([\w.-]*)$/, `@${name.replace(/\s/g, '')} `);
      setInputText(base);
    };

    return (
      <>
        {mentionSuggestions.length > 0 && (
          <ScrollView horizontal style={styles.mentionBar} keyboardShouldPersistTaps="handled">
            {mentionSuggestions.map((m) => (
              <TouchableOpacity
                key={m.user_id ?? m.display_name}
                style={styles.mentionChip}
                onPress={() => insertMention(m.display_name)}
              >
                <Text style={styles.mentionChipText}>@{m.display_name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        {/* Left icons (emoji / attachment) */}
        <View style={styles.leftIcons}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => {
              setShowEmojiPicker(true);
              inputRef.current?.blur();
            }}
          >
            <Ionicons name="happy-outline" size={22} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => {
              if (onAttachmentPress) {
                onAttachmentPress();
              } else {
                setShowAttachmentMenu(true);
              }
            }}
          >
            <Ionicons name="attach-outline" size={22} />
          </TouchableOpacity>
        </View>
        
        {/* Text Input — WhatsApp-style growable text area */}
        <View
          style={[
            styles.inputWrap,
            inputFocused && styles.inputWrapFocused,
            { height: Math.max(MIN_INPUT_HEIGHT, inputHeight) },
          ]}
        >
          <TextInput
            ref={inputRef}
            value={inputText}
            onChangeText={(t) => {
              setInputText(t);
              animateSendButton(t.trim().length > 0 || selectedAttachments.length > 0);
            }}
            placeholder={placeholder}
            multiline
            scrollEnabled={inputHeight >= MAX_INPUT_HEIGHT}
            onContentSizeChange={handleContentSizeChange}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            style={[styles.textInput, { height: Math.max(MIN_INPUT_HEIGHT - 8, inputHeight - 8) }]}
            underlineColorAndroid="transparent"
            importantForAutofill="no"
            autoComplete="off"
            placeholderTextColor="#8b8b8b"
            maxLength={5000}
            blurOnSubmit={false}
            returnKeyType="default"
            onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
            selection={selection}
            textAlignVertical="top"
            selectionColor={chatTheme.primary}
            cursorColor={chatTheme.primary}
            {...(Platform.OS === 'web'
              ? ({ outlineStyle: 'none', outlineWidth: 0 } as object)
              : {})}
          />
        </View>
        
        {/* Send/Record button */}
        <Animated.View style={{ transform: [{ scale: sendButtonEnabled ? sendScale : 1 }] }}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[
              styles.sendButton,
              sendButtonEnabled ? styles.sendButtonActive : styles.micButton,
            ]}
            onPress={() => {
              if (disabled) return;
              if (sendButtonEnabled) {
                handleSend();
              } else {
                void startRecording();
              }
            }}
            disabled={disabled}
            accessibilityLabel={sendButtonEnabled ? 'Send message' : 'Record voice message'}
          >
            <Ionicons
              name={sendButtonEnabled ? 'send' : 'mic'}
              size={20}
              color="#fff"
            />
          </TouchableOpacity>
        </Animated.View>
      </>
    );
  };

  const renderEmojiPicker = () => {
    return (
      <View style={styles.emojiPickerContainer}>
        <View style={styles.emojiPickerHeader}>
          <Text style={styles.emojiPickerTitle}>Emoji</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setShowEmojiPicker(false)}
          >
            <Ionicons name="close" size={24} color="#000" />
          </TouchableOpacity>
        </View>
        <View style={styles.emojiGrid}>
          {commonEmojis.map((emoji, index) => (
            <TouchableOpacity
              key={index}
              style={styles.emojiButton}
              onPress={() => handleEmojiSelect(emoji)}
            >
              <Text style={styles.emojiText}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.wrapper, style]}>
      <View style={styles.container}>
        {mode === 'text' ? renderTextInputUI() : renderRecordingUI()}
      </View>

      {/* Badge for selected attachments (local or parent-managed) */}
      {(selectedAttachments.length > 0 || pendingAttachmentCount > 0) && (
        <TouchableOpacity
          style={styles.attachmentBadge}
          onPress={() => {
            if (pendingAttachmentCount > 0 && onPendingAttachmentsPress) {
              onPendingAttachmentsPress();
            } else {
              setShowAttachmentPreview(true);
            }
          }}
        >
          <Text style={styles.attachmentBadgeText}>
            {pendingAttachmentCount > 0 ? pendingAttachmentCount : selectedAttachments.length}
          </Text>
        </TouchableOpacity>
      )}

      {/* Custom Emoji Picker Modal */}
      <Modal
        visible={showEmojiPicker}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowEmojiPicker(false)}
      >
        {renderEmojiPicker()}
      </Modal>

      {/* Attachment Menu */}
      {renderAttachmentMenu()}

      {/* Attachment Preview Component */}
      <AttachmentPreview
        attachments={selectedAttachments}
        visible={showAttachmentPreview}
        onClose={() => setShowAttachmentPreview(false)}
        onRemove={removeAttachment}
        onClearAll={clearAllAttachments}
        onSendAll={sendAllAttachments}
        onSendSingle={sendSingleAttachment}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    backgroundColor: chatTheme.inputBarBg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: chatTheme.composerBorder,
  },
  mentionBar: {
    maxHeight: 40,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: chatTheme.composerBorder,
  },
  mentionChip: {
    backgroundColor: 'rgba(0,122,255,0.1)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
  },
  mentionChipText: { color: chatTheme.primary, fontSize: 13, fontWeight: '600' },
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: chatTheme.inputBarBg,
    minHeight: 56,
  },
  leftIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 6,
    paddingBottom: 4,
  },
  iconButton: {
    padding: 6,
    marginRight: 2,
    borderRadius: 20,
  },
  inputWrap: {
    flex: 1,
    backgroundColor: chatTheme.inputFieldBg,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 4,
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: chatTheme.composerBorder,
    marginRight: 6,
    overflow: 'hidden',
  },
  inputWrapFocused: {
    borderWidth: 0,
  },
  textInput: {
    fontSize: 16,
    lineHeight: 22,
    paddingTop: Platform.OS === 'ios' ? 8 : 6,
    paddingBottom: Platform.OS === 'ios' ? 8 : 6,
    paddingHorizontal: 0,
    margin: 0,
    color: '#111',
    textAlignVertical: 'top',
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'none', outlineWidth: 0 } as object)
      : {}),
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  sendButtonActive: {
    backgroundColor: chatTheme.primary,
  },
  sendButtonMuted: {
    backgroundColor: '#b0b0b0',
  },
  micButton: {
    backgroundColor: chatTheme.primary,
  },
  // Recording mode — WhatsApp-style tap to record, pause, preview, send
  recordingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minHeight: 44,
  },
  recordingLeft: {
    alignItems: 'flex-start',
    marginRight: 8,
    minWidth: 52,
  },
  recordingCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
    gap: 4,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#e53935',
    marginRight: 6,
  },
  timerText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    fontVariant: ['tabular-nums'],
  },
  voiceIconBtn: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#eef4ff',
    borderRadius: 22,
  },
  previewTime: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginLeft: 6,
    fontVariant: ['tabular-nums'],
  },
  previewHint: {
    fontSize: 14,
    color: '#888',
    fontVariant: ['tabular-nums'],
  },
  waveContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
  },
  waveBar: {
    width: 3,
    backgroundColor: chatTheme.primary,
    marginHorizontal: 2,
    borderRadius: 1.5,
  },
  // Emoji picker styles
  emojiPickerContainer: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 50,
  },
  emojiPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  emojiPickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  closeButton: {
    padding: 8,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
  },
  emojiButton: {
    width: '12.5%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  emojiText: {
    fontSize: 24,
    textAlign: 'center',
  },
  // Attachment Menu styles (3x2 Grid)
  attachmentMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  attachmentMenuContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 30,
    maxHeight: '60%',
  },
  attachmentMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  attachmentMenuTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  attachmentCloseButton: {
    padding: 8,
  },
  attachmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
  },
  attachmentOption: {
    width: '33.33%', // 3 columns
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  attachmentIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  attachmentOptionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 2,
  },
  attachmentOptionSubtitle: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
  },
  // Attachment Badge
  attachmentBadge: {
    position: 'absolute',
    top: -5,
    right: 50,
    backgroundColor: '#ff4444',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  attachmentBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});

export default ChatInput;