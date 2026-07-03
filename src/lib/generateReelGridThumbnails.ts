import * as VideoThumbnails from 'expo-video-thumbnails';
import type { ReelDTO } from './api';
import { getReelGridThumbnail } from './reelThumbnails';
import { isImageReelUrl } from './reelPlayback';

const MAX_CONCURRENT = 4;

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
      try {
        const { uri } = await VideoThumbnails.getThumbnailAsync(
          reel.playback_url ?? reel.video_url,
          { time: 500, quality: 0.65 }
        );
        onUpdate(reel.id, uri);
      } catch {
        /* ignore */
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, pending.length || 1) }, worker));
}
