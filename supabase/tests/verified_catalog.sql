-- Run inside a transaction after the migration; outer transaction MUST roll back.
-- Uses existing synthetic staging identities, no emails, payments or dispatch.
create temp table catalog_test_context (admin_id uuid,customer_a uuid,customer_b uuid,product_id uuid,category_id uuid,order_id uuid);
insert into catalog_test_context(admin_id,customer_a,customer_b)
select (select id from auth.users where raw_app_meta_data->>'role'='admin' and raw_app_meta_data->>'environment'='staging' and raw_app_meta_data->>'synthetic'='true' limit 1),
(select id from auth.users where email like 'customer-a%' and raw_app_meta_data->>'environment'='staging' limit 1),
(select id from auth.users where email like 'customer-b%' and raw_app_meta_data->>'environment'='staging' limit 1);
do $$
declare ctx record; result jsonb; pid uuid; cid uuid; failed boolean;
begin
 select * into ctx from catalog_test_context;
 assert ctx.admin_id is not null and ctx.customer_a is not null and ctx.customer_b is not null,'Missing staging fixtures';
 result:=public.core_catalog_mutate(ctx.admin_id,'{"action":"save_category","category":{"name":"Transaction test only","slug":"transaction-test-only","active":true}}');
 cid:=(result->'category'->>'id')::uuid;
 result:=public.core_catalog_mutate(ctx.admin_id,jsonb_build_object('action','save_product','product',jsonb_build_object('name','ROLLBACK ONLY test','sku','ROLLBACK-ONLY-'||gen_random_uuid(),'price',12.50,'category_id',cid,'description','Transaction-only integration assertion. Not genuine inventory.','image_url','https://example.invalid/transaction-only.png','quantity','5 mL')));
 pid:=(result->'product'->>'id')::uuid;
 assert result->'product'->>'publication_status'='draft';
 assert result->'product'->>'active'='false';
 update catalog_test_context set product_id=pid,category_id=cid;
 failed:=false;
 begin perform public.core_catalog_mutate(ctx.customer_a,jsonb_build_object('action','adjust_inventory','productId',pid,'stockOnHand',20,'reason','Forbidden customer write')); exception when insufficient_privilege then failed:=true; end;
 assert failed,'Customer catalog mutation must fail';
 failed:=false;
 begin perform public.core_catalog_mutate(ctx.admin_id,jsonb_build_object('action','set_publication','productId',pid,'status','published')); exception when others then failed:=true; end;
 assert failed,'Unverified publication must fail';
 perform public.core_catalog_mutate(ctx.admin_id,jsonb_build_object('action','adjust_inventory','productId',pid,'stockOnHand',10,'lowStockThreshold',3,'reason','Transaction test inventory'));
 failed:=false;
 begin perform public.core_catalog_mutate(ctx.admin_id,jsonb_build_object('action','adjust_inventory','productId',pid,'stockOnHand',-1,'reason','Invalid negative')); exception when check_violation then failed:=true; end;
 assert failed,'Negative inventory must fail';
 -- This simulated verification exists ONLY in this rollback transaction.
 perform public.core_catalog_mutate(ctx.admin_id,jsonb_build_object('action','set_publication','productId',pid,'status','published','verification',jsonb_build_object('authenticity',true,'eligibility',true,'imagery',true,'evidence','ROLLBACK ONLY simulated verification, never committed or published.')));
 assert (select count(*) from public.core_audit_events where entity_id=pid::text)>=3;
 assert (select stock_on_hand from public.product_inventory where product_id=pid)=10;
end $$;
grant select,update on catalog_test_context to authenticated,anon;
set local role anon;
do $$ begin
 assert (select count(id) from public.products)=1,'Anon sees only transaction verified product, never synthetic';
 begin perform verification_evidence from public.products; raise exception 'Verification evidence exposed'; exception when insufficient_privilege then null; end;
 begin update public.products set price=0; raise exception 'Unexpected product write'; exception when insufficient_privilege then null; end;
 begin update public.product_inventory set stock_on_hand=100; raise exception 'Unexpected inventory write'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',customer_a,'role','authenticated')::text,true) from catalog_test_context;
set local role authenticated;
do $$
declare ctx record; result jsonb; repeated jsonb; key uuid:=gen_random_uuid(); badkey uuid:=gen_random_uuid(); failed boolean; total_before integer;
begin
 select * into ctx from catalog_test_context;
 begin perform public.core_catalog_mutate(ctx.customer_a,'{}'); raise exception 'Unexpected RPC access'; exception when insufficient_privilege then null; end;
 result:=public.staging_submit_order(jsonb_build_array(jsonb_build_object('product_id',ctx.product_id,'quantity',4,'unit_price',12.50)),key,'Henderson');
 assert (result->>'total')::numeric=50;
 assert result->>'sandbox'='true';
 assert (select available_to_sell from public.product_inventory where product_id=ctx.product_id)=6;
 repeated:=public.staging_submit_order(jsonb_build_array(jsonb_build_object('product_id',ctx.product_id,'quantity',4,'unit_price',12.50)),key,'Henderson');
 assert result->>'id'=repeated->>'id','Idempotency must return same order';
 assert (select reserved_quantity from public.product_inventory where product_id=ctx.product_id)=4;
 update catalog_test_context set order_id=(result->>'id')::uuid;
 select count(*) into total_before from public.orders;
 failed:=false;
 begin perform public.staging_submit_order(jsonb_build_array(jsonb_build_object('product_id',ctx.product_id,'quantity',7,'unit_price',12.50)),badkey,'Henderson'); exception when others then failed:=true; end;
 assert failed,'Oversell must fail';
 assert (select count(*) from public.orders)=total_before,'Failed order must roll back';
 failed:=false;
 begin perform public.staging_submit_order(jsonb_build_array(jsonb_build_object('product_id',ctx.product_id,'quantity',1,'unit_price',0)),badkey,'Henderson'); exception when others then failed:=true; end;
 assert failed,'Price tampering must fail';
 assert (select reserved_quantity from public.product_inventory where product_id=ctx.product_id)=4;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',customer_b,'role','authenticated')::text,true) from catalog_test_context;
set local role authenticated;
do $$ declare failed boolean:=false; begin
 assert not exists(select 1 from public.orders where id=(select order_id from catalog_test_context)),'Cross-customer order leak';
 begin perform public.staging_cancel_order((select order_id from catalog_test_context)); exception when others then failed:=true; end;
 assert failed,'Cross-customer cancellation must fail';
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',customer_a,'role','authenticated')::text,true) from catalog_test_context;
set local role authenticated;
do $$ begin
 perform public.staging_cancel_order((select order_id from catalog_test_context));
 perform public.staging_cancel_order((select order_id from catalog_test_context));
 assert (select available_to_sell from public.product_inventory where product_id=(select product_id from catalog_test_context))=10,'Cancellation must release stock once';
end $$;
reset role;
select 'PASS: admin CRUD, draft gate, inventory audit, RLS writes, price validation, stock reservation, idempotency, oversell rollback, customer isolation, cancellation' as result;
