// ChatInput.tsx
import React, { useState, useRef, forwardRef } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
  Animated,
  LayoutAnimation,
  Modal,
  Text,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

type ChatInputProps = {
  onSend?: (text: string) => void;
  onSendVoice?: (voiceUri: string, duration: number) => void;
  onSendAttachment?: (uri: string, mimeType: string | undefined, name: string | null, size?: number) => void;
  placeholder?: string;
  style?: any;
  onAttachmentPress?: () => void;
  onVoiceLongPress?: () => void;
};

type RecordingMode = 'text' | 'recording' | 'paused' | 'playing';

// Simple emoji data to replace the problematic rn-emoji-picker
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

const ChatInput = forwardRef<TextInput, ChatInputProps>(({
  onSend = (text) => console.log('send:', text),
  onSendVoice = (uri, duration) => console.log('voice:', uri, duration),
  onSendAttachment,
  placeholder = 'Send a message...',
  style,
  onAttachmentPress = async () => {
    Alert.alert('Attach File', 'Choose an option', [
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission required', 'Please grant camera permission to take photos.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 1,
          });
          if (!result.canceled && result.assets) {
            const asset = result.assets[0];
            onSendAttachment?.(asset.uri, asset.mimeType, asset.fileName, asset.fileSize);
          }
        },
      },
      {
        text: 'Record Video',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission required', 'Please grant camera permission to record videos.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Videos,
            videoMaxDuration: 60,
            quality: 1,
          });
          if (!result.canceled && result.assets) {
            const asset = result.assets[0];
            onSendAttachment?.(asset.uri, asset.mimeType, asset.fileName, asset.fileSize);
          }
        },
      },
      {
        text: 'Photos from Gallery',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission required', 'Please grant photo library permission to select media.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 1,
            allowsMultipleSelection: true,
          });
          if (!result.canceled && result.assets) {
            result.assets.forEach(asset => {
              onSendAttachment?.(asset.uri, asset.mimeType, asset.fileName, asset.fileSize);
            });
          }
        },
      },
      {
        text: 'Videos from Gallery',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission required', 'Please grant photo library permission to select media.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Videos,
            quality: 1,
            allowsMultipleSelection: true,
          });
          if (!result.canceled && result.assets) {
            result.assets.forEach(asset => {
              onSendAttachment?.(asset.uri, asset.mimeType, asset.fileName, asset.fileSize);
            });
          }
        },
      },
      {
        text: 'Document',
        onPress: async () => {
          const result = await DocumentPicker.getDocumentAsync({
            type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
            multiple: true,
          });
          if (!result.canceled && result.assets) {
            result.assets.forEach(asset => {
              onSendAttachment?.(asset.uri, asset.mimeType, asset.name, asset.size);
            });
          }
        },
      },
      {
        text: 'Audio',
        onPress: async () => {
          const result = await DocumentPicker.getDocumentAsync({
            type: 'audio/*',
            multiple: true,
          });
          if (!result.canceled && result.assets) {
            result.assets.forEach(asset => {
              onSendAttachment?.(asset.uri, asset.mimeType, asset.name, asset.size);
            });
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  },
  onVoiceLongPress = () => {},
}, ref) => {
  const [text, setText] = useState('');
  const [inputHeight, setInputHeight] = useState(40);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [mode, setMode] = useState<RecordingMode>('text');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  
  const inputRef = useRef<TextInput>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const waveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordedDurationRef = useRef(0);
  
  const sendScale = useRef(new Animated.Value(1)).current;
  const recordScale = useRef(new Animated.Value(1)).current;
  const waveAnimations = useRef<Animated.Value[]>([]).current;

  React.useImperativeHandle(ref, () => inputRef.current!);

  // Initialize wave animations
  React.useEffect(() => {
    // Initialize wave animations with 20 bars
    waveAnimations.length = 0;
    for (let i = 0; i < 20; i++) {
      waveAnimations[i] = new Animated.Value(5);
    }

    // Cleanup function
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

      if (recordingRef.current) {
        try {
          const status = await recordingRef.current.getStatusAsync();
          if (status.canRecord) {
            await recordingRef.current.stopAndUnloadAsync();
          }
        } catch (error) {
          console.log('Error stopping recording during cleanup:', error);
        }
        recordingRef.current = null;
      }

      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });
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
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    } catch (error) {
      console.log('Playback cleanup error:', error);
    }
  };

  function handleContentSizeChange(e: any) {
    const height = e.nativeEvent.contentSize.height;
    const newHeight = Math.max(40, Math.min(120, Math.ceil(height)));
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setInputHeight(newHeight);
  }

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setInputHeight(40);
  }

  function animateSendButton(active: boolean) {
    Animated.spring(sendScale, {
      toValue: active ? 1.06 : 1,
      useNativeDriver: true,
    }).start();
  }

  function handleEmojiSelect(emoji: string) {
    const { start, end } = selection;
    const newText = text.slice(0, start) + emoji + text.slice(end);
    setText(newText);
    const newCursorPos = start + emoji.length;
    setSelection({ start: newCursorPos, end: newCursorPos });
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  }

  const startRecording = async () => {
    try {
      // Clean up any existing recording first
      await cleanupRecording();
      await cleanupPlayback();

      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please grant microphone permission to record voice messages.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      await recording.startAsync();
      
      recordingRef.current = recording;
      setMode('recording');
      setRecordingDuration(0);
      recordedDurationRef.current = 0;
      
      // Update timer every 0.1 seconds (100ms) instead of 1 second
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          const newDuration = prev + 0.1;
          recordedDurationRef.current = newDuration;
          return newDuration;
        });
      }, 100);

      startWaveAnimation();
      Animated.spring(recordScale, {
        toValue: 1.2,
        useNativeDriver: true,
      }).start();

    } catch (error) {
      console.error('Failed to start recording', error);
      Alert.alert('Error', 'Failed to start recording. Please try again.');
      // Reset state on error
      await cleanupRecording();
      setMode('text');
    }
  };

  const pauseRecording = async () => {
    try {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
      
      if (waveIntervalRef.current) {
        clearInterval(waveIntervalRef.current);
        waveIntervalRef.current = null;
      }

      if (recordingRef.current) {
        await recordingRef.current.pauseAsync();
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
      if (recordingRef.current) {
        await recordingRef.current.startAsync();
        
        // Resume timer with 0.1 second increments
        recordingIntervalRef.current = setInterval(() => {
          setRecordingDuration(prev => {
            const newDuration = prev + 0.1;
            recordedDurationRef.current = newDuration;
            return newDuration;
          });
        }, 100);

        startWaveAnimation();
        setMode('recording');
      }
    } catch (error) {
      console.error('Failed to resume recording', error);
      Alert.alert('Error', 'Failed to resume recording');
    }
  };

  const playRecording = async () => {
    try {
      if (!recordingRef.current) return;

      // Get the recording URI
      const uri = recordingRef.current.getURI();
      if (!uri) {
        Alert.alert('Error', 'No recording found to play');
        return;
      }

      // Stop any existing playback
      await cleanupPlayback();

      // Create and load sound
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true }
      );
      soundRef.current = sound;

      // Set up playback tracking
      setPlaybackPosition(0);
      setMode('playing');

      // Update playback position every 0.1 seconds
      playbackIntervalRef.current = setInterval(async () => {
        if (soundRef.current) {
          try {
            const status = await soundRef.current.getStatusAsync();
            if (status.isLoaded) {
              setPlaybackPosition(status.positionMillis / 1000); // Convert to seconds
              
              // If playback finished, stop and return to paused mode
              if (status.didJustFinish) {
                await cleanupPlayback();
                setMode('paused');
                setPlaybackPosition(0);
              }
            }
          } catch (error) {
            console.log('Error getting playback status:', error);
          }
        }
      }, 100);

      // Set up playback completion listener
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish) {
          cleanupPlayback();
          setMode('paused');
          setPlaybackPosition(0);
        }
      });

    } catch (error) {
      console.error('Failed to play recording', error);
      Alert.alert('Error', 'Failed to play recording');
      setMode('paused');
    }
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
      Animated.spring(recordScale, {
        toValue: 1,
        useNativeDriver: true,
      }).start();

    } catch (error) {
      console.error('Failed to cancel recording', error);
      Alert.alert('Error', 'Failed to cancel recording');
    }
  };

  const handleSendVoiceMessage = async () => {
    try {
      if (recordingRef.current && recordedDurationRef.current > 0) {
        let uri;
        
        if (mode === 'paused' || mode === 'playing') {
          // For paused/playing recordings, we need to properly stop and unload
          await cleanupPlayback();
          uri = recordingRef.current.getURI();
        } else {
          // For active recordings, get URI first then stop
          uri = recordingRef.current.getURI();
          await recordingRef.current.stopAndUnloadAsync();
        }
        
        if (uri) {
          onSendVoice(uri, recordedDurationRef.current);
        }
      }
      
      await cleanupRecording();
      await cleanupPlayback();
      resetRecording();
      setMode('text');
      Animated.spring(recordScale, {
        toValue: 1,
        useNativeDriver: true,
      }).start();

    } catch (error) {
      console.error('Failed to send voice message', error);
      Alert.alert('Error', 'Failed to send voice message');
    }
  };

  const resetRecording = () => {
    setRecordingDuration(0);
    setPlaybackPosition(0);
    recordedDurationRef.current = 0;
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
    const totalSeconds = Math.floor(seconds);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const tenths = Math.floor((seconds - totalSeconds) * 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${tenths}`;
  };

  const sendButtonEnabled = text.trim().length > 0;
  const canSendVoice = mode !== 'text' && recordedDurationRef.current > 0;

  const renderRecordingUI = () => {
    if (mode === 'text') return null;

    // Determine which time to display
    const displayTime = mode === 'playing' ? playbackPosition : recordingDuration;
    const isPlaying = mode === 'playing';

    return (
      <View style={styles.recordingContainer}>
        {/* Left Section */}
        <View style={styles.recordingLeft}>
          {mode === 'recording' ? (
            <View style={styles.timerContainer}>
              <Ionicons name="recording" size={16} color="#ff4444" />
              <Text style={styles.timerText}>
                {formatDuration(displayTime)}
              </Text>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.deleteButton}
              onPress={cancelRecording}
            >
              <Ionicons name="trash-outline" size={22} color="#ff4444" />
            </TouchableOpacity>
          )}
        </View>

        {/* Center Section */}
        <View style={styles.recordingCenter}>
          {mode === 'recording' ? (
            <>
              <TouchableOpacity 
                style={styles.cancelButton}
                onPress={cancelRecording}
              >
                <Ionicons name="close" size={20} color="#666" />
              </TouchableOpacity>
              <View style={styles.waveContainer}>
                {waveAnimations.map((anim, index) => (
                  <Animated.View
                    key={index}
                    style={[
                      styles.waveBar,
                      { height: anim }
                    ]}
                  />
                ))}
              </View>
            </>
          ) : (
            <TouchableOpacity 
              style={styles.playButton}
              onPress={isPlaying ? stopPlayback : playRecording}
            >
              <Ionicons 
                name={isPlaying ? "pause" : "play"} 
                size={24} 
                color="#0b62ff" 
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Right Section */}
        <View style={styles.recordingRight}>
          {mode === 'recording' ? (
            <TouchableOpacity 
              style={styles.pauseButton}
              onPress={pauseRecording}
            >
              <Ionicons name="pause" size={24} color="#666" />
            </TouchableOpacity>
          ) : mode === 'paused' ? (
            <TouchableOpacity 
              style={styles.resumeButton}
              onPress={resumeRecording}
            >
              <Ionicons name="mic" size={24} color="#0b62ff" />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[
              styles.sendButton,
              canSendVoice ? styles.sendButtonActive : styles.sendButtonDisabled,
            ]}
            onPress={handleSendVoiceMessage}
            disabled={!canSendVoice}
          >
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderTextInputUI = () => {
    return (
      <>
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
          <TouchableOpacity style={styles.iconButton} onPress={onAttachmentPress}>
            <Ionicons name="attach-outline" size={22} />
          </TouchableOpacity>
        </View>
        
        {/* Text Input */}
        <View style={[styles.inputWrap, { height: Math.max(40, inputHeight) }]}>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={(t) => {
              setText(t);
              animateSendButton(t.trim().length > 0);
            }}
            placeholder={placeholder}
            multiline
            onContentSizeChange={handleContentSizeChange}
            style={[styles.textInput, { height: Math.max(36, inputHeight - 6) }]}
            underlineColorAndroid="transparent"
            placeholderTextColor="#8b8b8b"
            maxLength={2000}
            returnKeyType={sendButtonEnabled ? "send" : "default"}
            onSubmitEditing={handleSend}
            onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
            selection={selection}
          />
        </View>
        
        {/* Send/Record button */}
        <Animated.View style={{ transform: [{ scale: sendButtonEnabled ? sendScale : recordScale }] }}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[
              styles.sendButton,
              sendButtonEnabled ? styles.sendButtonActive : styles.sendButtonDisabled,
            ]}
            onPress={sendButtonEnabled ? handleSend : undefined}
            onLongPress={startRecording}
            disabled={!sendButtonEnabled && mode !== 'text'}
          >
            <Ionicons 
              name={sendButtonEnabled ? 'send' : 'mic-outline'} 
              size={20} 
              color="#fff" 
            />
          </TouchableOpacity>
        </Animated.View>
      </>
    );
  };

  // Simple emoji picker component
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
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      keyboardVerticalOffset={Platform.select({ ios: 10, android: 0 })}
      style={[styles.wrapper, style]}
    >
      <View style={styles.container}>
        {mode === 'text' ? renderTextInputUI() : renderRecordingUI()}
      </View>

      {/* Custom Emoji Picker Modal */}
      <Modal
        visible={showEmojiPicker}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowEmojiPicker(false)}
      >
        {renderEmojiPicker()}
      </Modal>
    </KeyboardAvoidingView>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    backgroundColor: 'transparent',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'transparent',
    minHeight: 60,
  },
  leftIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  iconButton: {
    padding: 6,
    marginRight: 4,
    borderRadius: 20,
  },
  inputWrap: {
    flex: 1,
    backgroundColor: '#f2f2f2',
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 6,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  textInput: {
    fontSize: 16,
    lineHeight: 20,
    padding: 0,
    margin: 0,
    color: '#111',
    textAlignVertical: 'top',
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
    backgroundColor: '#0b62ff',
  },
  sendButtonDisabled: {
    backgroundColor: '#7a7a7a',
  },
  // Recording mode styles
  recordingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  recordingLeft: {
    alignItems: 'flex-start',
    marginRight: 12,
    minWidth: 60,
  },
  recordingCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginLeft: 4,
  },
  deleteButton: {
    padding: 8,
  },
  cancelButton: {
    padding: 8,
    marginRight: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 16,
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
    backgroundColor: '#0b62ff',
    marginHorizontal: 2,
    borderRadius: 1.5,
  },
  playButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    backgroundColor: '#f0f0f0',
    borderRadius: 22,
  },
  pauseButton: {
    padding: 8,
    marginRight: 8,
  },
  resumeButton: {
    padding: 8,
    marginRight: 8,
  },
  // Custom emoji picker styles
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
    width: '12.5%', // 8 per row
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  emojiText: {
    fontSize: 24,
    textAlign: 'center',
  },
});

export default ChatInput;