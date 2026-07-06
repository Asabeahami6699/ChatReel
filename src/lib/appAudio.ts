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

export function createLoopingPlayer(source: number | string): AudioPlayer {
  const player = createAudioPlayer(source);
  player.loop = true;
  return player;
}

export function createPlaybackPlayer(source: string | number): AudioPlayer {
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
