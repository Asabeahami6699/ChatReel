/**
 * Block screenshots / screen recording while sensitive content (view-once) is open.
 * Uses expo-screen-capture when available (native builds). No-op on web.
 */
import { Platform } from 'react-native';
import { showAppToast } from './appToast';

const VIEW_ONCE_KEY = 'chatreel_view_once';
const CALL_KEY = 'chatreel_call_privacy';

type ScreenCaptureModule = {
  preventScreenCaptureAsync: (key?: string) => Promise<void>;
  allowScreenCaptureAsync: (key?: string) => Promise<void>;
  addScreenshotListener?: (listener: () => void) => { remove: () => void };
};

function loadScreenCapture(): ScreenCaptureModule | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-screen-capture') as ScreenCaptureModule;
  } catch {
    return null;
  }
}

let screenshotSub: { remove: () => void } | null = null;

export async function preventViewOnceCapture(): Promise<void> {
  const mod = loadScreenCapture();
  if (!mod) return;
  try {
    await mod.preventScreenCaptureAsync(VIEW_ONCE_KEY);
    if (!screenshotSub && typeof mod.addScreenshotListener === 'function') {
      screenshotSub = mod.addScreenshotListener(() => {
        showAppToast('Screenshots are blocked for view once media');
      });
    }
  } catch {
    /* native module missing in Expo Go / older builds */
  }
}

export async function allowViewOnceCapture(): Promise<void> {
  const mod = loadScreenCapture();
  if (!mod) return;
  try {
    screenshotSub?.remove();
    screenshotSub = null;
    await mod.allowScreenCaptureAsync(VIEW_ONCE_KEY);
  } catch {
    /* ignore */
  }
}

export async function preventCallCapture(): Promise<void> {
  const mod = loadScreenCapture();
  if (!mod) return;
  try {
    await mod.preventScreenCaptureAsync(CALL_KEY);
  } catch {
    /* ignore */
  }
}

export async function allowCallCapture(): Promise<void> {
  const mod = loadScreenCapture();
  if (!mod) return;
  try {
    await mod.allowScreenCaptureAsync(CALL_KEY);
  } catch {
    /* ignore */
  }
}
