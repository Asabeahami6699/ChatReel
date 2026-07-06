/** Pause feed reels when opening compose / upload (PostReel modal stays over the feed). */
type PauseHandler = () => void;

const pauseHandlers = new Set<PauseHandler>();

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

/** Call before navigating to PostReel so background reels stop immediately. */
export function openPostReelCompose(): void {
  pauseReelFeedPlayback();
}
