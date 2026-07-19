import { create } from 'zustand';
import { api } from '../lib/api';

export type PeerProfile = {
  user_id: string;
  display_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  status?: string | null;
  last_seen_at?: string | null;
  [key: string]: unknown;
};

type PeerEntry = {
  profile: PeerProfile;
  updatedAt: number;
};

type PeerProfileStore = {
  byUserId: Record<string, PeerEntry>;
  loadingIds: Record<string, boolean>;
  ensureLoaded: (userId: string, opts?: { force?: boolean }) => Promise<PeerProfile | null>;
  getCached: (userId: string) => PeerProfile | null;
  reset: () => void;
};

const inflight = new Map<string, Promise<PeerProfile | null>>();
const STALE_MS = 5 * 60_000;

export const usePeerProfileStore = create<PeerProfileStore>((set, get) => ({
  byUserId: {},
  loadingIds: {},

  getCached: (userId: string) => get().byUserId[userId]?.profile ?? null,

  ensureLoaded: async (userId: string, opts) => {
    if (!userId) return null;
    const existing = get().byUserId[userId];
    if (
      existing &&
      !opts?.force &&
      Date.now() - existing.updatedAt < STALE_MS
    ) {
      return existing.profile;
    }

    const pending = inflight.get(userId);
    if (pending) return pending;

    set((s) => ({
      loadingIds: { ...s.loadingIds, [userId]: true },
    }));

    const task = (async () => {
      try {
        const { profile } = await api.profiles.getByUserId(userId);
        if (!profile) {
          set((s) => {
            const loadingIds = { ...s.loadingIds };
            delete loadingIds[userId];
            return { loadingIds };
          });
          return null;
        }
        const row = profile as PeerProfile;
        set((s) => {
          const loadingIds = { ...s.loadingIds };
          delete loadingIds[userId];
          return {
            byUserId: {
              ...s.byUserId,
              [userId]: { profile: row, updatedAt: Date.now() },
            },
            loadingIds,
          };
        });
        return row;
      } catch {
        set((s) => {
          const loadingIds = { ...s.loadingIds };
          delete loadingIds[userId];
          return { loadingIds };
        });
        return existing?.profile ?? null;
      } finally {
        inflight.delete(userId);
      }
    })();

    inflight.set(userId, task);
    return task;
  },

  reset: () => {
    inflight.clear();
    set({ byUserId: {}, loadingIds: {} });
  },
}));
