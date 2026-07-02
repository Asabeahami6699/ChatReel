// src/navigation/RootNavigator.tsx
import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { useAuth } from '../hooks/useAuth';
import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';
import { rootNavigationRef } from './rootNavigation';

const prefix = Linking.createURL('/');

const linking = {
  prefixes: [prefix, 'yourapp://'],
  config: {
    screens: {
      Login: 'login',
      Signup: 'signup',
      Home: 'home',
      NewGroup: 'new-group',
      Invite: 'invite/:token',
    },
  },
};

export const RootNavigator = () => {
  const { user, loading } = useAuth();

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
      {user ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
};
