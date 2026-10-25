# Backend baseline (nexus. and core.)

Until now the nexus./core. database only existed inside the live NEXUS
Supabase project: its core tables were made by hand and never saved to git.
`production_schema.sql` fixes that. It is the complete structure of that
project, captured read-only on 2026-10-25: tables, keys, indexes, row level
security, functions, triggers, permissions and storage buckets. It has **no
customer, order or payment data**, only the memberships and product
categories the app can't run without.

Checked: a database built from this file matches production exactly on all
ten fingerprint parts (`fingerprint.sql`), and `supabase/tests` pass on it.
CI (`backend-ci.yml`) rebuilds it from git on every change under `supabase/`.

## Build a new, empty project

For the 2.0 backend in the account that holds PULSE2.0. Never against a
project that already has these tables.

1. Create the project in the Supabase dashboard (free plan, region near Las Vegas, e.g. us-west).
2. In its SQL editor, run `production_schema.sql`.
3. Run each file in `supabase/migrations/` dated **after** `20261002062537`, oldest first. Older ones are already part of the baseline.
4. Add the Vault secrets by hand (Dashboard → Project Settings → Vault): `ecosystem_push_cron_secret`, `ecosystem_vapid_public` and `ecosystem_vapid_private`. Generate new ones; never reuse production's.
5. Recreate the two scheduled jobs, with the new project's URL:
   ```sql
   select cron.schedule('ecosystem-push-dispatch', '* * * * *', $$
     select net.http_post(
       url := 'https://<NEW_REF>.supabase.co/functions/v1/app-push?action=dispatch',
       headers := jsonb_build_object('Content-Type','application/json','x-cron-key',
         (select decrypted_secret from vault.decrypted_secrets where name='ecosystem_push_cron_secret' limit 1)),
       body := '{}'::jsonb, timeout_milliseconds := 60000);
   $$);
   select cron.schedule('ecosystem-push-cleanup', '20 4 * * *',
     $$ delete from private.app_push_queue where created_at < now() - interval '7 days' $$);
   ```
6. Check it: run `fingerprint.sql` there and compare the hashes with a local build (`test/verify.sh`, then run `fingerprint.sql` on the local database).

## Before the server functions can run there

- **23 of the 36 live server functions are not in git.** Their source is only on Supabase. The guarded staging versions live in the staging project (`evyssawhlarqqhgyswhz`), which is in another account.
- **The staging guard is tied to the old project.** `supabase/functions/_shared/staging.ts` hard-codes `STAGING_REF = 'evyssawhlarqqhgyswhz'`, so every guarded function would refuse to run on a new project until that is changed.
- **Production functions name a specific key.** They read `SUPABASE_SECRET_KEYS.nexus_rotation_20261023`, a key that exists only in production. Staging versions use the project's own default key instead.
- **Two functions nexus. 2.0 calls aren't deployed anywhere visible:** `native-push` and `complete-apple-profile`.

## Test locally

```sh
PGHOST=localhost PGPORT=5432 PGUSER=postgres bash supabase/baseline/test/verify.sh
```

`test/supabase_stub.sql` stands in for the parts Supabase provides (auth, storage, roles). It is for plain Postgres only.
