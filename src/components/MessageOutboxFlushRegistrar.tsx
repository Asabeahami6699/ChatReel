import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { flushMessageOutbox } from '../lib/flushMessageOutbox';
import { useAuth } from '../hooks/useAuth';

/**
 * Flushes the durable message outbox (text + media) when connectivity returns,
 * even if the relevant chat room is not open.
 */
export function MessageOutboxFlushRegistrar() {
  const { user } = useAuth();
  const flushing = useRef(false);

  useEffect(() => {
    if (!user?.id) return;

    const run = async () => {
      if (flushing.current) return;
      flushing.current = true;
      try {
        await flushMessageOutbox(undefined, user.id);
      } finally {
        flushing.current = false;
      }
    };

    void NetInfo.fetch().then((s) => {
      if (s.isConnected && s.isInternetReachable !== false) void run();
    });

    const unsub = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        void run();
      }
    });

    return unsub;
  }, [user?.id]);

  return null;
}
