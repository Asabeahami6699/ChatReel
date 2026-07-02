import { supabaseAdmin } from './supabaseAdmin';

export const STORAGE_BUCKETS = ['avatars', 'group_avatar', 'chat-files', 'reels'] as const;
export type StorageBucket = (typeof STORAGE_BUCKETS)[number];

const ensured = new Set<StorageBucket>();

const BUCKET_SIZE_LIMIT: Record<StorageBucket, number> = {
  avatars: 5_242_880, // 5 MB
  group_avatar: 5_242_880, // 5 MB
  'chat-files': 52_428_800, // 50 MB
  reels: 104_857_600, // 100 MB (short videos)
};

/** Create public storage buckets if missing (service role). */
export async function ensureStorageBucket(bucket: StorageBucket): Promise<void> {
  if (ensured.has(bucket)) return;

  const { data: existing, error: getError } = await supabaseAdmin.storage.getBucket(bucket);
  if (existing && !getError) {
    ensured.add(bucket);
    return;
  }

  const { error: createError } = await supabaseAdmin.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: BUCKET_SIZE_LIMIT[bucket],
  });

  if (createError && !/already exists/i.test(createError.message)) {
    throw new Error(`Storage bucket "${bucket}" is not available: ${createError.message}`);
  }

  ensured.add(bucket);
}

export function normalizeBase64(input: string): string {
  const trimmed = input.trim();
  const dataUrlMatch = /^data:[^;]+;base64,(.+)$/i.exec(trimmed);
  return (dataUrlMatch?.[1] ?? trimmed).replace(/\s/g, '');
}

export function guessImageContentType(path: string, provided?: string): string {
  if (provided?.startsWith('image/')) {
    if (provided === 'image/jpg') return 'image/jpeg';
    return provided;
  }
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'heic':
    case 'heif':
      return 'image/heic';
    default:
      return 'image/jpeg';
  }
}
