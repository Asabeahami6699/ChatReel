import { CommonActions } from '@react-navigation/native';
import {
  type MainTabName,
  rootNavigationRef,
} from './rootNavigation';
import { showAppToast } from '../lib/appToast';

type CallReturnTarget = {
  tab: MainTabName;
};

let returnTarget: CallReturnTarget | null = null;

function readFocusedMainTab(): MainTabName {
  try {
    if (!rootNavigationRef.isReady()) return 'Chats';
    const state = rootNavigationRef.getRootState();
    const main = state?.routes?.find((r) => r.name === 'Main');
    const tab = (main?.state as { index?: number; routes?: Array<{ name: string }> } | undefined)
      ?.routes?.[(main?.state as { index?: number } | undefined)?.index ?? 0]?.name;
    if (tab === 'Chats' || tab === 'Explore' || tab === 'Calls' || tab === 'Reels') {
      return tab;
    }
    const paramsScreen = (main?.params as { screen?: string } | undefined)?.screen;
    if (
      paramsScreen === 'Chats' ||
      paramsScreen === 'Explore' ||
      paramsScreen === 'Calls' ||
      paramsScreen === 'Reels'
    ) {
      return paramsScreen;
    }
  } catch {
    /* ignore */
  }
  return 'Chats';
}

/** Capture where the user was before the call UI took over (once per call session). */
export function rememberCallReturnPoint(tab?: MainTabName) {
  if (returnTarget) return;
  returnTarget = { tab: tab ?? readFocusedMainTab() };
}

/**
 * Leave ActiveCall / OutgoingCall and restore Main on the remembered tab
 * (fallback: Calls). No Close button required.
 */
export function leaveCallScreen(
  fallbackTab: MainTabName = 'Calls',
  toastMessage?: string | null
) {
  if (toastMessage) showAppToast(toastMessage);
  const tab = returnTarget?.tab ?? fallbackTab;
  returnTarget = null;

  if (!rootNavigationRef.isReady()) return;

  rootNavigationRef.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [
        {
          name: 'Main',
          params: { screen: tab },
        },
      ],
    })
  );
}
