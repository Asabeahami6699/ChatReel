import type { ReelDTO } from '../../lib/api';

export function formatReelCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`.replace('.0K', 'K');
  return `${(n / 1_000_000).toFixed(1)}M`.replace('.0M', 'M');
}

export function reelAuthorLabel(reel: ReelDTO): string {
  return (
    reel.author?.display_name?.trim() ||
    reel.author?.email?.split('@')[0] ||
    'unknown'
  );
}

export function reelAvatarUrl(reel: ReelDTO): string | null {
  return reel.author?.avatar_url ?? null;
}

/** Shallow compare fields that affect the feed row UI. */
export function reelRowDataEqual(a: ReelDTO, b: ReelDTO): boolean {
  return (
    a.id === b.id &&
    a.liked_by_me === b.liked_by_me &&
    a.like_count === b.like_count &&
    a.comment_count === b.comment_count &&
    a.view_count === b.view_count &&
    a.caption === b.caption &&
    a.visibility === b.visibility &&
    a.author_id === b.author_id &&
    a.author?.avatar_url === b.author?.avatar_url &&
    a.author?.display_name === b.author?.display_name
  );
}
