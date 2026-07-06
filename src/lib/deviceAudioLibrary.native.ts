import * as MediaLibrary from 'expo-media-library';

export type DeviceAudioTrack = {
  id: string;
  title: string;
  durationSec: number;
  uri: string;
  fileName: string;
};

export function isDeviceAudioLibrarySupported(): boolean {
  return true;
}

export async function requestDeviceAudioPermission(): Promise<boolean> {
  const current = await MediaLibrary.getPermissionsAsync();
  if (current.granted) return true;
  const next = await MediaLibrary.requestPermissionsAsync();
  return next.granted;
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '').slice(0, 80) || 'Untitled';
}

export function formatDeviceAudioDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export async function loadDeviceAudioPage(opts: {
  after?: string;
  first?: number;
  query?: string;
}): Promise<{
  tracks: DeviceAudioTrack[];
  hasNextPage: boolean;
  endCursor: string | null;
}> {
  const granted = await requestDeviceAudioPermission();
  if (!granted) {
    throw new Error('Media library permission is required to browse device audio.');
  }

  const page = await MediaLibrary.getAssetsAsync({
    mediaType: MediaLibrary.MediaType.audio,
    first: opts.first ?? 50,
    after: opts.after,
    sortBy: [[MediaLibrary.SortBy.modificationTime, false]],
  });

  const q = opts.query?.trim().toLowerCase();
  const tracks: DeviceAudioTrack[] = [];

  for (const asset of page.assets) {
    const fileName = asset.filename || 'audio';
    const title = stripExtension(fileName);
    if (q && !title.toLowerCase().includes(q) && !fileName.toLowerCase().includes(q)) {
      continue;
    }

    let uri = asset.uri;
    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset);
      if (info.localUri) uri = info.localUri;
    } catch {
      /* use asset.uri */
    }

    tracks.push({
      id: asset.id,
      title,
      durationSec: asset.duration ?? 0,
      uri,
      fileName,
    });
  }

  return {
    tracks,
    hasNextPage: page.hasNextPage,
    endCursor: page.endCursor,
  };
}

export async function resolveDeviceAudioUri(assetId: string): Promise<string | null> {
  try {
    const info = await MediaLibrary.getAssetInfoAsync(assetId);
    return info.localUri ?? info.uri ?? null;
  } catch {
    return null;
  }
}
