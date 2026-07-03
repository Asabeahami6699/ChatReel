import { create } from 'zustand';
import { api } from '../lib/api';

type ProfileRow = Record<string, unknown>;

type ProfileStore = {
  authUserId: string | null;
  profileId: string | null;
  profile: ProfileRow | null;
  loading: boolean;
  ensureLoaded: (authUserId: string) => Promise<void>;
  reset: () => void;
};

let inflight: Promise<void> | null = null;
let inflightUserId: string | null = null;

export const useProfileStore = create<ProfileStore>((set, get) => ({
  authUserId: null,
  profileId: null,
  profile: null,
  loading: false,

  ensureLoaded: async (authUserId: string) => {
    const state = get();
    if (state.authUserId === authUserId && state.profileId) return;
    if (inflight && inflightUserId === authUserId) {
      await inflight;
      return;
    }

    inflightUserId = authUserId;
    set({ loading: true, authUserId });

    inflight = (async () => {
      try {
        const { profile } = await api.profiles.me();
        set({
          authUserId,
          profile: profile ?? null,
          profileId: (profile?.id as string) ?? null,
          loading: false,
        });
      } catch {
        set({
          authUserId,
          profile: null,
          profileId: null,
          loading: false,
        });
      }
    })();

    try {
      await inflight;
    } finally {
      inflight = null;
      inflightUserId = null;
    }
  },

  reset: () => {
    inflight = null;
    inflightUserId = null;
    set({
      authUserId: null,
      profileId: null,
      profile: null,
      loading: false,
    });
  },
}));

/** Resolve profile id once (shared cache for realtime hub, etc.). */
export async function ensureProfileId(authUserId: string): Promise<string | null> {
  await useProfileStore.getState().ensureLoaded(authUserId);
  return useProfileStore.getState().profileId;
}
