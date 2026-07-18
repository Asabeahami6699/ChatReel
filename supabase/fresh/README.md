# Fresh Supabase bootstrap (new empty project)

Rewritten from your live schema dump + repo extras (payouts, RPCs, RLS, Realtime, storage, seeds).

## How to apply

1. Create a **new** Supabase project (empty).
2. Open **SQL Editor**.
3. Run files **in order**:

| Order | File |
|------:|------|
| 1 | `01_tables.sql` |
| 2 | `02_functions.sql` |
| 3 | `03_rls_realtime_storage.sql` |
| 4 | `04_seeds.sql` |

4. Point the app `.env` / `backend/.env` at the new project URL + keys.
5. Deploy the backend.

## What’s new vs the old dump

- `messages.client_message_id` + unique index (idempotent sends / offline queue)
- Hot-path chat indexes: group history + unread lookups
- Full `payout_*` tables (missing from the dump you pasted)
- `wallet_accounts.cashable_coins`
- Final call waiting: `call_participants.state` includes `held` + `held_at`
- Functions / triggers / Realtime / storage buckets / seeds

## Do not run the old `migrations/` folder on this new DB

Those 34 files are incremental history for the **old** project. This `fresh/` folder is the rewrite for the new one.
