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
import { ChatListRealtimeRegistrar } from './src/components/ChatListRealtimeRegistrar';
import { AudioExtractToast } from './src/components/AudioExtractToast';
import { MomentUploadToast } from './src/components/MomentUploadToast';
import { ConfirmToastHost } from './src/components/ConfirmToastHost';
import { AppToastHost } from './src/components/AppToastHost';
import { PresenceSyncRegistrar } from './src/components/PresenceSyncRegistrar';
import { ReelInboxRealtimeRegistrar } from './src/components/ReelInboxRealtimeRegistrar';
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
          <AuthProvider>
          <ChatSettingsProvider>
            <RealtimeProvider>
              <PushNotificationRegistrar />
              <PresenceSyncRegistrar />
              <AppPrefetchRegistrar />
              <ChatListRealtimeRegistrar />
              <ReelInboxRealtimeRegistrar />
              <ReelUploadQueueRegistrar />
              <RootNavigator />
              <ReelUploadToast />
              <AudioExtractToast />
              <MomentUploadToast />
              <ConfirmToastHost />
              <AppToastHost />
            </RealtimeProvider>
            <StatusBar style="auto" />
          </ChatSettingsProvider>
          </AuthProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}