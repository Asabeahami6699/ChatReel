import type { FilterConfig, FilterType } from './filterPipeline';
import type { ReelFilterId } from '../screens/Reel/reelFilters';

/**
 * Map UI filter chips (ReelFilterId) onto WebGL pipeline configs.
 * AR / shader-native ids pass through; CSS-era grades map to the closest shader.
 */
const DIRECT: Partial<Record<string, FilterConfig>> = {
  none: { type: 'none' },
  beauty: { type: 'beauty', intensity: 0.7 },
  smooth: { type: 'smooth', intensity: 0.8 },
  vintage: { type: 'vintage', intensity: 0.9 },
  bw: { type: 'bw', intensity: 1 },
  sepia: { type: 'sepia', intensity: 0.9 },
  neon: { type: 'neon', intensity: 0.8 },
  pixelate: { type: 'pixelate', intensity: 0.6 },
  swirl: { type: 'swirl', intensity: 0.5 },
  dog_ears: { type: 'dog_ears' },
  cat_ears: { type: 'cat_ears' },
  crown: { type: 'crown' },
  sunglasses: { type: 'sunglasses' },
  big_eyes: { type: 'big_eyes' },
  rainbow_vomit: { type: 'rainbow_vomit' },
  // chip aliases
  dog: { type: 'dog_ears' },
  cat: { type: 'cat_ears' },
  glasses: { type: 'sunglasses' },
  bigEyes: { type: 'big_eyes' },
  rainbow: { type: 'rainbow_vomit' },
};

const GRADE_MAP: Partial<Record<string, FilterConfig>> = {
  mono: { type: 'bw', intensity: 1 },
  softbw: { type: 'bw', intensity: 0.85 },
  noir: { type: 'bw', intensity: 1 },
  ink: { type: 'bw', intensity: 1 },
  warm: { type: 'sepia', intensity: 0.45 },
  golden: { type: 'sepia', intensity: 0.55 },
  honey: { type: 'sepia', intensity: 0.5 },
  peach: { type: 'sepia', intensity: 0.35 },
  sunset: { type: 'vintage', intensity: 0.75 },
  fade: { type: 'vintage', intensity: 0.55 },
  glow: { type: 'beauty', intensity: 0.55 },
  bloom: { type: 'beauty', intensity: 0.65 },
  dream: { type: 'smooth', intensity: 0.7 },
  clarity: { type: 'smooth', intensity: 0.4 },
  cool: { type: 'neon', intensity: 0.35 },
  sky: { type: 'neon', intensity: 0.4 },
  mint: { type: 'neon', intensity: 0.35 },
  ocean: { type: 'neon', intensity: 0.45 },
  arctic: { type: 'bw', intensity: 0.55 },
  frost: { type: 'bw', intensity: 0.4 },
  vivid: { type: 'neon', intensity: 0.55 },
  pop: { type: 'neon', intensity: 0.65 },
  rose: { type: 'sepia', intensity: 0.4 },
  lavender: { type: 'vintage', intensity: 0.5 },
  ember: { type: 'vintage', intensity: 0.7 },
  cinema: { type: 'vintage', intensity: 0.65 },
  drama: { type: 'bw', intensity: 0.9 },
};

export function reelFilterToPipeline(
  filterId?: ReelFilterId | string | null
): FilterConfig {
  if (!filterId || filterId === 'none') return { type: 'none' };
  return (
    DIRECT[filterId] ??
    GRADE_MAP[filterId] ?? { type: 'none' }
  );
}

export function isPipelineOverlayFilter(filterId?: string | null): boolean {
  const t = reelFilterToPipeline(filterId).type;
  return (
    t === 'dog_ears' ||
    t === 'cat_ears' ||
    t === 'crown' ||
    t === 'sunglasses' ||
    t === 'big_eyes' ||
    t === 'rainbow_vomit'
  );
}

export function isIdentityPipelineFilter(filterId?: string | null): boolean {
  return reelFilterToPipeline(filterId).type === 'none';
}

export type { FilterType, FilterConfig };
