import { Alert, Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { api } from './api';
import type { ReelDTO } from './api';

export async function downloadReelVideo(reel: ReelDTO): Promise<void> {
  let url: string;
  try {
    const res = await api.reels.download(reel.id);
    url = res.download_url;
  } catch {
    throw new Error('Could not prepare watermarked download');
  }

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
    Alert.alert('Downloaded', 'Watermarked video saved to app cache. Open Files to access it.');
  }
}
