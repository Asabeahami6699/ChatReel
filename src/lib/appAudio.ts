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

export function createLoopingPlayer(source: number | string | { uri: string }): AudioPlayer {
  const player = createAudioPlayer(source);
  player.loop = true;
  return player;
}

export function createPlaybackPlayer(source: string | number | { uri: string }): AudioPlayer {
  return createAudioPlayer(source);
}

export async function releasePlayer(player: AudioPlayer | null): Promise<void> {
  if (!player) return;
  try {
    player.pause();
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
 * (common web NotSupportedError when the source can't decode).
 */
export async function safePlayAudioPlayer(player: AudioPlayer): Promise<boolean> {
  try {
    const media = (player as AudioPlayer & { media?: HTMLMediaElement }).media;
    if (media && typeof media.play === 'function') {
      if (!media.src && !media.currentSrc) return false;
      await media.play();
      (player as AudioPlayer & { isPlaying?: boolean }).isPlaying = true;
      return true;
    }
    player.play();
    return true;
  } catch (err) {
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
