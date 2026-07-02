const path = require('path');
const { withMainApplication } = require('@expo/config-plugins');

// Ensure .env is loaded when Expo evaluates this file (Node). Metro web does not always
// inline EXPO_PUBLIC_* from .env into the bundle; extra + expo-constants fixes that.
require('@expo/env').load(path.resolve(__dirname));

/** Keep LiveKit native init across `expo prebuild`. */
function withLiveKitSetup(config) {
  return withMainApplication(config, (modConfig) => {
    let src = modConfig.modResults.contents;
    if (src.includes('LiveKitReactNative.setup')) {
      return modConfig;
    }
    if (!src.includes('import com.livekit.reactnative.LiveKitReactNative')) {
      src = src.replace(
        'import expo.modules.ApplicationLifecycleDispatcher',
        [
          'import com.livekit.reactnative.LiveKitReactNative',
          'import com.livekit.reactnative.audio.AudioType',
          '',
          'import expo.modules.ApplicationLifecycleDispatcher',
        ].join('\n')
      );
    }
    src = src.replace(
      'super.onCreate()',
      'super.onCreate()\n    LiveKitReactNative.setup(this, AudioType.CommunicationAudioType())'
    );
    modConfig.modResults.contents = src;
    return modConfig;
  });
}

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: 'ChatReel',
  slug: 'chatapp',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'yourapp',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  icon: './assets/favIconChat.png',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'cover',
    backgroundColor: '#1a2f7a',
  },
  web: {
    favicon: './assets/favIconChat.png',
  },
  android: {
    package: 'com.chatapp',
    adaptiveIcon: {
      foregroundImage: './assets/favIconChat.png',
      backgroundColor: '#4f46e5',
    },
  },
  ios: {
    bundleIdentifier: 'com.chatapp',
    icon: './assets/favIconChat.png',
  },
  plugins: [
    [
      'expo-splash-screen',
      {
        backgroundColor: '#1a2f7a',
        image: './assets/splash.png',
        resizeMode: 'cover',
        imageWidth: 280,
        android: {
          backgroundColor: '#1a2f7a',
          image: './assets/splash.png',
          imageWidth: 280,
        },
        ios: {
          backgroundColor: '#1a2f7a',
          image: './assets/splash.png',
          resizeMode: 'cover',
        },
      },
    ],
    'expo-audio',
    'expo-video',
    withLiveKitSetup,
    'expo-secure-store',
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow ChatReel to access your photos.',
        cameraPermission: 'Allow ChatReel to access your camera.',
      },
    ],
    [
      'react-native-vision-camera',
      {
        cameraPermissionText: 'Allow ChatReel to access your camera for QR codes and photos.',
        enableMicrophonePermission: true,
        microphonePermissionText: 'Allow ChatReel to access your microphone for voice messages.',
      },
    ],
    'expo-notifications',
  ],
  extra: {
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
    },
    apiUrl:
      process.env.EXPO_PUBLIC_API_URL ?? process.env.API_URL ?? 'http://localhost:3001',
    supabaseUrl:
      process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
    supabaseAnonKey:
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '',
  },
};
