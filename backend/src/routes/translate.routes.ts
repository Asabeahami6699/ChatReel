import { Router } from 'express';
import { z } from 'zod';
import { createHash } from 'crypto';
import { asyncHandler, AuthedRequest, requireAuth } from '../middleware/auth';

const router = Router();

const cache = new Map<
  string,
  { data: { translatedText: string; detectedSourceLanguage?: string }; ts: number }
>();
const CACHE_TTL_MS = 30 * 60_000;
const TIMEOUT_MS = 10_000;

function cleanExpired() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.ts > CACHE_TTL_MS) cache.delete(key);
  }
}

/** Normalize profile / BCP-47 codes for translation APIs. */
function normalizeLang(code: string): string {
  const base = code.trim().toLowerCase().split(/[-_]/)[0] || 'en';
  const aliases: Record<string, string> = {
    tw: 'ak', // Twi → Akan (closest widely supported)
    zh: 'zh-CN',
  };
  return aliases[base] ?? base;
}

function statusOk(status: unknown): boolean {
  return status === 200 || status === '200';
}

async function translateWithGoogle(
  text: string,
  to: string,
  from?: string
): Promise<{ translatedText: string; detectedSourceLanguage?: string }> {
  const sl = from && from !== 'auto' ? from : 'auto';
  const url =
    `https://translate.googleapis.com/translate_a/single` +
    `?client=gtx&sl=${encodeURIComponent(sl)}` +
    `&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'ChatReel/1.0' },
    } as RequestInit);
    if (!response.ok) {
      throw new Error(`Google translate HTTP ${response.status}`);
    }
    const json = (await response.json()) as unknown;
    // Shape: [[["translated","original",...],...], null, "detected", ...]
    if (!Array.isArray(json) || !Array.isArray(json[0])) {
      throw new Error('Unexpected Google translate response');
    }
    const chunks = json[0] as Array<unknown>;
    const translatedText = chunks
      .map((part) => (Array.isArray(part) && typeof part[0] === 'string' ? part[0] : ''))
      .join('')
      .trim();
    if (!translatedText) throw new Error('Empty Google translation');
    const detected =
      typeof json[2] === 'string' && json[2] ? json[2] : undefined;
    return { translatedText, detectedSourceLanguage: detected };
  } finally {
    clearTimeout(timeout);
  }
}

async function translateWithMyMemory(
  text: string,
  to: string,
  from: string
): Promise<{ translatedText: string; detectedSourceLanguage?: string }> {
  // MyMemory does NOT accept "auto" as source — always pass a real code.
  const source = from === 'auto' ? 'en' : from;
  const langpair = `${source}|${to}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal } as RequestInit);
    if (!response.ok) {
      throw new Error('MyMemory unavailable');
    }
    const json = (await response.json()) as {
      responseData?: { translatedText?: string };
      responseStatus?: number | string;
      responseDetails?: string;
    };
    const translatedText = json.responseData?.translatedText?.trim();
    if (!translatedText || !statusOk(json.responseStatus)) {
      throw new Error(json.responseDetails || 'MyMemory could not translate');
    }
    // Reject "INVALID SOURCE LANGUAGE" style payloads that still return text.
    if (/invalid source language/i.test(translatedText)) {
      throw new Error(translatedText);
    }
    return {
      translatedText,
      detectedSourceLanguage: source,
    };
  } finally {
    clearTimeout(timeout);
  }
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

    const target = normalizeLang(body.to);
    const source = body.from ? normalizeLang(body.from) : 'auto';
    const cacheKey = createHash('sha256')
      .update(`${source}|${target}|${body.text}`)
      .digest('hex');

    cleanExpired();
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached.data);

    let lastError: unknown;
    try {
      const data = await translateWithGoogle(
        body.text,
        target,
        source === 'auto' ? undefined : source
      );
      // No-op / same-language: still return so UI can show "already in your language".
      cache.set(cacheKey, { data, ts: Date.now() });
      return res.json(data);
    } catch (err) {
      lastError = err;
    }

    try {
      const data = await translateWithMyMemory(
        body.text,
        target,
        source === 'auto' ? 'en' : source
      );
      cache.set(cacheKey, { data, ts: Date.now() });
      return res.json(data);
    } catch (err) {
      lastError = err;
    }

    return res.status(502).json({
      error:
        lastError instanceof Error
          ? lastError.message
          : 'Could not translate text',
    });
  })
);

export default router;
