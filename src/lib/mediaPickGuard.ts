/**
 * Patches expo-image-picker (and document-picker when present) so App Lock
 * does not engage while the system gallery/camera UI is open.
 */
import { Platform } from 'react-native';
import { beginPrivacyLockPause, endPrivacyLockPause } from './privacyLockPause';

let patched = false;

function wrapAsync<T extends (...args: never[]) => Promise<unknown>>(fn: T): T {
  const wrapped = (async (...args: Parameters<T>) => {
    beginPrivacyLockPause(2500);
    try {
      return await fn(...args);
    } finally {
      endPrivacyLockPause(2500);
    }
  }) as T;
  return wrapped;
}

export function installMediaPickLockGuard(): void {
  if (patched || Platform.OS === 'web') return;
  patched = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ImagePicker = require('expo-image-picker') as Record<string, unknown>;
    for (const key of [
      'launchImageLibraryAsync',
      'launchCameraAsync',
      'getMediaLibraryPermissionsAsync',
      'requestMediaLibraryPermissionsAsync',
      'requestCameraPermissionsAsync',
    ]) {
      const original = ImagePicker[key];
      if (typeof original === 'function') {
        ImagePicker[key] = wrapAsync(original as (...args: never[]) => Promise<unknown>);
      }
    }
  } catch {
    /* optional */
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const DocumentPicker = require('expo-document-picker') as Record<string, unknown>;
    const original = DocumentPicker.getDocumentAsync;
    if (typeof original === 'function') {
      DocumentPicker.getDocumentAsync = wrapAsync(
        original as (...args: never[]) => Promise<unknown>
      );
    }
  } catch {
    /* optional */
  }
}
