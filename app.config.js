// app.config.js
import 'dotenv/config';

export default ({ config }) => {
  return {
    ...config,
    name: 'chatApp',
    slug: 'chatApp',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/splash.jpg',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.yourcompany.chatapp',
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      package: 'com.yourcompany.chatapp',
    },
    web: {
      favicon: './assets/favicon.png',
    },
    scheme: 'chatapp',
    extra: {
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      eas: {
        projectId: "c406c637-2a75-42ec-929b-712a3a497034"   // ← THIS LINE
      }
    },
    plugins: [
      // Correct: expo-image-picker with config
      [
        'expo-image-picker',
        {
          photosPermission: 'Allow access to pick group avatars.',
        },
      ],
      // Correct: react-native-libsodium as a separate string entry
      'react-native-libsodium',
    ],
  };
};