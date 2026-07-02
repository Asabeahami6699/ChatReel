/**
 * Web voice notes: concatenating WebM blobs by bytes produces invalid audio.
 * For multi-segment recordings, use the most recent segment (pause/resume on web).
 */
export async function mergeVoiceSegments(uris: string[]): Promise<string | null> {
  if (uris.length === 0) return null;
  return uris[uris.length - 1];
}
