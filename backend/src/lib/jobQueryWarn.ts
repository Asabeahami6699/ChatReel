/**
 * Throttle noisy job query failures (e.g. Supabase `fetch failed` during
 * network blips) so the console isn't flooded every interval tick.
 */
const lastLogAt = new Map<string, number>();
const suppressCount = new Map<string, number>();

const DEFAULT_COOLDOWN_MS = 60_000;

export function warnJobQueryFailure(
  key: string,
  prefix: string,
  err: unknown,
  cooldownMs = DEFAULT_COOLDOWN_MS
): void {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err);

  const now = Date.now();
  const last = lastLogAt.get(key) ?? 0;
  if (now - last < cooldownMs) {
    suppressCount.set(key, (suppressCount.get(key) ?? 0) + 1);
    return;
  }

  const skipped = suppressCount.get(key) ?? 0;
  suppressCount.set(key, 0);
  lastLogAt.set(key, now);

  if (skipped > 0) {
    console.warn(`${prefix}: ${message} (+${skipped} similar since last log)`);
  } else {
    console.warn(`${prefix}: ${message}`);
  }
}
