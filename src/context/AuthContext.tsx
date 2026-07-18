import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { api, onAuthExpired } from '../lib/api';
import { sessionStorage } from '../lib/sessionStorage';
import { ensureSupabaseSession } from '../lib/ensureSupabaseSession';
import { clearSupabaseSession } from '../lib/supabase';
import { clearUserLocalCaches } from '../lib/clearUserLocalCaches';

type AuthResult = {
  data?: { user: User | null; session: Session | null };
  error?: { message: string } | null;
};

type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isGuest: boolean;
  isAuthenticated: boolean;
  enterGuest: () => void;
  exitGuest: () => void;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (
    email: string,
    password: string,
    metadata?: { display_name?: string }
  ) => Promise<AuthResult>;
  sendPhoneOtp: (
    phone: string,
    mode: 'login' | 'register',
    display_name?: string
  ) => Promise<{ data?: { phone: string; phone_masked: string }; error?: { message: string } | null }>;
  verifyPhoneOtp: (
    phone: string,
    token: string,
    opts?: { display_name?: string; email?: string }
  ) => Promise<AuthResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const session = await ensureSupabaseSession();
        if (session?.user) {
          setUser(session.user);
          setSession(session);
          setIsGuest(false);
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

  useEffect(() => {
    return onAuthExpired(() => {
      void (async () => {
        await sessionStorage.clear();
        await clearSupabaseSession();
        setSession(null);
        setUser(null);
      })();
    });
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
    setIsGuest(false);
  };

  const enterGuest = useCallback(() => {
    setIsGuest(true);
  }, []);

  const exitGuest = useCallback(() => {
    setIsGuest(false);
  }, []);

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
        setIsGuest(false);
      }

      return { data: { user: newUser, session: newSession }, error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
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
          error: {
            message:
              'No session returned. Try again — if this persists, confirm the account email in Supabase Auth.',
          },
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

  const sendPhoneOtp = async (
    phone: string,
    mode: 'login' | 'register',
    display_name?: string
  ) => {
    setLoading(true);
    try {
      const res = await api.auth.sendPhoneOtp(phone, mode, display_name);
      return {
        data: { phone: res.phone, phone_masked: res.phone_masked },
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not send verification code';
      return { error: { message } };
    } finally {
      setLoading(false);
    }
  };

  const verifyPhoneOtp = async (
    phone: string,
    token: string,
    opts?: { display_name?: string; email?: string }
  ) => {
    setLoading(true);
    try {
      const { session: newSession, user: newUser } = await api.auth.verifyPhoneOtp(
        phone,
        token,
        opts
      );
      if (!newSession) {
        return {
          data: { user: newUser, session: null },
          error: { message: 'Verification succeeded but no session was returned.' },
        };
      }
      await persistSession(newSession);
      return { data: { user: newUser, session: newSession }, error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid verification code';
      return { data: { user: null, session: null }, error: { message } };
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    const uid = user?.id ?? session?.user?.id ?? null;
    await clearUserLocalCaches(uid);
    await persistSession(null);
    setIsGuest(false);
  };

  const isAuthenticated = Boolean(user && session);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isGuest,
        isAuthenticated,
        enterGuest,
        exitGuest,
        signIn,
        signUp,
        sendPhoneOtp,
        verifyPhoneOtp,
        signOut,
      }}
    >
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
