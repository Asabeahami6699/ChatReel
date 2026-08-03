import { useEffect, useRef } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import {
  captureAppInviteFromWebLocation,
  consumePendingAppInviteRef,
  markPlayStorePromptShown,
  PLAY_STORE_APP_URL,
  shouldPromptPlayStoreAfterInvite,
} from '../lib/pendingAppInvite';

/**
 * After login from an invite-a-friend web link, prompt downloading the Play Store app.
 */
export function AppInviteDownloadPrompt() {
  const { isAuthenticated, loading } = useAuth();
  const promptedRef = useRef(false);

  useEffect(() => {
    void captureAppInviteFromWebLocation();
  }, []);

  useEffect(() => {
    if (loading || !isAuthenticated || Platform.OS !== 'web') return;
    if (promptedRef.current) return;

    void (async () => {
      const should = await shouldPromptPlayStoreAfterInvite();
      if (!should) return;
      if (promptedRef.current) return;
      promptedRef.current = true;
      await consumePendingAppInviteRef();
      await markPlayStorePromptShown();

      Alert.alert(
        'Get the ChatReel app',
        'For the best experience — faster chats, calls, and notifications — download ChatReel from the Play Store.',
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Download',
            onPress: () => {
              void Linking.openURL(PLAY_STORE_APP_URL);
            },
          },
        ]
      );
    })();
  }, [isAuthenticated, loading]);

  return null;
}
