import { supabaseAdmin } from '../lib/supabaseAdmin';

/**
 * Best-effort cleanup of moment media in the `chat-files` bucket.
 *
 * Safety rails:
 * - only objects under the app-owned `moments/` prefix are ever touched
 *   (moment uploads go to `moments/…` and `moments/thumbs/…`); reel-type
 *   moments point at the reels bucket and are ignored automatically.
 * - URLs still referenced by other rows (chat messages created from moment
 *   replies, other moment slides) are skipped.
 */

const CHAT_FILES_URL_RE = /\/storage\/v1\/object\/(?:public|sign)\/chat-files\/(.+?)(?:\?|$)/;

/** Object path for a chat-files URL under the moments/ prefix, else null. */
export function extractMomentMediaPath(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = CHAT_FILES_URL_RE.exec(url);
  if (!m?.[1]) return null;
  const path = decodeURIComponent(m[1]);
  return path.startsWith('moments/') ? path : null;
}

/** URLs from `candidates` that are still referenced elsewhere in the DB. */
async function findReferencedUrls(candidates: string[]): Promise<Set<string>> {
  const referenced = new Set<string>();

  const { data: msgRows, error: msgErr } = await supabaseAdmin
    .from('messages')
    .select('file_url')
    .in('file_url', candidates);
  if (msgErr) {
    // Can't verify — treat everything as referenced rather than risk data loss.
    console.warn('[moments] message reference check failed:', msgErr.message);
    return new Set(candidates);
  }
  for (const row of msgRows ?? []) {
    if (row.file_url) referenced.add(row.file_url as string);
  }

  // Archive table may not exist yet; ignore failures (no archive → no refs).
  const { data: archRows } = await supabaseAdmin
    .from('messages_archive')
    .select('file_url')
    .in('file_url', candidates);
  for (const row of archRows ?? []) {
    if (row.file_url) referenced.add(row.file_url as string);
  }

  // Other (not yet deleted) moment slides sharing the same object.
  const [byMedia, byThumb] = await Promise.all([
    supabaseAdmin.from('moments').select('media_url').in('media_url', candidates),
    supabaseAdmin.from('moments').select('thumbnail_url').in('thumbnail_url', candidates),
  ]);
  for (const row of byMedia.data ?? []) {
    if (row.media_url) referenced.add(row.media_url as string);
  }
  for (const row of byThumb.data ?? []) {
    if (row.thumbnail_url) referenced.add(row.thumbnail_url as string);
  }

  return referenced;
}

/**
 * Remove moment media objects for the given URLs. Call AFTER the moment rows
 * are deleted so the reference check sees only surviving rows. Never throws.
 */
export async function cleanupMomentMedia(
  urls: Array<string | null | undefined>
): Promise<void> {
  try {
    const pathByUrl = new Map<string, string>();
    for (const url of urls) {
      const path = extractMomentMediaPath(url);
      if (url && path) pathByUrl.set(url, path);
    }
    if (pathByUrl.size === 0) return;

    const referenced = await findReferencedUrls([...pathByUrl.keys()]);
    const paths = [...pathByUrl.entries()]
      .filter(([url]) => !referenced.has(url))
      .map(([, path]) => path);
    if (paths.length === 0) return;

    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const { error } = await supabaseAdmin.storage.from('chat-files').remove(chunk);
      if (error) console.warn('[moments] storage remove failed:', error.message);
    }
  } catch (e) {
    console.warn('[moments] storage cleanup failed:', (e as Error).message);
  }
}
