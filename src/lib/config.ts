// Environment configuration for frontend.
// Set EXPO_PUBLIC_* in .env at the project root, then restart: npx expo start -c
//
// Web dev: Metro injects EXPO_PUBLIC_* into process.env (see metro.config.js).
// Native: same + app.config.js → extra via expo-constants.

import Constants from 'expo-constants';
import { normalizeDevApiUrl } from './devServer';

type PublicExtra = {
  apiUrl?: string;
  webUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

function getExtraFromManifest(): PublicExtra {
  const manifest = Constants.expoConfig ?? Constants.manifest;
  if (!manifest || typeof manifest !== 'object') {
    return {};
  }
  const extra = (manifest as { extra?: PublicExtra }).extra;
  return extra && typeof extra === 'object' ? extra : {};
}

const manifestExtra = getExtraFromManifest();

// Static `process.env.EXPO_PUBLIC_*` access is required so Metro/babel can collect these keys.
const API_URL =
  manifestExtra.apiUrl ??
  process.env.EXPO_PUBLIC_API_URL ??
  'http://localhost:3001';

function normalizeApiUrlForPlatform(url: string): string {
  return normalizeDevApiUrl(url);
}

const SUPABASE_URL =
  manifestExtra.supabaseUrl ??
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  '';

const SUPABASE_ANON_KEY =
  manifestExtra.supabaseAnonKey ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  '';

const WEB_URL =
  manifestExtra.webUrl ??
  process.env.EXPO_PUBLIC_WEB_URL ??
  'https://chat-reel.vercel.app';

export const config = {
  apiUrl: normalizeApiUrlForPlatform(API_URL).replace(/\/$/, ''),
  webUrl: WEB_URL.replace(/\/$/, ''),
  supabaseUrl: SUPABASE_URL,
  supabaseAnonKey: SUPABASE_ANON_KEY,
};
