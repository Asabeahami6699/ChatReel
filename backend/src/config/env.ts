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
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
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
};

export function isLiveKitConfigured(): boolean {
  return Boolean(env.liveKit.apiKey && env.liveKit.apiSecret && env.liveKit.url);
}
