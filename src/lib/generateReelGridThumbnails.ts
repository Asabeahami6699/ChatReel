import { Platform } from 'react-native';
import * as VideoThumbnails from 'expo-video-thumbnails';
import type { ReelDTO } from './api';
import { getReelGridThumbnail } from './reelThumbnails';
import { isImageReelUrl } from './reelPlayback';

const MAX_CONCURRENT = 6;

async function webCaptureThumb(url: string): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    let settled = false;
    const finish = (uri: string | null) => {
      if (settled) return;
      settled = true;
      video.pause();
      video.removeAttribute('src');
      video.load();
      resolve(uri);
    };

    const capture = () => {
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) {
          finish(null);
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(null);
          return;
        }
        ctx.drawImage(video, 0, 0, w, h);
        finish(canvas.toDataURL('image/jpeg', 0.72));
      } catch {
        finish(null);
      }
    };

    video.addEventListener('loadeddata', () => {
      video.currentTime = Math.min(0.5, Math.max(0, (video.duration || 1) * 0.05));
    });
    video.addEventListener('seeked', capture);
    video.addEventListener('error', () => finish(null));
    setTimeout(() => finish(null), 10000);
    video.src = url.includes('#') ? url : `${url}#t=0.5`;
  });
}

/** Generate missing grid thumbnails in parallel batches. */
export async function generateReelGridThumbnails(
  reels: ReelDTO[],
  existing: Record<string, string>,
  onUpdate: (id: string, uri: string) => void
): Promise<void> {
  const pending = reels.filter((r) => !getReelGridThumbnail(r, existing));
  let index = 0;

  async function worker() {
    while (index < pending.length) {
      const reel = pending[index++];
      if (!reel?.video_url) continue;
      if (isImageReelUrl(reel.video_url)) {
        onUpdate(reel.id, reel.video_url);
        continue;
      }
      const source = reel.playback_url ?? reel.video_url;
      try {
        if (Platform.OS === 'web') {
          const uri = await webCaptureThumb(source);
          if (uri) onUpdate(reel.id, uri);
          continue;
        }
        const { uri } = await VideoThumbnails.getThumbnailAsync(source, {
          time: 500,
          quality: 0.65,
        });
        onUpdate(reel.id, uri);
      } catch {
        /* ReelGridThumb falls back to inline video poster on web */
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, pending.length || 1) }, worker));
}
