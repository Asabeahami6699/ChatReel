type AppToastRequest = {
  message: string;
  isError?: boolean;
  durationMs?: number;
};

type Listener = (next: AppToastRequest | null) => void;

let listener: Listener | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;
let lastMessage = '';
let lastAt = 0;

/** Lightweight global snackbar (Call ended, No answer, etc.). */
export function showAppToast(
  message: string,
  opts?: { isError?: boolean; durationMs?: number }
): void {
  const text = message.trim();
  if (!text) return;
  const now = Date.now();
  // Deduplicate rapid identical toasts (e.g. disconnect + hangup).
  if (text === lastMessage && now - lastAt < 1600) return;
  lastMessage = text;
  lastAt = now;
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
  listener?.({
    message: text,
    isError: opts?.isError,
    durationMs: opts?.durationMs ?? 3200,
  });
}

export function clearAppToast(): void {
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
  listener?.(null);
}

export function subscribeAppToast(fn: Listener): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

export function scheduleAppToastClear(ms: number): void {
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    clearTimer = null;
    listener?.(null);
  }, ms);
}
