import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Android uses softwareKeyboardLayoutMode: 'resize' (app.config.js).
 * Extra KeyboardAvoidingView on Android fights resize; use manual inset as fallback.
 */
export function keyboardAvoidingBehavior(): 'padding' | undefined {
  return Platform.OS === 'ios' ? 'padding' : undefined;
}

export function keyboardAvoidingEnabled(): boolean {
  return Platform.OS === 'ios';
}

export function keyboardVerticalOffset(extra = 0): number {
  return Platform.OS === 'ios' ? extra : 0;
}

/** Manual bottom inset when OS resize / KAV is unreliable (Android + mobile web). */
export function useKeyboardBottomInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const vv = typeof window !== 'undefined' ? window.visualViewport : null;
      if (!vv) return;
      const update = () => {
        const gap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        setInset(gap);
      };
      update();
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
      return () => {
        vv.removeEventListener('resize', update);
        vv.removeEventListener('scroll', update);
      };
    }

    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvt, (e) => {
      if (Platform.OS === 'android') {
        setInset(e.endCoordinates?.height ?? 0);
      }
    });
    const hideSub = Keyboard.addListener(hideEvt, () => {
      if (Platform.OS === 'android') setInset(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return inset;
}

/** Subtract home-indicator inset so padding isn't doubled on notched Android devices. */
export function keyboardPaddingAboveSafeArea(
  keyboardInset: number,
  safeBottom: number
): number {
  if (keyboardInset <= 0) return 0;
  return Math.max(0, keyboardInset - safeBottom);
}
