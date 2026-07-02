/**
 * Native: lazy-load @livekit/react-native so a missing dev build fails at
 * runtime with a clear message instead of crashing on import.
 */
export type LiveKitModule = typeof import('@livekit/react-native');

let cached: LiveKitModule | null = null;
let attempted = false;
let lastError: string | null = null;

export function getLiveKit(): LiveKitModule | null {
  if (cached) return cached;
  if (attempted) return null;
  attempted = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@livekit/react-native') as LiveKitModule;
    cached = mod;
    return mod;
  } catch (err) {
    lastError = (err as Error)?.message ?? 'unknown';
    return null;
  }
}

export function isLiveKitAvailable(): boolean {
  return getLiveKit() != null;
}

export function getLiveKitError(): string | null {
  return lastError;
}
