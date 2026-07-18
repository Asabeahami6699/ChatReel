# ChatReel — Architecture & Setup (Phase 1)

WhatsApp-lite cost path: **Postgres is truth**, **Realtime + local cache + push** for live delivery — not 1–2s HTTP polling.

```
React Native / Expo app
  ├── Express API  →  send, history, catch-up, auth, uploads, calls, push
  ├── Supabase Realtime  →  messages, chats, calls, presence (primary live path)
  ├── Local cache / outbox  →  open UI offline-first; queue sends
  └── LiveKit  →  call media only (audio/video); signaling via API + Realtime
```

## 1. Database (fresh project)

Use the ordered bootstrap under `supabase/fresh/` (not the old `001–034` migration history):

1. `supabase/fresh/01_tables.sql`
2. `supabase/fresh/02_functions.sql`
3. `supabase/fresh/03_rls_realtime_storage.sql`
4. `supabase/fresh/04_seeds.sql`

See `supabase/fresh/README.md`. Storage buckets (`avatars`, `group_avatar`, `chat-files`, etc.) are created in step 3.

**Do not** re-run `supabase/migrations/001_*.sql`… on a DB that already applied `fresh/`.

Phase 1 schema notes:

- `messages.client_message_id` + unique `(sender_id, client_message_id)` for idempotent sends
- `push_tokens` for Expo device registration
- Calls / participants tables for Realtime signaling

## 2. Backend

```bash
cd backend
cp .env.example .env   # SUPABASE_URL, service role, anon, LiveKit, Expo token
npm install
npm run dev            # http://localhost:3001/health
```

Notable Phase 1 API behavior:

| Area | Behavior |
|------|----------|
| `POST /api/messages` | Accepts `client_message_id`; idempotent duplicate return |
| Message / call rate limits | Per-user limits on send & call start |
| Push | Expo; skip message push if recipient has that chat open (`/api/profiles/me/active-chat`) |
| Call push | High priority + Android `calls` channel |
| Presence | `POST /api/profiles/me/heartbeat`, status Online/Offline |

## 3. Frontend

Root `.env`:

```env
EXPO_PUBLIC_API_URL=http://localhost:3001
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_EAS_PROJECT_ID=…   # required for production Expo push
```

Physical device: use your LAN IP instead of `localhost`.

## 4. Phase 1 status (done)

### Chat delivery
- Realtime primary for open chat + inbox lists
- HTTP for send / history / rare catch-up (≈45s safety poll)
- `client_message_id` + server idempotency
- Durable outbox (text **and** media/voice upload jobs) flushed on reconnect
- Local message + chat-list caches; UI opens local-first

### Push
- Native Expo token register on login; refresh on app focus / token rotation
- Message push when recipient is not focused on that chat
- High-priority incoming-call push; tap → pending call id + IncomingCall overlay
- Web: no Expo push (Realtime while tab open) — see `usePushNotifications.web.ts`

### Calls
- Realtime-first incoming / outgoing / active call row sync
- LiveKit stays on media path; lifecycle via API + Realtime
- LiveKit reconnect forces call-row HTTP refresh
- Rate limits on call start

### Presence / lists
- Heartbeat while foregrounded; Offline on background
- Chat lists & calls feed: local-first + Realtime + debounced catch-up

## 5. Ops checklist

1. Apply `supabase/fresh/` on the target project (once)
2. Point app + backend `.env` at that project
3. Deploy backend (e.g. Render) when ready for push/idle skip across devices
4. Native QA: offline text/media send → reconnect flush; background message push; call wake + answer

## 6. Phase 2 — Split & strengthen

See **[docs/PHASE2.md](docs/PHASE2.md)** for CDN, message archive SQL, call caps/metrics, and ops checklist (LiveKit plan / Render tier / TURN).

Quick apply on the live project:

1. Run `supabase/phase2/01_messages_archive.sql` in the SQL Editor  
2. Set optional `MEDIA_CDN_BASE_URL`, `MAX_CONCURRENT_CALLS`, `MESSAGE_ARCHIVE_*` in `backend/.env`  
3. Restart the API

## 7. Phase 3 — sockets / sync / queues (foundation)

See **[docs/PHASE3.md](docs/PHASE3.md)**.

Apply `supabase/phase3/01_devices_sync.sql`, restart API. Optional: `REDIS_URL` + `npm i ioredis` in `backend` for a shared job queue.

## 8. Later (true multi-region / Kafka / full E2E product)

- Multi-region Postgres + LiveKit edge (ops)
- Kafka/SQS for planet-scale fan-out
- Harden E2E to Signal-style sessions + decrypt on all receive paths
- Shared Redis for active-chat focus + rate limits across API replicas
