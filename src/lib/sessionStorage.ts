import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';

const SESSION_KEY = '@chatapp_session';

export type StoredSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: User;
};

export const sessionStorage = {
  async save(session: Session | null) {
    if (!session) {
      await AsyncStorage.removeItem(SESSION_KEY);
      return;
    }
    const payload: StoredSession = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      user: session.user,
    };
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  },

  async load(): Promise<StoredSession | null> {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredSession;
    } catch {
      return null;
    }
  },

  async clear() {
    await AsyncStorage.removeItem(SESSION_KEY);
  },
};
