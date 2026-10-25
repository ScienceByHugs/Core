-- Science By Hugs: nexus./core. backend schema baseline.
--
-- Captured read-only on 2026-10-25 from the live NEXUS project's system
-- catalog. Schema only: no customer, order or payment rows. The only data
-- here is configuration the app cannot run without (memberships and product
-- categories; signup fails without the "new-researcher" membership).
--
-- Use it to build a brand-new, empty project. Never run it against a project
-- that already has these tables. See README.md in this folder.

-- ---------------------------------------------------------------- schemas
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- ----------------------------------------------------------------- tables
create table private.app_push_queue (
  id uuid default gen_random_uuid() not null,
  event_key text not null,
  user_id uuid not null,
  app text not null,
  payload jsonb not null,
  created_at timestamp with time zone default now() not null,
  locked_at timestamp with time zone,
  attempts integer default 0 not null,
  delivered_endpoints uuid[] default '{}'::uuid[] not null,
  delivered_at timestamp with time zone
);

create table public.app_push_subscriptions (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  app text not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  last_test_at timestamp with time zone
);

create table public.catalog_sync_runs (
  id uuid default gen_random_uuid() not null,
  source text not null,
  status text default 'running'::text not null,
  received_count integer default 0 not null,
  upserted_count integer default 0 not null,
  deactivated_count integer default 0 not null,
  error_message text,
  started_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone
);

create table public.core_audit_events (
  id uuid default gen_random_uuid() not null,
  actor_user_id uuid not null,
  actor_email text,
  actor_role text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null
);

create table public.customer_rewards (
  id uuid default gen_random_uuid() not null,
  customer_id uuid not null,
  reward_type text not null,
  reward_value numeric,
  title text not null,
  description text,
  status text default 'available'::text not null,
  source_referral_id uuid,
  milestone_threshold integer,
  source_key text not null,
  reserved_order_id uuid,
  redeemed_order_id uuid,
  reserved_at timestamp with time zone,
  redeemed_at timestamp with time zone,
  expires_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null
);

create table public.discount_codes (
  id uuid default gen_random_uuid() not null,
  code text not null,
  kind text not null,
  discount_percent numeric(5,2),
  shipping_discount numeric(10,2),
  one_time boolean default false not null,
  permanent boolean default false not null,
  active boolean default true not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  used_at timestamp with time zone,
  used_by_profile_id uuid,
  used_order_id uuid
);

create table public.internal_runtime_config (
  key text not null,
  value jsonb not null,
  updated_at timestamp with time zone default now() not null
);

create table public.invoice_events (
  id uuid default gen_random_uuid() not null,
  invoice_id uuid not null,
  event_type text not null,
  description text,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null
);

create table public.invoices (
  id uuid default gen_random_uuid() not null,
  invoice_number text not null,
  order_id uuid,
  customer_id uuid,
  status text default 'pending'::text not null,
  subtotal numeric(10,2) default 0 not null,
  shipping_total numeric(10,2) default 0 not null,
  discount_total numeric(10,2) default 0 not null,
  tax_total numeric(10,2) default 0 not null,
  total numeric(10,2) default 0 not null,
  payment_method text,
  google_sheet_name text,
  google_sheet_url text,
  pdf_status text default 'pending'::text not null,
  pdf_url text,
  invoice_date timestamp with time zone default now() not null,
  paid_at timestamp with time zone,
  pdf_created_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  contact_method text,
  customer_name_snapshot text,
  customer_email_snapshot text,
  customer_phone_snapshot text,
  delivery_eta text,
  profit_amount numeric(10,2),
  profit_percentage numeric(8,4),
  sent_at timestamp with time zone,
  sent_to text,
  sent_by uuid,
  send_status text default 'not_sent'::text not null,
  pdf_storage_path text,
  processing_fee_total numeric default 0 not null,
  discount_code_id uuid,
  discount_code text,
  shipping_discount_total numeric default 0 not null
);

create table public.marketing_consent_events (
  id bigint generated always as identity not null,
  user_id uuid not null,
  app text not null,
  email text,
  email_opt_in boolean default false not null,
  sms_opt_in boolean default false not null,
  phone text,
  source text not null,
  disclosure_version text not null,
  recorded_at timestamp with time zone default clock_timestamp() not null
);

create table public.memberships (
  id uuid default gen_random_uuid() not null,
  name text not null,
  slug text not null,
  description text,
  sort_order integer default 0,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  benefits jsonb default '[]'::jsonb not null
);

create table public.message_templates (
  id uuid default gen_random_uuid() not null,
  name text not null,
  message text not null,
  category text,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  legacy_template_id text
);

create table public.order_items (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  product_id uuid,
  product_code text,
  product_name text not null,
  quantity integer default 1 not null,
  unit_price numeric(10,2) default 0 not null,
  line_total numeric(10,2) default 0 not null,
  created_at timestamp with time zone default now() not null
);

create table public.orders (
  id uuid default gen_random_uuid() not null,
  order_number text,
  customer_id uuid,
  status text default 'pending'::text not null,
  subtotal numeric(10,2) default 0 not null,
  discount_total numeric(10,2) default 0 not null,
  shipping_total numeric(10,2) default 0 not null,
  tax_total numeric(10,2) default 0 not null,
  total numeric(10,2) default 0 not null,
  payment_method text,
  payment_status text default 'pending'::text not null,
  customer_notes text,
  admin_notes text,
  submitted_at timestamp with time zone,
  paid_at timestamp with time zone,
  completed_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  contact_method text,
  ordered_at timestamp with time zone,
  shipped_at timestamp with time zone,
  delivered_at timestamp with time zone,
  delayed_at timestamp with time zone,
  fulfillment_note text,
  processing_fee_total numeric default 0 not null,
  estimated_delivery_date date,
  discount_code_id uuid,
  discount_code text,
  shipping_discount_total numeric default 0 not null
);

