/**
 * Native: lazy-load @livekit/react-native so a missing dev build fails at
 * runtime with a clear message instead of crashing on import.
 *
 * `Track` comes from `livekit-client` — @livekit/react-native does not re-export it.
 */
export type LiveKitModule = typeof import('@livekit/react-native') & {
  Track: typeof import('livekit-client').Track;
};

let cached: LiveKitModule | null = null;
let attempted = false;
let lastError: string | null = null;

export function getLiveKit(): LiveKitModule | null {
  if (cached) return cached;
  if (attempted) return null;
  attempted = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@livekit/react-native') as typeof import('@livekit/react-native');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Track } = require('livekit-client') as typeof import('livekit-client');
    if (!Track?.Source) {
      lastError = 'livekit-client Track.Source unavailable';
      return null;
    }
    cached = Object.assign(mod, { Track }) as LiveKitModule;
    return cached;
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
