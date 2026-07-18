# Phase 2 — Split & strengthen

Code for scale is in place. Ops items still need your cloud console.

## Implemented in code

| Item | What |
|------|------|
| **20. CDN media** | Set `MEDIA_CDN_BASE_URL` (or `REELS_CDN_URL`). API rewrites storage URLs on responses; DB keeps Supabase URLs. |
| **21. Hot / cold messages** | Run `supabase/phase2/01_messages_archive.sql`. Job archives settled rows older than `MESSAGE_ARCHIVE_AFTER_DAYS`. List stays on hot `messages`; `?archive=true` reads cold. |
| **22. Indexes** | Hot indexes already in fresh schema; phase2 SQL adds group catch-up + archive indexes. |
| **23. Soft service split** | `backend/src/routers/chat.router.ts` + `calls.router.ts` — same `/api/...` paths, ready to split deploy later. |
| **24. TURN** | LiveKit Cloud includes TURN. Configure TURN only if self-hosting LiveKit server. See `/api/calls/config` → `turn: livekit-managed`. |
| **25. Call metrics** | In-process counters + join latency p50/p95. `GET /api/calls/metrics`. JSON log every ~5 min. |
| **26. Concurrent call cap** | `MAX_CONCURRENT_CALLS` (default 2). Over limit → `429` `CALL_CONCURRENCY_LIMIT`. LiveKit capacity → `503` `LIVEKIT_CAPACITY`. |

## Ops (console — not code)

| Item | Action |
|------|--------|
| **18. LiveKit plan** | Upgrade LiveKit Cloud concurrent connections when metrics show SFU pressure. |
| **19. Render** | Move API off free/sleeping tier; enable autoscaling or a second instance. Shared in-memory metrics/rate-limits are per instance. |
| **CDN setup** | Cloudflare (or similar) proxy → Supabase storage origin; preserve `/storage/v1/object/public/...` path. Set `MEDIA_CDN_BASE_URL=https://cdn.yourdomain.com`. |

## Apply archive SQL

```text
Supabase SQL Editor → run supabase/phase2/01_messages_archive.sql
```

## Env knobs (`backend/.env`)

```env
MEDIA_CDN_BASE_URL=
MAX_CONCURRENT_CALLS=2
MESSAGE_ARCHIVE_AFTER_DAYS=90
MESSAGE_ARCHIVE_INTERVAL_MS=21600000
MESSAGES_LIST_MAX_LIMIT=100
```

Manual archive batch: `POST /api/messages/archive/run` (authenticated).
