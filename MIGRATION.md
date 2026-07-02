# ChatApp — Frontend + Express Backend Migration

Architecture after Option A (full replacement):

```
React Native App
    ├── Express API (all CRUD, auth, uploads)
    └── Supabase Realtime (live message/group updates only)
            └── PostgreSQL (Supabase)
```

## 1. Recreate the database

1. Open your [Supabase Dashboard](https://supabase.com/dashboard) → **SQL Editor**
2. Paste and run:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_push_tokens.sql` (push notifications)
3. In **Storage**, create public buckets:
   - `avatars`
   - `group_avatar`
   - `chat-files`
4. Copy from **Project Settings → API**:
   - Project URL
   - `anon` key
   - `service_role` key (backend only — never ship to the app)

## 2. Start the backend

```bash
cd backend
cp .env.example .env
# Edit .env with your Supabase URL + service role key + anon key

npm install
npm run dev
```

API health check: `http://localhost:3001/health`

### API routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Sign up |
| POST | `/api/auth/login` | Sign in (returns Supabase session for Realtime) |
| POST | `/api/auth/refresh` | Refresh token |
| GET/PATCH | `/api/profiles/me` | Profile read/update |
| GET | `/api/profiles/suggestions` | Friend suggestions (mutual, location, new users) |
| GET | `/api/friendships` | List friendships |
| POST | `/api/friendships/request` | Send friend request |
| GET/POST | `/api/groups` | Groups list / create |
| GET | `/api/groups/:id/details` | Group info, members, invites |
| GET/POST | `/api/messages` | Messages list / send |
| PATCH | `/api/messages/read` | Mark messages read |
| POST | `/api/keys` | Register E2EE public keys |
| POST | `/api/uploads` | Upload files to Supabase Storage |
| GET | `/api/chats/individual` | Individual chat list |
| GET | `/api/chats/groups` | Group chat list |
| POST/DELETE | `/api/notifications/register` | Register/unregister Expo push token |

## 3. Configure the frontend

Add to your root `.env`:

```env
EXPO_PUBLIC_API_URL=http://localhost:3001
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

For a physical device, use your machine's LAN IP instead of `localhost`.

## 4. Migration status

### ✅ Migrated to Express API

All CRUD, auth, uploads, and aggregated chat-list queries go through `src/lib/api.ts`:

- **Auth:** `AuthContext`, `useAuth`
- **Hooks:** `useChat`, `useIndividualChats`, `useGroupList`, `useKeys`
- **Screens:** Profile, FriendRequests, AddFriend, ChatRoom, ChatList, QR, JoinGroup, Invite, NewGroup, GroupInfo, FriendsList
- **Components:** DropdownMenu

### ✅ Supabase on the client (intentional)

The app no longer calls `supabase.from()` or `supabase.storage`. Supabase is used only for:

- **Realtime** — `supabase.channel(...)` in hooks and screens for live updates
- **Session sync** — after login/register via API, tokens are set on the Supabase client so Realtime respects RLS

Files with Realtime subscriptions:

- `useChat`, `useIndividualChats`, `useGroupList`
- `ChatRoomScreen`, `FriendRequestsScreen`, `FriendsListScreen`, `GroupInfoScreen`, `DropdownMenu`

### Optional follow-ups

- End-to-end test: register → login → friends → groups → chat → uploads → Realtime delivery

### Push notifications

Run `supabase/migrations/002_push_tokens.sql` after the initial schema.

Backend sends Expo push notifications for:

- New friend requests
- Accepted friend requests
- New direct messages

The app registers push tokens via `POST /api/notifications/register` when the user signs in (`PushNotificationRegistrar` in `App.tsx`).

For production push tokens, set `EXPO_PUBLIC_EAS_PROJECT_ID` in `.env` (see `.env.example`).

## 5. Development tips

- Backend uses **service role** → bypasses RLS for writes
- Frontend Realtime uses **user JWT** → RLS policies in the SQL file control what events you receive
- E2EE: keep encrypt/decrypt on the client; backend stores ciphertext only
- **friendships** use `profiles.id`; **messages** use auth `user_id`
