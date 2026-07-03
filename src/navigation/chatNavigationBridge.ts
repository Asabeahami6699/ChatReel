import { CommonActions } from '@react-navigation/native';
import { Platform } from 'react-native';
import { MOBILE_BREAKPOINT } from './navigationUtils';
import { rootNavigationRef } from './rootNavigation';

export type OpenChatParams = {
  chatId: string;
  chatType: 'individual' | 'group';
  chatName: string;
  avatarUrl?: string;
};

type ChatOpener = (params: OpenChatParams) => void;

/** Desktop split layout: opens chat in the main panel. */
let desktopChatOpener: ChatOpener | null = null;
/** Mobile / narrow web: opens chat via the main tab navigator. */
let mobileChatOpener: ChatOpener | null = null;
let beforeChatNavigate: (() => void) | null = null;

export function registerDesktopChatOpener(fn: ChatOpener) {
  desktopChatOpener = fn;
}

export function unregisterDesktopChatOpener() {
  desktopChatOpener = null;
}

export function registerMobileChatOpener(fn: ChatOpener) {
  mobileChatOpener = fn;
}

export function unregisterMobileChatOpener() {
  mobileChatOpener = null;
}

export function registerBeforeChatNavigate(fn: () => void) {
  beforeChatNavigate = fn;
}

export function unregisterBeforeChatNavigate() {
  beforeChatNavigate = null;
}

export function isWebDesktopLayout(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    window.innerWidth >= MOBILE_BREAKPOINT
  );
}

function openMobileChat(params: OpenChatParams) {
  if (!rootNavigationRef.isReady()) {
    console.warn('[navigation] root not ready for chat');
    return;
  }
  rootNavigationRef.dispatch(
    CommonActions.navigate({
      name: 'Main',
      params: {
        screen: 'Chats',
        params: {
          screen: 'ChatRoom',
          params,
        },
      },
    })
  );
}

/** Open a chat room using the in-app navigator (works on mobile, web, and desktop split). */
export function openChat(params: OpenChatParams): boolean {
  beforeChatNavigate?.();

  if (isWebDesktopLayout()) {
    if (desktopChatOpener) {
      desktopChatOpener(params);
      return true;
    }
    console.warn('[navigation] desktop chat opener not registered');
    return false;
  }

  if (mobileChatOpener) {
    mobileChatOpener(params);
    return true;
  }

  openMobileChat(params);
  return true;
}
