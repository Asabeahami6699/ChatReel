import type { ReelDTO } from '../../lib/api';
import { useReelProfileStore } from '../../stores/reelProfileStore';

/**
 * Build an author-only immersive feed starting at the reel the user was watching
 * (TikTok-style profile handoff).
 */
export async function resolveCreatorFeedAtReel(
  reel: ReelDTO,
  limit = 48
): Promise<{ posts: ReelDTO[]; initialIndex: number; profileId: string | null }> {
  const profileId = reel.author_id || reel.author?.id || null;
  if (!profileId) {
    return { posts: [reel], initialIndex: 0, profileId: null };
  }

  const store = useReelProfileStore.getState();
  try {
    await store.ensureLoaded(profileId, limit);
  } catch {
    /* fall through with the watched reel alone */
  }

  let posts = store.getEntry(profileId).posts.slice();
  let initialIndex = posts.findIndex((r) => r.id === reel.id);

  if (initialIndex < 0) {
    posts = [reel, ...posts.filter((r) => r.id !== reel.id)];
    initialIndex = 0;
    store.setPosts(profileId, posts);
  }

  if (posts.length === 0) {
    posts = [reel];
    initialIndex = 0;
  }

  return { posts, initialIndex, profileId };
}
