-- NEXUS database-only catalog: vendors drive shipping, cost kept separate from
-- customer-facing product rows, certifications per product.
-- Additive only. Writes go through the service role, matching public.products
-- (which has no anon/authenticated write policy).

-- Vendors: who a product is bought from; sets shipping. Not customer-facing.
create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  shipping_fee numeric not null default 0,
  founding_member_free boolean not null default false,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.vendors enable row level security;
-- No anon/authenticated policy: only the service role (CORE admin, edge functions) reads or writes.

-- Link each product to its vendor, and record which channels sell it.
alter table public.products
  add column if not exists vendor_id uuid references public.vendors(id),
  add column if not exists channels text[] not null default array['web','ios']::text[];

-- Vendor (cost) price, kept out of the product row so a customer SELECT can never reach it.
create table if not exists public.product_costs (
  product_id uuid primary key references public.products(id) on delete cascade,
  vendor_price numeric not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.product_costs enable row level security;
-- No anon/authenticated policy: cost is service-role only. Customer price stays on products.price.

-- Certifications (COA etc.) per product.
create table if not exists public.product_certifications (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  cert_type text not null default 'COA',
  purity text,
  batch_lot text,
  issued_on date,
  expires_on date,
  file_path text,
  customer_visible boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists product_certifications_product_id_idx
  on public.product_certifications(product_id);
alter table public.product_certifications enable row level security;
-- Only certs explicitly marked customer_visible are readable by the storefront; writes are service-role only.
create policy product_certifications_select_public on public.product_certifications
  for select to anon, authenticated using (customer_visible = true);

-- Seed vendors (shipping fees from the Oct beta scope; Gigi free for Founding Members).
insert into public.vendors (name, shipping_fee, founding_member_free) values
  ('Gigi', 20, true),
  ('EZ', 30, false),
  ('EMLIN', 70, false),
  ('ELLA', 70, false),
  ('Amazon', 5, false)
on conflict (name) do nothing;
