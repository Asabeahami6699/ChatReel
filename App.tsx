// App.tsx
import React from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { AuthProvider } from './src/context/AuthContext';
import { ChatSettingsProvider } from './src/context/ChatSettingsContext';
import { AppChromeProvider } from './src/context/AppChromeContext';
import { AppLockProvider } from './src/context/AppLockContext';
import { ChatLockProvider } from './src/context/ChatLockContext';
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
import { MessageSyncCatchUpRegistrar } from './src/components/MessageSyncCatchUpRegistrar';
import { KeysRegistrar } from './src/components/KeysRegistrar';
import { ChatSocketRegistrar } from './src/components/ChatSocketRegistrar';
import { ReelInboxRealtimeRegistrar } from './src/components/ReelInboxRealtimeRegistrar';
import { AppLockGate } from './src/components/AppLockGate';
import { DeviceSessionRegistrar } from './src/components/DeviceSessionRegistrar';
import { useWebIconFonts } from './src/lib/loadWebIconFonts';
import { installMediaPickLockGuard } from './src/lib/mediaPickGuard';

import 'react-native-get-random-values';

SplashScreen.preventAutoHideAsync().catch(() => {});
installMediaPickLockGuard();

export default function App() {
  const iconFontsReady = useWebIconFonts();

  if (!iconFontsReady) {
    return null;
  }
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
        <SafeAreaProvider>
        <AuthProvider>
          <ChatSettingsProvider>
            <AppChromeProvider>
            <ThemedPaperProvider>
              <AppLockProvider>
                <ChatLockProvider>
                  <RealtimeProvider>
                    <PushNotificationRegistrar />
                    <ChatSocketRegistrar />
                    <PresenceSyncRegistrar />
                    <KeysRegistrar />
                    <DeviceSessionRegistrar />
                    <MessageOutboxFlushRegistrar />
                    <MessageSyncCatchUpRegistrar />
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
                    <AppLockGate />
                  </RealtimeProvider>
                </ChatLockProvider>
              </AppLockProvider>
            </ThemedPaperProvider>
            </AppChromeProvider>
          </ChatSettingsProvider>
        </AuthProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
