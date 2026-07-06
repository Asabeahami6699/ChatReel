import { Platform } from 'react-native';

/** Drop keyboard focus on web so aria-hidden inactive routes don't warn in DevTools. */
export function blurActiveElementOnWeb(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const el = document.activeElement;
  if (el instanceof HTMLElement && el !== document.body) {
    el.blur();
  }
}
