/**
 * Block screenshots / screen recording while sensitive content (view-once) is open.
 * Uses expo-screen-capture on native. Web cannot fully block OS capture — we blank
 * content on blur/visibility loss from the viewer instead.
 */
import { Platform } from 'react-native';
import { showAppToast } from './appToast';

const VIEW_ONCE_KEY = 'chatreel_view_once';
const CALL_KEY = 'chatreel_call_privacy';

type ScreenCaptureModule = {
  preventScreenCaptureAsync: (key?: string) => Promise<void>;
  allowScreenCaptureAsync: (key?: string) => Promise<void>;
  isAvailableAsync?: () => Promise<boolean>;
  enableAppSwitcherProtectionAsync?: (blurIntensity?: number) => Promise<void>;
  disableAppSwitcherProtectionAsync?: () => Promise<void>;
  addScreenshotListener?: (listener: () => void) => { remove: () => void };
  getPermissionsAsync?: () => Promise<{ granted: boolean; status: string }>;
  requestPermissionsAsync?: () => Promise<{ granted: boolean; status: string }>;
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

let viewOnceHoldCount = 0;
let callHoldCount = 0;
let screenshotSub: { remove: () => void } | null = null;
let appSwitcherOn = false;
let screenshotHandler: (() => void) | null = null;

async function ensureScreenshotPermission(mod: ScreenCaptureModule): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (!mod.getPermissionsAsync || !mod.requestPermissionsAsync) return true;
  try {
    const current = await mod.getPermissionsAsync();
    if (current.granted) return true;
    const next = await mod.requestPermissionsAsync();
    return next.granted;
  } catch {
    return false;
  }
}

function attachScreenshotListener(mod: ScreenCaptureModule): void {
  if (screenshotSub || typeof mod.addScreenshotListener !== 'function') return;
  screenshotSub = mod.addScreenshotListener(() => {
    showAppToast('Screenshots are blocked for view once media');
    screenshotHandler?.();
  });
}

export async function preventViewOnceCapture(options?: {
  onScreenshot?: () => void;
}): Promise<void> {
  if (options?.onScreenshot) {
    screenshotHandler = options.onScreenshot;
  }

  viewOnceHoldCount += 1;
  if (viewOnceHoldCount > 1) return;

  const mod = loadScreenCapture();
  if (!mod) return;

  try {
    if (mod.isAvailableAsync) {
      const ok = await mod.isAvailableAsync();
      if (!ok) return;
    }

    await mod.preventScreenCaptureAsync(VIEW_ONCE_KEY);

    if (
      Platform.OS === 'ios' &&
      typeof mod.enableAppSwitcherProtectionAsync === 'function'
    ) {
      await mod.enableAppSwitcherProtectionAsync(0.95);
      appSwitcherOn = true;
    }

    const permitted = await ensureScreenshotPermission(mod);
    if (permitted) {
      attachScreenshotListener(mod);
    }
  } catch {
    /* native module missing in Expo Go / older builds */
  }
}

export async function allowViewOnceCapture(): Promise<void> {
  viewOnceHoldCount = Math.max(0, viewOnceHoldCount - 1);
  if (viewOnceHoldCount > 0) return;

  screenshotHandler = null;
  const mod = loadScreenCapture();
  if (!mod) return;

  try {
    screenshotSub?.remove();
    screenshotSub = null;
    if (appSwitcherOn && typeof mod.disableAppSwitcherProtectionAsync === 'function') {
      await mod.disableAppSwitcherProtectionAsync();
      appSwitcherOn = false;
    }
    await mod.allowScreenCaptureAsync(VIEW_ONCE_KEY);
  } catch {
    /* ignore */
  }
}

export async function preventCallCapture(): Promise<void> {
  callHoldCount += 1;
  if (callHoldCount > 1) return;

  const mod = loadScreenCapture();
  if (!mod) return;
  try {
    await mod.preventScreenCaptureAsync(CALL_KEY);
  } catch {
    /* ignore */
  }
}

export async function allowCallCapture(): Promise<void> {
  callHoldCount = Math.max(0, callHoldCount - 1);
  if (callHoldCount > 0) return;

  const mod = loadScreenCapture();
  if (!mod) return;
  try {
    await mod.allowScreenCaptureAsync(CALL_KEY);
  } catch {
    /* ignore */
  }
}

/** True when running where OS-level capture blocking is available. */
export function isNativeCaptureGuardSupported(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}
