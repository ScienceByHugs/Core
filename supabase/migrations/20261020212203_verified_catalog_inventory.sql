-- Staging only: evyssawhlarqqhgyswhz. Additive, preserves historical orders.
alter table public.products
 add column publication_status text not null default 'draft' check(publication_status in ('draft','review','published','archived')),
 add column is_synthetic boolean not null default false,
 add column authenticity_verified boolean not null default false,
 add column eligibility_verified boolean not null default false,
 add column imagery_verified boolean not null default false,
 add column verification_evidence text,
 add column verified_by uuid references auth.users(id),
 add column verified_at timestamptz;
-- All pre-existing staging products are synthetic; never silently promote them.
update public.products set is_synthetic=true, active=false, core_hidden=true;
alter table public.products alter column active set default false;
create table public.product_inventory (
 product_id uuid primary key references public.products(id),
 stock_on_hand integer check(stock_on_hand >= 0),
 reserved_quantity integer not null default 0 check(reserved_quantity >= 0),
 available_to_sell integer generated always as (stock_on_hand-reserved_quantity) stored,
 low_stock_threshold integer not null default 3 check(low_stock_threshold >= 0),
 updated_at timestamptz not null default now(),
 check(stock_on_hand is null and reserved_quantity=0 or stock_on_hand >= reserved_quantity)
);
create table public.inventory_events (
 id uuid primary key default gen_random_uuid(),product_id uuid not null references public.products(id),
 actor_user_id uuid not null references auth.users(id),order_id uuid references public.orders(id),
 before_stock integer,after_stock integer,before_reserved integer not null,after_reserved integer not null,
 reason text not null check(length(trim(reason))>=3),created_at timestamptz not null default now()
);
create index inventory_events_product_created on public.inventory_events(product_id,created_at desc);
alter table public.product_inventory enable row level security;
alter table public.inventory_events enable row level security;
revoke all on public.product_inventory,public.inventory_events from anon,authenticated;
grant all on public.product_inventory,public.inventory_events to service_role;
grant select on public.product_inventory to anon,authenticated;
create policy inventory_visible_product on public.product_inventory for select to anon,authenticated using(exists(select 1 from public.products p where p.id=product_id));
create policy inventory_service on public.product_inventory for all to service_role using(true) with check(true);
create policy inventory_events_service on public.inventory_events for all to service_role using(true) with check(true);
insert into public.product_inventory(product_id) select id from public.products;
-- Restrictive policy composes with existing membership/category access rules.
create policy verified_publication_required on public.products as restrictive for select to anon,authenticated using (
 publication_status='published' and not is_synthetic and not core_hidden and active
 and authenticity_verified and eligibility_verified and imagery_verified
);
-- Verification evidence and reviewer identities are operational data, not storefront fields.
revoke select on public.products from anon,authenticated;
grant select(id,product_code,sku,name,research_name,category_id,description,purity,quantity,lot_number,coa_url,price,active,featured,sort_order,image_url,created_at,updated_at,product_type,shipping_from,storefront_status,core_hidden,publication_status,is_synthetic,authenticity_verified,eligibility_verified,imagery_verified) on public.products to anon,authenticated;
alter table public.orders add column sandbox boolean not null default false, add column idempotency_key uuid;
create unique index orders_customer_idempotency on public.orders(customer_id,idempotency_key) where idempotency_key is not null;

