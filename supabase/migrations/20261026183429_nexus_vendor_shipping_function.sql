-- Vendor-driven shipping: sum each DISTINCT active vendor's fee for the given
-- products, once per vendor. Founding Members skip fees on vendors flagged
-- founding_member_free. A product with no vendor raises, so an unassigned
-- shipper surfaces as an error instead of silently becoming free shipping.
create or replace function private.vendor_shipping_for_products(
  p_product_ids uuid[],
  p_is_founding boolean default false
)
returns numeric
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_missing text;
  v_total numeric;
begin
  -- Any product that isn't linked to an active vendor is an error.
  select string_agg(p.name, ', ')
    into v_missing
  from products p
  left join vendors v on v.id = p.vendor_id and v.active = true
  where p.id = any(p_product_ids)
    and v.id is null;

  if v_missing is not null then
    raise exception 'Products have no active vendor and cannot ship: %', v_missing
      using errcode = 'check_violation';
  end if;

  -- One fee per distinct vendor; Founding Members skip free-flagged vendors.
  select coalesce(sum(v.shipping_fee), 0)
    into v_total
  from (
    select distinct p.vendor_id
    from products p
    where p.id = any(p_product_ids)
  ) d
  join vendors v on v.id = d.vendor_id
  where not (p_is_founding and v.founding_member_free);

  return v_total;
end;
$$;

revoke all on function private.vendor_shipping_for_products(uuid[], boolean) from public;
