-- Owner/admin model for the 2.0 backend. A clean, explicit allow-list of the
-- auth users who can manage the catalog and approve orders from CORE.
create table if not exists public.app_admins (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('owner','admin')),
  email text,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
-- Service-role only; the edge function checks membership here with the service key.

create or replace function private.is_app_admin(p_uid uuid)
returns boolean
language sql
security definer
set search_path = public, private
as $$
  select exists (select 1 from public.app_admins where auth_user_id = p_uid);
$$;
revoke all on function private.is_app_admin(uuid) from public;
