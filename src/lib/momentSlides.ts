import type { MomentSlideDTO } from './api';

/** Drop duplicate slide ids (can happen when feed entries are merged). */
export function dedupeMomentSlides(slides: MomentSlideDTO[]): MomentSlideDTO[] {
  const seen = new Set<string>();
  const out: MomentSlideDTO[] = [];
  for (const slide of slides) {
    if (seen.has(slide.id)) continue;
    seen.add(slide.id);
    out.push(slide);
  }
  return out;
}
