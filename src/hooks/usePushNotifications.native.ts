import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { api } from '../lib/api';
import { openChat } from '../navigation/chatNavigationBridge';
import { navigateMainTab } from '../navigation/rootNavigation';
import {
  openReelFromPush,
  openReelInboxFromPush,
} from '../navigation/reelsNavigationBridge';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function getExpoProjectId(): string | undefined {
  return (
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId
  );
}

type PushData = {
  type?: string;
  reel_id?: string;
  screen?: string;
  chat_id?: string;
  chat_type?: 'individual' | 'group';
  chat_name?: string;
  friendship_id?: string;
  message_id?: string;
};

function handlePushOpen(data: PushData | undefined) {
  if (!data?.type) return;

  if (
    data.type === 'reel_gift' ||
    data.type === 'reel_like' ||
    data.type === 'reel_comment'
  ) {
    void import('../lib/reelInboxPrefetch').then((m) => m.refreshReelInbox());
    openReelInboxFromPush();
    return;
  }

  if (data.type === 'new_reel' && data.reel_id) {
    openReelFromPush(data.reel_id);
    return;
  }

  if (data.type === 'message' && data.chat_id) {
    openChat({
      chatId: data.chat_id,
      chatType: data.chat_type === 'group' ? 'group' : 'individual',
      chatName: data.chat_name || (data.chat_type === 'group' ? 'Group' : 'Chat'),
    });
    return;
  }

  if (data.type === 'friend_request') {
    navigateMainTab('Chats', { screen: 'FriendRequests' });
    return;
  }

  if (data.type === 'friend_accepted') {
    navigateMainTab('Chats', { screen: 'FriendsList' });
    return;
  }

  if (data.type === 'incoming_call') {
    // IncomingCallOverlay / call realtime handles join; just ensure app is foregrounded.
    return;
  }
}

export function usePushNotifications(userId: string | undefined) {
  const registeredToken = useRef<string | null>(null);
  const handledResponseIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;

    let active = true;
    let responseSub: { remove: () => void } | null = null;

    const consumeResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handledResponseIds.current.has(id)) return;
      handledResponseIds.current.add(id);
      handlePushOpen(response.notification.request.content.data as PushData);
    };

    (async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Messages & friends',
          importance: Notifications.AndroidImportance.MAX,
        });
        await Notifications.setNotificationChannelAsync('reel_inbox', {
          name: 'Reel activity',
          importance: Notifications.AndroidImportance.HIGH,
          sound: 'default',
        });
      }

      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted' || !active) return;

      const projectId = getExpoProjectId();
      const tokenResult = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getExpoPushTokenAsync();

      const token = tokenResult.data;
      if (!token || !active) return;

      registeredToken.current = token;
      await api.notifications.registerToken({ token, platform: Platform.OS });

      // Cold start: user opened the app by tapping a notification.
      const last = await Notifications.getLastNotificationResponseAsync();
      if (active) consumeResponse(last);
    })().catch((err) => {
      console.warn('[push] registration failed:', err);
    });

    responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      consumeResponse(response);
    });

    return () => {
      active = false;
      responseSub?.remove();
      const token = registeredToken.current;
      if (token) {
        api.notifications.unregisterToken(token).catch(() => undefined);
        registeredToken.current = null;
      }
    };
  }, [userId]);
}
