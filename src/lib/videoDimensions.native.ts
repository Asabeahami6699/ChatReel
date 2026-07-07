import { createVideoPlayer } from 'expo-video';

/** Probe local video metadata via expo-video (native). */
export async function probeVideoDimensions(
  uri: string
): Promise<{ width: number; height: number; duration?: number } | null> {
  return new Promise((resolve) => {
    let settled = false;
    const player = createVideoPlayer(uri);

    const finish = (result: { width: number; height: number; duration?: number } | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sourceSub.remove();
      statusSub.remove();
      try {
        player.pause();
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), 12_000);

    const sourceSub = player.addListener('sourceLoad', (payload) => {
      const track = payload.availableVideoTracks?.[0];
      const width = track?.size?.width ?? 0;
      const height = track?.size?.height ?? 0;
      const duration =
        payload.duration > 0 ? payload.duration : player.duration > 0 ? player.duration : undefined;

      if (width > 0 && height > 0) {
        finish({ width, height, duration });
      } else if (duration && duration > 0) {
        finish(null);
      }
    });

    const statusSub = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') finish(null);
    });
  });
}

/** True when expo-video reports at least one audio track. */
export async function probeVideoHasAudio(uri: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const player = createVideoPlayer(uri);

    const finish = (hasAudio: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sourceSub.remove();
      statusSub.remove();
      try {
        player.pause();
      } catch {
        /* ignore */
      }
      resolve(hasAudio);
    };

    const timer = setTimeout(() => finish(true), 8000);

    const sourceSub = player.addListener('sourceLoad', (payload) => {
      const tracks = payload.availableAudioTracks ?? [];
      finish(tracks.length > 0);
    });

    const statusSub = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') finish(false);
    });
  });
}
