import { Platform } from 'react-native';
import { FileSystemUploadType, createUploadTask } from 'expo-file-system/legacy';
import { api } from './api';
import { config } from './config';
import { ensureSupabaseSession } from './ensureSupabaseSession';

export type UploadBucket = 'avatars' | 'group_avatar' | 'chat-files' | 'reels' | 'ringtones';

type UploadParams = {
  bucket: UploadBucket;
  path: string;
  contentBase64: string;
  contentType?: string;
  upsert?: boolean;
};

/** Small files only (avatars, thumbnails) — subject to API JSON body limit. */
export async function uploadBase64({
  bucket,
  path,
  contentBase64,
  contentType,
  upsert = true,
}: UploadParams): Promise<string> {
  const { publicUrl } = await api.uploads.uploadBase64({
    bucket,
    path,
    content_base64: contentBase64,
    content_type: contentType,
    upsert,
  });
  return publicUrl;
}

function resolveSignedUploadUrl(signedUrl: string): string {
  return signedUrl.startsWith('http')
    ? signedUrl
    : `${config.supabaseUrl.replace(/\/$/, '')}${signedUrl}`;
}

async function putBlob(
  uploadUrl: string,
  blob: Blob,
  contentType: string
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'x-upsert': 'false' },
    body: blob,
  });
  if (!res.ok) {
    throw new Error(`Upload failed (${res.status})`);
  }
}

async function putNativeFile(
  uploadUrl: string,
  uri: string,
  contentType: string
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const task = createUploadTask(uploadUrl, uri, {
      httpMethod: 'PUT',
      uploadType: FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': contentType, 'x-upsert': 'false' },
    });
    task
      .uploadAsync()
      .then((result) => {
        if (!result || result.status < 200 || result.status >= 300) {
          reject(new Error(`Upload failed (${result?.status ?? 'unknown'})`));
          return;
        }
        resolve();
      })
      .catch(reject);
  });
}

/** Stream file bytes through the API (web + fallback — no base64). */
async function uploadViaBinaryApi(
  bucket: UploadBucket,
  path: string,
  uri: string,
  contentType: string
): Promise<string> {
  const session = await ensureSupabaseSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  const blob = await (await fetch(uri)).blob();
  const params = new URLSearchParams({
    bucket,
    path,
    content_type: contentType,
  });

  const res = await fetch(`${config.apiUrl}/api/uploads/binary?${params}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': contentType,
    },
    body: blob,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? `Upload failed (${res.status})`);
  }
  return data.publicUrl as string;
}

async function uploadViaSignedUrl(
  bucket: UploadBucket,
  path: string,
  uri: string,
  contentType: string
): Promise<string> {
  const { signedUrl } = await api.uploads.sign({ bucket, path });
  const uploadUrl = resolveSignedUploadUrl(signedUrl);

  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    await putBlob(uploadUrl, blob, contentType);
  } else {
    await putNativeFile(uploadUrl, uri, contentType);
  }

  const { publicUrl } = await api.uploads.publicUrl(bucket, path);
  return publicUrl;
}

/**
 * Upload a local file URI to Supabase Storage.
 * Uses signed direct upload on native; binary API on web (avoids CORS + JSON limits).
 */
export async function uploadFromUri(
  bucket: UploadBucket,
  path: string,
  uri: string,
  contentType?: string
): Promise<string> {
  const type = contentType || 'application/octet-stream';

  if (Platform.OS === 'web') {
    return uploadViaBinaryApi(bucket, path, uri, type);
  }

  try {
    return await uploadViaSignedUrl(bucket, path, uri, type);
  } catch (signedErr) {
    console.warn('[uploads] signed upload failed, trying binary API', signedErr);
    return uploadViaBinaryApi(bucket, path, uri, type);
  }
}
