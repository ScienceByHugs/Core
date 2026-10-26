-- Client experience backend: contact preference, per-order compliance approval,
-- favorite orders. Additive. Reads/writes go through the service role, matching
-- public.profiles and public.orders (both RLS-on, no client policies).

-- Each client picks how they hear about order status; mark auto-created accounts.
alter table public.profiles
  add column if not exists update_channel text not null default 'email'
    check (update_channel in ('sms','email','push')),
  add column if not exists is_anonymous boolean not null default false;

-- Per-order approval gate. A placed order waits for owner approval before it is final.
alter table public.orders
  add column if not exists approval_status text not null default 'pending'
    check (approval_status in ('pending','approved','declined')),
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id),
  add column if not exists decline_reason text;

-- Favorite orders a client can reorder from in one tap.
create table if not exists public.favorite_orders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  label text,
  created_at timestamptz not null default now(),
  unique (profile_id, order_id)
);
create index if not exists favorite_orders_profile_id_idx
  on public.favorite_orders(profile_id);
alter table public.favorite_orders enable row level security;
-- No client policy: favorites are read/written through an edge function on the
-- service role, the same pattern as orders and profiles.
