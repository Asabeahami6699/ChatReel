import type { ReelDTO } from '../lib/api';
import { isImageReelUrl } from './reelPlayback';

/** Best thumbnail URL for a reel grid tile. */
export function getReelGridThumbnail(
  reel: ReelDTO,
  generated?: Record<string, string>
): string | null {
  if (reel.thumbnail_url) return reel.thumbnail_url;
  if (generated?.[reel.id]) return generated[reel.id];
  const firstMedia = reel.media?.[0];
  if (firstMedia?.thumbnail_url) return firstMedia.thumbnail_url;
  if (firstMedia?.media_type === 'image') return firstMedia.media_url;
  if (isImageReelUrl(reel.video_url)) return reel.video_url;
  return null;
}

/** Highlight query matches in caption text for search results. */
export function splitCaptionHighlight(
  caption: string,
  query: string
): Array<{ text: string; match: boolean }> {
  const q = query.trim();
  if (!q) return [{ text: caption, match: false }];
  const lower = caption.toLowerCase();
  const needle = q.toLowerCase();
  const parts: Array<{ text: string; match: boolean }> = [];
  let start = 0;
  let idx = lower.indexOf(needle, start);
  while (idx !== -1) {
    if (idx > start) parts.push({ text: caption.slice(start, idx), match: false });
    parts.push({ text: caption.slice(idx, idx + needle.length), match: true });
    start = idx + needle.length;
    idx = lower.indexOf(needle, start);
  }
  if (start < caption.length) parts.push({ text: caption.slice(start), match: false });
  return parts.length ? parts : [{ text: caption, match: false }];
}
