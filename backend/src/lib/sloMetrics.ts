/**
 * In-process SLO / gateway metrics (Phase 3).
 * Per-instance only — use Redis/prom later for multi-instance scrapes.
 */

type Counters = {
  http_requests: number;
  ws_connections: number;
  ws_auth_ok: number;
  ws_auth_fail: number;
  ws_events_out: number;
  queue_enqueued: number;
  queue_processed: number;
  queue_failed: number;
  send_ack_samples: number;
  send_slo_breaches: number;
};

const counters: Counters = {
  http_requests: 0,
  ws_connections: 0,
  ws_auth_ok: 0,
  ws_auth_fail: 0,
  ws_events_out: 0,
  queue_enqueued: 0,
  queue_processed: 0,
  queue_failed: 0,
  send_ack_samples: 0,
  send_slo_breaches: 0,
};

const sendLatencies: number[] = [];
const MAX = 300;

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

export function incSloMetric(key: keyof Counters, by = 1) {
  counters[key] += by;
}

export function recordSendAckLatencyMs(ms: number, budgetMs: number) {
  if (!Number.isFinite(ms) || ms < 0) return;
  sendLatencies.push(ms);
  if (sendLatencies.length > MAX) sendLatencies.shift();
  counters.send_ack_samples += 1;
  if (ms > budgetMs) counters.send_slo_breaches += 1;
}

export function getSloMetricsSnapshot(budgets: {
  sendP95Ms: number;
  callJoinP95Ms: number;
  callJoinP95?: number | null;
}) {
  const sorted = [...sendLatencies].sort((a, b) => a - b);
  const sendP95 = percentile(sorted, 0.95);
  return {
    ...counters,
    send_ack_ms_p50: percentile(sorted, 0.5),
    send_ack_ms_p95: sendP95,
    send_slo_budget_ms: budgets.sendP95Ms,
    send_slo_ok: sendP95 == null || sendP95 <= budgets.sendP95Ms,
    call_join_ms_p95: budgets.callJoinP95 ?? null,
    call_join_slo_budget_ms: budgets.callJoinP95Ms,
    call_join_slo_ok:
      budgets.callJoinP95 == null || budgets.callJoinP95 <= budgets.callJoinP95Ms,
  };
}
