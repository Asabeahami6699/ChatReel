import { api } from './api';

type TwoFaStatus = { enabled: boolean; security_question: string | null };

let cached: TwoFaStatus | null = null;
let inflight: Promise<TwoFaStatus> | null = null;
let fetchedAt = 0;

const TTL_MS = 5 * 60 * 1000;

/** Cached 2FA status so Settings opens instantly. */
export function getCached2faStatus(): TwoFaStatus | null {
  if (!cached) return null;
  if (Date.now() - fetchedAt > TTL_MS) return cached; // still return stale while refreshing
  return cached;
}

export function setCached2faStatus(status: TwoFaStatus): void {
  cached = status;
  fetchedAt = Date.now();
}

export function clearCached2faStatus(): void {
  cached = null;
  fetchedAt = 0;
  inflight = null;
}

export async function prefetch2faStatus(force = false): Promise<TwoFaStatus | null> {
  if (!force && cached && Date.now() - fetchedAt < TTL_MS) return cached;
  if (inflight) return inflight;
  inflight = api.account2fa
    .status()
    .then((res) => {
      setCached2faStatus(res);
      return res;
    })
    .catch(() => cached)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
