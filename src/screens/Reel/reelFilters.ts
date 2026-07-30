export type ReelFilterId =
  | 'none'
  | 'warm'
  | 'cool'
  | 'vivid'
  | 'fade'
  | 'mono'
  | 'noir'
  | 'cinema'
  | 'sunset'
  | 'arctic'
  | 'rose'
  | 'ember'
  | 'mint'
  | 'clarity'
  | 'dream';

export type ReelFilterPreset = {
  id: ReelFilterId;
  label: string;
  /** Semi-transparent overlay on top of the video/image preview. */
  overlay?: string;
};

export const REEL_FILTER_PRESETS: ReelFilterPreset[] = [
  { id: 'none', label: 'Normal' },
  { id: 'warm', label: 'Warm', overlay: 'rgba(255, 170, 70, 0.18)' },
  { id: 'cool', label: 'Cool', overlay: 'rgba(70, 130, 255, 0.16)' },
  { id: 'vivid', label: 'Vivid', overlay: 'rgba(255, 60, 180, 0.1)' },
  { id: 'fade', label: 'Fade', overlay: 'rgba(240, 220, 180, 0.22)' },
  { id: 'mono', label: 'Mono', overlay: 'rgba(128, 128, 128, 0.45)' },
  { id: 'noir', label: 'Noir', overlay: 'rgba(0, 0, 0, 0.28)' },
  { id: 'cinema', label: 'Cinema', overlay: 'rgba(40, 20, 0, 0.2)' },
  { id: 'sunset', label: 'Sunset', overlay: 'rgba(255, 90, 40, 0.2)' },
  { id: 'arctic', label: 'Arctic', overlay: 'rgba(160, 220, 255, 0.18)' },
  { id: 'rose', label: 'Rose', overlay: 'rgba(255, 120, 160, 0.18)' },
  { id: 'ember', label: 'Ember', overlay: 'rgba(255, 60, 20, 0.16)' },
  { id: 'mint', label: 'Mint', overlay: 'rgba(80, 220, 160, 0.16)' },
  { id: 'clarity', label: 'Clarity', overlay: 'rgba(255, 255, 255, 0.08)' },
  { id: 'dream', label: 'Dream', overlay: 'rgba(180, 140, 255, 0.16)' },
];

export function getReelFilterOverlay(id: ReelFilterId | string | undefined | null): string | null {
  if (!id || id === 'none') return null;
  return REEL_FILTER_PRESETS.find((p) => p.id === id)?.overlay ?? null;
}
