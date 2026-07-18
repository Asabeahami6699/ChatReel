import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';

export type AuthedRequest = Request & {
  userId?: string;
  accessToken?: string;
};

/** Short-lived cache so brief Supabase outages don't break every poll. */
const authCache = new Map<string, { userId: string; expMs: number }>();
const AUTH_CACHE_TTL_MS = 5 * 60 * 1000;

function cacheKey(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
}

function readCachedUserId(token: string): string | null {
  const entry = authCache.get(cacheKey(token));
  if (!entry) return null;
  if (entry.expMs < Date.now()) {
    authCache.delete(cacheKey(token));
    return null;
  }
  return entry.userId;
}

function cacheUserId(token: string, userId: string, expSec?: number): void {
  const expMs = expSec ? expSec * 1000 : Date.now() + AUTH_CACHE_TTL_MS;
  authCache.set(cacheKey(token), { userId, expMs: Math.min(expMs, Date.now() + AUTH_CACHE_TTL_MS) });
}

function base64UrlDecode(str: string): Buffer {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

/** Verify Supabase HS256 JWT locally when Auth API is unreachable. */
function verifyJwtLocally(token: string, secret: string): { sub: string; exp?: number } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  const data = `${headerB64}.${payloadB64}`;
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  const sigBuf = Buffer.from(sigB64);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  try {
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as {
      sub?: string;
      exp?: number;
    };
    if (typeof payload.sub !== 'string') return null;
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return null;
    return { sub: payload.sub, exp: payload.exp };
  } catch {
    return null;
  }
}

function isAuthServiceNetworkError(err: unknown): boolean {
  const parts: string[] = [];
  if (err && typeof err === 'object') {
    if ('message' in err && typeof (err as Error).message === 'string') {
      parts.push((err as Error).message);
    }
    if ('name' in err && typeof (err as Error).name === 'string') {
      parts.push((err as Error).name);
    }
    const cause = 'cause' in err ? (err as { cause?: unknown }).cause : undefined;
    if (cause && typeof cause === 'object') {
      if ('message' in cause && typeof (cause as Error).message === 'string') {
        parts.push((cause as Error).message);
      }
      if ('code' in cause && typeof (cause as { code?: string }).code === 'string') {
        parts.push((cause as { code: string }).code);
      }
    }
  }
  const haystack = parts.join(' ').toLowerCase();
  return (
    haystack.includes('fetch failed') ||
    haystack.includes('timeout') ||
    haystack.includes('econnrefused') ||
    haystack.includes('enotfound') ||
    haystack.includes('und_err_connect')
  );
}

function resolveUserFromOfflineToken(token: string): string | null {
  const cached = readCachedUserId(token);
  if (cached) return cached;

  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!jwtSecret) return null;

  const verified = verifyJwtLocally(token, jwtSecret);
  if (!verified) return null;

  cacheUserId(token, verified.sub, verified.exp);
  return verified.sub;
}

export async function resolveAuthUserId(token: string): Promise<string | null> {
  if (!token) return null;

  const cached = readCachedUserId(token);
  if (cached) return cached;

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (!error && data.user) {
      cacheUserId(token, data.user.id);
      return data.user.id;
    }
    if (error && isAuthServiceNetworkError(error)) {
      return resolveUserFromOfflineToken(token);
    }
    return null;
  } catch (err) {
    if (isAuthServiceNetworkError(err)) {
      return resolveUserFromOfflineToken(token);
    }
    return null;
  }
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = header.slice(7);
  let data: Awaited<ReturnType<typeof supabaseAdmin.auth.getUser>>['data'];
  let error: Awaited<ReturnType<typeof supabaseAdmin.auth.getUser>>['error'];

  try {
    ({ data, error } = await supabaseAdmin.auth.getUser(token));
  } catch (err) {
    if (isAuthServiceNetworkError(err)) {
      const userId = resolveUserFromOfflineToken(token);
      if (userId) {
        req.userId = userId;
        req.accessToken = token;
        return next();
      }
      console.warn('[auth] Supabase unreachable while validating token');
      return res.status(503).json({ error: 'Auth service unavailable' });
    }
    throw err;
  }

  if (error) {
    if (isAuthServiceNetworkError(error)) {
      const userId = resolveUserFromOfflineToken(token);
      if (userId) {
        req.userId = userId;
        req.accessToken = token;
        return next();
      }
      console.warn('[auth] Supabase unreachable while validating token');
      return res.status(503).json({ error: 'Auth service unavailable' });
    }
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  if (!data.user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  cacheUserId(token, data.user.id);
  req.userId = data.user.id;
  req.accessToken = token;
  next();
}

/** Resolve profiles.id from auth user id */
export async function getProfileIdByUserId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.id ?? null;
}

export function asyncHandler(
  fn: (req: AuthedRequest, res: Response, next: NextFunction) => Promise<void | Response>
) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
