import { usePresenceSync } from '../hooks/usePresenceSync';

/** Mount inside AuthProvider to sync Online/Offline globally. */
export function PresenceSyncRegistrar() {
  usePresenceSync();
  return null;
}
