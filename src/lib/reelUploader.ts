import {
  EncodingType,
  FileSystemUploadType,
  createUploadTask,
  readAsStringAsync,
} from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { api } from './api';
import { config } from './config';

/**
 * Upload a reel video to Supabase Storage `reels` bucket via a signed upload
 * URL. We avoid base64 here because reels can be tens of MB, which would
 * blow past the JSON body limit.
 *
 * Returns the public URL of the uploaded file.
 */
export async function uploadReelVideo(params: {
  uri: string;
  fileName?: string;
  contentType?: string;
  onProgress?: (loaded: number, total: number) => void;
}): Promise<string> {
  const ext = inferExtension(params.uri, params.fileName, params.contentType) || 'mp4';
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const contentType = params.contentType || `video/${ext === 'mov' ? 'quicktime' : ext}`;

  const { signedUrl } = await api.uploads.sign({ bucket: 'reels', path });
  const uploadUrl = signedUrl.startsWith('http')
    ? signedUrl
    : `${config.supabaseUrl.replace(/\/$/, '')}${signedUrl}`;

  if (Platform.OS === 'web') {
    const blob = await (await fetch(params.uri)).blob();
    await uploadBlobWithProgress(uploadUrl, blob, contentType, params.onProgress);
  } else {
    await new Promise<void>((resolve, reject) => {
      const task = createUploadTask(
        uploadUrl,
        params.uri,
        {
          httpMethod: 'PUT',
          uploadType: FileSystemUploadType.BINARY_CONTENT,
          headers: { 'Content-Type': contentType, 'x-upsert': 'false' },
        },
        (progress) => {
          const total = progress.totalBytesExpectedToSend || 0;
          if (total > 0) {
            params.onProgress?.(progress.totalBytesSent, total);
          }
        }
      );
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

  const { publicUrl } = await api.uploads.publicUrl('reels', path);
  return publicUrl;
}

/**
 * Upload a thumbnail (small JPG) via base64 since it fits comfortably under
 * the JSON body limit.
 */
export async function uploadReelThumbnail(params: {
  uri: string;
  fileName?: string;
}): Promise<string> {
  const base64 = await readAsStringAsync(params.uri, {
    encoding: EncodingType.Base64,
  });
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
  const { publicUrl } = await api.uploads.uploadBase64({
    bucket: 'reels',
    path: `thumbs/${path}`,
    content_base64: base64,
    content_type: 'image/jpeg',
    upsert: false,
  });
  return publicUrl;
}

/** Upload a photo reel to the reels bucket. */
export async function uploadReelImage(params: {
  uri: string;
  fileName?: string;
  contentType?: string;
  onProgress?: (loaded: number, total: number) => void;
}): Promise<string> {
  const ext = inferImageExtension(params.uri, params.fileName, params.contentType) || 'jpg';
  const path = `images/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const contentType =
    params.contentType || (ext === 'jpg' ? 'image/jpeg' : `image/${ext}`);

  const { signedUrl } = await api.uploads.sign({ bucket: 'reels', path });
  const uploadUrl = signedUrl.startsWith('http')
    ? signedUrl
    : `${config.supabaseUrl.replace(/\/$/, '')}${signedUrl}`;

  if (Platform.OS === 'web') {
    const blob = await (await fetch(params.uri)).blob();
    await uploadBlobWithProgress(uploadUrl, blob, contentType, params.onProgress);
  } else {
    await new Promise<void>((resolve, reject) => {
      const task = createUploadTask(
        uploadUrl,
        params.uri,
        {
          httpMethod: 'PUT',
          uploadType: FileSystemUploadType.BINARY_CONTENT,
          headers: { 'Content-Type': contentType, 'x-upsert': 'false' },
        },
        (progress) => {
          const total = progress.totalBytesExpectedToSend || 0;
          if (total > 0) params.onProgress?.(progress.totalBytesSent, total);
        }
      );
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

  const { publicUrl } = await api.uploads.publicUrl('reels', path);
  return publicUrl;
}

/** Upload a custom sound track (mp3/m4a) to the reels bucket. */
export async function uploadReelAudio(params: {
  uri: string;
  fileName?: string;
  contentType?: string;
  onProgress?: (loaded: number, total: number) => void;
}): Promise<string> {
  const ext = inferAudioExtension(params.uri, params.fileName, params.contentType) || 'mp3';
  const path = `sounds/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const contentType =
    params.contentType ||
    (ext === 'mp3' ? 'audio/mpeg' : ext === 'm4a' ? 'audio/mp4' : `audio/${ext}`);

  const { signedUrl } = await api.uploads.sign({ bucket: 'reels', path });
  const uploadUrl = signedUrl.startsWith('http')
    ? signedUrl
    : `${config.supabaseUrl.replace(/\/$/, '')}${signedUrl}`;

  if (Platform.OS === 'web') {
    const blob = await (await fetch(params.uri)).blob();
    await uploadBlobWithProgress(uploadUrl, blob, contentType, params.onProgress);
  } else {
    await new Promise<void>((resolve, reject) => {
      const task = createUploadTask(
        uploadUrl,
        params.uri,
        {
          httpMethod: 'PUT',
          uploadType: FileSystemUploadType.BINARY_CONTENT,
          headers: { 'Content-Type': contentType, 'x-upsert': 'false' },
        },
        (progress) => {
          const total = progress.totalBytesExpectedToSend || 0;
          if (total > 0) params.onProgress?.(progress.totalBytesSent, total);
        }
      );
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

  const { publicUrl } = await api.uploads.publicUrl('reels', path);
  return publicUrl;
}

function inferExtension(uri: string, fileName?: string, mime?: string): string | null {
  const fromName = (fileName || uri).split('?')[0].split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (!mime) return null;
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('quicktime')) return 'mov';
  if (mime.includes('webm')) return 'webm';
  return null;
}

function inferImageExtension(uri: string, fileName?: string, mime?: string): string | null {
  const fromName = (fileName || uri).split('?')[0].split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName === 'jpeg' ? 'jpg' : fromName;
  if (!mime) return null;
  if (mime.includes('jpeg')) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return null;
}

function inferAudioExtension(uri: string, fileName?: string, mime?: string): string | null {
  const fromName = (fileName || uri).split('?')[0].split('.').pop()?.toLowerCase();
  if (fromName && /^(mp3|m4a|aac|wav|ogg|flac)$/.test(fromName)) return fromName;
  if (!mime) return null;
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('ogg')) return 'ogg';
  return null;
}

function uploadBlobWithProgress(
  url: string,
  blob: Blob,
  contentType: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress?.(event.loaded, event.total);
      }
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    });
    xhr.addEventListener('error', () => reject(new Error('Upload failed')));
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.send(blob);
  });
}
