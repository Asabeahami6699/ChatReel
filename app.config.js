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
  owner: 'protocolgh',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'chatapp',
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
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/favIconChat.png',
      backgroundColor: '#4f46e5',
    },
    statusBar: {
      backgroundColor: '#f8f9fa',
      barStyle: 'dark-content',
    },
    /** We pad chat composer manually; pan avoids double-resize fights with SafeArea shell. */
    softwareKeyboardLayoutMode: 'pan',
    permissions: [
      'CAMERA',
      'RECORD_AUDIO',
      'MODIFY_AUDIO_SETTINGS',
      'READ_MEDIA_IMAGES',
      'READ_MEDIA_VIDEO',
      'READ_MEDIA_AUDIO',
      'READ_EXTERNAL_STORAGE',
      'POST_NOTIFICATIONS',
      'VIBRATE',
    ],
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON || undefined,
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          {
            scheme: 'https',
            host: 'chat-reel.vercel.app',
            pathPrefix: '/invite',
          },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  ios: {
    bundleIdentifier: 'com.chatapp',
    buildNumber: '1',
    icon: './assets/favIconChat.png',
    infoPlist: {
      NSAppleMusicUsageDescription:
        'Allow ChatReel to browse music on your device for reel sounds.',
      NSCameraUsageDescription:
        'Allow ChatReel to access your camera for photos, video, and QR codes.',
      NSMicrophoneUsageDescription:
        'Allow ChatReel to access your microphone for voice messages and calls.',
      NSPhotoLibraryUsageDescription:
        'Allow ChatReel to access your photo library.',
      NSPhotoLibraryAddUsageDescription:
        'Allow ChatReel to save media to your library.',
    },
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
      'expo-media-library',
      {
        photosPermission: 'Allow ChatReel to access your media library.',
        savePhotosPermission: 'Allow ChatReel to save media to your library.',
        isAccessMediaLocationEnabled: false,
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
    'expo-sqlite',
    '@react-native-community/datetimepicker',
  ],
  extra: {
    eas: {
      projectId:
        process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
        'f8e106cd-7d57-4cf7-b694-a038fea7fe3e',
    },
    apiUrl:
      process.env.EXPO_PUBLIC_API_URL ?? process.env.API_URL ?? 'http://localhost:3001',
    webUrl:
      process.env.EXPO_PUBLIC_WEB_URL ??
      process.env.WEB_URL ??
      'https://chat-reel.vercel.app',
    supabaseUrl:
      process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
    supabaseAnonKey:
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '',
  },
};
