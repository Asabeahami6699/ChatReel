import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReelUploadCheckpoint, ReelUploadDraft, ReelUploadTask } from './reelUploadQueue';

const STORAGE_KEY = '@chatreel/reel-upload-queue-v1';

export type PersistedReelUploadState = {
  tasks: ReelUploadTask[];
  drafts: Record<string, ReelUploadDraft>;
  checkpoints: Record<string, ReelUploadCheckpoint>;
};

export async function loadReelUploadState(): Promise<PersistedReelUploadState | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedReelUploadState;
    if (!parsed?.tasks?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveReelUploadState(state: PersistedReelUploadState): Promise<void> {
  const active = state.tasks.filter((t) => t.status !== 'done');
  if (active.length === 0) {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function clearReelUploadState(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
