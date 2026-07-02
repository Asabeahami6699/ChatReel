import { useAuth } from '../hooks/useAuth';
import { usePushNotifications } from '../hooks/usePushNotifications';

/** Registers Expo push token with backend when user is signed in. */
export function PushNotificationRegistrar() {
  const { user } = useAuth();
  usePushNotifications(user?.id);
  return null;
}
