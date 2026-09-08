// src/navigation/RootNavigator.tsx
import React, { useCallback, useEffect, useMemo } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { useAuth } from '../hooks/useAuth';
import { useChatSettings } from '../context/ChatSettingsContext';
import { buildNavigationTheme } from '../theme/buildAppTheme';
import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';
import { GuestNavigator } from './GuestNavigator';
import { parseInviteTokenFromUrl } from '../lib/groupInviteLinks';
import { parseReelIdFromUrl } from '../lib/reelShareLinks';
import { config } from '../lib/config';
import {
  consumePendingInviteToken,
  setPendingInviteToken,
} from '../lib/pendingInvite';
import {
  consumePendingReelId,
  setPendingReelId,
} from '../lib/pendingReel';
import { captureAppInviteFromUrl } from '../lib/pendingAppInvite';
import { AppInviteDownloadPrompt } from '../components/AppInviteDownloadPrompt';
import { WebPlayStoreInstallBanner } from '../components/WebPlayStoreInstallBanner';
import { navigateToInvite, rootNavigationRef } from './rootNavigation';
import { navigateToReelPreview } from './navigateToChat';

const prefix = Linking.createURL('/');
const webHost = config.webUrl.replace(/\/$/, '');

const linking = {
  // Include HTTPS web host so shared invite / reel links open in-app.
  prefixes: [prefix, 'chatapp://', 'yourapp://', webHost, `${webHost}/`],
  config: {
    screens: {
      Invite: 'invite/:token',
      ReelPreview: 'reel/:reelId',
      Main: {
        screens: {
          Chats: {
            screens: {
              ChatList: 'chats',
              ChatRoom: 'chat/:chatId',
            },
          },
        },
      },
    },
  },
};

export const RootNavigator = () => {
  const { loading, isGuest, isAuthenticated } = useAuth();
  const { theme } = useChatSettings();
  const navigationTheme = useMemo(() => buildNavigationTheme(theme), [theme]);

  const handleDeepLink = useCallback(
    (url: string | null | undefined) => {
      if (!url) return;
      void captureAppInviteFromUrl(url);

      const reelId = parseReelIdFromUrl(url);
      if (reelId) {
        if (isAuthenticated) {
          // Defer until nav tree is ready (auth stack → app stack).
          requestAnimationFrame(() => navigateToReelPreview(reelId));
        } else {
          void setPendingReelId(reelId);
        }
        return;
      }

      const token = parseInviteTokenFromUrl(url);
      if (!token) return;
      if (isAuthenticated) {
        navigateToInvite(token);
      } else {
        void setPendingInviteToken(token);
      }
    },
    [isAuthenticated]
  );

  useEffect(() => {
    void Linking.getInitialURL().then(handleDeepLink);
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    // Web: Expo Linking sometimes misses the address-bar path on first paint.
    if (typeof window !== 'undefined' && window.location?.href) {
      handleDeepLink(window.location.href);
    }
    return () => sub.remove();
  }, [handleDeepLink]);

  useEffect(() => {
    if (!isAuthenticated || loading) return;
    void consumePendingInviteToken().then((token) => {
      if (token) navigateToInvite(token);
    });
    void consumePendingReelId().then((reelId) => {
      if (reelId) {
        requestAnimationFrame(() => navigateToReelPreview(reelId));
      }
    });
  }, [isAuthenticated, loading]);

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loading]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: theme.listBg,
        }}
      >
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <NavigationContainer
        ref={rootNavigationRef}
        linking={linking}
        theme={navigationTheme}
      >
        <AppInviteDownloadPrompt />
        {isAuthenticated ? <AppNavigator /> : isGuest ? <GuestNavigator /> : <AuthNavigator />}
      </NavigationContainer>
      <WebPlayStoreInstallBanner />
    </View>
  );
};
