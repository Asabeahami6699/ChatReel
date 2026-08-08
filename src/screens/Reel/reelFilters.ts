export type ReelFilterId =
  | 'none'
  | 'bw'
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
  | 'dream'
  // Snapchat-inspired style filters (color grade, not AR lenses)
  | 'glow'
  | 'bloom'
  | 'sky'
  | 'golden'
  | 'vintage'
  | 'pop'
  | 'frost'
  | 'neon'
  | 'sepia'
  | 'softbw'
  | 'drama'
  | 'peach'
  | 'ocean'
  | 'lavender'
  | 'honey'
  | 'ink';

export type ReelFilterPreset = {
  id: ReelFilterId;
  label: string;
  /** Semi-transparent overlay on top of the video/image preview. */
  overlay?: string;
  /** Base tint under the overlay for Snapchat-style circular chips. */
  swatch?: string;
  /** CSS/RN filter for true desaturation (B&W family). */
  cssFilter?: string;
};

export const REEL_FILTER_PRESETS: ReelFilterPreset[] = [
  { id: 'none', label: 'Normal', swatch: '#6b7280' },
  { id: 'bw', label: 'B&W', swatch: '#e5e5e5', cssFilter: 'grayscale(1)' },
  { id: 'warm', label: 'Warm', overlay: 'rgba(255, 170, 70, 0.18)', swatch: '#f59e0b' },
  { id: 'cool', label: 'Cool', overlay: 'rgba(70, 130, 255, 0.16)', swatch: '#3b82f6' },
  { id: 'vivid', label: 'Vivid', overlay: 'rgba(255, 60, 180, 0.1)', swatch: '#ec4899' },
  { id: 'glow', label: 'Glow', overlay: 'rgba(255, 255, 200, 0.2)', swatch: '#fde68a' },
  { id: 'bloom', label: 'Bloom', overlay: 'rgba(255, 180, 220, 0.22)', swatch: '#f9a8d4' },
  { id: 'sky', label: 'Sky', overlay: 'rgba(100, 180, 255, 0.2)', swatch: '#38bdf8' },
  { id: 'golden', label: 'Golden', overlay: 'rgba(255, 190, 60, 0.22)', swatch: '#fbbf24' },
  { id: 'sunset', label: 'Sunset', overlay: 'rgba(255, 90, 40, 0.2)', swatch: '#f97316' },
  { id: 'peach', label: 'Peach', overlay: 'rgba(255, 170, 130, 0.22)', swatch: '#fdba74' },
  { id: 'rose', label: 'Rose', overlay: 'rgba(255, 120, 160, 0.18)', swatch: '#fb7185' },
  { id: 'lavender', label: 'Lavender', overlay: 'rgba(180, 140, 255, 0.2)', swatch: '#c4b5fd' },
  { id: 'dream', label: 'Dream', overlay: 'rgba(180, 140, 255, 0.16)', swatch: '#a78bfa' },
  { id: 'neon', label: 'Neon', overlay: 'rgba(0, 255, 180, 0.14)', swatch: '#34d399' },
  { id: 'mint', label: 'Mint', overlay: 'rgba(80, 220, 160, 0.16)', swatch: '#6ee7b7' },
  { id: 'ocean', label: 'Ocean', overlay: 'rgba(20, 90, 180, 0.22)', swatch: '#2563eb' },
  { id: 'arctic', label: 'Arctic', overlay: 'rgba(160, 220, 255, 0.18)', swatch: '#bae6fd' },
  { id: 'frost', label: 'Frost', overlay: 'rgba(220, 240, 255, 0.28)', swatch: '#e0f2fe' },
  { id: 'fade', label: 'Fade', overlay: 'rgba(240, 220, 180, 0.22)', swatch: '#d6d3d1' },
  { id: 'vintage', label: 'Vintage', overlay: 'rgba(180, 140, 80, 0.24)', swatch: '#a8a29e' },
  { id: 'sepia', label: 'Sepia', overlay: 'rgba(160, 110, 50, 0.35)', swatch: '#92400e' },
  { id: 'honey', label: 'Honey', overlay: 'rgba(255, 200, 80, 0.2)', swatch: '#f59e0b' },
  { id: 'ember', label: 'Ember', overlay: 'rgba(255, 60, 20, 0.16)', swatch: '#ef4444' },
  { id: 'pop', label: 'Pop', overlay: 'rgba(255, 40, 120, 0.12)', swatch: '#f43f5e' },
  { id: 'cinema', label: 'Cinema', overlay: 'rgba(40, 20, 0, 0.2)', swatch: '#44403c' },
  { id: 'drama', label: 'Drama', overlay: 'rgba(20, 0, 40, 0.22)', swatch: '#1e1b4b' },
  { id: 'clarity', label: 'Clarity', overlay: 'rgba(255, 255, 255, 0.08)', swatch: '#f8fafc' },
  { id: 'mono', label: 'Mono', swatch: '#9ca3af', cssFilter: 'grayscale(1)' },
  {
    id: 'softbw',
    label: 'Soft B&W',
    swatch: '#d1d5db',
    cssFilter: 'grayscale(1) contrast(0.92) brightness(1.05)',
  },
  {
    id: 'noir',
    label: 'Noir',
    overlay: 'rgba(0, 0, 0, 0.22)',
    swatch: '#111827',
    cssFilter: 'grayscale(1) contrast(1.25)',
  },
  {
    id: 'ink',
    label: 'Ink',
    overlay: 'rgba(0, 0, 0, 0.32)',
    swatch: '#0f172a',
    cssFilter: 'grayscale(1) contrast(1.4) brightness(0.92)',
  },
];

export function getReelFilterOverlay(id: ReelFilterId | string | undefined | null): string | null {
  if (!id || id === 'none') return null;
  return REEL_FILTER_PRESETS.find((p) => p.id === id)?.overlay ?? null;
}

export function getReelFilterCssFilter(id: ReelFilterId | string | undefined | null): string | null {
  if (!id || id === 'none') return null;
  return REEL_FILTER_PRESETS.find((p) => p.id === id)?.cssFilter ?? null;
}

export function getReelFilterSwatch(id: ReelFilterId | string | undefined | null): string {
  if (!id) return '#6b7280';
  return REEL_FILTER_PRESETS.find((p) => p.id === id)?.swatch ?? '#6b7280';
}
