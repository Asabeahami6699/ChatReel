import {
  EncodingType,
  FileSystemUploadType,
  createUploadTask,
  readAsStringAsync,
} from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { api } from './api';
import { config } from './config';

export async function uploadMomentMedia(params: {
  uri: string;
  mediaType: 'image' | 'video';
  fileName?: string;
  mime?: string;
  onProgress?: (pct: number) => void;
}): Promise<string> {
  const isVideo = params.mediaType === 'video';
  const ext = inferExtension(params.uri, params.fileName, params.mime, isVideo) || (isVideo ? 'mp4' : 'jpg');
  const path = `moments/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const contentType =
    params.mime ||
    (isVideo ? `video/${ext === 'mov' ? 'quicktime' : ext}` : `image/${ext === 'jpg' ? 'jpeg' : ext}`);

  if (!isVideo && Platform.OS !== 'web') {
    try {
      const base64 = await readAsStringAsync(params.uri, { encoding: EncodingType.Base64 });
      const { publicUrl } = await api.uploads.uploadBase64({
        bucket: 'chat-files',
        path,
        content_base64: base64,
        content_type: contentType,
        upsert: false,
      });
      params.onProgress?.(100);
      return publicUrl;
    } catch {
      /* fall through to signed upload */
    }
  }

  const { signedUrl } = await api.uploads.sign({ bucket: 'chat-files', path });
  const uploadUrl = signedUrl.startsWith('http')
    ? signedUrl
    : `${config.supabaseUrl.replace(/\/$/, '')}${signedUrl}`;

  if (Platform.OS === 'web') {
    const blob = await (await fetch(params.uri)).blob();
    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType, 'x-upsert': 'false' },
      body: blob,
    });
    params.onProgress?.(100);
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
            params.onProgress?.(Math.round((progress.totalBytesSent / total) * 100));
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

  const { publicUrl } = await api.uploads.publicUrl('chat-files', path);
  return publicUrl;
}

export async function uploadMomentThumbnail(params: { uri: string }): Promise<string> {
  const base64 = await readAsStringAsync(params.uri, {
    encoding: EncodingType.Base64,
  });
  const path = `moments/thumbs/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
  const { publicUrl } = await api.uploads.uploadBase64({
    bucket: 'chat-files',
    path,
    content_base64: base64,
    content_type: 'image/jpeg',
    upsert: false,
  });
  return publicUrl;
}

function inferExtension(
  uri: string,
  fileName?: string,
  mime?: string,
  isVideo?: boolean
): string | null {
  if (fileName?.includes('.')) return fileName.split('.').pop()!.toLowerCase();
  if (mime?.includes('/')) return mime.split('/')[1]?.replace('jpeg', 'jpg') ?? null;
  const match = /\.(\w+)(?:\?|$)/i.exec(uri);
  if (match) return match[1].toLowerCase();
  return isVideo ? 'mp4' : 'jpg';
}
