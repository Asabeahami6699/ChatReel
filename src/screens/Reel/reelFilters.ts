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
  | 'ink'
  // WebGL pipeline / AR lenses
  | 'beauty'
  | 'smooth'
  | 'pixelate'
  | 'swirl'
  | 'dog_ears'
  | 'cat_ears'
  | 'crown'
  | 'sunglasses'
  | 'big_eyes'
  | 'rainbow_vomit';

export type ReelFilterPreset = {
  id: ReelFilterId;
  label: string;
  /** Semi-transparent overlay on top of the video/image preview (native fallback). */
  overlay?: string;
  /** Base tint under the overlay for Snapchat-style circular chips. */
  swatch?: string;
  /**
   * CSS filter applied to media (web). Required for a visible grade —
   * overlays alone are too subtle on photos.
   */
  cssFilter?: string;
};

export const REEL_FILTER_PRESETS: ReelFilterPreset[] = [
  { id: 'none', label: 'Normal', swatch: '#6b7280' },
  {
    id: 'bw',
    label: 'B&W',
    swatch: '#e5e5e5',
    cssFilter: 'grayscale(1)',
  },
  {
    id: 'warm',
    label: 'Warm',
    overlay: 'rgba(255, 140, 40, 0.22)',
    swatch: '#f59e0b',
    cssFilter: 'sepia(0.35) saturate(1.25) brightness(1.05)',
  },
  {
    id: 'cool',
    label: 'Cool',
    overlay: 'rgba(70, 130, 255, 0.2)',
    swatch: '#3b82f6',
    cssFilter: 'saturate(1.1) hue-rotate(195deg) brightness(1.02)',
  },
  {
    id: 'vivid',
    label: 'Vivid',
    overlay: 'rgba(255, 60, 180, 0.12)',
    swatch: '#ec4899',
    cssFilter: 'saturate(1.7) contrast(1.15)',
  },
  {
    id: 'glow',
    label: 'Glow',
    overlay: 'rgba(255, 255, 200, 0.28)',
    swatch: '#fde68a',
    cssFilter: 'brightness(1.12) contrast(0.95) saturate(1.15)',
  },
  {
    id: 'bloom',
    label: 'Bloom',
    overlay: 'rgba(255, 160, 210, 0.28)',
    swatch: '#f9a8d4',
    cssFilter: 'saturate(1.35) brightness(1.08) contrast(0.96)',
  },
  {
    id: 'sky',
    label: 'Sky',
    overlay: 'rgba(80, 170, 255, 0.24)',
    swatch: '#38bdf8',
    cssFilter: 'saturate(1.2) hue-rotate(175deg) brightness(1.05)',
  },
  {
    id: 'golden',
    label: 'Golden',
    overlay: 'rgba(255, 180, 40, 0.28)',
    swatch: '#fbbf24',
    cssFilter: 'sepia(0.45) saturate(1.4) brightness(1.08)',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    overlay: 'rgba(255, 80, 30, 0.28)',
    swatch: '#f97316',
    cssFilter: 'sepia(0.4) saturate(1.5) hue-rotate(-15deg) contrast(1.08)',
  },
  {
    id: 'peach',
    label: 'Peach',
    overlay: 'rgba(255, 160, 120, 0.28)',
    swatch: '#fdba74',
    cssFilter: 'sepia(0.25) saturate(1.3) brightness(1.06)',
  },
  {
    id: 'rose',
    label: 'Rose',
    overlay: 'rgba(255, 100, 150, 0.24)',
    swatch: '#fb7185',
    cssFilter: 'saturate(1.25) hue-rotate(-20deg) brightness(1.04)',
  },
  {
    id: 'lavender',
    label: 'Lavender',
    overlay: 'rgba(170, 130, 255, 0.26)',
    swatch: '#c4b5fd',
    cssFilter: 'saturate(1.15) hue-rotate(240deg) brightness(1.03)',
  },
  {
    id: 'dream',
    label: 'Dream',
    overlay: 'rgba(180, 140, 255, 0.22)',
    swatch: '#a78bfa',
    cssFilter: 'saturate(0.85) brightness(1.1) contrast(0.9)',
  },
  {
    id: 'neon',
    label: 'Neon',
    overlay: 'rgba(0, 255, 180, 0.18)',
    swatch: '#34d399',
    cssFilter: 'saturate(1.8) contrast(1.2) hue-rotate(100deg)',
  },
  {
    id: 'mint',
    label: 'Mint',
    overlay: 'rgba(60, 220, 160, 0.22)',
    swatch: '#6ee7b7',
    cssFilter: 'saturate(1.25) hue-rotate(110deg) brightness(1.05)',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    overlay: 'rgba(20, 80, 180, 0.28)',
    swatch: '#2563eb',
    cssFilter: 'saturate(1.2) hue-rotate(190deg) contrast(1.1) brightness(0.95)',
  },
  {
    id: 'arctic',
    label: 'Arctic',
    overlay: 'rgba(160, 220, 255, 0.26)',
    swatch: '#bae6fd',
    cssFilter: 'saturate(0.7) brightness(1.12) contrast(1.05) hue-rotate(180deg)',
  },
  {
    id: 'frost',
    label: 'Frost',
    overlay: 'rgba(220, 240, 255, 0.35)',
    swatch: '#e0f2fe',
    cssFilter: 'saturate(0.55) brightness(1.15) contrast(0.92)',
  },
  {
    id: 'fade',
    label: 'Fade',
    overlay: 'rgba(240, 220, 180, 0.28)',
    swatch: '#d6d3d1',
    cssFilter: 'saturate(0.65) contrast(0.88) brightness(1.08)',
  },
  {
    id: 'vintage',
    label: 'Vintage',
    overlay: 'rgba(180, 140, 80, 0.3)',
    swatch: '#a8a29e',
    cssFilter: 'sepia(0.55) contrast(0.95) brightness(0.98)',
  },
  {
    id: 'sepia',
    label: 'Sepia',
    overlay: 'rgba(160, 110, 50, 0.32)',
    swatch: '#92400e',
    cssFilter: 'sepia(1) contrast(1.05)',
  },
  {
    id: 'honey',
    label: 'Honey',
    overlay: 'rgba(255, 190, 60, 0.26)',
    swatch: '#f59e0b',
    cssFilter: 'sepia(0.5) saturate(1.35) brightness(1.06)',
  },
  {
    id: 'ember',
    label: 'Ember',
    overlay: 'rgba(255, 50, 10, 0.22)',
    swatch: '#ef4444',
    cssFilter: 'saturate(1.4) contrast(1.15) hue-rotate(-10deg) brightness(0.98)',
  },
  {
    id: 'pop',
    label: 'Pop',
    overlay: 'rgba(255, 40, 120, 0.16)',
    swatch: '#f43f5e',
    cssFilter: 'saturate(1.85) contrast(1.2)',
  },
  {
    id: 'cinema',
    label: 'Cinema',
    overlay: 'rgba(40, 20, 0, 0.28)',
    swatch: '#44403c',
    cssFilter: 'contrast(1.2) saturate(0.85) brightness(0.92)',
  },
  {
    id: 'drama',
    label: 'Drama',
    overlay: 'rgba(20, 0, 40, 0.28)',
    swatch: '#1e1b4b',
    cssFilter: 'contrast(1.35) saturate(0.9) brightness(0.9)',
  },
  {
    id: 'clarity',
    label: 'Clarity',
    overlay: 'rgba(255, 255, 255, 0.1)',
    swatch: '#f8fafc',
    cssFilter: 'contrast(1.2) saturate(1.05) brightness(1.04)',
  },
  {
    id: 'mono',
    label: 'Mono',
    swatch: '#9ca3af',
    cssFilter: 'grayscale(1)',
  },
  {
    id: 'softbw',
    label: 'Soft B&W',
    swatch: '#d1d5db',
    cssFilter: 'grayscale(1) contrast(0.92) brightness(1.05)',
  },
  {
    id: 'noir',
    label: 'Noir',
    overlay: 'rgba(0, 0, 0, 0.28)',
    swatch: '#111827',
    cssFilter: 'grayscale(1) contrast(1.25)',
  },
  {
    id: 'ink',
    label: 'Ink',
    overlay: 'rgba(0, 0, 0, 0.36)',
    swatch: '#0f172a',
    cssFilter: 'grayscale(1) contrast(1.4) brightness(0.92)',
  },
  // WebGL shader / AR presets (applied via FilterPipeline on web)
  {
    id: 'beauty',
    label: 'Beauty',
    swatch: '#fbcfe8',
    cssFilter: 'brightness(1.08) saturate(1.1) contrast(0.95)',
  },
  {
    id: 'smooth',
    label: 'Smooth',
    swatch: '#fce7f3',
    cssFilter: 'brightness(1.06) contrast(0.92)',
  },
  {
    id: 'pixelate',
    label: 'Pixel',
    swatch: '#a3e635',
    cssFilter: 'contrast(1.2) saturate(1.3)',
  },
  {
    id: 'swirl',
    label: 'Swirl',
    swatch: '#818cf8',
    cssFilter: 'hue-rotate(90deg) saturate(1.4)',
  },
  { id: 'dog_ears', label: 'Dog', swatch: '#fbbf24' },
  { id: 'cat_ears', label: 'Cat', swatch: '#fb923c' },
  { id: 'crown', label: 'Crown', swatch: '#facc15' },
  { id: 'sunglasses', label: 'Shades', swatch: '#334155' },
  { id: 'big_eyes', label: 'Big Eyes', swatch: '#67e8f9' },
  { id: 'rainbow_vomit', label: 'Rainbow', swatch: '#c084fc' },
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
