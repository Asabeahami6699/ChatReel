# Phase 3 — True WhatsApp shape (foundation)

This is a **single-region foundation**, not a finished global WhatsApp clone.
Multi-region DBs and Kafka still need cloud ops when traffic demands them.

## What was implemented

| Piece | Purpose | How |
|-------|---------|-----|
| **Own WebSocket gateway** | Persistent chat socket next to Supabase Realtime | `ws://API/ws` — auth via JWT query/`auth` frame |
| **Push / fan-out queue** | Async Expo push | Memory queue always; `REDIS_URL` + `ioredis` for shared queue |
| **Multi-device sync** | Device registry + cursors + catch-up API | `devices`, `sync_cursor` tables; `/api/realtime/sync/*` |
| **E2E policy** | Decide encryption stance without rewriting crypto | `E2E_MODE=off\|prefer\|strict` (`strict` rejects plaintext text) |
| **Observability** | Send/call SLO samples | `GET /api/realtime/metrics` |
| **Region label** | Prep for multi-region | `REGION_ID` on health / WS ready |

Supabase Realtime + LiveKit remain; the socket layer is additive.

## Apply SQL

```text
Supabase SQL Editor → supabase/phase3/01_devices_sync.sql
```

## Env (`backend/.env`)

```env
WS_PATH=/ws
E2E_MODE=prefer
REGION_ID=default
REDIS_URL=                 # optional — npm i ioredis in backend
SLO_SEND_P95_MS=800
SLO_CALL_JOIN_P95_MS=2500
```

Restart API. Client `ChatSocketRegistrar` connects automatically when signed in.

## Multi-region / Kafka (not coded)

Those need managed infra (second region DB replicas, Redis Cluster, Kafka/SQS).
Use `REGION_ID` + CDN + LiveKit edge when you expand; don’t reinvent until metrics force it.

## E2E notes

- Key crypto already exists (`src/lib/crypto.ts`, `/api/keys`).
- `prefer` (default): encrypt when client has keys; server accepts plaintext or ciphertext.
- `strict`: server rejects `plaintext:true` text messages — turn on only after clients encrypt reliably.

## Verify

1. Backend log shows `[ws] gateway on path /ws`
2. `GET /api/realtime/status` → queue + e2e_mode + ws stats
3. Send a DM → both users’ WS clients get `message.created` (and Realtime still works)
