/** Native picks usually include width/height; backend probes if still missing. */
export async function probeVideoDimensions(
  _uri: string
): Promise<{ width: number; height: number; duration?: number } | null> {
  return null;
}

/** Best-effort check for an audio track in a local video file. */
export async function probeVideoHasAudio(_uri: string): Promise<boolean> {
  return true;
}
