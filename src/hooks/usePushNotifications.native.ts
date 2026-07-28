import { useEffect, useRef } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { isPushForActiveChat } from '../lib/activeChatFocus';
import { bumpAppBadgeCount } from '../lib/appBadge';
import { api } from '../lib/api';
import { requestIncomingCallResync } from '../lib/callIncomingBridge';
import { openChat } from '../navigation/chatNavigationBridge';
import { navigateMainTab } from '../navigation/rootNavigation';
import {
  openReelFromPush,
  openReelInboxFromPush,
} from '../navigation/reelsNavigationBridge';
import {
  getPushNotificationsEnabled,
  getRegisteredExpoPushToken,
  setRegisteredExpoPushToken,
} from '../lib/pushPrefs';

const MESSAGE_REPLY_CATEGORY = 'message_reply';
const REPLY_ACTION = 'REPLY';

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as PushData | undefined;
    const inThisChat = isPushForActiveChat(data ?? {});
    const isCall = data?.type === 'incoming_call';
    // Honor Settings → Push notifications (calls still alert).
    if (!getPushNotificationsEnabled() && !isCall) {
      return {
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
      };
    }
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
  sender_id?: string;
  badge?: number;
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

async function replyFromNotification(data: PushData, text: string) {
  const chatId = data.chat_id;
  if (!chatId || !text.trim()) return;
  const payload =
    data.chat_type === 'group'
      ? {
          content: text.trim(),
          message_type: 'text',
          group_id: chatId,
          push_preview: text.trim().slice(0, 120),
        }
      : {
          content: text.trim(),
          message_type: 'text',
          receiver_id: chatId,
          push_preview: text.trim().slice(0, 120),
        };
  await api.messages.send(payload);
}

let androidChannelsReady = false;
let categoriesReady = false;

async function ensureNotificationCategories() {
  if (categoriesReady || Platform.OS === 'web') return;
  try {
    await Notifications.setNotificationCategoryAsync(MESSAGE_REPLY_CATEGORY, [
      {
        identifier: REPLY_ACTION,
        buttonTitle: 'Reply',
        textInput: {
          submitButtonTitle: 'Send',
          placeholder: 'Message',
        },
        options: {
          opensAppToForeground: false,
        },
      },
    ]);
    categoriesReady = true;
  } catch (err) {
    console.warn('[push] setNotificationCategoryAsync failed:', err);
  }
}

async function ensureAndroidChannels() {
  if (Platform.OS !== 'android' || androidChannelsReady) return;
  // One-shot migrate: older builds used sound: "default" (missing raw asset).
  const channelIds = ['default', 'reel_inbox', 'calls'] as const;
  for (const id of channelIds) {
    try {
      await Notifications.deleteNotificationChannelAsync(id);
    } catch {
      /* channel may not exist yet */
    }
  }
  // Omit `sound` so Android uses the system default notification sound.
  // showBadge lets launchers that support it show an unread count / dot.
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Messages & friends',
    importance: Notifications.AndroidImportance.MAX,
    showBadge: true,
  });
  await Notifications.setNotificationChannelAsync('reel_inbox', {
    name: 'Reel activity',
    importance: Notifications.AndroidImportance.HIGH,
    showBadge: true,
  });
  await Notifications.setNotificationChannelAsync('calls', {
    name: 'Incoming calls',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 200, 400],
    bypassDnd: true,
    showBadge: true,
  });
  androidChannelsReady = true;
}

async function registerExpoToken(userId: string): Promise<string | null> {
  if (!getPushNotificationsEnabled()) {
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.warn('[push] Notification permission not granted:', finalStatus);
    return null;
  }

  const projectId = getExpoProjectId();
  if (!projectId) {
    console.warn('[push] Missing EAS projectId — cannot fetch Expo push token');
  }

  try {
    const tokenResult = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    const token = tokenResult.data;
    if (!token) return null;
    // Only store Expo tokens — raw FCM device tokens break Expo Push delivery.
    if (!token.startsWith('ExponentPushToken')) {
      console.warn('[push] Ignoring non-Expo push token shape');
      return null;
    }
    await api.notifications.registerToken({ token, platform: Platform.OS });
    console.log('[push] Registered Expo push token for', Platform.OS);
    return token;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Local debug builds often omit google-services.json — push is optional there.
    if (
      /FirebaseApp is not initialized|googleServicesFile|Firebase Messaging|Default FirebaseApp/i.test(
        msg
      )
    ) {
      console.warn(
        '[push] Firebase / google-services.json missing in this build. ' +
          'Add google-services.json and rebuild the APK for push to work.'
      );
      return null;
    }
    console.warn('[push] getExpoPushTokenAsync failed:', msg);
    throw err;
  }
}

