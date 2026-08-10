import type { ReelChatTarget } from '../lib/shareReelToChat';
import { openChat } from './chatNavigationBridge';
import { rootNavigationRef } from './rootNavigation';

export function navigateToChat(target: ReelChatTarget) {
  const params = {
    chatId: target.chatId,
    chatType: target.chatType,
    chatName: target.chatName,
    avatarUrl: target.avatarUrl,
  };

  if (!openChat(params)) {
    console.warn('[navigation] Could not open chat');
  }
}

export function navigateToReelPreview(reelId: string) {
  const go = () => {
    if (!rootNavigationRef.isReady()) {
      setTimeout(go, 80);
      return;
    }
    try {
      rootNavigationRef.navigate('ReelPreview', { reelId });
    } catch {
      setTimeout(() => {
        if (rootNavigationRef.isReady()) {
          rootNavigationRef.navigate('ReelPreview', { reelId });
        }
      }, 200);
    }
  };
  go();
}
