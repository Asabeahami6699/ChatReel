import React, { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { ensureSupabaseSession } from '../lib/ensureSupabaseSession';
import { onSupabaseAuthChange } from '../lib/supabase';
import { startRealtimeHub, stopRealtimeHub } from '../lib/realtimeHub';

/** Starts one Supabase realtime channel for the signed-in user (all tables). */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!user?.id) {
      stopRealtimeHub();
      return;
    }

    let cancelled = false;

    const connect = async (force = false) => {
      const session = await ensureSupabaseSession();
      if (!session || cancelled) {
        if (!session) console.warn('[RealtimeProvider] no valid session for realtime');
        return;
      }
      await startRealtimeHub(user.id, { force });
    };

    void connect().catch((err) => {
      console.error('[RealtimeProvider] failed to start hub:', err);
    });

    const offAuth = onSupabaseAuthChange(() => {
      void connect(true).catch((err) => {
        console.error('[RealtimeProvider] hub reconnect failed:', err);
      });
    });

    return () => {
      cancelled = true;
      offAuth();
      stopRealtimeHub();
    };
  }, [user?.id, loading]);

  return <>{children}</>;
}
