/** Pause feed reels when opening compose / upload (PostReel modal stays over the feed). */
import { useSyncExternalStore } from 'react';
import type { ReelSoundDTO } from './api';
import type { SavedReelComposeDraft } from './reelComposeDraftStore';

type PauseHandler = () => void;

const pauseHandlers = new Set<PauseHandler>();
const gateListeners = new Set<() => void>();
const playbackGates = new Set<string>();
let pendingComposeDraft: SavedReelComposeDraft | null = null;
let pendingComposeSound: ReelSoundDTO | null = null;

export function registerReelFeedPauseHandler(handler: PauseHandler): () => void {
  pauseHandlers.add(handler);
  return () => pauseHandlers.delete(handler);
}

export function pauseReelFeedPlayback(): void {
  pauseHandlers.forEach((handler) => {
    try {
      handler();
    } catch {
      /* ignore */
    }
  });
}

/** Block auto-resume while a modal / overlay is open. */
export function setReelPlaybackGate(id: string, blocked: boolean): void {
  if (blocked) {
    if (!playbackGates.has(id)) {
      playbackGates.add(id);
      pauseReelFeedPlayback();
      gateListeners.forEach((l) => l());
    }
    return;
  }
  if (playbackGates.delete(id)) {
    gateListeners.forEach((l) => l());
  }
}

export function isReelPlaybackGateActive(): boolean {
  return playbackGates.size > 0;
}

export function useReelPlaybackGateActive(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      gateListeners.add(onStoreChange);
      return () => gateListeners.delete(onStoreChange);
    },
    () => playbackGates.size > 0,
    () => false
  );
}

/** Call before navigating to PostReel so background reels stop immediately. */
export function openPostReelCompose(draft?: SavedReelComposeDraft): void {
  pendingComposeDraft = draft ?? null;
  setReelPlaybackGate('post-reel-nav', true);
  pauseReelFeedPlayback();
}

/** Open PostReel with a sound pre-selected (from sound page or reel feed). */
export function openPostReelWithSound(sound: ReelSoundDTO): void {
  pendingComposeSound = sound;
  setReelPlaybackGate('post-reel-nav', true);
  pauseReelFeedPlayback();
}

export function consumePendingComposeDraft(): SavedReelComposeDraft | null {
  const draft = pendingComposeDraft;
  pendingComposeDraft = null;
  return draft;
}

export function consumePendingComposeSound(): ReelSoundDTO | null {
  const sound = pendingComposeSound;
  pendingComposeSound = null;
  return sound;
}
