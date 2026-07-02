import { Platform } from 'react-native';

/** Web has no RCTAnimation; using the native driver logs a warning and falls back anyway. */
export const USE_NATIVE_DRIVER = Platform.OS !== 'web';
