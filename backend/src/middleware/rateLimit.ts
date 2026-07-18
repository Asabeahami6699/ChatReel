import type { NextFunction, Response } from 'express';
import type { AuthedRequest } from './auth';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * In-memory per-user rate limit (per process). Fine for a single Render instance;
 * swap for Redis when you multi-instance.
 */
export function rateLimitPerUser(opts: {
  key: string;
  limit: number;
  windowMs: number;
  message?: string;
}) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const mapKey = `${opts.key}:${userId}`;
    const now = Date.now();
    let entry = buckets.get(mapKey);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 1, resetAt: now + opts.windowMs };
      buckets.set(mapKey, entry);
      return next();
    }

    if (entry.count >= opts.limit) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: opts.message ?? 'Too many requests. Please slow down.',
        retry_after_seconds: retryAfterSec,
      });
    }

    entry.count += 1;
    return next();
  };
}

/** ~1 msg/sec burst, 60/min sustain — blocks spam without hurting normal chat. */
export const messageSendRateLimit = rateLimitPerUser({
  key: 'messages',
  limit: 60,
  windowMs: 60_000,
  message: 'Message rate limit exceeded. Try again in a minute.',
});

/** ~1 call every 3s average — 20 starts/min is plenty for real use. */
export const callStartRateLimit = rateLimitPerUser({
  key: 'calls',
  limit: 20,
  windowMs: 60_000,
  message: 'Call rate limit exceeded. Try again in a minute.',
});

/**
 * In-memory per-IP rate limit for anonymous/public endpoints.
 */
export function rateLimitByIp(opts: {
  key: string;
  limit: number;
  windowMs: number;
  message?: string;
}) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : null) ||
      req.socket.remoteAddress ||
      'unknown';

    const mapKey = `${opts.key}:${ip}`;
    const now = Date.now();
    let entry = buckets.get(mapKey);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 1, resetAt: now + opts.windowMs };
      buckets.set(mapKey, entry);
      return next();
    }

    if (entry.count >= opts.limit) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: opts.message ?? 'Too many requests. Please slow down.',
        retry_after_seconds: retryAfterSec,
      });
    }

    entry.count += 1;
    return next();
  };
}

/** Guest browse: ~60 feed/search requests per minute per IP. */
export const publicReelsRateLimit = rateLimitByIp({
  key: 'reels-public',
  limit: 60,
  windowMs: 60_000,
  message: 'Too many requests. Please try again shortly.',
});

/** Phone OTP send: 8 codes / 15 min per IP (SMS cost / abuse protection). */
export const phoneOtpSendRateLimit = rateLimitByIp({
  key: 'auth-otp-send',
  limit: 8,
  windowMs: 15 * 60_000,
  message: 'Too many verification codes. Try again in a few minutes.',
});

/** Phone OTP verify attempts: 20 / 15 min per IP. */
export const phoneOtpVerifyRateLimit = rateLimitByIp({
  key: 'auth-otp-verify',
  limit: 20,
  windowMs: 15 * 60_000,
  message: 'Too many verification attempts. Try again later.',
});
