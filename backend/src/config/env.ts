import type { CorsOptions } from 'cors';
import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3001),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
  /** Comma-separated origins, or * to allow any origin. Empty env var is treated as *. */
  corsOrigin: (process.env.CORS_ORIGIN ?? '*').trim() || '*',
  liveKit: {
    apiKey: process.env.LIVEKIT_API_KEY ?? '',
    apiSecret: process.env.LIVEKIT_API_SECRET ?? '',
    url: process.env.LIVEKIT_URL ?? '',
    tokenTtlSeconds: Number(process.env.LIVEKIT_TOKEN_TTL ?? 14_400),
  },
  /** Optional CDN origin in front of Supabase storage, e.g. https://cdn.example.com */
  reelsCdnUrl: process.env.REELS_CDN_URL ?? '',
  /**
   * CDN for all media (chat-files, avatars, reels…). Falls back to REELS_CDN_URL.
   * Persist raw Supabase URLs in DB; rewrite on API responses.
   */
  mediaCdnUrl: process.env.MEDIA_CDN_BASE_URL ?? '',
  /** When true, new reels are transcoded to HLS segments after upload. Requires ffmpeg. */
  reelsHlsEnabled: process.env.REELS_HLS_ENABLED === 'true',
  /** Max simultaneous joined/held call sessions per user (Phase 2). */
  maxConcurrentCalls: Math.max(1, Number(process.env.MAX_CONCURRENT_CALLS ?? 2)),
  /** Archive messages older than N days into messages_archive (0 = never). */
  messageArchiveAfterDays: Math.max(0, Number(process.env.MESSAGE_ARCHIVE_AFTER_DAYS ?? 90)),
  /** How often the archive job runs (ms). 0 disables. Default 6h. */
  messageArchiveIntervalMs: Math.max(0, Number(process.env.MESSAGE_ARCHIVE_INTERVAL_MS ?? 21_600_000)),
  /** Max messages returned by GET /api/messages. */
  messagesListMaxLimit: Math.min(200, Math.max(20, Number(process.env.MESSAGES_LIST_MAX_LIMIT ?? 100))),
  /** Requeue reels stranded in pending/processing after a restart (ms). 0 disables. Default 10 min. */
  reelReconcileIntervalMs: Math.max(0, Number(process.env.REEL_RECONCILE_INTERVAL_MS ?? 600_000)),
  /** A pending/processing reel is considered stranded after this many minutes. Min 10. */
  reelReconcileStaleMinutes: Math.max(10, Number(process.env.REEL_RECONCILE_STALE_MINUTES ?? 30)),
  /** Purge long-expired moments and their media (ms). 0 disables. Default 6h. */
  momentCleanupIntervalMs: Math.max(0, Number(process.env.MOMENT_CLEANUP_INTERVAL_MS ?? 21_600_000)),
  /** Phase 3: optional Redis for push/fan-out queues (memory fallback if unset). */
  redisUrl: (process.env.REDIS_URL ?? '').trim(),
  /** Phase 3 WebSocket path (same HTTP server). */
  wsPath: (process.env.WS_PATH ?? '/ws').trim() || '/ws',
  /**
   * Phase 3 E2E policy:
   * off = plaintext allowed (default)
   * prefer = client should encrypt when keys exist; server accepts both
   * strict = reject plaintext:true text sends
   */
  e2eMode: (process.env.E2E_MODE ?? 'prefer').toLowerCase() as 'off' | 'prefer' | 'strict',
  /** Logical region label for this API instance (ops / multi-region prep). */
  regionId: (process.env.REGION_ID ?? 'default').trim() || 'default',
  /**
   * Default country calling code for phone normalization when users omit +.
   * Example: +234 (Nigeria). Must include leading +.
   */
  authDefaultCountryCode: (() => {
    const raw = (process.env.AUTH_DEFAULT_COUNTRY_CODE ?? '+234').trim() || '+234';
    return raw.startsWith('+') ? raw : `+${raw}`;
  })(),
  /** SLO target: message send ack p95 budget (ms) — logged in metrics. */
  sloSendP95Ms: Math.max(50, Number(process.env.SLO_SEND_P95_MS ?? 800)),
  /** SLO target: call accept→token p95 budget (ms). */
  sloCallJoinP95Ms: Math.max(100, Number(process.env.SLO_CALL_JOIN_P95_MS ?? 2500)),
  sightengine: {
    apiUser: process.env.SIGHTENGINE_API_USER ?? '',
    apiSecret: process.env.SIGHTENGINE_API_SECRET ?? '',
  },
  reelModeration: {
    enabled: process.env.REEL_MODERATION_ENABLED !== 'false',
    rejectThreshold: Number(process.env.REEL_MODERATION_REJECT_THRESHOLD ?? 0.55),
    flagThreshold: Number(process.env.REEL_MODERATION_FLAG_THRESHOLD ?? 0.35),
  },
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY ?? '',
    publicKey: process.env.PAYSTACK_PUBLIC_KEY ?? '',
    callbackUrl: process.env.PAYSTACK_CALLBACK_URL ?? '',
  },
  /** Optional Expo push access token (Expo dashboard → Access tokens). */
  expoAccessToken: process.env.EXPO_ACCESS_TOKEN ?? '',
};

export function isReelModerationEnabled(): boolean {
  return (
    env.reelModeration.enabled &&
    Boolean(env.sightengine.apiUser && env.sightengine.apiSecret)
  );
}

export function isLiveKitConfigured(): boolean {
  return Boolean(env.liveKit.apiKey && env.liveKit.apiSecret && env.liveKit.url);
}

export function isPaystackConfigured(): boolean {
  return Boolean(env.paystack.secretKey);
}

const DEFAULT_CORS_ORIGINS = [
  'https://chat-reel.vercel.app',
  'http://localhost:8081',
  'http://localhost:19006',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:19006',
];

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/$/, '');
}

function buildAllowedOrigins(): Set<string> {
  const set = new Set(DEFAULT_CORS_ORIGINS);
  if (env.corsOrigin !== '*') {
    for (const part of env.corsOrigin.split(',')) {
      const o = normalizeOrigin(part);
      if (o) set.add(o);
    }
  }
  return set;
}

function isAllowedOrigin(origin: string | undefined, allowed: Set<string>): boolean {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (allowed.has(normalized)) return true;
  // Vercel preview deployments: https://chat-reel-<hash>.vercel.app
  if (/^https:\/\/[\w-]+\.vercel\.app$/i.test(normalized)) return true;
  return env.corsOrigin === '*';
}

/** CORS origin callback — supports *, comma-separated list, and Vercel previews. */
export function getCorsOriginOption(): CorsOptions['origin'] {
  const allowed = buildAllowedOrigins();
  return (origin, callback) => {
    if (isAllowedOrigin(origin, allowed)) {
      callback(null, true);
    } else {
      console.warn('[CORS] Blocked origin:', origin);
      callback(new Error(`CORS not allowed for origin: ${origin}`));
    }
  };
}

export function getCorsMiddlewareOptions(): CorsOptions {
  return {
    origin: getCorsOriginOption(),
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    optionsSuccessStatus: 204,
  };
}
