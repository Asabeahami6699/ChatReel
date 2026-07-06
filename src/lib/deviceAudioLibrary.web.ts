export type DeviceAudioTrack = {
  id: string;
  title: string;
  durationSec: number;
  uri: string;
  fileName: string;
};

export function isDeviceAudioLibrarySupported(): boolean {
  return false;
}

export async function requestDeviceAudioPermission(): Promise<boolean> {
  return false;
}

export function formatDeviceAudioDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export async function loadDeviceAudioPage(_opts: {
  after?: string;
  first?: number;
  query?: string;
}): Promise<{
  tracks: DeviceAudioTrack[];
  hasNextPage: boolean;
  endCursor: string | null;
}> {
  return { tracks: [], hasNextPage: false, endCursor: null };
}

export async function resolveDeviceAudioUri(_assetId: string): Promise<string | null> {
  return null;
}
