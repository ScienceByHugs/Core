-- Research-only access. Nobody sees products, prices or stock, or can order,
-- until the owner has approved their research application. Approval lasts a
-- year. Applications must use the account's own confirmed login email, and
-- that email must be on an institutional domain (free webmail is refused
-- unless the owner deliberately overrides it). Every decision is audited.

-- ------------------------------------------------------------ applications
create table public.research_applications (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied', 'withdrawn')),
  institution_name text not null check (length(trim(institution_name)) between 2 and 200),
  department text check (department is null or length(department) <= 200),
  role_title text not null check (length(trim(role_title)) between 2 and 120),
  principal_investigator text not null check (length(trim(principal_investigator)) between 2 and 160),
  institutional_email text not null check (institutional_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  email_domain text generated always as (lower(split_part(institutional_email, '@', 2))) stored,
  research_summary text not null check (length(trim(research_summary)) between 40 and 4000),
  document_path text check (document_path is null or document_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$'),
  terms_version text not null,
  free_domain_override boolean not null default false,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  decision_reason text check (decision_reason is null or length(decision_reason) <= 2000),
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  check (status <> 'approved' or (expires_at is not null and reviewed_by is not null)),
  check (status not in ('approved', 'denied') or reviewed_at is not null)
);
create unique index research_applications_one_pending
  on public.research_applications (auth_user_id) where status = 'pending';
create index research_applications_status_submitted
  on public.research_applications (status, submitted_at desc);
create index research_applications_user
  on public.research_applications (auth_user_id, submitted_at desc);
create trigger research_applications_set_updated_at before update on public.research_applications
  for each row execute function public.set_updated_at();

alter table public.research_applications enable row level security;
revoke all on public.research_applications from anon, authenticated;
grant all on public.research_applications to service_role;
grant select on public.research_applications to authenticated;
create policy research_applications_read_own on public.research_applications
  for select to authenticated using ((select auth.uid()) = auth_user_id);
create policy research_applications_service on public.research_applications
  for all to service_role using (true) with check (true);

-- --------------------------------------------------------------- helpers
create or replace function private.is_free_email_domain(p_domain text) returns boolean
language sql immutable set search_path = '' as $$
  select lower(coalesce(p_domain, '')) = any (array[
    'gmail.com','googlemail.com','yahoo.com','ymail.com','outlook.com','hotmail.com','live.com','msn.com',
    'icloud.com','me.com','mac.com','aol.com','proton.me','protonmail.com','pm.me','gmx.com','gmx.net',
    'mail.com','yandex.com','zoho.com','zohomail.com','tutanota.com','tuta.io','hey.com','fastmail.com'
  ]);
$$;

-- True only for the signed-in user with a current, approved application whose
-- email still matches their confirmed login email.
create or replace function private.is_verified_researcher() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.research_applications a
    join auth.users u on u.id = a.auth_user_id
    where a.auth_user_id = (select auth.uid())
      and a.status = 'approved'
      and a.expires_at > now()
      and u.email_confirmed_at is not null
      and lower(u.email) = lower(a.institutional_email)
  );
$$;
revoke all on function private.is_verified_researcher() from public;
grant execute on function private.is_verified_researcher() to anon, authenticated, service_role;

-- ----------------------------------------------------------- applicant RPC
create or replace function private.submit_research_application(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  u auth.users;
  v_email text;
  v_domain text;
  v_profile uuid;
  v_row public.research_applications;
begin
  if uid is null then raise exception 'Sign in to apply' using errcode = '42501'; end if;
  select * into u from auth.users where id = uid;
  if u.email_confirmed_at is null then raise exception 'Confirm your email address first' using errcode = '42501'; end if;
  v_email := lower(trim(u.email));
  v_domain := split_part(v_email, '@', 2);
  if private.is_free_email_domain(v_domain) then
    raise exception 'Apply with your institutional email address, not a personal one' using errcode = '22023';
  end if;
  if coalesce(p->>'terms_version', '') = '' then raise exception 'Accept the research-use terms to apply' using errcode = '22023'; end if;
  if exists (select 1 from public.research_applications where auth_user_id = uid and status = 'pending') then
    raise exception 'You already have an application under review' using errcode = '23505';
  end if;
  select id into v_profile from public.profiles where auth_user_id = uid;

  insert into public.research_applications (
    auth_user_id, profile_id, institution_name, department, role_title, principal_investigator,
    institutional_email, research_summary, document_path, terms_version
  ) values (
    uid, v_profile, trim(p->>'institution_name'), nullif(trim(p->>'department'), ''), trim(p->>'role_title'),
    trim(p->>'principal_investigator'), v_email, trim(p->>'research_summary'),
    nullif(p->>'document_path', ''), p->>'terms_version'
  ) returning * into v_row;

  if v_row.document_path is not null and split_part(v_row.document_path, '/', 1) <> uid::text then
    raise exception 'Document must be uploaded to your own folder' using errcode = '42501';
  end if;

  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'submitted_at', v_row.submitted_at);
end $$;
revoke all on function private.submit_research_application(jsonb) from public, anon;
grant execute on function private.submit_research_application(jsonb) to authenticated;
create or replace function public.submit_research_application(p jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select private.submit_research_application(p) $$;
revoke all on function public.submit_research_application(jsonb) from public, anon;
grant execute on function public.submit_research_application(jsonb) to authenticated;

create or replace function private.withdraw_research_application() returns void
language sql security definer set search_path = '' as $$
  update public.research_applications set status = 'withdrawn'
  where auth_user_id = (select auth.uid()) and status = 'pending';
$$;
revoke all on function private.withdraw_research_application() from public, anon;
grant execute on function private.withdraw_research_application() to authenticated;
create or replace function public.withdraw_research_application() returns void
language sql security invoker set search_path = '' as $$ select private.withdraw_research_application() $$;
revoke all on function public.withdraw_research_application() from public, anon;
grant execute on function public.withdraw_research_application() to authenticated;

-- ----------------------------------------------------------- reviewer RPC
-- Called only by the core. server function (service_role) after it has
-- confirmed the caller is an owner/admin; the actor is re-checked here.
create or replace function private.review_research_application(
  p_actor uuid, p_application_id uuid, p_decision text, p_reason text, p_allow_free_domain boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor auth.users;
  before_row public.research_applications;
  after_row public.research_applications;
begin
  select * into actor from auth.users where id = p_actor;
  if actor.id is null or actor.email_confirmed_at is null
     or coalesce(actor.raw_app_meta_data->>'role', '') not in ('owner', 'admin') then
    raise exception 'Owner or admin required' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'denied') then raise exception 'Decision must be approved or denied'; end if;
  if p_decision = 'denied' and length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Give the applicant a reason for the denial';
  end if;

  select * into before_row from public.research_applications where id = p_application_id for update;
  if before_row.id is null then raise exception 'Application not found'; end if;
  if before_row.status <> 'pending' then raise exception 'Only pending applications can be reviewed'; end if;
  if before_row.auth_user_id = p_actor then raise exception 'You cannot approve your own application' using errcode = '42501'; end if;
  if p_decision = 'approved' and private.is_free_email_domain(before_row.email_domain) and not coalesce(p_allow_free_domain, false) then
    raise exception 'This applicant used a personal email domain; confirm the override to approve anyway';
  end if;

  update public.research_applications set
    status = p_decision,
    reviewed_at = now(),
    reviewed_by = p_actor,
    decision_reason = nullif(trim(coalesce(p_reason, '')), ''),
    free_domain_override = (p_decision = 'approved' and private.is_free_email_domain(before_row.email_domain)),
    expires_at = case when p_decision = 'approved' then now() + interval '1 year' else null end
  where id = p_application_id
  returning * into after_row;

  insert into public.core_audit_events (actor_user_id, actor_email, actor_role, action, entity_type, entity_id, before_data, after_data, metadata)
  values (p_actor, actor.email, actor.raw_app_meta_data->>'role', 'research_application.' || p_decision,
          'research_application', p_application_id::text, to_jsonb(before_row), to_jsonb(after_row),
          jsonb_build_object('free_domain_override', after_row.free_domain_override));

  return to_jsonb(after_row);
end $$;
revoke all on function private.review_research_application(uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function private.review_research_application(uuid, uuid, text, text, boolean) to service_role;
create or replace function public.review_research_application(
  p_actor uuid, p_application_id uuid, p_decision text, p_reason text, p_allow_free_domain boolean default false
) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.review_research_application(p_actor, p_application_id, p_decision, p_reason, p_allow_free_domain)
$$;
revoke all on function public.review_research_application(uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.review_research_application(uuid, uuid, text, text, boolean) to service_role;

-- ------------------------------------------------------------- the gate
-- Restrictive policies add to every existing rule; they can only narrow access.
create policy research_verified_required on public.products as restrictive
  for select to anon, authenticated using ((select private.is_verified_researcher()));
create policy research_verified_required on public.product_inventory as restrictive
  for select to anon, authenticated using ((select private.is_verified_researcher()));

-- Ordering re-checks approval (the order function bypasses row security).
create or replace function private.staging_submit_order(p_items jsonb,p_idempotency_key uuid,p_city text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); customer uuid; oid uuid; item jsonb; p public.products; inv public.product_inventory; qty integer; amount numeric:=0; result jsonb;
begin
 if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null and raw_app_meta_data->>'environment'='staging' and raw_app_meta_data->>'synthetic'='true') then raise exception 'Verified staging account required' using errcode='42501'; end if;
 if not private.is_verified_researcher() then raise exception 'Approved research account required' using errcode='42501'; end if;
 if p_city not in ('Las Vegas','North Las Vegas','Henderson') or p_city is null then raise exception 'Unsupported local fulfillment city'; end if;
 select id into customer from public.profiles where auth_user_id=uid and lower(trim(account_status))='active';
 if customer is null then raise exception 'Active customer profile required'; end if;
 if p_idempotency_key is null then raise exception 'Idempotency key required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(customer::text||p_idempotency_key::text,0));
 select to_jsonb(o) into result from public.orders o where customer_id=customer and idempotency_key=p_idempotency_key;
 if result is not null then return result; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>50 then raise exception 'Choose between 1 and 50 items'; end if;
 if (select count(*)<>count(distinct value->>'product_id') from jsonb_array_elements(p_items)) then raise exception 'Duplicate products are not allowed'; end if;
 oid:=gen_random_uuid();
 insert into public.orders(id,order_number,customer_id,status,payment_method,payment_status,sandbox,idempotency_key,submitted_at,fulfillment_note) values(oid,'STG-'||oid::text,customer,'pending','sandbox','pending',true,p_idempotency_key,now(),'Sandbox only. No charge or dispatch. Local city: '||p_city);
 for item in select value from jsonb_array_elements(p_items) order by value->>'product_id' loop
  qty:=(item->>'quantity')::integer;
  if qty is null or qty<1 or qty>100 then raise exception 'Quantity must be between 1 and 100'; end if;
  select * into p from public.products where id=(item->>'product_id')::uuid for update;
  if p.id is null or p.publication_status<>'published' or p.is_synthetic or not p.active or p.core_hidden or not p.authenticity_verified or not p.eligibility_verified or not p.imagery_verified then raise exception 'Product unavailable'; end if;
  if not exists(select 1 from public.product_categories c where c.id=p.category_id and c.active) then raise exception 'Product category unavailable'; end if;
  if exists(select 1 from public.product_categories c where c.id=p.category_id and (lower(c.name) like '%oral%' or lower(c.name) like '%inject%')) and not private.can_view_restricted_catalog() then raise exception 'Product unavailable'; end if;
  if (item->>'unit_price')::numeric is distinct from p.price then raise exception 'Price changed; review your cart'; end if;
  select * into inv from public.product_inventory where product_id=p.id for update;
  if inv.stock_on_hand is null or inv.available_to_sell<qty then raise exception 'Insufficient verified stock'; end if;
  update public.product_inventory set reserved_quantity=reserved_quantity+qty,updated_at=now() where product_id=p.id;
  insert into public.inventory_events(product_id,actor_user_id,order_id,before_stock,after_stock,before_reserved,after_reserved,reason) values(p.id,uid,oid,inv.stock_on_hand,inv.stock_on_hand,inv.reserved_quantity,inv.reserved_quantity+qty,'Sandbox order reservation');
  insert into public.order_items(order_id,product_id,product_code,product_name,quantity,unit_price,line_total) values(oid,p.id,p.sku,p.name,qty,p.price,qty*p.price);
  amount:=amount+qty*p.price;
 end loop;
 update public.orders set subtotal=amount,total=amount where id=oid returning to_jsonb(orders.*) into result;
 return result;
end $$;

-- ----------------------------------------------- supporting documents
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('research-documents', 'research-documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy research_docs_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'research-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy research_docs_read_own on storage.objects for select to authenticated
  using (bucket_id = 'research-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
