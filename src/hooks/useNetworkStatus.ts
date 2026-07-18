// src/hooks/useNetworkStatus.ts
import { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';

function connected(state: { isConnected: boolean | null; isInternetReachable: boolean | null }) {
  if (!state.isConnected) return false;
  // null = unknown (common on web) — treat as online and let send/catch decide.
  if (state.isInternetReachable === false) return false;
  return true;
}

export const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    void NetInfo.fetch().then((state) => setIsOnline(connected(state)));
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(connected(state));
    });

    return unsubscribe;
  }, []);

  return isOnline;
};