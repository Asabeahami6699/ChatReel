import { env } from '../config/env';
import type { ReelRow } from '../services/reels.service';

/** Rewrite Supabase storage URLs through an optional CDN origin (e.g. Cloudflare). */
export function applyReelsCdnUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const cdn = env.reelsCdnUrl?.trim();
  if (!cdn) return url;
  try {
    const source = new URL(url);
    const base = new URL(cdn.replace(/\/$/, ''));
    return `${base.origin}${source.pathname}${source.search}`;
  } catch {
    return url;
  }
}

export function getReelPlaybackUrl(reel: Pick<ReelRow, 'video_url' | 'hls_url' | 'transcode_status'>): string {
  const hls =
    reel.transcode_status === 'ready' && reel.hls_url ? applyReelsCdnUrl(reel.hls_url) : null;
  const mp4 = applyReelsCdnUrl(reel.video_url);
  return hls ?? mp4 ?? reel.video_url;
}

export function withCdnReelUrls<T extends ReelRow>(reel: T): T & { playback_url: string } {
  const playback_url = getReelPlaybackUrl(reel);
  return {
    ...reel,
    video_url: applyReelsCdnUrl(reel.video_url) ?? reel.video_url,
    hls_url: applyReelsCdnUrl(reel.hls_url) ?? reel.hls_url,
    thumbnail_url: applyReelsCdnUrl(reel.thumbnail_url) ?? reel.thumbnail_url,
    playback_url,
  };
}
