type Counters = {
  calls_started: number;
  calls_accepted: number;
  calls_ended: number;
  calls_missed: number;
  calls_declined: number;
  calls_cancelled: number;
  calls_concurrency_rejected: number;
  livekit_token_minted: number;
  livekit_errors: number;
};

const counters: Counters = {
  calls_started: 0,
  calls_accepted: 0,
  calls_ended: 0,
  calls_missed: 0,
  calls_declined: 0,
  calls_cancelled: 0,
  calls_concurrency_rejected: 0,
  livekit_token_minted: 0,
  livekit_errors: 0,
};

const joinLatenciesMs: number[] = [];
const MAX_SAMPLES = 200;

let lastFlushAt = Date.now();
const FLUSH_EVERY_MS = 5 * 60_000;

function maybeFlush() {
  const now = Date.now();
  if (now - lastFlushAt < FLUSH_EVERY_MS) return;
  lastFlushAt = now;
  const snapshot = getCallMetricsSnapshot();
  console.log(JSON.stringify({ type: 'call_metrics', ...snapshot, at: new Date().toISOString() }));
}

export function incCallMetric(key: keyof Counters, by = 1) {
  counters[key] += by;
  maybeFlush();
}

/** Record accept→joined path latency once the callee gets a token. */
export function recordCallJoinLatencyMs(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return;
  joinLatenciesMs.push(ms);
  if (joinLatenciesMs.length > MAX_SAMPLES) joinLatenciesMs.shift();
}

export function getCallMetricsSnapshot() {
  const sorted = [...joinLatenciesMs].sort((a, b) => a - b);
  const p50 = sorted.length ? sorted[Math.floor(sorted.length * 0.5)] : null;
  const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : null;
  return {
    ...counters,
    join_latency_ms_p50: p50,
    join_latency_ms_p95: p95,
    join_latency_samples: sorted.length,
  };
}
