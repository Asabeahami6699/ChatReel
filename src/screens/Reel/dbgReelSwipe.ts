/** Debug-session ingest helper for reel swipe investigation. */
export function dbgReelSwipe(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown> = {}
) {
  // #region agent log
  const payload = {
    sessionId: '8cebb0',
    runId: typeof data.runId === 'string' ? data.runId : 'pre',
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  console.log('[REEL_SWIPE_DBG]', hypothesisId, message, data);
  const body = JSON.stringify(payload);
  const hosts =
    typeof window !== 'undefined'
      ? Array.from(new Set([window.location.hostname, '127.0.0.1']).values()).filter(Boolean)
      : ['127.0.0.1'];
  for (const host of hosts) {
    const url = `http://${host}:7873/ingest/6cdc8920-733c-4986-8d68-feb016f24fae`;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon(url, blob)) continue;
      }
    } catch {
      // fall through to fetch
    }
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '8cebb0',
      },
      body,
    }).catch(() => {});
  }
  // #endregion
}
