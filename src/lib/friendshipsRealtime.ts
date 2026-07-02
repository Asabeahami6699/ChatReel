import { getRealtimeTopic, notifyRealtimeTopic } from './realtimeHub';

type Listener = () => void;

/** @deprecated profileId is unused; hub filters by current user profile. */
export function subscribeFriendshipsRealtime(
  _profileId: string,
  listener: Listener
): () => void {
  return getRealtimeTopic('friendships').subscribe(listener);
}

export function notifyFriendshipsListenersImmediate() {
  notifyRealtimeTopic('friendships');
}
