import { Router } from 'express';
import { z } from 'zod';
import { createHash } from 'crypto';
import { asyncHandler, AuthedRequest, requireAuth } from '../middleware/auth';

const router = Router();

const cache = new Map<string, { data: { translatedText: string; detectedSourceLanguage?: string }; ts: number }>();
const CACHE_TTL_MS = 30 * 60_000;
const TIMEOUT_MS = 8_000;

function cleanExpired() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.ts > CACHE_TTL_MS) cache.delete(key);
  }
}

/** Map profile locale codes to MyMemory-friendly language codes. */
function toMyMemoryLang(code: string): string {
  const base = code.trim().toLowerCase().split(/[-_]/)[0] || 'en';
  const aliases: Record<string, string> = {
    tw: 'ak', // Twi → Akan (closest supported)
    zh: 'zh-CN',
  };
  return aliases[base] ?? base;
}

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z
      .object({
        text: z.string().min(1).max(5000),
        to: z.string().min(2).max(16),
        from: z.string().min(2).max(16).optional(),
      })
      .parse(req.body);

    const target = toMyMemoryLang(body.to);
    const source = body.from ? toMyMemoryLang(body.from) : 'auto';
    const cacheKey = createHash('sha256')
      .update(`${source}|${target}|${body.text}`)
      .digest('hex');

    cleanExpired();
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached.data);

    const langpair = `${source}|${target}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(body.text)}&langpair=${encodeURIComponent(langpair)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) {
        return res.status(502).json({ error: 'Translation service unavailable' });
      }
      const json = (await response.json()) as {
        responseData?: { translatedText?: string };
        responseStatus?: number;
        responseDetails?: string;
      };
      const translatedText = json.responseData?.translatedText?.trim();
      if (!translatedText || json.responseStatus !== 200) {
        return res.status(502).json({
          error: json.responseDetails || 'Could not translate text',
        });
      }
      const data = {
        translatedText,
        detectedSourceLanguage: source === 'auto' ? undefined : source,
      };
      cache.set(cacheKey, { data, ts: Date.now() });
      return res.json(data);
    } catch (err) {
      clearTimeout(timeout);
      return res.status(502).json({
        error: err instanceof Error ? err.message : 'Translation failed',
      });
    }
  })
);

export default router;
