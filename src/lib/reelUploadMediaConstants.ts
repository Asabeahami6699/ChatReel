export const REEL_PERSIST_URI_PREFIX = 'reel-persist://';

export function isPersistedReelUri(uri: string): boolean {
  return uri.startsWith(REEL_PERSIST_URI_PREFIX);
}
