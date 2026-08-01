/**
 * Suppress App Lock / Chat Lock while the OS gallery, camera, or document
 * picker is open — those send the app to background and would otherwise
 * flash the lock gate over the picker result.
 */
let depth = 0;
let pauseUntil = 0;

export function beginPrivacyLockPause(holdMsAfterEnd = 2000): void {
  depth += 1;
  pauseUntil = Math.max(pauseUntil, Date.now() + Math.max(holdMsAfterEnd, 500));
}

export function endPrivacyLockPause(holdMsAfterEnd = 2000): void {
  depth = Math.max(0, depth - 1);
  pauseUntil = Math.max(pauseUntil, Date.now() + Math.max(holdMsAfterEnd, 500));
}

export function isPrivacyLockPaused(): boolean {
  return depth > 0 || Date.now() < pauseUntil;
}

/** Run an async picker / share sheet without engaging privacy locks. */
export async function withPrivacyLockPause<T>(fn: () => Promise<T>): Promise<T> {
  beginPrivacyLockPause();
  try {
    return await fn();
  } finally {
    endPrivacyLockPause();
  }
}
