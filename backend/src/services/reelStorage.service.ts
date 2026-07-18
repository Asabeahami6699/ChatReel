import { supabaseAdmin } from '../lib/supabaseAdmin';

/**
 * Best-effort cleanup of every storage object a reel can own inside the
 * `reels` bucket: primary/media uploads, thumbnails, HLS segments
 * (`hls/<reelId>/…`), the sound-mux output (`mixed/<reelId>.mp4`) and
 * watermarked downloads (`downloads/<reelId>-*.mp4`).
 *
 * Only paths that clearly belong to this reel are touched — no broad sweeps.
 */

const REELS_URL_RE = /\/storage\/v1\/object\/(?:public|sign)\/reels\/(.+?)(?:\?|$)/;

/** Extract the object path from a reels-bucket public/signed URL, else null. */
export function extractReelsBucketPath(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = REELS_URL_RE.exec(url);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

async function removeChunked(paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const { error } = await supabaseAdmin.storage.from('reels').remove(chunk);
    if (error) console.warn('[reels] storage remove failed:', error.message);
  }
}

/** Fetch reel_media storage URLs for a reel (empty array if table/rows missing). */
export async function getReelMediaUrls(reelId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('reel_media')
    .select('media_url, thumbnail_url, hls_url')
    .eq('reel_id', reelId);
  if (error || !data) return [];
  const urls: string[] = [];
  for (const row of data) {
    if (row.media_url) urls.push(row.media_url as string);
    if (row.thumbnail_url) urls.push(row.thumbnail_url as string);
    if (row.hls_url) urls.push(row.hls_url as string);
  }
  return urls;
}

/**
 * Remove all storage objects belonging to `reelId`. `urls` should contain any
 * known media/thumbnail/HLS URLs (rows may already be deleted by cascade, so
 * callers capture them beforehand). Never throws.
 */
export async function cleanupReelStorage(
  reelId: string,
  urls: Array<string | null | undefined>
): Promise<void> {
  try {
    const paths = new Set<string>();
    for (const url of urls) {
      const p = extractReelsBucketPath(url);
      // index.m3u8 URLs resolve under hls/<reelId>/, handled by the prefix list below.
      if (p) paths.add(p);
    }

    // Known per-reel prefixes.
    paths.add(`mixed/${reelId}.mp4`);

    const { data: hlsFiles } = await supabaseAdmin.storage.from('reels').list(`hls/${reelId}`);
    for (const f of hlsFiles ?? []) {
      paths.add(`hls/${reelId}/${f.name}`);
    }

    const { data: downloads } = await supabaseAdmin.storage
      .from('reels')
      .list('downloads', { search: reelId });
    for (const f of downloads ?? []) {
      if (f.name.startsWith(`${reelId}-`)) paths.add(`downloads/${f.name}`);
    }

    if (paths.size > 0) {
      await removeChunked([...paths]);
    }
  } catch (e) {
    console.warn('[reels] storage cleanup failed:', (e as Error).message);
  }
}
