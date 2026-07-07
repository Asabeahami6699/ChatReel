import { useEffect } from 'react';
import { setReelPlaybackGate } from '../lib/reelPlaybackBridge';

/** Registers a playback gate while `active` is true (e.g. modal open). */
export function useReelPlaybackGate(id: string, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    setReelPlaybackGate(id, true);
    return () => setReelPlaybackGate(id, false);
  }, [id, active]);
}
