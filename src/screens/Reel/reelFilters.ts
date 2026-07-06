export type ReelFilterId = 'none' | 'warm' | 'cool' | 'vivid' | 'fade' | 'mono';

export type ReelFilterPreset = {
  id: ReelFilterId;
  label: string;
  /** Semi-transparent overlay on top of the video preview. */
  overlay?: string;
};

export const REEL_FILTER_PRESETS: ReelFilterPreset[] = [
  { id: 'none', label: 'Normal' },
  { id: 'warm', label: 'Warm', overlay: 'rgba(255, 170, 70, 0.18)' },
  { id: 'cool', label: 'Cool', overlay: 'rgba(70, 130, 255, 0.16)' },
  { id: 'vivid', label: 'Vivid', overlay: 'rgba(255, 60, 180, 0.1)' },
  { id: 'fade', label: 'Fade', overlay: 'rgba(240, 220, 180, 0.22)' },
  { id: 'mono', label: 'Mono', overlay: 'rgba(128, 128, 128, 0.45)' },
];

export function getReelFilterOverlay(id: ReelFilterId | undefined | null): string | null {
  if (!id || id === 'none') return null;
  return REEL_FILTER_PRESETS.find((p) => p.id === id)?.overlay ?? null;
}