export function usePushNotifications(userId: string | undefined) {
  const registeredToken = useRef<string | null>(null);
  const handledResponseIds = useRef<Set<string>>(new Set());
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  // Unregister only on explicit logout (userId → undefined), not Strict Mode remounts.
  useEffect(() => {
    if (userId) return;
    const token = registeredToken.current ?? getRegisteredExpoPushToken();
    if (!token) return;
    registeredToken.current = null;
    setRegisteredExpoPushToken(null);
    void api.notifications.unregisterToken(token).catch(() => undefined);
    void import('../lib/appBadge').then((m) => m.clearAppBadge());
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    let active = true;
    let responseSub: { remove: () => void } | null = null;
    let receivedSub: { remove: () => void } | null = null;
    let tokenSub: { remove: () => void } | null = null;
    let appStateSub: { remove: () => void } | null = null;

    const consumeResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      const actionId = response.actionIdentifier;
      const data = response.notification.request.content.data as PushData;

      // Reply-from-notification (WhatsApp-style) — send without opening the chat.
      if (
        actionId === REPLY_ACTION &&
        data?.type === 'message' &&
        data.chat_id
      ) {
        const replyKey = `${id}:reply`;
        if (handledResponseIds.current.has(replyKey)) return;
        handledResponseIds.current.add(replyKey);
        const text =
          'userText' in response && typeof response.userText === 'string'
            ? response.userText
            : '';
        if (text.trim()) {
          void replyFromNotification(data, text).catch((err) => {
            console.warn('[push] reply-from-notification failed:', err);
          });
        }
        return;
      }

      if (handledResponseIds.current.has(id)) return;
      handledResponseIds.current.add(id);
      handlePushOpen(data);
    };

    const syncToken = async () => {
      try {
        await ensureAndroidChannels();
        await ensureNotificationCategories();
        // Pick up tokens registered via Settings toggle.
        if (!registeredToken.current) {
          registeredToken.current = getRegisteredExpoPushToken();
        }
        if (!getPushNotificationsEnabled()) {
          const existing = registeredToken.current;
          if (existing) {
            registeredToken.current = null;
            setRegisteredExpoPushToken(null);
            await api.notifications.unregisterToken(existing).catch(() => undefined);
          }
          return;
        }
        const token = await registerExpoToken(userId);
        if (!active || !token) return;
        registeredToken.current = token;
        setRegisteredExpoPushToken(token);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          /FirebaseApp is not initialized|googleServicesFile|Firebase Messaging|Default FirebaseApp/i.test(
            msg
          )
        ) {
          console.warn(
            '[push] Push unavailable in this build (no Firebase). Add google-services.json and rebuild.'
          );
          return;
        }
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

    // Foreground delivery — keep badge in sync before ChatList refreshes.
    receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as PushData | undefined;
      if (!data) return;
      if (typeof data.badge === 'number' && Number.isFinite(data.badge)) {
        void import('../lib/appBadge').then((m) => m.setAppBadgeCount(data.badge as number));
        return;
      }
      if (data.type === 'message' && !isPushForActiveChat(data)) {
        bumpAppBadgeCount(1);
      }
    });

    // Device FCM token rotation — re-fetch the Expo token (never register the raw FCM id).
    tokenSub = Notifications.addPushTokenListener(() => {
      if (!userIdRef.current) return;
      void syncToken();
    });

    appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active' && userIdRef.current) {
        void syncToken();
      }
    });

    return () => {
      active = false;
      responseSub?.remove();
      receivedSub?.remove();
      tokenSub?.remove();
      appStateSub?.remove();
      // Keep the DB token across remounts; logout effect handles delete.
    };
  }, [userId]);
}

/** Call when the Settings toggle changes so tokens register/unregister immediately. */
export async function syncPushRegistrationForSetting(
  userId: string | undefined,
  enabled: boolean
): Promise<void> {
  const { setPushNotificationsEnabled, getRegisteredExpoPushToken } = await import(
    '../lib/pushPrefs'
  );
  setPushNotificationsEnabled(enabled);
  if (!userId) return;
  if (!enabled) {
    const token = getRegisteredExpoPushToken();
    if (token) {
      setRegisteredExpoPushToken(null);
      await api.notifications.unregisterToken(token).catch(() => undefined);
    }
    return;
  }
  try {
    await ensureAndroidChannels();
    await ensureNotificationCategories();
    const token = await registerExpoToken(userId);
    if (token) {
      setRegisteredExpoPushToken(token);
    }
  } catch (err) {
    console.warn('[push] re-register after toggle failed:', err);
  }
}
