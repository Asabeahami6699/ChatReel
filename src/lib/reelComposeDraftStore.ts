import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReelSoundDTO } from './api';
import type { ReelUploadDraft } from './reelUploadQueue';

const STORAGE_KEY = '@chatreel/reel-compose-drafts-v1';

export type SavedReelComposeDraft = {
  id: string;
  label: string;
  savedAt: number;
  draft: ReelUploadDraft;
  sound?: ReelSoundDTO | null;
};

export async function listReelComposeDrafts(): Promise<SavedReelComposeDraft[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedReelComposeDraft[];
    return Array.isArray(parsed) ? parsed.sort((a, b) => b.savedAt - a.savedAt) : [];
  } catch {
    return [];
  }
}

export async function saveReelComposeDraft(
  draft: ReelUploadDraft,
  label?: string,
  sound?: ReelSoundDTO | null
): Promise<SavedReelComposeDraft> {
  const existing = await listReelComposeDrafts();
  const entry: SavedReelComposeDraft = {
    id: `draft-${Date.now()}`,
    label: label?.trim() || draft.caption?.trim()?.slice(0, 40) || 'Video draft',
    savedAt: Date.now(),
    draft,
    sound: sound ?? null,
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...existing].slice(0, 20)));
  return entry;
}

export async function deleteReelComposeDraft(id: string): Promise<void> {
  const existing = await listReelComposeDrafts();
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(existing.filter((d) => d.id !== id))
  );
}
