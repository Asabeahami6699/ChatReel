// src/navigation/RootNavigator.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { useAuth } from '../hooks/useAuth';
import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';
import { ActivityIndicator, View } from 'react-native';

// Deep linking config
const prefix = Linking.createURL('/');

const linking = {
  prefixes: [prefix, 'yourapp://'],
  config: {
    screens: {
      // Auth screens
      Login: 'login',
      Signup: 'signup',
      // App screens
      Home: 'home',
      NewGroup: 'new-group',
      Invite: 'invite/:token',
      // Add others as needed
    },
  },
};

export const RootNavigator = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#0066cc" />
      </View>
    );
  }

  return (
    <NavigationContainer linking={linking}>
      {user ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
};