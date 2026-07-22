import { CommonActions } from '@react-navigation/native';
import {
  type MainTabName,
  rootNavigationRef,
} from './rootNavigation';
import { showAppToast } from '../lib/appToast';
import { playCallEndTone } from '../lib/playCallEndTone';

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
 * Leave call UI and restore Main on the remembered tab (fallback: Calls).
 * Clears return target. Does not clear call pip — callers should clearCallPip first when ending.
 * Plays the call-ended tone so both sides hear it when either party hangs up.
 */
export function leaveCallScreen(
  fallbackTab: MainTabName = 'Calls',
  toastMessage?: string | null,
  opts?: { playEndTone?: boolean }
) {
  if (opts?.playEndTone !== false) {
    playCallEndTone();
  }
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

/** Ensure stack is on Main so ActiveCallLayer can cover / shrink over it. */
export function ensureMainUnderCallLayer(tab?: MainTabName) {
  if (!rootNavigationRef.isReady()) return;
  const preferredTab = tab ?? returnTarget?.tab ?? readFocusedMainTab();
  const route = rootNavigationRef.getCurrentRoute();
  if (route?.name === 'Main') return;

  rootNavigationRef.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [
        {
          name: 'Main',
          params: { screen: preferredTab },
        },
      ],
    })
  );
}

/** @deprecated Minimize no longer changes the stack — kept for any old callers. */
export function focusMainUnderFloatingCall(tab?: MainTabName) {
  ensureMainUnderCallLayer(tab);
}

/** @deprecated Expand only flips pip.minimized — ActiveCallLayer stays mounted. */
export function focusActiveCallOverMain() {
  /* no-op: callPipExpand updates minimized flag */
}
