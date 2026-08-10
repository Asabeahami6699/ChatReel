/**
 * Bake a filtered still image via the WebGL pipeline (web).
 * Returns a blob URL + metadata suitable for upload queues.
 */
import { Platform } from 'react-native';
import { FilterPipeline } from './filterPipeline';
import { isIdentityPipelineFilter, reelFilterToPipeline } from './reelFilterPipelineMap';

export type BakedImage = {
  uri: string;
  blob: Blob;
  mime: string;
  fileName: string;
  width: number;
  height: number;
};

function loadHtmlImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for filter bake'));
    img.src = uri;
  });
}

export async function bakeFilteredImage(
  uri: string,
  filterId?: string | null,
  fileName = 'moment.jpg'
): Promise<BakedImage | null> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
  if (isIdentityPipelineFilter(filterId)) return null;

  const pipeline = new FilterPipeline();
  try {
    await pipeline.load();
    const img = await loadHtmlImage(uri);
    const snap = await pipeline.filterImage(img, reelFilterToPipeline(filterId));
    return {
      uri: snap.url,
      blob: snap.blob,
      mime: 'image/jpeg',
      fileName: fileName.replace(/\.\w+$/, '') + '-filtered.jpg',
      width: snap.width,
      height: snap.height,
    };
  } finally {
    pipeline.destroy();
  }
}
