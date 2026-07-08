// App.tsx
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from './src/context/AuthContext';
import { ChatSettingsProvider } from './src/context/ChatSettingsContext';
import { RealtimeProvider } from './src/components/RealtimeProvider';
import { PushNotificationRegistrar } from './src/components/PushNotificationRegistrar';
import { Provider as PaperProvider } from 'react-native-paper';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ReelUploadToast } from './src/components/ReelUploadToast';
import { ReelUploadQueueRegistrar } from './src/components/ReelUploadQueueRegistrar';
import { AppPrefetchRegistrar } from './src/components/AppPrefetchRegistrar';
import { AudioExtractToast } from './src/components/AudioExtractToast';
import { MomentUploadToast } from './src/components/MomentUploadToast';
import { PresenceSyncRegistrar } from './src/components/PresenceSyncRegistrar';
import { useWebIconFonts } from './src/lib/loadWebIconFonts';

import 'react-native-get-random-values';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const iconFontsReady = useWebIconFonts();

  if (!iconFontsReady) {
    return null;
  }
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider>
          <ChatSettingsProvider>
          <AuthProvider>
            <RealtimeProvider>
              <PushNotificationRegistrar />
              <PresenceSyncRegistrar />
              <AppPrefetchRegistrar />
              <ReelUploadQueueRegistrar />
              <RootNavigator />
              <ReelUploadToast />
              <AudioExtractToast />
              <MomentUploadToast />
            </RealtimeProvider>
            <StatusBar style="auto" />
          </AuthProvider>
          </ChatSettingsProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}