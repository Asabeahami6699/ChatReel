import { useEffect, useRef } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { isPushForActiveChat } from '../lib/activeChatFocus';
import { api } from '../lib/api';
import { requestIncomingCallResync } from '../lib/callIncomingBridge';
import { openChat } from '../navigation/chatNavigationBridge';
import { navigateMainTab } from '../navigation/rootNavigation';
import {
  openReelFromPush,
  openReelInboxFromPush,
} from '../navigation/reelsNavigationBridge';

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as PushData | undefined;
    const inThisChat = isPushForActiveChat(data ?? {});
    const isCall = data?.type === 'incoming_call';
    // Quiet when already looking at that chat; always alert for calls.
    const show = isCall || !inThisChat;
    return {
      shouldShowAlert: show,
      shouldPlaySound: show,
      shouldSetBadge: true,
      shouldShowBanner: show,
      shouldShowList: show,
    };
  },
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
  call_id?: string;
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
    requestIncomingCallResync(data.call_id);
    navigateMainTab('Calls');
    return;
  }
}

async function ensureAndroidChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Messages & friends',
    importance: Notifications.AndroidImportance.MAX,
  });
  await Notifications.setNotificationChannelAsync('reel_inbox', {
    name: 'Reel activity',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync('calls', {
    name: 'Incoming calls',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 400, 200, 400],
    bypassDnd: true,
  });
}

async function registerExpoToken(userId: string): Promise<string | null> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  const projectId = getExpoProjectId();
  const tokenResult = projectId
    ? await Notifications.getExpoPushTokenAsync({ projectId })
    : await Notifications.getExpoPushTokenAsync();

  const token = tokenResult.data;
  if (!token) return null;

  await api.notifications.registerToken({ token, platform: Platform.OS });
  return token;
}

export function usePushNotifications(userId: string | undefined) {
  const registeredToken = useRef<string | null>(null);
  const handledResponseIds = useRef<Set<string>>(new Set());
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  // Unregister only on explicit logout (userId → undefined), not Strict Mode remounts.
  useEffect(() => {
    if (userId) return;
    const token = registeredToken.current;
    if (!token) return;
    registeredToken.current = null;
    void api.notifications.unregisterToken(token).catch(() => undefined);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    let active = true;
    let responseSub: { remove: () => void } | null = null;
    let tokenSub: { remove: () => void } | null = null;
    let appStateSub: { remove: () => void } | null = null;

    const consumeResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handledResponseIds.current.has(id)) return;
      handledResponseIds.current.add(id);
      handlePushOpen(response.notification.request.content.data as PushData);
    };

    const syncToken = async () => {
      try {
        await ensureAndroidChannels();
        const token = await registerExpoToken(userId);
        if (!active || !token) return;
        registeredToken.current = token;
      } catch (err) {
        console.warn('[push] registration failed:', err);
      }
    };

    void (async () => {
      await syncToken();
      if (!active) return;
      const last = await Notifications.getLastNotificationResponseAsync();
      if (active) consumeResponse(last);
    })();

    responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      consumeResponse(response);
    });

    tokenSub = Notifications.addPushTokenListener((devicePushToken) => {
      const next =
        typeof devicePushToken?.data === 'string' ? devicePushToken.data : null;
      if (!next || !userIdRef.current) return;
      registeredToken.current = next;
      void api.notifications
        .registerToken({ token: next, platform: Platform.OS })
        .catch(() => undefined);
    });

    appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active' && userIdRef.current) {
        void syncToken();
      }
    });

    return () => {
      active = false;
      responseSub?.remove();
      tokenSub?.remove();
      appStateSub?.remove();
      // Keep the DB token across remounts; logout effect handles delete.
    };
  }, [userId]);
}
