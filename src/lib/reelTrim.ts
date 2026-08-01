/** Shared helpers for reel clip windows (preview → upload → playback). */

export type ReelTrimWindow = {
  trimStartSec: number;
  trimEndSec: number;
};

export function isMeaningfulReelTrim(
  trimStartSec: number | null | undefined,
  trimEndSec: number | null | undefined,
  fullDurationSec?: number | null
): boolean {
  const start = Number(trimStartSec ?? 0);
  const end = trimEndSec != null ? Number(trimEndSec) : null;
  if (!Number.isFinite(start) || start < 0) return false;
  if (start > 0.05) return true;
  if (end == null || !Number.isFinite(end) || end <= start + 0.05) return false;
  if (
    fullDurationSec != null &&
    Number.isFinite(fullDurationSec) &&
    end >= fullDurationSec - 0.05
  ) {
    return false;
  }
  // Client only sets end when the user shortened the clip (or duration unknown).
  return true;
}

/** Fields to send on create — always include both ends when the window is a real trim. */
export function reelTrimApiFields(
  trimStartSec: number | null | undefined,
  trimEndSec: number | null | undefined,
  fullDurationSec?: number | null
): { trim_start_sec?: number; trim_end_sec?: number } {
  if (!isMeaningfulReelTrim(trimStartSec, trimEndSec, fullDurationSec)) return {};
  const start = Math.max(0, Number(trimStartSec ?? 0));
  const end = Number(trimEndSec);
  return {
    trim_start_sec: start,
    trim_end_sec: end,
  };
}

export function reelTrimClipDurationSec(
  trimStartSec: number | null | undefined,
  trimEndSec: number | null | undefined,
  fallbackDuration?: number | null
): number | undefined {
  const start = Number(trimStartSec ?? 0);
  const end = trimEndSec != null ? Number(trimEndSec) : null;
  if (end != null && Number.isFinite(end) && end > start + 0.05) {
    return end - start;
  }
  if (fallbackDuration != null && Number.isFinite(fallbackDuration) && fallbackDuration >= 0.5) {
    return fallbackDuration;
  }
  return undefined;
}
