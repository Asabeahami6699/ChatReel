import { useAuth } from '../hooks/useAuth';
import { useKeys } from '../hooks/useKeys';

/** Ensures the signed-in user has identity/prekeys published for E2E DMs. */
export function KeysRegistrar() {
  const { user } = useAuth();
  useKeys(user?.id ?? '');
  return null;
}
