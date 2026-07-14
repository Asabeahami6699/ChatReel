import { CommonActions, createNavigationContainerRef } from '@react-navigation/native';
import type { CallDTO } from '../lib/api';

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
export function navigateMainTab(
  tab: MainTabName,
  nested?: { screen: string; params?: Record<string, unknown> }
) {
  if (!rootNavigationRef.isReady()) {
    console.warn('[navigation] root not ready for Main tab');
    return;
  }
  rootNavigationRef.dispatch(
    CommonActions.navigate({
      name: 'Main',
      params: nested ? { screen: tab, params: nested } : { screen: tab },
    })
  );
}

export function navigateToOutgoingCall(
  params: RootStackParamList['OutgoingCall'],
  attempt = 0
) {
  void import('./callSessionNav').then((m) => m.rememberCallReturnPoint());
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('OutgoingCall', params);
    return;
  }
  if (attempt < 30) {
    setTimeout(() => navigateToOutgoingCall(params, attempt + 1), 50);
  } else {
    console.warn('[navigation] root not ready for OutgoingCall');
  }
}

export function navigateToActiveCall(params: RootStackParamList['ActiveCall']) {
  void import('./callSessionNav').then((m) => m.rememberCallReturnPoint());
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('ActiveCall', params);
  } else {
    console.warn('[navigation] root not ready for ActiveCall');
  }
}

export function replaceWithActiveCall(params: RootStackParamList['ActiveCall']) {
  void import('./callSessionNav').then((m) => m.rememberCallReturnPoint());
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.reset({
      index: 1,
      routes: [
        { name: 'Main' },
        { name: 'ActiveCall', params },
      ],
    });
  } else {
    navigateToActiveCall(params);
  }
}
