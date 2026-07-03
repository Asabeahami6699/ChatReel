/** Compute grid columns/rows for N video tiles (max 10). */
export function callGridLayout(count: number): { cols: number; rows: number } {
  const n = Math.max(1, Math.min(count, 10));
  if (n === 1) return { cols: 1, rows: 1 };
  if (n === 2) return { cols: 2, rows: 1 };
  if (n <= 4) return { cols: 2, rows: 2 };
  if (n <= 6) return { cols: 3, rows: 2 };
  if (n <= 9) return { cols: 3, rows: 3 };
  return { cols: 4, rows: 3 };
}

export type CallTileParticipant = {
  identity: string;
  name: string;
  avatarUrl: string | null;
  isLocal?: boolean;
  hasVideo?: boolean;
};
