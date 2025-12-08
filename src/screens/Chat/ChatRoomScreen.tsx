// src/screens/Chat/ChatRoomScreen.tsx
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  TouchableWithoutFeedback,
  StatusBar,
  SectionList,
} from 'react-native';
import { IconButton } from 'react-native-paper';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialIcons, Feather } from '@expo/vector-icons';
import ChatMenuDropdown, { MenuItem } from '../../components/ChatMenuDropdown';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ChatInput from './ChatInput';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { messageStorage } from '../../utils/messageStorage';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio } from 'expo-av';
import { RefreshControl } from 'react-native';
import { Keyboard } from 'react-native';

type Message = {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  receiver_id?: string;
  group_id?: string;
  message_type?: 'text' | 'audio' | 'image' | 'video' | 'file';
  audio_url?: string;
  audio_duration?: number;
  file_url?: string;
  local_file_uri?: string;
  video_url?: string;
  file_name?: string;
  file_type?: string;
  is_read?: boolean;
  delivered?: boolean;
  profiles?: { 
    display_name: string; 
    avatar_url: string; 
    user_id?: string;
  };
  _status?: 'sending' | 'sent' | 'pending' | 'failed';
  local_audio_uri?: string;
};

type RouteParams = {
  chatId: string;
  chatType: 'individual' | 'group';
  chatName: string;
  avatarUrl?: string;
};

type SectionData = {
  title: string;
  date: Date;
  data: Message[];
};

const MessageStatus = ({ status, isRead, delivered }: { 
  status?: string; 
  isRead?: boolean; 
  delivered?: boolean 
}) => {
  if (status === 'sending') {
    return <ActivityIndicator size={12} color="#999" />;
  } else if (status === 'pending' || status === 'failed') {
    return <Ionicons name="time-outline" size={16} color="#FFA500" />;
  } else if (isRead) {
    return <Ionicons name="checkmark-done" size={16} color="#34B7F1" />;
  } else if (delivered) {
    return <Ionicons name="checkmark-done" size={16} color="#999" />;
  } else {
    return <Ionicons name="checkmark" size={16} color="#999" />;
  }
};

