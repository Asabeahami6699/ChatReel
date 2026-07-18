import { CommonActions, createNavigationContainerRef } from '@react-navigation/native';
import type { CallDTO } from '../lib/api';
import { openCallSession } from '../screens/Call/callPipBridge';

export type MainTabName = 'Chats' | 'Explore' | 'Calls' | 'Reels';

export type RootStackParamList = {
  Main: undefined;
  Invite: { token: string };
  PostReel: undefined;
  ReelPreview: { reelId: string };
  OutgoingCall: { call: CallDTO; token: string; url: string };
  ActiveCall: { call: CallDTO; token: string; url: string };
};

export const rootNavigationRef = createNavigationContainerRef<RootStackParamList>();

/** Jump to a main tab (and optional nested stack screen) from anywhere in the app. */
/** Open group invite flow (App stack — requires signed-in user). */
export function navigateToInvite(token: string, attempt = 0) {
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('Invite', { token });
    return;
  }
  if (attempt < 40) {
    setTimeout(() => navigateToInvite(token, attempt + 1), 50);
  } else {
    console.warn('[navigation] root not ready for Invite');
  }
}

export function navigateMainTab(
  tab: MainTabName,
  nested?: { screen: string; params?: Record<string, unknown> },
  attempt = 0
) {
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.dispatch(
      CommonActions.navigate({
        name: 'Main',
        params: nested ? { screen: tab, params: nested } : { screen: tab },
      })
    );
    return;
  }
  if (attempt < 40) {
    setTimeout(() => navigateMainTab(tab, nested, attempt + 1), 50);
  } else {
    console.warn('[navigation] root not ready for Main tab');
  }
}

/**
 * Start an outgoing call — opens ActiveCallLayer over Main (LiveKit connects
 * while ringing so both sides meet as soon as accept lands).
 */
export function navigateToOutgoingCall(
  params: RootStackParamList['OutgoingCall'],
  attempt = 0
) {
  void import('./callSessionNav').then((m) => m.rememberCallReturnPoint());
  if (rootNavigationRef.isReady()) {
    replaceWithActiveCall(params);
    return;
  }
  if (attempt < 30) {
    setTimeout(() => navigateToOutgoingCall(params, attempt + 1), 50);
  } else {
    console.warn('[navigation] root not ready for OutgoingCall');
  }
}

export function navigateToActiveCall(params: RootStackParamList['ActiveCall']) {
  replaceWithActiveCall(params);
}

/**
 * Show in-call UI via ActiveCallLayer (outside the stack). Keeps Main mounted
 * underneath so minimize can expose it without tearing down LiveKit.
 */
export function replaceWithActiveCall(params: RootStackParamList['ActiveCall']) {
  void import('./callSessionNav').then((m) => {
    m.rememberCallReturnPoint();
    m.ensureMainUnderCallLayer();
  });
  const token = typeof params.token === 'string' ? params.token : String(params.token ?? '');
  openCallSession({
    call: params.call,
    token,
    url: params.url,
  });
}
