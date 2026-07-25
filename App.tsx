// App.tsx
import React from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from './src/context/AuthContext';
import { ChatSettingsProvider } from './src/context/ChatSettingsContext';
import { ThemedPaperProvider } from './src/theme/ThemedAppProviders';
import { RealtimeProvider } from './src/components/RealtimeProvider';
import { PushNotificationRegistrar } from './src/components/PushNotificationRegistrar';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ReelUploadToast } from './src/components/ReelUploadToast';
import { ReelUploadQueueRegistrar } from './src/components/ReelUploadQueueRegistrar';
import { AppPrefetchRegistrar } from './src/components/AppPrefetchRegistrar';
import { ChatListRealtimeRegistrar } from './src/components/ChatListRealtimeRegistrar';
import { AudioExtractToast } from './src/components/AudioExtractToast';
import { RingtoneSaveToast } from './src/components/RingtoneSaveToast';
import { MomentUploadToast } from './src/components/MomentUploadToast';
import { ConfirmToastHost } from './src/components/ConfirmToastHost';
import { AppToastHost } from './src/components/AppToastHost';
import { PresenceSyncRegistrar } from './src/components/PresenceSyncRegistrar';
import { MessageOutboxFlushRegistrar } from './src/components/MessageOutboxFlushRegistrar';
import { KeysRegistrar } from './src/components/KeysRegistrar';
import { ChatSocketRegistrar } from './src/components/ChatSocketRegistrar';
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
        <AuthProvider>
          <ChatSettingsProvider>
            <ThemedPaperProvider>
              <RealtimeProvider>
                <PushNotificationRegistrar />
                <ChatSocketRegistrar />
                <PresenceSyncRegistrar />
                <KeysRegistrar />
                <MessageOutboxFlushRegistrar />
                <AppPrefetchRegistrar />
                <ChatListRealtimeRegistrar />
                <ReelInboxRealtimeRegistrar />
                <ReelUploadQueueRegistrar />
                <RootNavigator />
                <ReelUploadToast />
                <AudioExtractToast />
                <RingtoneSaveToast />
                <MomentUploadToast />
                <ConfirmToastHost />
                <AppToastHost />
              </RealtimeProvider>
            </ThemedPaperProvider>
          </ChatSettingsProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
