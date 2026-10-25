#!/usr/bin/env bash
# Build the backend from git on a throwaway local Postgres and run the SQL tests.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres bash supabase/baseline/test/verify.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."
db="sbh_baseline_check"
psql_q() { psql -v ON_ERROR_STOP=1 -q "$@"; }

psql_q -d postgres -c "drop database if exists $db" -c "create database $db"
for role in anon authenticated service_role; do
  psql_q -d postgres -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname='$role') then create role $role nologin; end if; end \$\$"
done
psql_q -d postgres -c "alter role service_role bypassrls"
grep -v -E '^create role ' supabase/baseline/test/supabase_stub.sql | psql_q -d "$db"
# pg_net and pg_cron exist only on Supabase.
grep -v -E 'create extension if not exists (pg_net|pg_cron)' supabase/baseline/production_schema.sql | psql_q -d "$db"

# Migrations already folded into the baseline are skipped; newer ones run in order.
baseline_upto=20261002062537
for f in supabase/migrations/*.sql; do
  v=$(basename "$f" | cut -d_ -f1)
  if [ "$v" -gt "$baseline_upto" ]; then echo "migration $(basename "$f")"; psql_q -d "$db" -f "$f"; fi
done

psql_q -d "$db" -f supabase/baseline/test/fixtures.sql

for t in supabase/tests/*.sql; do
  echo "test $(basename "$t")"
  { echo 'begin;'; grep -v -E '^\s*(begin|rollback);\s*$' "$t"; echo 'rollback;'; } | psql_q -d "$db"
done
echo "All baseline checks passed."
