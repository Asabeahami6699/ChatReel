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
  /** When true, new reels are transcoded to HLS segments after upload. Requires ffmpeg. */
  reelsHlsEnabled: process.env.REELS_HLS_ENABLED === 'true',
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