create table public.payments (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  customer_id uuid,
  provider text,
  payment_reference text,
  amount numeric(10,2) default 0 not null,
  status text default 'pending'::text not null,
  paid_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  submitted_at timestamp with time zone,
  verified_at timestamp with time zone,
  verified_by uuid,
  provider_order_id text,
  provider_capture_id text
);

create table public.product_categories (
  id uuid default gen_random_uuid() not null,
  name text not null,
  slug text not null,
  description text,
  sort_order integer default 0,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.products (
  id uuid default gen_random_uuid() not null,
  product_code text,
  sku text,
  name text not null,
  research_name text,
  category_id uuid,
  description text,
  purity text,
  quantity text,
  lot_number text,
  coa_url text,
  price numeric(10,2) default 0 not null,
  active boolean default true not null,
  featured boolean default false not null,
  sort_order integer default 0,
  image_url text,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  product_type text,
  shipping_from text,
  source text,
  storefront_status text,
  source_key text,
  sync_source text,
  last_sync_run_id uuid,
  source_synced_at timestamp with time zone,
  core_hidden boolean default false not null
);

create table public.profiles (
  id uuid default gen_random_uuid() not null,
  auth_user_id uuid,
  customer_number text,
  first_name text,
  last_name text,
  email text not null,
  phone text,
  membership_id uuid,
  account_status text default 'active'::text not null,
  address_line_1 text,
  address_line_2 text,
  city text,
  state text,
  postal_code text,
  preferred_contact_method text,
  notes text,
  original_created_at timestamp with time zone,
  last_login_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  referral_code text
);

create table public.referrals (
  id uuid default gen_random_uuid() not null,
  referrer_id uuid,
  referred_customer_id uuid,
  referred_name text,
  referred_email text,
  referral_code text,
  status text default 'pending'::text not null,
  reward_type text,
  reward_value numeric(10,2),
  referred_at timestamp with time zone default now() not null,
  converted_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  legacy_referral_id text,
  qualified_at timestamp with time zone,
  qualifying_order_number text,
  consent_confirmed boolean default false not null,
  consent_confirmed_at timestamp with time zone,
  consent_version text,
  consent_source text
);

-- ------------------------------------------------- primary keys / unique
alter table private.app_push_queue add constraint app_push_queue_pkey PRIMARY KEY (id);
alter table public.app_push_subscriptions add constraint app_push_subscriptions_pkey PRIMARY KEY (id);
alter table public.catalog_sync_runs add constraint catalog_sync_runs_pkey PRIMARY KEY (id);
alter table public.core_audit_events add constraint core_audit_events_pkey PRIMARY KEY (id);
alter table public.customer_rewards add constraint customer_rewards_pkey PRIMARY KEY (id);
alter table public.discount_codes add constraint discount_codes_pkey PRIMARY KEY (id);
alter table public.internal_runtime_config add constraint internal_runtime_config_pkey PRIMARY KEY (key);
alter table public.invoice_events add constraint invoice_events_pkey PRIMARY KEY (id);
alter table public.invoices add constraint invoices_pkey PRIMARY KEY (id);
alter table public.marketing_consent_events add constraint marketing_consent_events_pkey PRIMARY KEY (id);
alter table public.memberships add constraint memberships_pkey PRIMARY KEY (id);
alter table public.message_templates add constraint message_templates_pkey PRIMARY KEY (id);
alter table public.order_items add constraint order_items_pkey PRIMARY KEY (id);
alter table public.orders add constraint orders_pkey PRIMARY KEY (id);
alter table public.payments add constraint payments_pkey PRIMARY KEY (id);
alter table public.product_categories add constraint product_categories_pkey PRIMARY KEY (id);
alter table public.products add constraint products_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.referrals add constraint referrals_pkey PRIMARY KEY (id);
alter table private.app_push_queue add constraint app_push_queue_event_key_user_id_app_key UNIQUE (event_key, user_id, app);
alter table public.app_push_subscriptions add constraint app_push_subscriptions_app_endpoint_key UNIQUE (app, endpoint);
alter table public.customer_rewards add constraint customer_rewards_source_key_key UNIQUE (source_key);
alter table public.invoices add constraint invoices_invoice_number_key UNIQUE (invoice_number);
alter table public.invoices add constraint invoices_order_id_key UNIQUE (order_id);
alter table public.memberships add constraint memberships_name_key UNIQUE (name);
alter table public.memberships add constraint memberships_slug_key UNIQUE (slug);
alter table public.orders add constraint orders_order_number_key UNIQUE (order_number);
alter table public.product_categories add constraint product_categories_name_key UNIQUE (name);
alter table public.product_categories add constraint product_categories_slug_key UNIQUE (slug);
alter table public.products add constraint products_product_code_key UNIQUE (product_code);
alter table public.products add constraint products_sku_key UNIQUE (sku);
alter table public.profiles add constraint profiles_auth_user_id_key UNIQUE (auth_user_id);
alter table public.profiles add constraint profiles_customer_number_key UNIQUE (customer_number);

-- ------------------------------------------------------------------ checks
alter table private.app_push_queue add constraint app_push_queue_app_check CHECK ((app = ANY (ARRAY['core'::text, 'nexus'::text])));
alter table public.app_push_subscriptions add constraint app_push_subscriptions_app_check CHECK ((app = ANY (ARRAY['core'::text, 'nexus'::text])));
alter table public.app_push_subscriptions add constraint app_push_subscriptions_endpoint_check CHECK ((length(endpoint) <= 4096));
alter table public.customer_rewards add constraint customer_rewards_status_check CHECK ((status = ANY (ARRAY['available'::text, 'active'::text, 'reserved'::text, 'redeemed'::text, 'superseded'::text])));
alter table public.customer_rewards add constraint customer_rewards_type_check CHECK ((reward_type = ANY (ARRAY['percent_discount'::text, 'free_shipping'::text, 'membership_upgrade'::text])));
alter table public.discount_codes add constraint discount_codes_kind_check CHECK ((kind = ANY (ARRAY['free_shipping'::text, 'referral_bonus'::text, 'new_customer'::text, 'group_buy'::text])));
alter table public.discount_codes add constraint discount_codes_value_check CHECK ((((kind = 'free_shipping'::text) AND (shipping_discount IS NOT NULL) AND (discount_percent IS NULL)) OR ((kind = ANY (ARRAY['referral_bonus'::text, 'new_customer'::text, 'group_buy'::text])) AND (discount_percent IS NOT NULL) AND (shipping_discount IS NULL))));
alter table public.marketing_consent_events add constraint marketing_consent_events_app_check CHECK ((app = ANY (ARRAY['nexus'::text, 'pulse'::text])));
alter table public.marketing_consent_events add constraint marketing_consent_events_check CHECK (((NOT sms_opt_in) OR (phone ~ '^\+[1-9][0-9]{7,14}$'::text)));
alter table public.marketing_consent_events add constraint marketing_consent_events_disclosure_version_check CHECK ((disclosure_version = '2026-10-01'::text));
alter table public.marketing_consent_events add constraint marketing_consent_events_source_check CHECK ((source = ANY (ARRAY['signup'::text, 'activation'::text, 'account'::text])));

-- ------------------------------------------------------------ foreign keys
alter table private.app_push_queue add constraint app_push_queue_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.app_push_subscriptions add constraint app_push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.customer_rewards add constraint customer_rewards_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public.customer_rewards add constraint customer_rewards_redeemed_order_id_fkey FOREIGN KEY (redeemed_order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
alter table public.customer_rewards add constraint customer_rewards_reserved_order_id_fkey FOREIGN KEY (reserved_order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
alter table public.customer_rewards add constraint customer_rewards_source_referral_id_fkey FOREIGN KEY (source_referral_id) REFERENCES public.referrals(id) ON DELETE SET NULL;
alter table public.discount_codes add constraint discount_codes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.discount_codes add constraint discount_codes_used_by_profile_id_fkey FOREIGN KEY (used_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
alter table public.discount_codes add constraint discount_codes_used_order_id_fkey FOREIGN KEY (used_order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
alter table public.invoice_events add constraint invoice_events_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
alter table public.invoices add constraint invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
alter table public.invoices add constraint invoices_discount_code_id_fkey FOREIGN KEY (discount_code_id) REFERENCES public.discount_codes(id) ON DELETE SET NULL;
alter table public.invoices add constraint invoices_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
alter table public.marketing_consent_events add constraint marketing_consent_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.order_items add constraint order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
alter table public.order_items add constraint order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
alter table public.orders add constraint orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
alter table public.orders add constraint orders_discount_code_id_fkey FOREIGN KEY (discount_code_id) REFERENCES public.discount_codes(id) ON DELETE SET NULL;
alter table public.payments add constraint payments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
alter table public.payments add constraint payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
alter table public.products add constraint products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.product_categories(id) ON DELETE SET NULL;
alter table public.profiles add constraint profiles_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.profiles add constraint profiles_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.memberships(id) ON DELETE SET NULL;
alter table public.referrals add constraint referrals_referred_customer_id_fkey FOREIGN KEY (referred_customer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
alter table public.referrals add constraint referrals_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------- indexes
CREATE INDEX app_push_pending ON private.app_push_queue USING btree (created_at) WHERE (delivered_at IS NULL);
CREATE INDEX app_push_subscriptions_user_app ON public.app_push_subscriptions USING btree (user_id, app);
CREATE INDEX core_audit_events_actor_idx ON public.core_audit_events USING btree (actor_user_id, created_at DESC);
CREATE INDEX core_audit_events_created_at_idx ON public.core_audit_events USING btree (created_at DESC);
CREATE INDEX core_audit_events_entity_idx ON public.core_audit_events USING btree (entity_type, entity_id, created_at DESC);
CREATE INDEX customer_rewards_customer_status_idx ON public.customer_rewards USING btree (customer_id, status, reward_type);
CREATE INDEX customer_rewards_redeemed_order_id_idx ON public.customer_rewards USING btree (redeemed_order_id);
CREATE INDEX customer_rewards_reserved_order_id_idx ON public.customer_rewards USING btree (reserved_order_id);
CREATE INDEX customer_rewards_source_referral_id_idx ON public.customer_rewards USING btree (source_referral_id);
CREATE UNIQUE INDEX discount_codes_code_lower_uidx ON public.discount_codes USING btree (lower(code));
CREATE INDEX invoice_events_invoice_id_idx ON public.invoice_events USING btree (invoice_id);
CREATE INDEX invoices_customer_id_idx ON public.invoices USING btree (customer_id);
CREATE UNIQUE INDEX invoices_invoice_number_unique ON public.invoices USING btree (invoice_number);
CREATE INDEX invoices_order_id_idx ON public.invoices USING btree (order_id);
CREATE UNIQUE INDEX invoices_pdf_storage_path_unique ON public.invoices USING btree (pdf_storage_path) WHERE (pdf_storage_path IS NOT NULL);
CREATE INDEX marketing_consent_owner_time ON public.marketing_consent_events USING btree (user_id, app, recorded_at DESC, id DESC);
CREATE UNIQUE INDEX message_templates_legacy_template_id_unique ON public.message_templates USING btree (legacy_template_id) WHERE (legacy_template_id IS NOT NULL);
CREATE INDEX order_items_order_id_idx ON public.order_items USING btree (order_id);
CREATE INDEX order_items_product_id_idx ON public.order_items USING btree (product_id);
CREATE INDEX orders_created_at_idx ON public.orders USING btree (created_at DESC);
CREATE INDEX orders_customer_id_idx ON public.orders USING btree (customer_id);
CREATE INDEX payments_customer_id_idx ON public.payments USING btree (customer_id);
CREATE INDEX payments_order_id_idx ON public.payments USING btree (order_id);
CREATE UNIQUE INDEX payments_order_id_unique ON public.payments USING btree (order_id);
CREATE UNIQUE INDEX payments_provider_capture_id_unique ON public.payments USING btree (provider_capture_id) WHERE (provider_capture_id IS NOT NULL);
CREATE UNIQUE INDEX payments_provider_order_id_unique ON public.payments USING btree (provider_order_id) WHERE (provider_order_id IS NOT NULL);
CREATE INDEX products_category_id_idx ON public.products USING btree (category_id);
CREATE UNIQUE INDEX products_source_key_unique ON public.products USING btree (source_key);
CREATE INDEX profiles_auth_user_id_idx ON public.profiles USING btree (auth_user_id);
CREATE UNIQUE INDEX profiles_email_lower_unique ON public.profiles USING btree (lower(email));
CREATE INDEX profiles_membership_id_idx ON public.profiles USING btree (membership_id);
CREATE UNIQUE INDEX profiles_referral_code_unique ON public.profiles USING btree (referral_code) WHERE (referral_code IS NOT NULL);
CREATE UNIQUE INDEX referrals_legacy_referral_id_unique ON public.referrals USING btree (legacy_referral_id) WHERE (legacy_referral_id IS NOT NULL);
CREATE INDEX referrals_referral_code_idx ON public.referrals USING btree (referral_code) WHERE (referral_code IS NOT NULL);
CREATE INDEX referrals_referred_customer_id_idx ON public.referrals USING btree (referred_customer_id);
CREATE UNIQUE INDEX referrals_referred_customer_unique ON public.referrals USING btree (referred_customer_id) WHERE (referred_customer_id IS NOT NULL);
CREATE UNIQUE INDEX referrals_referrer_email_unique ON public.referrals USING btree (referrer_id, lower(referred_email)) WHERE (referred_email IS NOT NULL);
CREATE INDEX referrals_referrer_id_idx ON public.referrals USING btree (referrer_id);

-- --------------------------------------------------------------- functions
CREATE OR REPLACE FUNCTION private.can_view_restricted_catalog()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles p
    join public.memberships m on m.id = p.membership_id
    where p.auth_user_id = (select auth.uid())
      and m.active = true
      and lower(trim(m.name)) in ('founding member', 'principal scientist')
  );
$function$
;

CREATE OR REPLACE FUNCTION private.capture_signup_marketing_consent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c jsonb;
begin
 c:=new.raw_user_meta_data->'marketing_consent';
 if c->>'app'='pulse' and c->>'source'='signup' and c->>'disclosure_version'='2026-10-01' then
  insert into public.marketing_consent_events(user_id,app,email,email_opt_in,sms_opt_in,phone,source,disclosure_version)
  values(new.id,'pulse',new.email,c->'email_opt_in'='true'::jsonb,c->'sms_opt_in'='true'::jsonb,
    case when c->'sms_opt_in'='true'::jsonb then c->>'phone' else null end,'signup','2026-10-01');
 end if;
 return new;
end $function$
;

CREATE OR REPLACE FUNCTION private.is_founding_member()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles p
    join public.memberships m on m.id = p.membership_id
    where p.auth_user_id = (select auth.uid())
      and m.active = true
      and lower(trim(m.name)) = 'founding member'
  );
$function$
;

CREATE OR REPLACE FUNCTION private.link_profile_for_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_new_researcher_id uuid;
begin
  -- Never auto-claim a pre-existing customer record on raw signup.
  -- If a profile with this email already exists, it must be claimed later
  -- by the authenticated + email-verified user.
  if exists (
    select 1
    from public.profiles p
    where p.email is not null
      and lower(trim(p.email)) = lower(trim(new.email))
  ) then
    return new;
  end if;

  select m.id
    into v_new_researcher_id
  from public.memberships m
  where m.slug = 'new-researcher'
    and m.active = true
  limit 1;

  if v_new_researcher_id is null then
    raise exception 'Active New Researcher membership is not configured';
  end if;

  -- Brand-new email: create a fresh profile owned by this Auth user
  -- with the standard New Researcher membership.
  insert into public.profiles (
    auth_user_id,
    email,
    first_name,
    last_name,
    membership_id,
    account_status
  )
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', ''),
    v_new_researcher_id,
    'Active'
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.queue_order_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  customer_auth uuid;
  event_key text := gen_random_uuid()::text;
  nexus_body text;
  core_body text;
begin
  if TG_OP='INSERT' then
    core_body := 'A new order is ready to review in CORE.';
    nexus_body := 'Your order has been received. Open NEXUS for details.';
  else
    if NEW.status is distinct from OLD.status then
      nexus_body := 'Your order status has changed. Open NEXUS for details.';
    elsif NEW.payment_status is distinct from OLD.payment_status then
      nexus_body := 'Your payment status has changed. Open NEXUS for details.';
    elsif NEW.estimated_delivery_date is distinct from OLD.estimated_delivery_date then
      nexus_body := case when NEW.estimated_delivery_date is null then 'Your estimated delivery date is being updated. Check NEXUS for details.'
        else 'Your estimated delivery date is now ' || to_char(NEW.estimated_delivery_date,'Mon DD, YYYY') || '.' end;
    end if;
    if NEW.payment_status is distinct from OLD.payment_status then
      core_body := 'An order payment status has changed. Open CORE to review.';
    end if;
  end if;
  if nexus_body is not null then
    select auth_user_id into customer_auth from public.profiles where id=NEW.customer_id;
    insert into private.app_push_queue(event_key,user_id,app,payload)
      select event_key,s.user_id,'nexus',jsonb_build_object('title','NEXUS · Order update','body',nexus_body,'url','?push=orders','tag','order-'||NEW.id)
      from public.app_push_subscriptions s where s.app='nexus' and s.user_id=customer_auth group by s.user_id
      on conflict do nothing;
  end if;
  if core_body is not null then
    insert into private.app_push_queue(event_key,user_id,app,payload)
      select event_key,s.user_id,'core',jsonb_build_object('title','CORE · Order alert','body',core_body,'url','#orders','tag','order-'||NEW.id)
      from public.app_push_subscriptions s join auth.users u on u.id=s.user_id
      where s.app='core' and lower(u.raw_app_meta_data->>'role') in ('owner','admin') group by s.user_id
      on conflict do nothing;
  end if;
  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_one_time_discount_code(p_discount_id uuid, p_profile_id uuid, p_order_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  with claimed as (
    update public.discount_codes
       set used_at=now(),
           used_by_profile_id=p_profile_id,
           used_order_id=p_order_id
     where id=p_discount_id
       and one_time=true
       and used_at is null
    returning 1
  )
  select exists(select 1 from claimed);
$function$
;

CREATE OR REPLACE FUNCTION public.clear_checkout_pending_orders(p_order_id uuid DEFAULT NULL::uuid, p_actor_user_id uuid DEFAULT NULL::uuid, p_actor_email text DEFAULT NULL::text, p_actor_role text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_ids uuid[];
  v_count integer := 0;
begin
  select array_agg(o.id)
  into v_ids
  from public.orders o
  where lower(trim(o.status))='checkout_pending'
    and lower(coalesce(o.payment_status,'')) <> 'paid'
    and (p_order_id is null or o.id=p_order_id);

  if v_ids is null or array_length(v_ids,1) is null then
    return jsonb_build_object('success',true,'deleted',0,'orderIds','[]'::jsonb);
  end if;

  insert into public.core_audit_events(
    actor_user_id,actor_email,actor_role,action,entity_type,entity_id,before_data,after_data,metadata
  )
  select
    p_actor_user_id,
    p_actor_email,
    coalesce(nullif(trim(p_actor_role),''),'admin'),
    'order.checkout_pending.clear',
    'order',
    o.id::text,
    jsonb_build_object(
      'status',o.status,
      'payment_status',o.payment_status,
      'payment_method',o.payment_method,
      'total',o.total,
      'discount_code',o.discount_code
    ),
    null,
    jsonb_build_object('source','core','bulk',p_order_id is null)
  from public.orders o
  where o.id=any(v_ids);

  update public.discount_codes
  set used_at=null,
      used_by_profile_id=null,
      used_order_id=null
  where one_time=true
    and used_order_id=any(v_ids);

  delete from public.invoices
  where order_id=any(v_ids)
    and lower(coalesce(status,''))='direct_checkout'
    and paid_at is null;

  delete from public.orders
  where id=any(v_ids);

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'success',true,
    'deleted',v_count,
    'orderIds',to_jsonb(v_ids)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.core_delete_catalog_product(p_product_id uuid, p_actor_user_id uuid, p_actor_email text, p_actor_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_product public.products%rowtype;
begin
  select * into v_product
  from public.products
  where id=p_product_id
  for update;

  if v_product.id is null then
    return jsonb_build_object('success',false,'error','Product not found.');
  end if;

  if v_product.active=true or lower(coalesce(v_product.storefront_status,''))='available' then
    return jsonb_build_object(
      'success',false,
      'error','This product is still active on the vendor catalog. Hide it instead of deleting it.'
    );
  end if;

  insert into public.core_audit_events(
    actor_user_id,actor_email,actor_role,action,entity_type,entity_id,before_data,after_data,metadata
  ) values (
    p_actor_user_id,
    p_actor_email,
    coalesce(nullif(trim(p_actor_role),''),'admin'),
    'catalog.product.delete',
    'product',
    v_product.id::text,
    jsonb_build_object(
      'name',v_product.name,
      'product_code',v_product.product_code,
      'sku',v_product.sku,
      'active',v_product.active,
      'core_hidden',v_product.core_hidden,
      'storefront_status',v_product.storefront_status,
      'source_key',v_product.source_key,
      'source_synced_at',v_product.source_synced_at
    ),
    null,
    jsonb_build_object('source','core')
  );

  delete from public.products where id=v_product.id;

  return jsonb_build_object(
    'success',true,
    'deletedId',v_product.id,
    'deletedName',v_product.name
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.evaluate_discount_code(p_code text, p_profile_id uuid, p_subtotal numeric, p_shipping numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  d public.discount_codes%rowtype;
  prior_order_exists boolean := false;
  merchandise_discount numeric := 0;
  shipping_discount numeric := 0;
begin
  select * into d
  from public.discount_codes
  where lower(code)=lower(trim(p_code))
    and active=true
  limit 1;

  if d.id is null then
    return jsonb_build_object('valid',false,'error','Discount code not found.');
  end if;

  if d.one_time and d.used_at is not null then
    return jsonb_build_object('valid',false,'error','This discount code has already been used.');
  end if;

  if d.kind='new_customer' then
    select exists(
      select 1 from public.orders o
      where o.customer_id=p_profile_id
        and (
          lower(coalesce(o.payment_status,''))='paid'
          or lower(coalesce(o.status,'')) in ('invoice_requested','processing','ordered','shipped','delivered')
        )
    ) into prior_order_exists;
    if prior_order_exists then
      return jsonb_build_object('valid',false,'error','NewCustomer5 is only available on a customer’s first order.');
    end if;
  end if;

  if d.kind='free_shipping' then
    shipping_discount := least(greatest(coalesce(p_shipping,0),0), coalesce(d.shipping_discount,0));
  else
    merchandise_discount := round(greatest(coalesce(p_subtotal,0),0) * coalesce(d.discount_percent,0) / 100.0, 2);
  end if;

  return jsonb_build_object(
    'valid',true,
    'id',d.id,
    'code',d.code,
    'kind',d.kind,
    'oneTime',d.one_time,
    'permanent',d.permanent,
    'discountPercent',d.discount_percent,
    'merchandiseDiscount',merchandise_discount,
    'shippingDiscount',shipping_discount,
    'description',
      case d.kind
        when 'free_shipping' then 'Free Shipping'
        when 'referral_bonus' then 'Referral Bonus · 10% off'
        when 'new_customer' then 'New Customer · 5% off'
        when 'group_buy' then 'Group Buy · 50% off'
      end
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_referral_rewards_for_customer(p_customer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count integer;
  v_principal_id uuid;
begin
  select count(*)
    into v_count
  from public.referrals
  where referrer_id = p_customer_id
    and qualified_at is not null;

  insert into public.customer_rewards (
    customer_id,reward_type,reward_value,title,description,status,
    source_referral_id,source_key,metadata
  )
  select
    r.referrer_id,
    'percent_discount',
    10,
    '10% Referral Reward',
    'One-time 10% discount earned from a qualified referral.',
    'available',
    r.id,
    'referral-10-' || r.id::text,
    jsonb_build_object('qualified_at',r.qualified_at,'qualifying_order_number',r.qualifying_order_number)
  from public.referrals r
  where r.referrer_id = p_customer_id
    and r.qualified_at is not null
  on conflict (source_key) do nothing;

  if v_count >= 5 then
    insert into public.customer_rewards (
      customer_id,reward_type,reward_value,title,description,status,
      milestone_threshold,source_key,metadata
    )
    values (
      p_customer_id,'free_shipping',100,'Free Shipping',
      'Referral milestone benefit unlocked at 5 qualified referrals.',
      'active',5,'referral-milestone-5-' || p_customer_id::text,
      jsonb_build_object('qualified_referrals',v_count)
    )
    on conflict (source_key) do update
      set status='active',updated_at=now(),metadata=excluded.metadata;
  end if;

  if v_count >= 10 then
    insert into public.customer_rewards (
      customer_id,reward_type,reward_value,title,description,status,
      milestone_threshold,source_key,metadata
    )
    values (
      p_customer_id,'percent_discount',20,'20% Referral Milestone Reward',
      'One-time 20% discount unlocked at 10 qualified referrals.',
      'available',10,'referral-milestone-10-' || p_customer_id::text,
      jsonb_build_object('qualified_referrals',v_count)
    )
    on conflict (source_key) do nothing;
  end if;

  if v_count >= 20 then
    select id into v_principal_id
    from public.memberships
    where name='Principal Scientist'
    limit 1;

    if v_principal_id is not null then
      update public.profiles
      set membership_id=v_principal_id,updated_at=now()
      where id=p_customer_id
        and membership_id is distinct from v_principal_id;
    end if;

    insert into public.customer_rewards (
      customer_id,reward_type,reward_value,title,description,status,
      milestone_threshold,source_key,metadata
    )
    values (
      p_customer_id,'membership_upgrade',null,'Principal Scientist',
      'Membership upgraded automatically at 20 qualified referrals.',
      'active',20,'referral-milestone-20-' || p_customer_id::text,
      jsonb_build_object('qualified_referrals',v_count)
    )
    on conflict (source_key) do update
      set status='active',updated_at=now(),metadata=excluded.metadata;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_referral_reward_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.referrer_id is not null and new.qualified_at is not null then
    perform public.sync_referral_rewards_for_customer(new.referrer_id);
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

-- Function access matches production exactly.
revoke all on function private.capture_signup_marketing_consent() from public, anon, authenticated, service_role;
revoke all on function private.link_profile_for_new_auth_user() from public, anon, authenticated, service_role;
revoke all on function private.queue_order_push() from public, anon, authenticated, service_role;
revoke all on function private.is_founding_member() from public, service_role;
grant execute on function private.is_founding_member() to anon, authenticated;
revoke all on function public.claim_one_time_discount_code(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_one_time_discount_code(uuid, uuid, uuid) to service_role;
revoke all on function public.clear_checkout_pending_orders(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.clear_checkout_pending_orders(uuid, uuid, text, text) to service_role;
revoke all on function public.core_delete_catalog_product(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.core_delete_catalog_product(uuid, uuid, text, text) to service_role;
revoke all on function public.evaluate_discount_code(text, uuid, numeric, numeric) from public, anon, authenticated;
grant execute on function public.evaluate_discount_code(text, uuid, numeric, numeric) to service_role;
revoke all on function public.handle_referral_reward_sync() from public, anon, authenticated;
grant execute on function public.handle_referral_reward_sync() to service_role;
revoke all on function public.sync_referral_rewards_for_customer(uuid) from public, anon, authenticated;
grant execute on function public.sync_referral_rewards_for_customer(uuid) to service_role;
grant execute on function public.set_updated_at() to public, anon, authenticated, service_role;
-- private.can_view_restricted_catalog() keeps the default (executable by everyone); RLS on products calls it.

-- ---------------------------------------------------------------- triggers
CREATE TRIGGER capture_signup_marketing_consent AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION private.capture_signup_marketing_consent();
CREATE TRIGGER on_auth_user_created_link_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION private.link_profile_for_new_auth_user();
CREATE TRIGGER invoices_set_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER memberships_set_updated_at BEFORE UPDATE ON public.memberships FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER message_templates_set_updated_at BEFORE UPDATE ON public.message_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER order_push_events AFTER INSERT OR UPDATE OF status, payment_status, estimated_delivery_date ON public.orders FOR EACH ROW EXECUTE FUNCTION private.queue_order_push();
CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER product_categories_set_updated_at BEFORE UPDATE ON public.product_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER referral_reward_sync_trigger AFTER INSERT OR UPDATE OF qualified_at, status ON public.referrals FOR EACH ROW EXECUTE FUNCTION public.handle_referral_reward_sync();
CREATE TRIGGER referrals_set_updated_at BEFORE UPDATE ON public.referrals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------- row level security
alter table private.app_push_queue enable row level security;
alter table public.app_push_subscriptions enable row level security;
alter table public.catalog_sync_runs enable row level security;
alter table public.core_audit_events enable row level security;
alter table public.customer_rewards enable row level security;
alter table public.discount_codes enable row level security;
alter table public.internal_runtime_config enable row level security;
alter table public.invoice_events enable row level security;
alter table public.invoices enable row level security;
alter table public.marketing_consent_events enable row level security;
alter table public.memberships enable row level security;
alter table public.message_templates enable row level security;
alter table public.order_items enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.profiles enable row level security;
alter table public.referrals enable row level security;

create policy app_push_queue_service on private.app_push_queue as PERMISSIVE for ALL to service_role
  using (true)
  with check (true);
create policy app_push_delete_own on public.app_push_subscriptions as PERMISSIVE for DELETE to authenticated
  using ((( SELECT auth.uid() AS uid) = user_id));
create policy app_push_select_own on public.app_push_subscriptions as PERMISSIVE for SELECT to authenticated
  using ((( SELECT auth.uid() AS uid) = user_id));
create policy catalog_sync_runs_service_only on public.catalog_sync_runs as PERMISSIVE for ALL to anon, authenticated
  using (false)
  with check (false);
create policy core_audit_events_service_only on public.core_audit_events as PERMISSIVE for ALL to anon, authenticated
  using (false)
  with check (false);
create policy customer_rewards_select_own on public.customer_rewards as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = customer_rewards.customer_id) AND (p.auth_user_id = ( SELECT auth.uid() AS uid))))));
create policy invoice_events_select_own on public.invoice_events as PERMISSIVE for SELECT to authenticated
  using ((invoice_id IN ( SELECT i.id
   FROM (public.invoices i
     JOIN public.profiles p ON ((p.id = i.customer_id)))
  WHERE (p.auth_user_id = ( SELECT auth.uid() AS uid)))));
create policy invoices_select_own on public.invoices as PERMISSIVE for SELECT to authenticated
  using ((customer_id IN ( SELECT p.id
   FROM public.profiles p
  WHERE (p.auth_user_id = ( SELECT auth.uid() AS uid)))));
create policy consent_owner_insert on public.marketing_consent_events as PERMISSIVE for INSERT to authenticated
  with check (((( SELECT auth.uid() AS uid) = user_id) AND (email = ( SELECT (auth.jwt() ->> 'email'::text)))));
create policy consent_owner_read on public.marketing_consent_events as PERMISSIVE for SELECT to authenticated
  using ((( SELECT auth.uid() AS uid) = user_id));
create policy memberships_select_authenticated on public.memberships as PERMISSIVE for SELECT to authenticated
  using ((active = true));
create policy message_templates_service_only on public.message_templates as PERMISSIVE for ALL to anon, authenticated
  using (false)
  with check (false);
create policy order_items_select_own on public.order_items as PERMISSIVE for SELECT to authenticated
  using ((order_id IN ( SELECT o.id
   FROM (public.orders o
     JOIN public.profiles p ON ((p.id = o.customer_id)))
  WHERE (p.auth_user_id = ( SELECT auth.uid() AS uid)))));
create policy orders_select_own on public.orders as PERMISSIVE for SELECT to authenticated
  using ((customer_id IN ( SELECT p.id
   FROM public.profiles p
  WHERE (p.auth_user_id = ( SELECT auth.uid() AS uid)))));
create policy payments_select_own on public.payments as PERMISSIVE for SELECT to authenticated
  using ((customer_id IN ( SELECT p.id
   FROM public.profiles p
  WHERE (p.auth_user_id = ( SELECT auth.uid() AS uid)))));
create policy product_categories_select_public on public.product_categories as PERMISSIVE for SELECT to anon, authenticated
  using ((active = true));
create policy products_select_catalog_access on public.products as PERMISSIVE for SELECT to anon, authenticated
  using (((active = true) AND ((core_hidden = false) OR ( SELECT private.can_view_restricted_catalog() AS can_view_restricted_catalog)) AND ((NOT (EXISTS ( SELECT 1
   FROM public.product_categories pc
  WHERE ((pc.id = products.category_id) AND ((lower(pc.name) ~~ '%oral%'::text) OR (lower(pc.name) ~~ '%inject%'::text)))))) OR ( SELECT private.can_view_restricted_catalog() AS can_view_restricted_catalog))));
create policy profiles_select_own on public.profiles as PERMISSIVE for SELECT to authenticated
  using ((( SELECT auth.uid() AS uid) = auth_user_id));
create policy profiles_update_own on public.profiles as PERMISSIVE for UPDATE to authenticated
  using ((( SELECT auth.uid() AS uid) = auth_user_id))
  with check ((( SELECT auth.uid() AS uid) = auth_user_id));
create policy referrals_select_related on public.referrals as PERMISSIVE for SELECT to authenticated
  using (((referrer_id IN ( SELECT p.id
   FROM public.profiles p
  WHERE (p.auth_user_id = ( SELECT auth.uid() AS uid)))) OR (referred_customer_id IN ( SELECT p.id
   FROM public.profiles p
  WHERE (p.auth_user_id = ( SELECT auth.uid() AS uid))))));

-- ------------------------------------------------------------ table access
-- Start from nothing, then grant exactly what production grants.
revoke all on all tables in schema public from anon, authenticated, service_role;
revoke all on all tables in schema private from anon, authenticated, service_role;

grant all on all tables in schema public to service_role;
revoke all on public.internal_runtime_config from service_role;
grant select on public.internal_runtime_config to service_role;
grant all on private.app_push_queue to service_role;

-- RLS decides what anon/authenticated actually see on these.
grant all on public.customer_rewards, public.invoice_events, public.invoices, public.memberships,
  public.order_items, public.orders, public.payments, public.product_categories, public.products,
  public.referrals to anon, authenticated;
grant select, insert, delete, truncate, references, trigger on public.profiles to anon, authenticated;
grant update (email, first_name, last_name, phone, updated_at) on public.profiles to authenticated;
grant select, delete on public.app_push_subscriptions to authenticated;
grant select on public.marketing_consent_events to authenticated;
grant insert (user_id, app, email, email_opt_in, sms_opt_in, phone, source, disclosure_version)
  on public.marketing_consent_events to authenticated;
-- catalog_sync_runs, core_audit_events, discount_codes, message_templates and
-- internal_runtime_config: server functions only (service_role).

-- ----------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoice-pdfs', 'invoice-pdfs', false, null, null),
       ('avatars', 'avatars', false, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

create policy avatar_delete_own on storage.objects as PERMISSIVE for DELETE to authenticated
  using (((bucket_id = 'avatars'::text) AND (name = ((( SELECT auth.uid() AS uid))::text || '/avatar.jpg'::text))));
create policy avatar_insert_own on storage.objects as PERMISSIVE for INSERT to authenticated
  with check (((bucket_id = 'avatars'::text) AND (name = ((( SELECT auth.uid() AS uid))::text || '/avatar.jpg'::text))));
create policy avatar_read_own on storage.objects as PERMISSIVE for SELECT to authenticated
  using (((bucket_id = 'avatars'::text) AND (name = ((( SELECT auth.uid() AS uid))::text || '/avatar.jpg'::text))));
create policy avatar_update_own on storage.objects as PERMISSIVE for UPDATE to authenticated
  using (((bucket_id = 'avatars'::text) AND (name = ((( SELECT auth.uid() AS uid))::text || '/avatar.jpg'::text))))
  with check (((bucket_id = 'avatars'::text) AND (name = ((( SELECT auth.uid() AS uid))::text || '/avatar.jpg'::text))));

-- ------------------------------------------------- required configuration
insert into public.memberships (id, name, slug, description, sort_order, active, benefits) values
  ('5b61ece3-8697-4646-971a-a705b149613a', 'Founding Member', 'founding-member', null, 1, true,
   '["Free Shipping on Eligible Orders","Priority Shipping","Monthly Promotional Pricing","Exclusive Access to Products"]'),
  ('bcaef268-c7d3-4adc-a8a8-9f98ddb5a47c', 'Principal Scientist', 'principal-scientist', null, 2, true,
   '["Free Shipping on Eligible Orders","Priority Shipping","Monthly Promotional Pricing","Exclusive Access to Products"]'),
  ('7ae87d8b-94bc-4f93-8409-8e9ebbff8437', 'Resident Scientist', 'resident-scientist', null, 3, true,
   '["Priority Shipping","Monthly Promotional Pricing","Exclusive Access to Products"]'),
  ('a7978a29-3f4d-4af5-9502-d4a4951e20b3', 'New Researcher', 'new-researcher', null, 4, true,
   '["Priority Shipping","Exclusive Access to Products"]');

insert into public.product_categories (id, name, slug, description, sort_order, active) values
  ('7b4c9939-9314-4345-bd40-c8a067c5821d', 'LYOPHILIZED POWDERS', 'lyophilized-powders', null, 1, true),
  ('7c2148df-dbe5-44bb-af84-6f0e98830843', 'ORAL TABLETS', 'oral-tablets', null, 2, true),
  ('96ccbe9d-5c7c-48e5-b71b-6fc88ddf01dc', 'INJECTABLES', 'injectables', null, 3, true),
  ('649d5c45-38ef-4a98-9a28-15f3a0098863', 'SKIN CARE', 'skin-care', null, 4, true),
  ('cb7df422-1a15-4756-8649-68faf625ebb2', 'TOPICAL CREAM', 'topical-cream', null, 5, true),
  ('613e10db-d123-4c19-824a-b558fe584593', 'SUPPLIES', 'supplies', null, 6, true);

-- -------------------------------------------------------- scheduled jobs
-- Production runs these two jobs. They are NOT created here, because the
-- dispatch job calls the project's own URL and reads a Vault secret that the
-- owner adds by hand (ecosystem_push_cron_secret, plus ecosystem_vapid_public
-- and ecosystem_vapid_private for web push). Add them after the secrets
-- exist; see README.md.
--   ecosystem-push-dispatch  * * * * *   POST <project>/functions/v1/app-push?action=dispatch
--   ecosystem-push-cleanup   20 4 * * *  delete from private.app_push_queue where created_at < now() - interval '7 days'
