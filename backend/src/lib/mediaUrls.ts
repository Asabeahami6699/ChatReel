import { env } from '../config/env';

/**
 * Rewrite Supabase storage public URLs through MEDIA_CDN_BASE_URL (or REELS_CDN_URL).
 * DB keeps raw Supabase URLs; CDN is applied on API responses.
 */
export function applyMediaCdnUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const cdn = (env.mediaCdnUrl || env.reelsCdnUrl || '').trim();
  if (!cdn) return url;
  try {
    const source = new URL(url);
    // Only rewrite Supabase storage (and same-pathname CDN re-enters).
    if (
      !/\/storage\/v1\/object\//i.test(source.pathname) &&
      !source.hostname.includes('supabase')
    ) {
      return url;
    }
    const base = new URL(cdn.replace(/\/$/, ''));
    return `${base.origin}${source.pathname}${source.search}`;
  } catch {
    return url;
  }
}

export function withCdnMediaFields<T extends Record<string, unknown>>(row: T): T {
  const next: Record<string, unknown> = { ...row };
  for (const key of ['file_url', 'audio_url', 'media_url', 'thumbnail_url', 'avatar_url']) {
    if (typeof next[key] === 'string') {
      next[key] = applyMediaCdnUrl(next[key] as string) ?? next[key];
    }
  }
  return next as T;
}
