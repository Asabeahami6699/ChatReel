import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AuthedRequest, requireAuth } from '../middleware/auth';

const router = Router();

const OG_TIMEOUT_MS = 5_000;

const previewCache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL_MS = 10 * 60_000;

function cleanExpired() {
  const now = Date.now();
  for (const [key, entry] of previewCache) {
    if (now - entry.ts > CACHE_TTL_MS) previewCache.delete(key);
  }
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { url } = z.object({ url: z.string().url() }).parse(req.query);

    cleanExpired();
    const cached = previewCache.get(url);
    if (cached) return res.json(cached.data);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), OG_TIMEOUT_MS);

      const fetchInit = {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ChatReelBot/1.0)',
          Accept: 'text/html',
        },
        redirect: 'follow' as const,
      };
      const response = await fetch(url, fetchInit as RequestInit);
      clearTimeout(timeout);

      if (!response.ok) {
        return res.json({ title: null, description: null, image: null, siteName: null });
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html')) {
        return res.json({ title: null, description: null, image: null, siteName: null });
      }

      // Only read the first 32KB to extract meta tags.
      const reader = response.body?.getReader();
      let html = '';
      if (reader) {
        let bytes = 0;
        while (bytes < 32_768) {
          const { done, value } = await reader.read();
          if (done) break;
          html += new TextDecoder().decode(value);
          bytes += value.length;
        }
        reader.cancel().catch(() => undefined);
      } else {
        const text = await response.text();
        html = text.slice(0, 32_768);
      }

      const getMeta = (property: string): string | null => {
        const patterns = [
          new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
          new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i'),
          new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
          new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, 'i'),
        ];
        for (const re of patterns) {
          const m = re.exec(html);
          if (m?.[1]) return m[1].trim();
        }
        return null;
      };

      const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;

      const data = {
        title: getMeta('og:title') ?? getMeta('twitter:title') ?? titleTag,
        description: getMeta('og:description') ?? getMeta('twitter:description') ?? getMeta('description'),
        image: getMeta('og:image') ?? getMeta('twitter:image'),
        siteName: getMeta('og:site_name') ?? new URL(url).hostname,
      };

      previewCache.set(url, { data, ts: Date.now() });
      return res.json(data);
    } catch (err) {
      return res.json({ title: null, description: null, image: null, siteName: null });
    }
  })
);

export default router;