// Generate unique ID for temporary messages
const generateTempId = () => `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Format date for section headers
const formatSectionDate = (date: Date): string => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const messageDate = new Date(date);
  
  if (messageDate.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (messageDate.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else if (messageDate.getFullYear() === today.getFullYear()) {
    return messageDate.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric' 
    });
  } else {
    return messageDate.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric',
      month: 'long', 
      day: 'numeric' 
    });
  }
};

// Group messages by date for SectionList
const groupMessagesByDate = (messages: Message[]): SectionData[] => {
  const sections: SectionData[] = [];
  let currentSection: SectionData | null = null;
  
  // Sort messages by date
  const sortedMessages = [...messages].sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  
  sortedMessages.forEach(message => {
    const messageDate = new Date(message.created_at);
    const sectionDate = new Date(
      messageDate.getFullYear(),
      messageDate.getMonth(),
      messageDate.getDate()
    );
    
    // Check if we need a new section
    if (!currentSection || currentSection.date.getTime() !== sectionDate.getTime()) {
      currentSection = {
        title: formatSectionDate(sectionDate),
        date: sectionDate,
        data: []
      };
      sections.push(currentSection);
    }
    
    // Add message to current section
    currentSection.data.push(message);
  });
  
  return sections;
};

// Helper to check if URI is a local file
const isLocalFile = (uri: string): boolean => {
  return uri && (
    uri.startsWith('file://') || 
    uri.startsWith('content://') || 
    uri.startsWith('/') ||
    uri.includes('ExponentAudio')
  );
};

export default function ChatRoomScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { chatId, chatType, chatName, avatarUrl } = route.params as RouteParams;
  const isOnline = useNetworkStatus();

  const insets = useSafeAreaInsets();
  
  // FIXED: Use safe area insets for proper keyboard handling
  const keyboardVerticalOffset = Platform.OS === 'ios' ? insets.top : 0;

  const [messages, setMessages] = useState<Message[]>([]);
  const [sections, setSections] = useState<SectionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isPlayingAudio, setIsPlayingAudio] = useState<string | null>(null);
  const [sound, setSound] = useState<any>(null);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [lastFetchedId, setLastFetchedId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [hasAudioPermission, setHasAudioPermission] = useState<boolean>(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const flatListRef = useRef<any>(null);
  const pendingRetryRef = useRef<boolean>(false);
  const syncInProgressRef = useRef<boolean>(false);
  const shouldScrollToBottomRef = useRef<boolean>(true);
  const contentHeightRef = useRef<number>(0);
  const scrollViewHeightRef = useRef<number>(0);
  const lastContentOffsetRef = useRef<number>(0);
  const [refreshing, setRefreshing] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  /* ------------------------------------------------------------------ */
  /*  SCROLL MANAGEMENT                                                 */
  /* ------------------------------------------------------------------ */
  const scrollToBottom = useCallback(() => {
    if (flatListRef.current && sections.length > 0) {
      try {
        const lastSectionIndex = sections.length - 1;
        const lastItemIndex = sections[lastSectionIndex]?.data?.length - 1 || 0;
        
        flatListRef.current.scrollToLocation({
          sectionIndex: lastSectionIndex,
          itemIndex: lastItemIndex,
          animated: true,
          viewPosition: 0,
        });
      } catch (error) {
        console.log('Scroll error, trying alternative:', error);
        setTimeout(() => {
          if (flatListRef.current) {
            const lastSectionIndex = sections.length - 1;
            const lastItemIndex = sections[lastSectionIndex]?.data?.length - 1 || 0;
            
            flatListRef.current.scrollToLocation({
              sectionIndex: lastSectionIndex,
              itemIndex: lastItemIndex,
              animated: false,
              viewPosition: 0,
            });
          }
        }, 100);
      }
    }
  }, [sections]);

  const handleScroll = useCallback((event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const contentHeight = event.nativeEvent.contentSize.height;
    const scrollViewHeight = event.nativeEvent.layoutMeasurement.height;
    
    lastContentOffsetRef.current = offsetY;
    contentHeightRef.current = contentHeight;
    scrollViewHeightRef.current = scrollViewHeight;
    
    const distanceFromBottom = contentHeight - offsetY - scrollViewHeight;
    shouldScrollToBottomRef.current = distanceFromBottom < 100;
    
    const velocity = event.nativeEvent.velocity?.y;
    if (velocity && velocity < 0) {
      shouldScrollToBottomRef.current = false;
    }
  }, []);

  useEffect(() => {
  const keyboardDidShowListener = Keyboard.addListener(
    'keyboardDidShow',
    () => {
      setIsKeyboardVisible(true);
    }
  );
  const keyboardDidHideListener = Keyboard.addListener(
    'keyboardDidHide',
    () => {
      setIsKeyboardVisible(false);
    }
  );

  return () => {
    keyboardDidShowListener.remove();
    keyboardDidHideListener.remove();
  };
}, []);

  useEffect(() => {
    if (messages.length > 0 && !loading && !loadingMore && initialLoadComplete) {
      if (!loadingMore) {
        const timer = setTimeout(() => {
          if (shouldScrollToBottomRef.current || !loadingMore) {
            scrollToBottom();
          }
        }, 300);
        
        return () => clearTimeout(timer);
      }
    }
  }, [messages, loading, loadingMore, initialLoadComplete, scrollToBottom]);

  /* ------------------------------------------------------------------ */
  /*  AUDIO PERMISSION & SETUP                                          */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    const setupAudioPermissions = async () => {
      try {
        if (Platform.OS === 'web') {
          setHasAudioPermission(true);
          return;
        }

        const { status } = await Audio.requestPermissionsAsync();
        
        if (status === 'granted') {
          setHasAudioPermission(true);
          
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
          });
        } else {
          console.log('Audio permission not granted');
          setHasAudioPermission(false);
        }
      } catch (error) {
        console.error('Failed to setup audio permissions:', error);
        setHasAudioPermission(false);
      }
    };

    setupAudioPermissions();
  }, []);

  /* ------------------------------------------------------------------ */
  /*  MESSAGE MANAGEMENT FUNCTIONS                                      */
  /* ------------------------------------------------------------------ */
  const deduplicateMessages = useCallback((messages: Message[]): Message[] => {
    const seen = new Set();
    return messages.filter(message => {
      if (seen.has(message.id)) {
        return false;
      }
      seen.add(message.id);
      return true;
    }).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, []);

  const syncWithServer = async (localMessages: Message[], loadMore: boolean = false) => {
    if (!isOnline || syncInProgressRef.current || !user?.id) return;

    try {
      syncInProgressRef.current = true;
      if (loadMore) {
        setLoadingMore(true);
      } else {
        setSyncing(true);
      }

      let query = supabase
        .from('messages')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(50);

      if (loadMore && messages.length > 0) {
        const sorted = [...messages].sort((a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        const oldest = sorted[0];
        if (oldest) {
          query = query.lt('created_at', oldest.created_at);
        }
      }

      if (chatType === 'individual') {
        query = query.or(
          `and(receiver_id.eq.${chatId},sender_id.eq.${user.id}),` +
          `and(receiver_id.eq.${user.id},sender_id.eq.${chatId})`
        );
      } else {
        query = query.eq('group_id', chatId);
      }

      const { data: messagesData, error } = await query;

      if (error) throw error;

      if (messagesData && messagesData.length > 0) {
        const senderIds = [...new Set(messagesData.map(m => m.sender_id))];

        let profilesData: any = {};
        if (senderIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('user_id, display_name, avatar_url')
            .in('user_id', senderIds);

          if (profiles) {
            profilesData = profiles.reduce((acc, p) => {
              if (p.user_id) acc[p.user_id] = p;
              return acc;
            }, {} as any);
          }
        }

        const messagesWithProfiles = messagesData.map(serverMsg => {
          const localMatch = localMessages.find(localMsg => {
            if (localMsg.id === serverMsg.id) return true;
            if (
              localMsg.file_name === serverMsg.file_name &&
              localMsg.file_type === serverMsg.file_type &&
              localMsg.message_type === serverMsg.message_type &&
              Math.abs(new Date(localMsg.created_at).getTime() - new Date(serverMsg.created_at).getTime()) < 5000
            ) return true;
            return false;
          });

          return {
            ...serverMsg,
            profiles: profilesData[serverMsg.sender_id] || {
              display_name: serverMsg.sender_id === user.id ? 'You' : 'Unknown User',
              avatar_url: null,
              user_id: serverMsg.sender_id
            },
            _status: 'sent' as const,
            local_file_uri: localMatch?.local_file_uri || serverMsg.local_file_uri,
            file_url: serverMsg.file_url || localMatch?.file_url,
            local_audio_uri: localMatch?.local_audio_uri || serverMsg.local_audio_uri
          };
        });

        const serverMessages = messagesWithProfiles.reverse();

        let finalMessages: Message[];

        if (loadMore) {
          finalMessages = deduplicateMessages([...serverMessages, ...localMessages]);
        } else {
          const localPending = localMessages.filter(m =>
            m.id.startsWith('temp-') &&
            ['pending', 'failed', 'sending'].includes(m._status || '')
          );

          const serverIds = new Set(serverMessages.map(m => m.id));
          const uniquePending = localPending.filter(m => !serverIds.has(m.id));

          finalMessages = deduplicateMessages([...serverMessages, ...uniquePending]);
        }

        setMessages(finalMessages);
        setSections(groupMessagesByDate(finalMessages));
        setHasMore(messagesData.length === 50);

        await messageStorage.saveMessages(chatId, finalMessages);

        if (!loadMore && chatType === 'individual') {
          markMessagesAsRead();
        }
      }
      else if (messagesData && messagesData.length === 0 && !loadMore) {
        await messageStorage.clearMessages(chatId);
        setMessages([]);
        setSections([]);
        setHasMore(false);
      }
      else {
        setHasMore(false);
        if (!loadMore) {
          const deduped = deduplicateMessages(localMessages);
          setMessages(deduped);
          setSections(groupMessagesByDate(deduped));
        }
      }
    } catch (err: any) {
      console.error('Sync error:', err);
      if (!loadMore && !initialLoadComplete) {
        const deduped = deduplicateMessages(localMessages);
        setMessages(deduped);
        setSections(groupMessagesByDate(deduped));
      }
    } finally {
      if (loadMore) setLoadingMore(false);
      else {
        setLoading(false);
        setSyncing(false);
      }
      syncInProgressRef.current = false;
      if (!loadMore) setInitialLoadComplete(true);
    }
  };

  const fetchMessages = useCallback(async (loadMore: boolean = false) => {
    if (!user?.id || !chatId) {
      setLoading(false);
      setInitialLoadComplete(true);
      return;
    }

    if (loadMore) {
      setLoadingMore(true);
    } else if (!initialLoadComplete) {
      setLoading(true);
    }

    try {
      const localMessages = await messageStorage.getMessages(chatId);
      const dedupedLocalMessages = deduplicateMessages(localMessages);
      
      if (!loadMore && dedupedLocalMessages.length > 0) {
        setMessages(dedupedLocalMessages);
        setSections(groupMessagesByDate(dedupedLocalMessages));
        setLoading(false);
      }

      if (isOnline) {
        await syncWithServer(dedupedLocalMessages, loadMore);
      } else {
        if (!loadMore) {
          if (dedupedLocalMessages.length === 0) {
            setMessages([]);
            setSections([]);
          }
          setLoading(false);
          setInitialLoadComplete(true);
        }
        setLoadingMore(false);
      }
    } catch (error) {
      console.error('Fetch messages error:', error);
      if (!loadMore) {
        setLoading(false);
        setInitialLoadComplete(true);
      }
      setLoadingMore(false);
    }
  }, [user?.id, chatId, isOnline, initialLoadComplete]);

  const markMessagesAsRead = useCallback(async () => {
    if (!user?.id || chatType !== 'individual') return;

    try {
      const { error } = await supabase
        .from('messages')
        .update({ 
          is_read: true,
          read_at: new Date().toISOString()
        })
        .eq('receiver_id', user.id)
        .eq('sender_id', chatId)
        .is('is_read', false);

      if (!error) {
        setMessages(prev => prev.map(msg => 
          msg.sender_id === chatId && msg.receiver_id === user.id 
            ? { ...msg, is_read: true }
            : msg
        ));
        setSections(prev => prev.map(section => ({
          ...section,
          data: section.data.map(msg => 
            msg.sender_id === chatId && msg.receiver_id === user.id 
              ? { ...msg, is_read: true }
              : msg
          )
        })));
      }
    } catch (error) {
      console.error('Mark as read error:', error);
    }
  }, [user?.id, chatId, chatType]);

  const markSingleMessageAsRead = useCallback(async (messageId: string) => {
    if (!user?.id) return;
    
    try {
      await supabase
        .from('messages')
        .update({ 
          is_read: true,
          read_at: new Date().toISOString()
        })
        .eq('id', messageId)
        .eq('receiver_id', user.id)
        .eq('is_read', false);
    } catch (error) {
      console.error('Mark single as read error:', error);
    }
  }, [user?.id]);

  const retryPendingMessages = useCallback(async () => {
    if (!isOnline || pendingRetryRef.current) return;

    try {
      pendingRetryRef.current = true;
      
      const pendingMessages = messages.filter(msg => 
        msg._status === 'pending' || msg._status === 'failed'
      );

      const batchSize = 3;
      for (let i = 0; i < pendingMessages.length; i += batchSize) {
        const batch = pendingMessages.slice(i, i + batchSize);
        await Promise.allSettled(
          batch.map(msg => sendMessageToServer(msg))
        );
        
        if (i + batchSize < pendingMessages.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } catch (error) {
      console.error('Retry pending messages error:', error);
    } finally {
      pendingRetryRef.current = false;
    }
  }, [messages, isOnline]);

  const sendMessageToServer = async (message: Message) => {
    try {
      const messageData: any = {
        sender_id: user?.id,
        content: message.content,
        message_type: message.message_type || 'text',
      };

      if (chatType === 'individual') {
        messageData.receiver_id = chatId;
      } else {
        messageData.group_id = chatId;
      }

      if (message.message_type === 'audio') {
        messageData.audio_url = message.audio_url;
        messageData.audio_duration = message.audio_duration;
        messageData.file_name = message.file_name;
        messageData.file_type = message.file_type;
      }

      if (message.message_type === 'image' || message.message_type === 'file') {
        // Use clean URL without cache buster
        const cleanFileUrl = message.file_url ? message.file_url.split('?')[0] : message.file_url;
        messageData.file_url = cleanFileUrl;
        messageData.file_name = message.file_name;
        messageData.file_type = message.file_type;
      }

      const { data, error } = await supabase
        .from('messages')
        .insert(messageData)
        .select()
        .single();

      if (error) throw error;

      setMessages(prevMessages => {
        const updated = prevMessages.map(msg => 
          msg.id === message.id 
            ? { 
                ...data, 
                profiles: message.profiles, 
                _status: 'sent' as const,
                local_file_uri: msg.local_file_uri,
                ...(message.message_type === 'audio' && { local_audio_uri: message.local_audio_uri })
              }
            : msg
        );
        const deduped = deduplicateMessages(updated);
        setSections(groupMessagesByDate(deduped));
        return deduped;
      });

      const updatedMessages = messages.map(msg => 
        msg.id === message.id 
          ? { 
              ...data, 
              profiles: message.profiles, 
              _status: 'sent' as const,
              ...(message.message_type === 'audio' && { local_audio_uri: message.local_audio_uri })
            }
          : msg
      );
      await messageStorage.saveMessages(chatId, deduplicateMessages(updatedMessages));

      shouldScrollToBottomRef.current = true;
      setTimeout(() => {
        scrollToBottom();
      }, 50);

      return true;
    } catch (error) {
      console.error('Send message to server error:', error);
      
      setMessages(prevMessages => {
        const updated = prevMessages.map(msg => 
          msg.id === message.id 
            ? { ...msg, _status: 'failed' as const }
            : msg
        );
        setSections(groupMessagesByDate(updated));
        return updated;
      });

      const failedMessages = messages.map(msg => 
        msg.id === message.id 
          ? { ...msg, _status: 'failed' as const }
          : msg
      );
      await messageStorage.saveMessages(chatId, deduplicateMessages(failedMessages));
      
      return false;
    }
  };

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || !user?.id) return;

    const messageContent = messageText.trim();
    const tempId = generateTempId();

    const optimisticMessage: Message = {
      id: tempId,
      content: messageContent,
      created_at: new Date().toISOString(),
      sender_id: user.id,
      message_type: 'text',
      delivered: false,
      is_read: false,
      profiles: {
        display_name: 'You',
        avatar_url: null,
        user_id: user.id
      },
      _status: 'sending' as const
    };

    setMessages(prevMessages => {
      const newMessages = [...prevMessages, optimisticMessage];
      const deduped = deduplicateMessages(newMessages);
      setSections(groupMessagesByDate(deduped));
      return deduped;
    });

    const updatedMessages = [...messages, optimisticMessage];
    const dedupedUpdated = deduplicateMessages(updatedMessages);
    await messageStorage.saveMessages(chatId, dedupedUpdated);

    shouldScrollToBottomRef.current = true;
    setTimeout(() => {
      scrollToBottom();
    }, 50);

    if (isOnline) {
      const success = await sendMessageToServer(optimisticMessage);
      if (!success) {
        Alert.alert('Error', 'Failed to send message');
      }
    } else {
      setMessages(prevMessages => {
        const updated = prevMessages.map(msg => 
          msg.id === tempId 
            ? { ...msg, _status: 'pending' as const }
            : msg
        );
        setSections(groupMessagesByDate(updated));
        return updated;
      });

      const pendingUpdated = dedupedUpdated.map(msg => 
        msg.id === tempId 
          ? { ...msg, _status: 'pending' as const }
          : msg
      );
      await messageStorage.saveMessages(chatId, pendingUpdated);
    }
  };

  const sendVoiceMessage = async (audioUri: string, duration: number) => {
    if (!user?.id) return;

    const tempId = generateTempId();
    const fileName = `voice_message_${Date.now()}.m4a`;

    const optimisticMessage: Message = {
      id: tempId,
      content: 'Voice message',
      created_at: new Date().toISOString(),
      sender_id: user.id,
      message_type: 'audio',
      audio_url: audioUri,
      audio_duration: Math.round(duration),
      file_name: fileName,
      file_type: 'audio/m4a',
      local_audio_uri: audioUri,
      delivered: false,
      is_read: false,
      profiles: {
        display_name: 'You',
        avatar_url: null,
        user_id: user.id
      },
      _status: 'sending' as const
    };

    setMessages(prevMessages => {
      const newMessages = [...prevMessages, optimisticMessage];
      const deduped = deduplicateMessages(newMessages);
      setSections(groupMessagesByDate(deduped));
      return deduped;
    });
    
    const updatedMessages = [...messages, optimisticMessage];
    const dedupedUpdated = deduplicateMessages(updatedMessages);
    await messageStorage.saveMessages(chatId, dedupedUpdated);

    shouldScrollToBottomRef.current = true;
    setTimeout(() => {
      scrollToBottom();
    }, 50);

    if (!isOnline) {
      setMessages(prevMessages => {
        const updated = prevMessages.map(msg => 
          msg.id === tempId 
            ? { ...msg, _status: 'pending' as const }
            : msg
        );
        setSections(groupMessagesByDate(updated));
        return updated;
      });

      const pendingUpdated = dedupedUpdated.map(msg => 
        msg.id === tempId 
          ? { ...msg, _status: 'pending' as const }
          : msg
      );
      await messageStorage.saveMessages(chatId, pendingUpdated);
      return;
    }

    await uploadAndSendVoiceMessage(optimisticMessage, audioUri, Math.round(duration));
  };

  const uploadAndSendVoiceMessage = async (message: Message, audioUri: string, duration: number) => {
    try {
      const fileInfo = await FileSystem.getInfoAsync(audioUri);
      if (!fileInfo.exists) {
        throw new Error('Audio file not found');
      }

      const fileName = `${user?.id}/audio/${Date.now()}_voice_message.m4a`;

      let uploadSuccess = false;
      let uploadError = null;

      try {
        const fileContent = await FileSystem.readAsStringAsync(audioUri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const byteCharacters = atob(fileContent);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);

        const { error } = await supabase.storage
          .from('chat-files')
          .upload(fileName, byteArray, {
            contentType: 'audio/m4a',
            upsert: false,
          });

        if (!error) {
          uploadSuccess = true;
        } else {
          uploadError = error;
        }
      } catch (base64Error) {
        console.error('Base64 upload failed:', base64Error);
        uploadError = base64Error;
      }

      if (!uploadSuccess) {
        try {
          const binaryContent = await FileSystem.readAsStringAsync(audioUri, {
            encoding: FileSystem.EncodingType.UTF8,
          });

          const { error } = await supabase.storage
            .from('chat-files')
            .upload(fileName, binaryContent, {
              contentType: 'audio/m4a',
              upsert: false,
            });

          if (!error) {
            uploadSuccess = true;
          } else {
            uploadError = error;
          }
        } catch (binaryError) {
          console.error('Binary upload failed:', binaryError);
          uploadError = binaryError;
        }
      }

      if (!uploadSuccess) {
        try {
          const fileSize = fileInfo.size || 0;
          
          if (fileSize > 0) {
            const { error } = await supabase.storage
              .from('chat-files')
              .upload(fileName, audioUri, {
                contentType: 'audio/m4a',
                upsert: false,
              });

            if (!error) {
              uploadSuccess = true;
            } else {
              uploadError = error;
            }
          }
        } catch (chunkError) {
          console.error('Chunk upload failed:', chunkError);
          uploadError = chunkError;
        }
      }

      if (!uploadSuccess) {
        throw uploadError || new Error('Failed to upload audio file');
      }

      const { data: urlData } = supabase.storage
        .from('chat-files')
        .getPublicUrl(fileName);

      const messageData: any = {
        sender_id: user?.id,
        content: 'Voice message',
        message_type: 'audio',
        audio_url: urlData.publicUrl,
        audio_duration: duration,
        file_name: `voice_message_${Date.now()}.m4a`,
        file_type: 'audio/m4a',
      };

      if (chatType === 'individual') {
        messageData.receiver_id = chatId;
      } else {
        messageData.group_id = chatId;
      }

      const { data: insertedData, error: insertError } = await supabase
        .from('messages')
        .insert(messageData)
        .select()
        .single();

      if (insertError) throw insertError;

      setMessages(prevMessages => {
        const updated = prevMessages.map(msg => 
          msg.id === message.id 
            ? { 
                ...insertedData, 
                profiles: message.profiles, 
                _status: 'sent' as const,
                local_audio_uri: message.local_audio_uri
              }
            : msg
        );
        const deduped = deduplicateMessages(updated);
        setSections(groupMessagesByDate(deduped));
        return deduped;
      });

      const updatedMessages = messages.map(msg => 
        msg.id === message.id 
          ? { 
              ...insertedData, 
              profiles: message.profiles, 
              _status: 'sent' as const,
              local_audio_uri: message.local_audio_uri
            }
          : msg
      );
      await messageStorage.saveMessages(chatId, deduplicateMessages(updatedMessages));

      shouldScrollToBottomRef.current = true;
      setTimeout(() => {
        scrollToBottom();
      }, 50);

    } catch (error) {
      console.error('Failed to send voice message:', error);
      
      setMessages(prevMessages => {
        const updated = prevMessages.map(msg => 
          msg.id === message.id 
            ? { ...msg, _status: 'failed' as const }
            : msg
        );
        setSections(groupMessagesByDate(updated));
        return updated;
      });

      const failedMessages = messages.map(msg => 
        msg.id === message.id 
          ? { ...msg, _status: 'failed' as const }
          : msg
      );
      await messageStorage.saveMessages(chatId, deduplicateMessages(failedMessages));
      
      Alert.alert('Error', 'Failed to send voice message');
    }
  };

  /* ------------------------------------------------------------------ */
  /*  FILE UPLOAD FUNCTIONS - FIXED                                     */
  /* ------------------------------------------------------------------ */
 const uploadFile = async (uri: string, name: string, type: string, messageType: 'image' | 'video' | 'file') => {
  if (!user?.id) return;

  const tempId = generateTempId();

  const optimisticMessage: Message = {
    id: tempId,
    content: name,
    created_at: new Date().toISOString(),
    sender_id: user.id,
    message_type: messageType,
    file_url: uri,
    local_file_uri: uri,
    file_name: name,
    file_type: type,
    delivered: false,
    is_read: false,
    profiles: {
      display_name: 'You',
      avatar_url: null,
      user_id: user.id
    },
    _status: 'sending' as const
  };

  setMessages(prev => {
    const newMessages = [...prev, optimisticMessage];
    const deduped = deduplicateMessages(newMessages);
    setSections(groupMessagesByDate(deduped));
    return deduped;
  });

  const updatedForStorage = [...messages, optimisticMessage];
  const dedupedUpdated = deduplicateMessages(updatedForStorage);
  await messageStorage.saveMessages(chatId, dedupedUpdated);

  shouldScrollToBottomRef.current = true;
  setTimeout(scrollToBottom, 50);

  if (!isOnline) {
    setMessages(prev => prev.map(m =>
      m.id === tempId ? { ...m, _status: 'pending' as const } : m
    ));
    await messageStorage.saveMessages(chatId, messages);
    return;
  }

  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) throw new Error('File not found');

    // FIX: Ensure proper file extension
    const fileExt = name.split('.').pop()?.toLowerCase() || 
                   (type.includes('jpeg') ? 'jpg' : 
                    type.includes('png') ? 'png' : 
                    type.includes('gif') ? 'gif' : 'jpg');
    
    // FIX: Use clean filename without special characters
    const cleanFileName = name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${user.id}/files/${Date.now()}_${cleanFileName}`;

    console.log('Uploading file:', { uri, name, type, fileExt, fileName });

    // FIX: Use different upload method based on platform
    let uploadResult: any = null;
    
    // Method 1: Try using blob approach
    try {
      // Create blob from URI
      const blob = await new Promise<Blob>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = function() {
          resolve(xhr.response);
        };
        xhr.onerror = function() {
          reject(new Error('Failed to load file'));
        };
        xhr.responseType = 'blob';
        xhr.open('GET', uri, true);
        xhr.send(null);
      });

      // Upload to Supabase storage using blob
      const { error: uploadError, data } = await supabase.storage
        .from('chat-files')
        .upload(fileName, blob, {
          contentType: type,
          upsert: false,
          cacheControl: '3600',
        });

      if (uploadError) {
        console.log('Blob upload failed, trying direct file upload...', uploadError);
        
        // Method 2: Direct file upload as fallback
        const { error: directError } = await supabase.storage
          .from('chat-files')
          .upload(fileName, uri, {
            contentType: type,
            upsert: false,
            cacheControl: '3600',
          });
          
        if (directError) throw directError;
      }
    } catch (blobError) {
      console.log('Blob method failed, trying base64...', blobError);
      
      // Method 3: Base64 upload as final fallback
      try {
        const fileContent = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        
        const byteCharacters = atob(fileContent);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);

        const { error: base64Error } = await supabase.storage
          .from('chat-files')
          .upload(fileName, byteArray, {
            contentType: type,
            upsert: false,
            cacheControl: '3600',
          });

        if (base64Error) throw base64Error;
      } catch (base64Error) {
        console.log('Base64 upload failed, trying simple upload...', base64Error);
        
        // Method 4: Simple upload as last resort
        const { error: simpleError } = await supabase.storage
          .from('chat-files')
          .upload(fileName, uri, {
            contentType: type,
            upsert: false,
            cacheControl: '3600',
          });
          
        if (simpleError) throw simpleError;
      }
    }

    // FIX: Get public URL with cache buster to prevent caching issues
    const { data: { publicUrl } } = supabase.storage
      .from('chat-files')
      .getPublicUrl(fileName);

    // Add cache buster to URL
    const cacheBuster = `t=${Date.now()}`;
    const finalUrl = `${publicUrl}?${cacheBuster}`;

    // Insert into messages table
    const messageData: any = {
      sender_id: user.id,
      content: name,
      message_type: messageType,
      file_url: finalUrl,  // URL with cache buster
      file_name: name,
      file_type: type,
    };

    if (chatType === 'individual') messageData.receiver_id = chatId;
    else messageData.group_id = chatId;

    const { data: insertedData, error: insertErr } = await supabase
      .from('messages')
      .insert(messageData)
      .select()
      .single();

    if (insertErr) throw insertErr;

    // Update UI
    setMessages(prev => {
      const updated = prev.map(msg =>
        msg.id === tempId
          ? {
              ...insertedData,
              profiles: optimisticMessage.profiles,
              _status: 'sent' as const,
              local_file_uri: optimisticMessage.local_file_uri,
              file_url: finalUrl, // Use URL with cache buster
            }
          : msg
      );
      const deduped = deduplicateMessages(updated);
      setSections(groupMessagesByDate(deduped));
      return deduped;
    });

    // Update local storage
    const finalMessages = messages.map(msg =>
      msg.id === tempId
        ? {
            ...insertedData,
            profiles: optimisticMessage.profiles,
            _status: 'sent' as const,
            local_file_uri: optimisticMessage.local_file_uri,
            file_url: finalUrl,
          }
        : msg
    );
    await messageStorage.saveMessages(chatId, deduplicateMessages(finalMessages));

    shouldScrollToBottomRef.current = true;
    setTimeout(scrollToBottom, 100);

  } catch (error: any) {
    console.error('File upload failed:', error);

    // Mark as failed
    setMessages(prev => {
      const updated = prev.map(msg =>
        msg.id === tempId ? { ...msg, _status: 'failed' as const } : msg
      );
      const deduped = deduplicateMessages(updated);
      setSections(groupMessagesByDate(deduped));
      return deduped;
    });

    const failedMessages = messages.map(msg =>
      msg.id === tempId ? { ...msg, _status: 'failed' as const } : msg
    );
    await messageStorage.saveMessages(chatId, deduplicateMessages(failedMessages));

    Alert.alert('Upload Failed', `Could not send ${messageType}. ${error.message}`);
  }
};

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        await uploadFile(asset.uri, `image_${Date.now()}.jpg`, 'image/jpeg', 'image');
      }
      setShowAttachmentMenu(false);
    } catch (error) {
      console.error('Image pick error:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
      });

      if (result.type === 'success' && result.uri) {
        await uploadFile(result.uri, result.name || 'document', result.mimeType || 'application/octet-stream', 'file');
      }
      setShowAttachmentMenu(false);
    } catch (error) {
      console.error('Document pick error:', error);
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  /* ------------------------------------------------------------------ */
  /*  AUDIO PLAYBACK FUNCTIONS                                          */
  /* ------------------------------------------------------------------ */
  const playAudio = async (url: string, id: string) => {
    try {
      if (!hasAudioPermission && Platform.OS !== 'web') {
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Please grant audio permission to play voice messages.');
          return;
        }
        setHasAudioPermission(true);
      }

      if (sound && isPlayingAudio === id) {
        await sound.stopAsync();
        await sound.unloadAsync();
        setIsPlayingAudio(null);
        setSound(null);
        return;
      }

      if (sound) {
        await sound.unloadAsync();
        setSound(null);
        setIsPlayingAudio(null);
      }

      const message = messages.find(msg => msg.id === id);
      let audioUri = message?.local_audio_uri || url;

      if (!audioUri) {
        throw new Error('Audio URI is null or undefined');
      }

      if (isLocalFile(audioUri) && !audioUri.startsWith('file://') && Platform.OS !== 'web') {
        audioUri = `file://${audioUri}`;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { 
          shouldPlay: true,
          volume: 1.0,
        }
      );

      setSound(newSound);
      setIsPlayingAudio(id);

      newSound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish) {
          setIsPlayingAudio(null);
          setSound(null);
          newSound.unloadAsync();
        }
      });

    } catch (error) {
      console.error('Failed to play audio:', error);
      Alert.alert('Error', 'Failed to play audio message');
      setIsPlayingAudio(null);
      setSound(null);
    }
  };

  /* ------------------------------------------------------------------ */
  /*  EFFECTS AND LIFECYCLE                                             */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    fetchMessages();
  }, [user?.id, chatId, chatType]);

  useEffect(() => {
    if (isOnline && initialLoadComplete) {
      const handleOnline = async () => {
        await fetchMessages();
        await retryPendingMessages();
      };
      handleOnline();
    }
  }, [isOnline, initialLoadComplete]);

  useEffect(() => {
    if (messages.length > 0 && chatType === 'individual' && initialLoadComplete) {
      const hasUnreadMessages = messages.some(msg => 
        msg.sender_id === chatId && 
        msg.receiver_id === user?.id && 
        !msg.is_read
      );
      
      if (hasUnreadMessages) {
        markMessagesAsRead();
      }
    }
  }, [messages, chatType, user?.id, chatId, markMessagesAsRead, initialLoadComplete]);

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  useFocusEffect(
    useCallback(() => {
      if (chatType === 'individual' && initialLoadComplete) {
        markMessagesAsRead();
      }
      
      return () => {
        if (sound) {
          sound.unloadAsync();
        }
      };
    }, [chatType, markMessagesAsRead, initialLoadComplete, sound])
  );

  /* ------------------------------------------------------------------ */
  /*  REALTIME SUBSCRIPTION                                             */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (!chatId || !user?.id || !isOnline || !initialLoadComplete) return;

    let retryCount = 0;
    const maxRetries = 3;

    const setupRealtime = async () => {
      try {
        const channel = supabase
          .channel(`chat-${chatId}-${user.id}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'messages',
            },
            async (payload) => {
              const newMessage = payload.new;
              
              const isRelevantMessage = 
                (chatType === 'individual' && 
                 ((newMessage.receiver_id === chatId && newMessage.sender_id === user.id) ||
                  (newMessage.receiver_id === user.id && newMessage.sender_id === chatId))) ||
                (chatType === 'group' && newMessage.group_id === chatId);

              if (isRelevantMessage) {
                try {
                  const { data: profile } = await supabase
                    .from('profiles')
                    .select('user_id, display_name, avatar_url')
                    .eq('user_id', newMessage.sender_id)
                    .single();

                  const messageWithProfile: Message = {
                    ...newMessage,
                    profiles: profile || {
                      display_name: newMessage.sender_id === user.id ? 'You' : 'Unknown User',
                      avatar_url: null,
                      user_id: newMessage.sender_id
                    },
                    _status: 'sent' as const
                  };

                  setMessages(prev => {
                    if (prev.some(msg => msg.id === messageWithProfile.id)) {
                      return prev;
                    }
                    const updated = deduplicateMessages([...prev, messageWithProfile]);
                    setSections(groupMessagesByDate(updated));
                    messageStorage.saveMessages(chatId, updated);
                    return updated;
                  });

                  setTimeout(() => {
                    if (shouldScrollToBottomRef.current) {
                      scrollToBottom();
                    }
                  }, 100);

                  if (newMessage.receiver_id === user.id && chatType === 'individual') {
                    markSingleMessageAsRead(newMessage.id);
                    
                    setMessages(prev => {
                      const updated = prev.map(msg => 
                        msg.id === newMessage.id 
                          ? { ...msg, is_read: true }
                          : msg
                      );
                      setSections(groupMessagesByDate(updated));
                      return deduplicateMessages(updated);
                    });
                  }
                } catch (error) {
                  console.error('Realtime insert error:', error);
                }
              }
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'messages',
              filter: `receiver_id=eq.${user.id}`
            },
            (payload) => {
              const updatedMessage = payload.new;
              setMessages(prev => {
                const updated = prev.map(msg => 
                  msg.id === updatedMessage.id 
                    ? { ...msg, is_read: updatedMessage.is_read }
                    : msg
                );
                setSections(groupMessagesByDate(updated));
                return deduplicateMessages(updated);
              });
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              retryCount = 0;
            }
          });

        return channel;
      } catch (error) {
        console.error('Realtime setup error:', error);
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(setupRealtime, 1000 * retryCount);
        }
        return null;
      }
    };

    const channelPromise = setupRealtime();

    return () => {
      channelPromise.then(channel => {
        if (channel) {
          supabase.removeChannel(channel);
        }
      });
    };
  }, [chatId, chatType, user?.id, isOnline, initialLoadComplete, markSingleMessageAsRead, scrollToBottom]);

  /* ------------------------------------------------------------------ */
  /*  UI HANDLERS                                                       */
  /* ------------------------------------------------------------------ */
  const loadMoreMessages = useCallback(async () => {
    if (loadingMore || !hasMore || !initialLoadComplete) return;
    
    setLoadingMore(true);
    await fetchMessages(true);
    setLoadingMore(false);
  }, [loadingMore, hasMore, fetchMessages, initialLoadComplete]);

  const handleRefresh = useCallback(async () => {
    if (refreshing || loadingMore || !hasMore || !initialLoadComplete) return;
    
    setRefreshing(true);
    await loadMoreMessages();
    setRefreshing(false);
  }, [refreshing, loadingMore, hasMore, initialLoadComplete, loadMoreMessages]);

// Add this to your ChatRoomScreen.tsx temporarily
const handleInfoPress = useCallback(() => {
  console.log('handleInfoPress called');
  console.log('chatType:', chatType);
  console.log('chatId:', chatId);
  console.log('chatName:', chatName);
  console.log('avatarUrl:', avatarUrl);
  
  if (chatType === 'individual') {
    console.log('Navigating to Profile with profileId:', chatId);
    navigation.navigate('Profile', { profileId: chatId });
  } else {
    console.log('Navigating to GroupInfo with params:', { 
      groupId: chatId,
      groupName: chatName,
      avatarUrl: avatarUrl 
    });
    
    // Try alternative navigation method
    navigation.push('GroupInfo', { 
      groupId: chatId,
      groupName: chatName,
      avatarUrl: avatarUrl 
    });
  }
}, [chatType, chatId, chatName, avatarUrl, navigation]);
  const menuItems: MenuItem[] = useMemo(() => {
  const handleSearch = () => Alert.alert('Search', 'Search functionality would go here');
  const handleMute = () => Alert.alert('Mute', 'Mute functionality would go here');
  const handleClearChat = () => Alert.alert('Clear Chat', 'Clear chat functionality would go here');

  const items = [
    { 
      title: chatType === 'individual' ? 'View Contact' : 'Group Info', 
      icon: chatType === 'individual' ? 'person-outline' : 'people-outline', 
      onPress: handleInfoPress 
    },
    { title: 'Search', icon: 'search', onPress: handleSearch },
    { title: 'Mute', icon: 'volume-mute', onPress: handleMute },
  ];

  if (chatType === 'individual') {
    items.push({ title: 'Clear Chat', icon: 'trash-outline', onPress: handleClearChat });
  }

  return items;
}, [handleInfoPress, chatType]);
  /* ------------------------------------------------------------------ */
  /*  UTILITY FUNCTIONS                                                 */
  /* ------------------------------------------------------------------ */
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // FIXED: getImageUri function - always prioritize local_file_uri
  const getImageUri = (message: Message): string => {
    // Priority 1: Always use local_file_uri if it's a local file
    if (message.local_file_uri && 
        message.local_file_uri !== 'null' && 
        message.local_file_uri !== 'undefined' &&
        isLocalFile(message.local_file_uri)) {
      return message.local_file_uri;
    }
    
    // Priority 2: Use file_url from server (clean URL without cache buster)
    if (message.file_url) {
      // Remove any existing query parameters
      const cleanUrl = message.file_url.split('?')[0];
      return cleanUrl;
    }
    
    // Priority 3: For audio messages
    if (message.audio_url) {
      const cleanUrl = message.audio_url.split('?')[0];
      return cleanUrl;
    }
    
    return '';
  };

  const retryImageLoad = useCallback((messageId: string, url: string) => {
    const cleanUrl = url.split('?')[0];
    setMessages(prevMessages => {
      const updated = prevMessages.map(msg => 
        msg.id === messageId 
          ? { ...msg, file_url: cleanUrl }
          : msg
      );
      const deduped = deduplicateMessages(updated);
      setSections(groupMessagesByDate(deduped));
      return deduped;
    });
  }, []);

  /* ------------------------------------------------------------------ */
  /*  RENDER FUNCTIONS                                                  */
  /* ------------------------------------------------------------------ */
  const renderSectionHeader = ({ section }: { section: SectionData }) => (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderContent}>
        <Text style={styles.sectionHeaderText}>{section.title}</Text>
      </View>
    </View>
  );

  const renderMessage = ({ item: msg }: { item: Message }) => {
    const isCurrentUser = msg.sender_id === user?.id;
    const showAvatar = chatType === 'group' && !isCurrentUser;
    const profile = msg.profiles;

    const imageUri = getImageUri(msg);

    return (
      <View style={[
        styles.messageContainer,
        isCurrentUser ? styles.currentUserContainer : styles.otherUserContainer
      ]}>
        {showAvatar && (
          <Image
            source={{ uri: profile?.avatar_url || 'https://via.placeholder.com/32' }}
            style={styles.avatar}
            defaultSource={{ uri: 'https://via.placeholder.com/32' }}
          />
        )}
        
        <View style={[
          styles.messageContent,
          isCurrentUser ? styles.currentUserContent : styles.otherUserContent,
          showAvatar && styles.messageWithAvatar
        ]}>
          {chatType === 'group' && !isCurrentUser && (
            <Text style={styles.senderName}>
              {profile?.display_name || 'Unknown User'}
            </Text>
          )}
          
          {msg.message_type === 'audio' ? (
            <View style={[
              styles.audioBubble,
              isCurrentUser ? styles.currentAudio : styles.otherAudio
            ]}>
              <TouchableOpacity
                style={styles.audioButton}
                onPress={() => playAudio(msg.audio_url!, msg.id)}
                disabled={!hasAudioPermission && Platform.OS !== 'web'}
              >
                <MaterialIcons
                  name={isPlayingAudio === msg.id ? 'pause' : 'play-arrow'}
                  size={20}
                  color={isCurrentUser ? '#fff' : '#007AFF'}
                />
              </TouchableOpacity>
              <View style={styles.waveform}>
                {[8, 16, 24, 20, 12, 16, 8].map((h, i) => (
                  <View 
                    key={i} 
                    style={[
                      styles.waveBar, 
                      { height: h }, 
                      isCurrentUser && styles.currentWaveBar
                    ]} 
                  />
                ))}
              </View>
              <Text style={[
                styles.audioTime,
                isCurrentUser && styles.currentAudioTime
              ]}>
                {formatDuration(msg.audio_duration || 0)}
              </Text>
              
              <View style={[
                styles.messageMeta,
                isCurrentUser ? styles.currentMessageMeta : styles.otherMessageMeta,
                styles.audioMessageMeta
              ]}>
                <Text style={[
                  styles.time,
                  isCurrentUser && styles.currentTime
                ]}>
                  {new Date(msg.created_at).toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </Text>
                {isCurrentUser && (
                  <MessageStatus 
                    status={msg._status}
                    isRead={msg.is_read} 
                    delivered={msg.delivered} 
                  />
                )}
              </View>
            </View>
          ) : msg.message_type === 'image' ? (
            <View style={styles.imageContainer}>
              <TouchableOpacity>
                <Image
                  source={{ 
                    uri: imageUri,
                    cache: 'force-cache'
                  }}
                  style={styles.imageMessage}
                  resizeMode="cover"
                  onError={(e) => {
                    console.log('Image failed to load:', imageUri);
                    console.log('Error details:', e.nativeEvent.error);
                    
                    // Add to failed images set
                    setFailedImages(prev => new Set(prev).add(msg.id));
                    
                    // If URL has cache buster, retry without it
                    if (imageUri.includes('?t=')) {
                      setTimeout(() => {
                        retryImageLoad(msg.id, imageUri);
                      }, 1000);
                    }
                  }}
                  onLoad={() => {
                    console.log('Image loaded successfully:', imageUri);
                    // Remove from failed images if it was there
                    setFailedImages(prev => {
                      const newSet = new Set(prev);
                      newSet.delete(msg.id);
                      return newSet;
                    });
                  }}
                />
              </TouchableOpacity>
              
              <View style={[
                styles.messageMeta,
                isCurrentUser ? styles.currentMessageMeta : styles.otherMessageMeta,
                styles.imageMessageMeta
              ]}>
                <Text style={[
                  styles.time,
                  isCurrentUser && styles.currentTime
                ]}>
                  {new Date(msg.created_at).toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </Text>
                {isCurrentUser && (
                  <MessageStatus 
                    status={msg._status}
                    isRead={msg.is_read} 
                    delivered={msg.delivered} 
                  />
                )}
              </View>
            </View>
          ) : msg.message_type === 'file' ? (
            <View style={[
              styles.fileBubble,
              isCurrentUser ? styles.currentFile : styles.otherFile
            ]}>
              <Feather name="file" size={20} color={isCurrentUser ? '#fff' : '#007AFF'} />
              <Text style={[
                styles.fileName,
                isCurrentUser && styles.currentFileName
              ]} numberOfLines={1}>
                {msg.file_name || 'File'}
              </Text>
              
              <View style={[
                styles.messageMeta,
                isCurrentUser ? styles.currentMessageMeta : styles.otherMessageMeta,
                styles.fileMessageMeta
              ]}>
                <Text style={[
                  styles.time,
                  isCurrentUser && styles.currentTime
                ]}>
                  {new Date(msg.created_at).toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </Text>
                {isCurrentUser && (
                  <MessageStatus 
                    status={msg._status}
                    isRead={msg.is_read} 
                    delivered={msg.delivered} 
                  />
                )}
              </View>
            </View>
          ) : (
            <View style={[
              styles.textBubble,
              isCurrentUser ? styles.currentTextBubble : styles.otherTextBubble
            ]}>
              <Text style={[
                styles.messageText,
                isCurrentUser && styles.currentMessageText
              ]}>
                {msg.content}
              </Text>
              
              <View style={[
                styles.messageMeta,
                isCurrentUser ? styles.currentMessageMeta : styles.otherMessageMeta,
                styles.textMessageMeta
              ]}>
                <Text style={[
                  styles.time,
                  isCurrentUser && styles.currentTime
                ]}>
                  {new Date(msg.created_at).toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </Text>
                {isCurrentUser && (
                  <MessageStatus 
                    status={msg._status}
                    isRead={msg.is_read} 
                    delivered={msg.delivered} 
                  />
                )}
              </View>
            </View>
          )}
        </View>
      </View>
    );
  };

  /* ------------------------------------------------------------------ */
  /*  MAIN RENDER                                                       */
  /* ------------------------------------------------------------------ */
  return (
    <SafeAreaView 
      style={styles.container} edges={Platform.select({ios: ['top', 'left', 'right', ...(isKeyboardVisible ? ['bottom'] : [])], 
        android: ['top', 'left', 'right', 'bottom'],
      })}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <IconButton 
            icon="arrow-left" 
            size={24} 
            iconColor="#fff" 
            onPress={() => navigation.goBack()} 
          />
          <TouchableOpacity style={styles.headerInfo} onPress={handleInfoPress}>
            <Image 
              source={{ uri: avatarUrl || 'https://via.placeholder.com/40' }} 
              style={styles.headerAvatar} 
            />
            <View style={styles.headerText}>
              <Text style={styles.headerName} numberOfLines={1}>
                {chatName}
              </Text>
              <Text style={styles.headerStatus}>
                {isOnline ? 'Online' : 'Offline'}
                {syncing && ' • Syncing...'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
        <View style={styles.headerActions}>
          <IconButton icon="video" size={24} iconColor="#fff" />
          <IconButton icon="phone" size={24} iconColor="#fff" />
          <ChatMenuDropdown items={menuItems} />
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.select({
          ios: 0, // FIXED: Use 0 for iOS with SafeAreaView
          android: 0,
        })}
      >
        <SectionList
          ref={flatListRef}
          sections={sections}
          renderItem={renderMessage}
          renderSectionHeader={renderSectionHeader}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            loadingMore && { paddingTop: 40 }
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#007AFF']}
              tintColor="#007AFF"
              title="Pull to load older messages"
              titleColor="#666"
              progressViewOffset={loadingMore ? 40 : 0}
            />
          }
          ListEmptyComponent={
            !initialLoadComplete ? (
              <ActivityIndicator style={styles.loadingIndicator} size="large" color="#007AFF" />
            ) : (
              <View style={styles.empty}>
                <Ionicons name="chatbubble-ellipses-outline" size={80} color="#e0e0e0" />
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.emptySubtitle}>
                  {isOnline 
                    ? 'Start the conversation by sending a message!' 
                    : 'You are offline. Messages will be sent when connection is restored.'
                  }
                </Text>
              </View>
            )
          }
          ListHeaderComponent={
            loadingMore ? (
              <View style={styles.loadingMoreContainer}>
                <ActivityIndicator size="small" color="#007AFF" />
                <Text style={styles.loadingMoreText}>Loading older messages...</Text>
              </View>
            ) : null
          }
          inverted={false}
          stickySectionHeadersEnabled={false}
          initialNumToRender={20}
          maxToRenderPerBatch={10}
          windowSize={21}
          removeClippedSubviews={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onScrollToIndexFailed={(info) => {
            console.log('Scroll to index failed:', info);
            setTimeout(() => {
              if (flatListRef.current && sections.length > 0) {
                const lastSectionIndex = sections.length - 1;
                const lastItemIndex = sections[lastSectionIndex]?.data?.length - 1 || 0;
                
                flatListRef.current.scrollToLocation({
                  sectionIndex: lastSectionIndex,
                  itemIndex: lastItemIndex,
                  animated: false,
                  viewPosition: 0,
                });
              }
            }, 100);
          }}
          onContentSizeChange={(width, height) => {
            if (loadingMore && !shouldScrollToBottomRef.current) {
              const currentOffset = lastContentOffsetRef.current;
              const heightDifference = height - contentHeightRef.current;
              
              if (heightDifference > 0 && currentOffset > 0) {
                setTimeout(() => {
                  if (flatListRef.current) {
                    flatListRef.current.scrollToOffset({
                      offset: currentOffset + heightDifference,
                      animated: false,
                    });
                  }
                }, 50);
              }
            }
          }}
        />

        <ChatInput
          placeholder="Message..."
          onSend={sendMessage}
          onSendVoice={sendVoiceMessage}
          onAttachmentPress={() => setShowAttachmentMenu(true)}
          // Only add bottom padding when keyboard is visible
          style={{ paddingBottom: isKeyboardVisible ? insets.bottom : 0 }}
          disabled={!user?.id}
        />
      </KeyboardAvoidingView>

      <Modal visible={showAttachmentMenu} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setShowAttachmentMenu(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.attachmentSheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Share Content</Text>
              <View style={styles.attachmentOptions}>
                <TouchableOpacity style={styles.attachmentOption} onPress={pickImage}>
                  <View style={[styles.optionIcon, { backgroundColor: '#4CAF50' }]}>
                    <Ionicons name="image" size={24} color="#fff" />
                  </View>
                  <Text style={styles.optionText}>Photo & Video</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.attachmentOption} onPress={pickDocument}>
                  <View style={[styles.optionIcon, { backgroundColor: '#2196F3' }]}>
                    <Ionicons name="document" size={24} color="#fff" />
                  </View>
                  <Text style={styles.optionText}>Document</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#007AFF',
    height: 70,
    paddingHorizontal: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
    flex: 1,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  headerText: {
    flexDirection: 'column',
    flex: 1,
    marginRight: 8,
  },
  headerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    flexShrink: 1,
  },
  headerStatus: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  sectionHeader: {
    alignItems: 'center',
    marginVertical: 8,
  },
  sectionHeaderContent: {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  messageContainer: {
    flexDirection: 'row',
    marginVertical: 4,
    maxWidth: '80%',
  },
  currentUserContainer: {
    alignSelf: 'flex-end',
  },
  otherUserContainer: {
    alignSelf: 'flex-start',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
    alignSelf: 'flex-end',
    marginBottom: 4,
  },
  messageContent: {
    flex: 1,
  },
  currentUserContent: {
    alignItems: 'flex-end',
  },
  otherUserContent: {
    alignItems: 'flex-start',
  },
  messageWithAvatar: {
    marginLeft: 0,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 2,
    marginLeft: 8,
  },
  textBubble: {
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '100%',
  },
  currentTextBubble: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  otherTextBubble: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    color: '#000',
  },
  currentMessageText: {
    color: '#fff',
  },
  audioBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 160,
  },
  currentAudio: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  otherAudio: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
  },
  audioButton: {
    marginRight: 12,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    height: 24,
  },
  waveBar: {
    width: 2,
    backgroundColor: '#007AFF',
    marginHorizontal: 1,
    borderRadius: 1,
  },
  currentWaveBar: {
    backgroundColor: '#fff',
  },
  audioTime: {
    fontSize: 14,
    color: '#007AFF',
    marginLeft: 12,
    fontWeight: '500',
  },
  currentAudioTime: {
    color: '#fff',
  },
  imageContainer: {
    borderRadius: 18,
    overflow: 'hidden',
    maxWidth: 250,
  },
  imageMessage: {
    width: 250,
    height: 200,
    borderRadius: 18,
  },
  fileBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    maxWidth: 250,
  },
  currentFile: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  otherFile: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
  },
  fileName: {
    flex: 1,
    fontSize: 14,
    color: '#007AFF',
    marginLeft: 10,
  },
  currentFileName: {
    color: '#fff',
  },
  messageMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  currentMessageMeta: {
    justifyContent: 'flex-end',
  },
  otherMessageMeta: {
    justifyContent: 'flex-start',
  },
  textMessageMeta: {
    marginTop: 4,
  },
  audioMessageMeta: {
    position: 'absolute',
    right: 14,
    bottom: -16,
  },
  imageMessageMeta: {
    position: 'absolute',
    right: 12,
    bottom: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  fileMessageMeta: {
    position: 'absolute',
    right: 14,
    bottom: -16,
  },
  time: {
    fontSize: 11,
    color: 'rgba(0, 0, 0, 0.5)',
    marginRight: 4,
  },
  currentTime: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  loadingIndicator: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
  loadingMore: {
    marginVertical: 20,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 20,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  attachmentSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 30,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#ddd',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 20,
  },
  attachmentOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  attachmentOption: {
    alignItems: 'center',
  },
  optionIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  optionText: {
    fontSize: 14,
    color: '#333',
  },
  loadingMoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  loadingMoreText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#5b5b5bff',
  },
});
