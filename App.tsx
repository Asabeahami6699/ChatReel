// App.tsx
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from './src/context/AuthContext';
import { Provider as PaperProvider } from 'react-native-paper';
import { RootNavigator } from './src/navigation/RootNavigator';

// MUST BE THE VERY FIRST IMPORTS
import 'react-native-get-random-values';
import sodium from 'react-native-libsodium';

// Initialize libsodium properly (new 2025 API)
const initializeSodium = async () => {
  try {
    await sodium.ready; // This replaces startSodium() and is the official way now
    console.log('libsodium initialized successfully');
  } catch (error) {
    console.error('Failed to initialize libsodium:', error);
  }
};

export default function App() {
  useEffect(() => {
    initializeSodium();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider>
          <AuthProvider>
            <RootNavigator />
            <StatusBar style="auto" />
          </AuthProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}