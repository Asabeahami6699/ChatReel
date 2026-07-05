import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { ReelDTO } from '../../lib/api';

/** Adjust grid + immersive viewer state after a reel is deleted. */
export function useReelGridDeleteHandlers(
  setPosts: Dispatch<SetStateAction<ReelDTO[]>>,
  setGeneratedThumbs: Dispatch<SetStateAction<Record<string, string>>>,
  setImmersiveIndex: Dispatch<SetStateAction<number | null>>
) {
  return useCallback(
    (reelId: string, index: number) => {
      setPosts((prev) => prev.filter((r) => r.id !== reelId));
      setGeneratedThumbs((prev) => {
        const next = { ...prev };
        delete next[reelId];
        return next;
      });
      setImmersiveIndex((cur) => {
        if (cur == null) return null;
        if (cur === index) return null;
        if (cur > index) return cur - 1;
        return cur;
      });
    },
    [setPosts, setGeneratedThumbs, setImmersiveIndex]
  );
}
