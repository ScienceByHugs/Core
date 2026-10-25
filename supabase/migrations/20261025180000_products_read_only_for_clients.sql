-- Apps never write products directly; CORE changes them through server
-- functions (service_role). Row level security already blocks these writes,
-- but the table grants still allowed them, so a blocked write silently did
-- nothing instead of failing. Remove the grants so it fails loudly.
revoke insert, update, delete, truncate on public.products from anon, authenticated;