create or replace function private.core_catalog_mutate(p_actor uuid,p_body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a text:=p_body->>'action'; pid uuid:=nullif(p_body->>'productId','')::uuid; b jsonb:=p_body->'product';
 oldrow jsonb; newrow jsonb; actor auth.users; inv public.product_inventory; target text; v jsonb; cid uuid;
begin
 select * into actor from auth.users where id=p_actor;
 if actor.id is null or actor.email_confirmed_at is null or coalesce(actor.raw_app_meta_data->>'role','') not in ('owner','admin') or actor.raw_app_meta_data->>'environment' is distinct from 'staging' or actor.raw_app_meta_data->>'synthetic' is distinct from 'true' then raise exception 'Authorized staging administrator required' using errcode='42501'; end if;
 if a='save_category' then
  b:=p_body->'category'; cid:=coalesce(nullif(p_body->>'categoryId','')::uuid,gen_random_uuid());
  if length(trim(coalesce(b->>'name','')))<2 or coalesce(b->>'slug','') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Category name and URL slug required'; end if;
  select to_jsonb(c) into oldrow from public.product_categories c where id=cid for update;
  insert into public.product_categories(id,name,slug,description,active) values(cid,trim(b->>'name'),b->>'slug',b->>'description',coalesce((b->>'active')::boolean,true)) on conflict(id) do update set name=excluded.name,slug=excluded.slug,description=excluded.description,active=excluded.active returning to_jsonb(product_categories.*) into newrow;
  insert into public.core_audit_events(actor_user_id,actor_email,actor_role,action,entity_type,entity_id,before_data,after_data) values(p_actor,actor.email,actor.raw_app_meta_data->>'role',a,'category',cid::text,oldrow,newrow);
  return jsonb_build_object('success',true,'category',newrow);
 end if;
 if pid is not null then
  select to_jsonb(p) into oldrow from public.products p where id=pid for update;
  if oldrow is null then raise exception 'Product not found'; end if;
 end if;
 if a='save_product' then
  if length(trim(coalesce(b->>'name','')))<2 or length(trim(coalesce(b->>'sku','')))<1 or (b->>'price') is null or (b->>'price')::numeric::text in ('NaN','Infinity','-Infinity') or (b->>'price')::numeric <0 or (b->>'price')::numeric >1000000 then raise exception 'Name, SKU and valid price required'; end if;
  if length(coalesce(b->>'name',''))>200 or length(coalesce(b->>'sku',''))>100 or length(coalesce(b->>'description',''))>10000 or length(coalesce(b->>'image_url',''))>2048 or length(coalesce(b->>'quantity',''))>200 then raise exception 'Product fields exceed maximum length'; end if;
  if nullif(b->>'image_url','') is not null and b->>'image_url' !~ '^https://[^/[:space:]]+/' then raise exception 'Image URL must use HTTPS'; end if;
  perform pg_advisory_xact_lock(hashtextextended(lower(trim(b->>'sku')),0));
  if exists(select 1 from public.products where lower(sku)=lower(trim(b->>'sku')) and id is distinct from pid) then raise exception 'SKU already exists'; end if;
  pid:=coalesce(pid,gen_random_uuid());
  insert into public.products(id,name,sku,price,category_id,description,image_url,quantity,featured,active,core_hidden,is_synthetic)
  values(pid,trim(b->>'name'),trim(b->>'sku'),round((b->>'price')::numeric,2),nullif(b->>'category_id','')::uuid,b->>'description',nullif(b->>'image_url',''),b->>'quantity',coalesce((b->>'featured')::boolean,false),false,true,coalesce((b->>'is_synthetic')::boolean,false))
  on conflict(id) do update set name=excluded.name,sku=excluded.sku,price=excluded.price,category_id=excluded.category_id,description=excluded.description,image_url=excluded.image_url,quantity=excluded.quantity,featured=excluded.featured,publication_status='draft',active=false,core_hidden=true,authenticity_verified=false,eligibility_verified=false,imagery_verified=false,verified_at=null,verified_by=null;
  insert into public.product_inventory(product_id) values(pid) on conflict do nothing;
 elsif a='adjust_inventory' then
  if length(trim(coalesce(p_body->>'reason','')))<3 then raise exception 'Adjustment reason required'; end if;
  select * into inv from public.product_inventory where product_id=pid for update;
  update public.product_inventory set stock_on_hand=(p_body->>'stockOnHand')::integer,low_stock_threshold=coalesce((p_body->>'lowStockThreshold')::integer,3),updated_at=now() where product_id=pid;
  insert into public.inventory_events(product_id,actor_user_id,before_stock,after_stock,before_reserved,after_reserved,reason) values(pid,p_actor,inv.stock_on_hand,(p_body->>'stockOnHand')::integer,inv.reserved_quantity,inv.reserved_quantity,p_body->>'reason');
 elsif a='set_publication' then
  target:=p_body->>'status';v:=p_body->'verification';
  if target not in ('draft','review','published','archived') or target is null then raise exception 'Invalid publication state'; end if;
  if target='published' then
   if oldrow->>'is_synthetic'='true' or coalesce(v->>'authenticity','false')<>'true' or coalesce(v->>'eligibility','false')<>'true' or coalesce(v->>'imagery','false')<>'true' or length(trim(coalesce(v->>'evidence','')))<20 then raise exception 'Documented authenticity, legal/platform eligibility and image authorization required'; end if;
   if nullif(oldrow->>'sku','') is null or nullif(oldrow->>'description','') is null or nullif(oldrow->>'image_url','') is null or (oldrow->>'price')::numeric<=0 or not exists(select 1 from public.product_categories where id=(oldrow->>'category_id')::uuid and active) or not exists(select 1 from public.product_inventory where product_id=pid and stock_on_hand is not null) then raise exception 'Complete product, active category, approved image and known inventory required'; end if;
  end if;
  update public.products set publication_status=target,active=target='published',core_hidden=target<>'published',authenticity_verified=target='published',eligibility_verified=target='published',imagery_verified=target='published',verification_evidence=case when target='published' then v->>'evidence' else verification_evidence end,verified_by=case when target='published' then p_actor else null end,verified_at=case when target='published' then now() else null end where id=pid;
 elsif a='set_visibility' then
  if p_body->>'hidden' is distinct from 'true' then raise exception 'Use verified publication to restore storefront visibility'; end if;
  update public.products set core_hidden=true,active=false,publication_status='draft' where id=pid;
 elsif a='delete_product' then
  update public.products set publication_status='archived',active=false,core_hidden=true where id=pid;
 elsif a='update_metadata' then
  update public.products set product_code=p_body->>'productCode',research_name=p_body->>'researchName',purity=p_body->>'purity',quantity=p_body->>'quantity',lot_number=p_body->>'lotNumber',coa_url=p_body->>'coaUrl',publication_status='draft',active=false,core_hidden=true,authenticity_verified=false,eligibility_verified=false,imagery_verified=false where id=pid;
 else raise exception 'Unsupported catalog action'; end if;
 select to_jsonb(p)||jsonb_build_object('inventory',(select to_jsonb(i) from public.product_inventory i where product_id=pid)) into newrow from public.products p where id=pid;
 insert into public.core_audit_events(actor_user_id,actor_email,actor_role,action,entity_type,entity_id,before_data,after_data,metadata) values(p_actor,actor.email,actor.raw_app_meta_data->>'role',a,'product',pid::text,oldrow,newrow,jsonb_build_object('reason',p_body->>'reason'));
 return jsonb_build_object('success',true,'product',newrow,'inventory',newrow->'inventory');
end $$;
revoke all on function private.core_catalog_mutate(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.core_catalog_mutate(uuid,jsonb) to service_role;
create or replace function public.core_catalog_mutate(p_actor uuid,p_body jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.core_catalog_mutate(p_actor,p_body) $$;
revoke all on function public.core_catalog_mutate(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.core_catalog_mutate(uuid,jsonb) to service_role;

create or replace function private.staging_submit_order(p_items jsonb,p_idempotency_key uuid,p_city text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); customer uuid; oid uuid; item jsonb; p public.products; inv public.product_inventory; qty integer; amount numeric:=0; result jsonb;
begin
 if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null and raw_app_meta_data->>'environment'='staging' and raw_app_meta_data->>'synthetic'='true') then raise exception 'Verified staging account required' using errcode='42501'; end if;
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
revoke all on function private.staging_submit_order(jsonb,uuid,text) from public,anon;
grant execute on function private.staging_submit_order(jsonb,uuid,text) to authenticated;
create or replace function public.staging_submit_order(p_items jsonb,p_idempotency_key uuid,p_city text) returns jsonb
language sql security invoker set search_path='' as $$ select private.staging_submit_order(p_items,p_idempotency_key,p_city) $$;
revoke all on function public.staging_submit_order(jsonb,uuid,text) from public,anon;
grant execute on function public.staging_submit_order(jsonb,uuid,text) to authenticated;

-- Cancellation is the compensating transaction for an abandoned sandbox order.
create or replace function private.staging_cancel_order(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); o public.orders; line record; inv public.product_inventory;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into o from public.orders where id=p_order_id and sandbox and customer_id in(select id from public.profiles where auth_user_id=uid) for update;
 if o.id is null then raise exception 'Sandbox order not found'; end if;
 if o.status='cancelled' then return to_jsonb(o); end if;
 if o.status<>'pending' then raise exception 'Only pending sandbox orders can be cancelled'; end if;
 for line in select product_id,quantity from public.order_items where order_id=o.id order by product_id loop
  select * into inv from public.product_inventory where product_id=line.product_id for update;
  update public.product_inventory set reserved_quantity=reserved_quantity-line.quantity,updated_at=now() where product_id=line.product_id;
  insert into public.inventory_events(product_id,actor_user_id,order_id,before_stock,after_stock,before_reserved,after_reserved,reason) values(line.product_id,uid,o.id,inv.stock_on_hand,inv.stock_on_hand,inv.reserved_quantity,inv.reserved_quantity-line.quantity,'Sandbox order cancellation');
 end loop;
 update public.orders set status='cancelled',cancelled_at=now() where id=o.id returning * into o;
 return to_jsonb(o);
end $$;
revoke all on function private.staging_cancel_order(uuid) from public,anon;
grant execute on function private.staging_cancel_order(uuid) to authenticated;
create or replace function public.staging_cancel_order(p_order_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.staging_cancel_order(p_order_id) $$;
revoke all on function public.staging_cancel_order(uuid) from public,anon;
grant execute on function public.staging_cancel_order(uuid) to authenticated;
