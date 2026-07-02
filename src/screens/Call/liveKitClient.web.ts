/**
 * Web bundle: LiveKit native SDK is not used. Calls UI can still load; joining
 * a room on web would need livekit-client (separate). For now we disable native
 * LiveKit so Metro does not pull @livekit/react-native into the web bundle.
 */
export type LiveKitModule = null;

export function getLiveKit(): LiveKitModule {
  return null;
}

export function isLiveKitAvailable(): boolean {
  return false;
}

export function getLiveKitError(): string | null {
  return 'Calls require a native build (Android/iOS). Web calling is not enabled yet.';
}
