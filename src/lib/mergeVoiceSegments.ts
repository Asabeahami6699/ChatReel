/**
 * TypeScript entry for platform-specific merge implementations.
 * Metro resolves `.native.ts` / `.web.ts` at bundle time.
 */
export async function mergeVoiceSegments(uris: string[]): Promise<string | null> {
  if (uris.length === 0) return null;
  return uris[uris.length - 1];
}
