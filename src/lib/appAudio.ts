import {
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';

export type { AudioPlayer };

export async function configurePlaybackAudio(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    shouldRouteThroughEarpiece: false,
  });
}

/** Preview a paused voice note without tearing down the active recorder session. */
export async function configureVoicePreviewAudio(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false,
  });
}

export async function configureRecordingAudio(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false,
  });
}

export async function resetRecordingAudio(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    shouldPlayInBackground: false,
  });
}

export async function ensureMicPermission(): Promise<boolean> {
  const { granted } = await requestRecordingPermissionsAsync();
  return granted;
}

function isBenignPlayAbort(err: unknown): boolean {
  const name =
    err && typeof err === 'object' && 'name' in err ? String((err as { name?: unknown }).name) : '';
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return (
    name === 'AbortError' ||
    /interrupted by a call to pause|play\(\) request was interrupted|the play\(\) request was interrupted/i.test(
      msg
    )
  );
}

type WebAudioPlayer = AudioPlayer & {
  media?: HTMLMediaElement;
  isPlaying?: boolean;
  startSampling?: () => void;
  stopSampling?: () => void;
};

/**
 * expo-audio's web play() calls HTMLMediaElement.play() without catching the
 * promise. When pause()/remove() races an in-flight play(), browsers reject
 * with AbortError as an uncaught promise. Patch play() so every player created
 * through this module swallows that race.
 */
function withSafeWebPlay(player: AudioPlayer): AudioPlayer {
  if (typeof window === 'undefined') return player;

  const webPlayer = player as WebAudioPlayer;
  const originalPlay = webPlayer.play.bind(webPlayer);

  webPlayer.play = () => {
    const media = webPlayer.media;
    if (!media || typeof media.play !== 'function') {
      try {
        originalPlay();
      } catch (err) {
        if (!isBenignPlayAbort(err)) {
          console.warn('[appAudio] play failed', err);
        }
      }
      return;
    }

    try {
      const result = media.play();
      webPlayer.isPlaying = true;
      try {
        webPlayer.startSampling?.();
      } catch {
        /* sampling is optional */
      }
      if (result != null && typeof (result as Promise<void>).then === 'function') {
        void (result as Promise<void>).catch((err: unknown) => {
          if (media.paused) webPlayer.isPlaying = false;
          if (isBenignPlayAbort(err)) return;
          console.warn('[appAudio] play failed', err);
        });
      }
    } catch (err) {
      if (media.paused) webPlayer.isPlaying = false;
      if (!isBenignPlayAbort(err)) {
        console.warn('[appAudio] play failed', err);
      }
    }
  };

  return webPlayer;
}

export function createLoopingPlayer(source: number | string | { uri: string }): AudioPlayer {
  const player = createAudioPlayer(source);
  player.loop = true;
  return withSafeWebPlay(player);
}

export function createPlaybackPlayer(source: string | number | { uri: string }): AudioPlayer {
  return withSafeWebPlay(createAudioPlayer(source));
}

export async function releasePlayer(player: AudioPlayer | null): Promise<void> {
  if (!player) return;
  try {
    player.pause();
  } catch {
    /* ignore */
  }
  try {
    player.remove();
  } catch {
    /* ignore */
  }
}

/**
 * Resolve module assets to a real URI (needed on web so HTMLAudioElement
 * doesn't throw NotSupportedError for an empty/invalid source).
 */
export async function resolvePlayableAudioSource(
  source: number | string
): Promise<number | string | { uri: string }> {
  if (typeof source === 'string') {
    return source;
  }
  try {
    const { Asset } = await import('expo-asset');
    const asset = Asset.fromModule(source);
    if (!asset.downloaded) {
      await asset.downloadAsync();
    }
    const uri = asset.localUri ?? asset.uri;
    if (uri) return { uri };
  } catch (err) {
    console.warn('[appAudio] resolve asset failed', err);
  }
  return source;
}

/**
 * Play without leaking uncaught HTMLMediaElement.play() rejections
 * (AbortError from pause races, NotSupportedError for bad sources).
 */
export async function safePlayAudioPlayer(player: AudioPlayer): Promise<boolean> {
  try {
    const media = (player as WebAudioPlayer).media;
    if (media && typeof media.play === 'function') {
      if (!media.src && !media.currentSrc) return false;
      await media.play();
      (player as WebAudioPlayer).isPlaying = true;
      return true;
    }
    player.play();
    return true;
  } catch (err) {
    if (isBenignPlayAbort(err)) return false;
    console.warn('[appAudio] play failed', err);
    return false;
  }
}

/** Seek works on web via seekTo(); currentTime is read-only there. */
export async function seekPlaybackPlayer(player: AudioPlayer, seconds: number): Promise<void> {
  const sec = Math.max(0, seconds);
  if (typeof player.seekTo === 'function') {
    await player.seekTo(sec);
    return;
  }
  try {
    player.currentTime = sec;
  } catch {
    /* ignore */
  }
}
