// src/lib/supabase.ts
import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import Constants from 'expo-constants'

const expoExtra = Constants.expoConfig?.extra ?? {}

const supabaseUrl = expoExtra.EXPO_PUBLIC_SUPABASE_URL as string
const supabaseAnonKey = expoExtra.EXPO_PUBLIC_SUPABASE_ANON_KEY as string

// ✅ Single client with stable Auth config
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, // Keeps the user logged in
    autoRefreshToken: true, // Handles refresh automatically
    detectSessionInUrl: false, // Avoids redirect loops in native apps
  },
})
