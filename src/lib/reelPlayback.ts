import type { ReelDTO, ReelMediaDTO } from './api';

/** Strip `#t=` media fragments — they break cache/fetch on some browsers. */
export function stripMediaFragment(url: string): string {
  const hash = url.indexOf('#');
  return hash >= 0 ? url.slice(0, hash) : url;
}

export function isHlsUrl(url: string): boolean {
  return /\.m3u8(\?|$)/i.test(url) || url.includes('mpegurl');
}

export function isImageReelUrl(url: string): boolean {
  return /\.(jpe?g|png|webp|gif|heic)(\?|$)/i.test(url) || /^data:image\//i.test(url);
}

export function isImageMime(mime?: string | null): boolean {
  return Boolean(mime && mime.startsWith('image/'));
}

export function getReelMediaItems(reel: ReelDTO): ReelMediaDTO[] {
  if (reel.media?.length) return reel.media;
  return [
    {
      id: reel.id,
      reel_id: reel.id,
      position: 0,
      media_url: reel.video_url,
      media_type: isImageReelUrl(reel.video_url) ? 'image' : 'video',
      thumbnail_url: reel.thumbnail_url,
      duration: reel.duration,
      width: reel.width,
      height: reel.height,
      hls_url: reel.hls_url,
      transcode_status: reel.transcode_status,
      playback_url: reel.playback_url,
    },
  ];
}

export function getMediaPlaybackUrl(
  item: Pick<ReelMediaDTO, 'media_url' | 'hls_url' | 'transcode_status' | 'playback_url'>,
  cachedLocalUri?: string
): string {
  if (cachedLocalUri) return stripMediaFragment(cachedLocalUri);
  if (item.playback_url) return stripMediaFragment(item.playback_url);
  if (item.transcode_status === 'ready' && item.hls_url) return stripMediaFragment(item.hls_url);
  return stripMediaFragment(item.media_url);
}

/** Prefer HLS when ready, otherwise MP4. Local cache wins if provided. */
export type ReelPlaybackSource = Pick<
  ReelDTO,
  'video_url' | 'hls_url' | 'transcode_status' | 'playback_url'
>;

export function getReelPlaybackUrl(reel: ReelPlaybackSource, cachedLocalUri?: string): string {
  if (cachedLocalUri) return stripMediaFragment(cachedLocalUri);
  if (reel.playback_url) return stripMediaFragment(reel.playback_url);
  if (reel.transcode_status === 'ready' && reel.hls_url) return stripMediaFragment(reel.hls_url);
  return stripMediaFragment(reel.video_url);
}
