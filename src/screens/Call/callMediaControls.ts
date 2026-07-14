/**
 * Safe camera / speaker helpers for LiveKit calls.
 * Fail soft — never throw into the call UI.
 */

export type FacingMode = 'user' | 'environment';

/** Restart the local camera with the opposite facing mode when possible. */
export async function flipLocalCameraFacing(
  localParticipant: {
    getTrackPublication?: (source: unknown) =>
      | { track?: { restartTrack?: (opts: { facingMode: FacingMode }) => Promise<void> } | null }
      | undefined;
  } | null
  | undefined,
  cameraSource: unknown,
  current: FacingMode
): Promise<FacingMode | null> {
  try {
    const pub = localParticipant?.getTrackPublication?.(cameraSource);
    const track = pub?.track;
    if (!track?.restartTrack) return null;
    const next: FacingMode = current === 'user' ? 'environment' : 'user';
    await track.restartTrack({ facingMode: next });
    return next;
  } catch (err) {
    console.warn('[call] flip camera failed:', err);
    return null;
  }
}

/** Route audio to speaker or earpiece on native (best-effort). */
export async function setCallSpeakerOn(
  AudioSession: {
    selectAudioOutput?: (id: string) => Promise<void>;
    getAudioOutputs?: () => Promise<string[]>;
    configureAudio?: (config: Record<string, unknown>) => Promise<void>;
  } | null
  | undefined,
  speakerOn: boolean
): Promise<boolean> {
  if (!AudioSession) return false;
  try {
    const outputs = (await AudioSession.getAudioOutputs?.()) ?? [];
    if (speakerOn) {
      if (outputs.includes('speaker')) {
        await AudioSession.selectAudioOutput?.('speaker');
        return true;
      }
      if (outputs.includes('force_speaker')) {
        await AudioSession.selectAudioOutput?.('force_speaker');
        return true;
      }
    } else {
      if (outputs.includes('earpiece')) {
        await AudioSession.selectAudioOutput?.('earpiece');
        return true;
      }
      if (outputs.includes('default')) {
        await AudioSession.selectAudioOutput?.('default');
        return true;
      }
    }
    // Prefer explicit device selection; avoid configureAudio fallback (needs full android options).
    return false;
  } catch (err) {
    console.warn('[call] speaker toggle failed:', err);
    return false;
  }
}

export type CallConnQuality = 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';

export function normalizeConnQuality(raw: unknown): CallConnQuality {
  const s = String(raw ?? '').toLowerCase();
  if (s.includes('excellent')) return 'excellent';
  if (s.includes('good')) return 'good';
  if (s.includes('poor')) return 'poor';
  if (s.includes('lost')) return 'lost';
  return 'unknown';
}

export function connQualityLabel(q: CallConnQuality): string | null {
  if (q === 'poor') return 'Weak connection';
  if (q === 'lost') return 'Connection lost — reconnecting…';
  return null;
}
