import { Alert, Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { ReelDTO } from './api';

function reelVideoUrl(reel: ReelDTO): string {
  if (reel.video_url && !/\.m3u8(\?|$)/i.test(reel.video_url)) {
    return reel.video_url;
  }
  return reel.playback_url ?? reel.video_url;
}

export async function downloadReelVideo(reel: ReelDTO): Promise<void> {
  const url = reelVideoUrl(reel);
  if (!url) {
    Alert.alert('Download', 'Video is not available.');
    return;
  }

  if (Platform.OS === 'web') {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = `reel-${reel.id}.mp4`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(blobUrl);
    return;
  }

  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!dir) throw new Error('No writable storage');

  const target = `${dir}reel-download-${reel.id}.mp4`;
  const result = await FileSystem.downloadAsync(url, target);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Download failed (${result.status})`);
  }

  try {
    await Share.share({
      url: result.uri,
      message: reel.caption?.trim() || 'Reel video',
      title: 'Save reel',
    });
  } catch {
    Alert.alert('Downloaded', 'Video saved to app cache. Open Files to access it.');
  }
}
