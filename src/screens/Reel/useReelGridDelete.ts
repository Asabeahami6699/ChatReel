import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { useReelProfileStore } from '../../stores/reelProfileStore';

/** Adjust grid + immersive viewer state after reels are deleted. */
export function useReelGridDeleteHandlers(
  profileId: string,
  setImmersiveIndex: Dispatch<SetStateAction<number | null>>
) {
  const removeReels = useReelProfileStore((s) => s.removeReels);

  const removeOne = useCallback(
    (reelId: string, index: number) => {
      if (!profileId) return;
      removeReels(profileId, [reelId]);
      setImmersiveIndex((cur) => {
        if (cur == null) return null;
        if (cur === index) return null;
        if (cur > index) return cur - 1;
        return cur;
      });
    },
    [profileId, removeReels, setImmersiveIndex]
  );

  const removeMany = useCallback(
    (reelIds: string[]) => {
      if (!profileId) return;
      removeReels(profileId, reelIds);
      setImmersiveIndex(null);
    },
    [profileId, removeReels, setImmersiveIndex]
  );

  return { removeOne, removeMany };
}
