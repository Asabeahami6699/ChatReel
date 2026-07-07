export type RealtimeListener = () => void;

export type RealtimeTopic = {
  subscribe: (listener: RealtimeListener) => () => void;
  notify: () => void;
  notifyImmediate: () => void;
};

const DEBOUNCE_MS = 150;

export function createRealtimeTopic(_name: string): RealtimeTopic {
  const listeners = new Set<RealtimeListener>();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const runListeners = () => {
    listeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error(`[realtime:${_name}] listener error:`, e);
      }
    });
  };

  const notify = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      runListeners();
    }, DEBOUNCE_MS);
  };

  const notifyImmediate = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    runListeners();
  };

  const subscribe = (listener: RealtimeListener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return { subscribe, notify, notifyImmediate };
}
