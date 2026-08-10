import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { queueBackend } from '../lib/jobQueue';
import { getCallMetricsSnapshot } from '../lib/callMetrics';
import { getSloMetricsSnapshot } from '../lib/sloMetrics';
import { getWsStats } from '../realtime/wsGateway';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { asyncHandler, AuthedRequest, requireAuth } from '../middleware/auth';

const router = Router();

router.get(
  '/status',
  requireAuth,
  asyncHandler(async (_req: AuthedRequest, res) => {
    return res.json({
      region: env.regionId,
      e2e_mode: env.e2eMode,
      ws_path: env.wsPath,
      queue: queueBackend(),
      ws: getWsStats(),
    });
  })
);

router.get(
  '/metrics',
  requireAuth,
  asyncHandler(async (_req: AuthedRequest, res) => {
    const call = getCallMetricsSnapshot();
    return res.json({
      region: env.regionId,
      metrics: getSloMetricsSnapshot({
        sendP95Ms: env.sloSendP95Ms,
        callJoinP95Ms: env.sloCallJoinP95Ms,
        callJoinP95: call.join_latency_ms_p95,
      }),
      call_metrics: call,
      ws: getWsStats(),
      queue: queueBackend(),
    });
  })
);

/** Register / heartbeat this device for multi-device sync. */
router.post(
  '/devices',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z
      .object({
        device_id: z.string().min(4).max(128),
        platform: z.string().max(40).optional(),
        app_version: z.string().max(40).optional(),
      })
      .parse(req.body);

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('devices')
      .upsert(
        {
          user_id: req.userId!,
          device_id: body.device_id,
          platform: body.platform ?? null,
          app_version: body.app_version ?? null,
          last_seen_at: now,
        },
        { onConflict: 'user_id,device_id' }
      )
      .select('*')
      .single();

    if (error) {
      return res.status(503).json({
        error: error.message,
        hint: 'Apply supabase/phase3/01_devices_sync.sql',
      });
    }
    return res.json({ device: data });
  })
);

router.get(
  '/devices',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { data, error } = await supabaseAdmin
      .from('devices')
      .select('*')
      .eq('user_id', req.userId!)
      .order('last_seen_at', { ascending: false });
    if (error) return res.status(503).json({ error: error.message });
    return res.json({ devices: data ?? [] });
  })
);

/** Acknowledge sync cursor after catch-up. */
router.post(
  '/sync/ack',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z
      .object({
        device_id: z.string().min(4).max(128),
        stream: z.string().min(1).max(40).default('messages'),
        cursor_at: z.string().min(1),
      })
      .parse(req.body);

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('sync_cursor')
      .upsert(
        {
          user_id: req.userId!,
          device_id: body.device_id,
          stream: body.stream,
          cursor_at: body.cursor_at,
          updated_at: now,
        },
        { onConflict: 'user_id,device_id,stream' }
      )
      .select('*')
      .single();

    if (error) {
      return res.status(503).json({
        error: error.message,
        hint: 'Apply supabase/phase3/01_devices_sync.sql',
      });
    }
    return res.json({ cursor: data });
  })
);

router.get(
  '/sync/cursor',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const deviceId = z.string().min(4).parse(req.query.device_id);
    const stream = z.string().min(1).default('messages').parse(req.query.stream ?? 'messages');
    const { data, error } = await supabaseAdmin
      .from('sync_cursor')
      .select('*')
      .eq('user_id', req.userId!)
      .eq('device_id', deviceId)
      .eq('stream', stream)
      .maybeSingle();
    if (error) return res.status(503).json({ error: error.message });
    return res.json({ cursor: data });
  })
);

/**
 * Catch-up messages since a cursor for this user (DM + groups they belong to).
 * Complements Realtime / WS — store-and-forward style multi-device sync.
 */
router.get(
  '/sync/messages',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    // Accept ISO timestamps with offsets / fractional seconds (Zod default datetime is too strict).
    const sinceRaw = String(req.query.since ?? '');
    const sinceDate = new Date(sinceRaw);
    if (!sinceRaw || Number.isNaN(sinceDate.getTime())) {
      return res.status(400).json({ error: 'Invalid since timestamp' });
    }
    const since = sinceDate.toISOString();
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));

    const { data: memberships, error: memErr } = await supabaseAdmin
      .from('group_members')
      .select('group_id')
      .eq('user_id', userId);
    if (memErr) {
      console.warn('[realtime/sync/messages] group_members:', memErr.message);
    }
    const groupIds = (memberships ?? [])
      .map((m) => m.group_id as string)
      .filter(Boolean);

    // Split DM + group queries — a single .or() with a large in.() often 500s on PostgREST.
    const [dmRes, groupRes] = await Promise.all([
      supabaseAdmin
        .from('messages')
        .select('*')
        .gt('created_at', since)
        .or(`receiver_id.eq.${userId},sender_id.eq.${userId}`)
        .is('group_id', null)
        .order('created_at', { ascending: true })
        .limit(limit),
      groupIds.length
        ? supabaseAdmin
            .from('messages')
            .select('*')
            .gt('created_at', since)
            .in('group_id', groupIds)
            .order('created_at', { ascending: true })
            .limit(limit)
        : Promise.resolve({ data: [] as unknown[], error: null }),
    ]);

    if (dmRes.error) {
      console.warn('[realtime/sync/messages] dm query:', dmRes.error.message);
      // Prefer empty catch-up over a hard 500 — client can rely on WS / open-chat fetch.
      return res.json({ messages: [], since, limit, degraded: true });
    }
    if (groupRes.error) {
      console.warn('[realtime/sync/messages] group query:', groupRes.error.message);
      // Still return DMs rather than failing the whole catch-up.
    }

    const merged = [...(dmRes.data ?? []), ...((groupRes.data as unknown[]) ?? [])].sort(
      (a, b) =>
        String((a as { created_at?: string }).created_at ?? '').localeCompare(
          String((b as { created_at?: string }).created_at ?? '')
        )
    );
    const messages = merged.slice(0, limit);

    return res.json({ messages, since, limit });
  })
);

export default router;
