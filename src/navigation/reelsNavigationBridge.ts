import type { NavigationContainerRef } from '@react-navigation/native';
import type { ReelsStackParamList } from './reelsNavigation';
import { navigateMainTab } from './rootNavigation';

type ReelsNav = NavigationContainerRef<ReelsStackParamList>;

let reelsNavRef: ReelsNav | null = null;

export function registerReelsNavigation(ref: ReelsNav | null) {
  reelsNavRef = ref;
}

/** Switch to Reels tab and open the inbox screen. */
export function openReelInboxFromPush() {
  navigateMainTab('Reels');
  const tryNav = (attempt = 0) => {
    if (reelsNavRef?.isReady()) {
      reelsNavRef.navigate('ReelTabs', { screen: 'ReelInbox' });
      return;
    }
    if (attempt < 40) setTimeout(() => tryNav(attempt + 1), 50);
  };
  setTimeout(() => tryNav(), 100);
}

/** Switch to Reels and open a reel detail if possible; else root ReelPreview. */
export function openReelFromPush(reelId: string) {
  navigateMainTab('Reels');
  const tryNav = (attempt = 0) => {
    if (reelsNavRef?.isReady()) {
      reelsNavRef.navigate('ReelDetail', { reelId });
      return;
    }
    if (attempt < 40) {
      setTimeout(() => tryNav(attempt + 1), 50);
      return;
    }
    void import('./navigateToChat').then((m) => m.navigateToReelPreview(reelId));
  };
  setTimeout(() => tryNav(), 100);
}
