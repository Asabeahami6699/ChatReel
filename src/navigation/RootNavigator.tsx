// src/navigation/RootNavigator.tsx
import React, { useCallback, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { useAuth } from '../hooks/useAuth';
import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';
import { GuestNavigator } from './GuestNavigator';
import { parseInviteTokenFromUrl } from '../lib/groupInviteLinks';
import {
  consumePendingInviteToken,
  setPendingInviteToken,
} from '../lib/pendingInvite';
import { navigateToInvite, rootNavigationRef } from './rootNavigation';

const prefix = Linking.createURL('/');

const linking = {
  prefixes: [prefix, 'chatapp://', 'yourapp://'],
  config: {
    screens: {
      Invite: 'invite/:token',
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

  const handleInviteUrl = useCallback(
    (url: string | null | undefined) => {
      if (!url) return;
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
    void Linking.getInitialURL().then(handleInviteUrl);
    const sub = Linking.addEventListener('url', ({ url }) => handleInviteUrl(url));
    return () => sub.remove();
  }, [handleInviteUrl]);

  useEffect(() => {
    if (!isAuthenticated || loading) return;
    void consumePendingInviteToken().then((token) => {
      if (token) navigateToInvite(token);
    });
  }, [isAuthenticated, loading]);

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#0066cc" />
      </View>
    );
  }

  return (
    <NavigationContainer ref={rootNavigationRef} linking={linking}>
      {isAuthenticated ? <AppNavigator /> : isGuest ? <GuestNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
};
