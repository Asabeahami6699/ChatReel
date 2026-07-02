import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { api } from '../lib/api';
import { sessionStorage } from '../lib/sessionStorage';
import { ensureSupabaseSession } from '../lib/ensureSupabaseSession';
import { clearSupabaseSession } from '../lib/supabase';

type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (
    email: string,
    password: string
  ) => Promise<{
    data?: { user: User | null; session: Session | null };
    error?: { message: string } | null;
  }>;
  signUp: (
    email: string,
    password: string,
    metadata?: { display_name?: string }
  ) => Promise<{
    data?: { user: User | null; session: Session | null };
    error?: { message: string } | null;
  }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const stored = await sessionStorage.load();
        const session = await ensureSupabaseSession();
        if (session?.user) {
          setUser(session.user);
          setSession(session);
        }
      } catch (err) {
        console.error('[Auth] session restore failed:', err);
        await sessionStorage.clear();
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  const persistSession = async (newSession: Session | null) => {
    if (!newSession) {
      await sessionStorage.clear();
      await clearSupabaseSession();
      setSession(null);
      setUser(null);
      return;
    }

    await sessionStorage.save(newSession);
    await ensureSupabaseSession();
    setSession(newSession);
    setUser(newSession.user);
  };

  const signUp = async (email: string, password: string, metadata?: { display_name?: string }) => {
    setLoading(true);
    try {
      const { session: newSession, user: newUser } = await api.auth.register(
        email,
        password,
        metadata?.display_name
      );

      if (newSession) {
        await persistSession(newSession);
      } else if (newUser) {
        setUser(newUser);
      }

      return { data: { user: newUser, session: newSession }, error: null };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Registration failed';
      return { data: { user: null, session: null }, error: { message } };
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      const { session: newSession, user: newUser } = await api.auth.login(email, password);

      if (!newSession) {
        return {
          data: { user: newUser, session: null },
          error: { message: 'No session returned. Confirm your email if signup requires verification.' },
        };
      }

      await persistSession(newSession);

      return { data: { user: newUser, session: newSession }, error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      return { data: { user: null, session: null }, error: { message } };
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await persistSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

export const useAuthContext = useAuth;
