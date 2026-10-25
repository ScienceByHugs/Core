-- Synthetic accounts and one order for the SQL tests. Plain Postgres only.
insert into auth.users (email, email_confirmed_at, raw_app_meta_data) values
  ('admin-staging@example.invalid', now(), '{"role":"admin","environment":"staging","synthetic":true}'),
  ('customer-a@example.invalid', now(), '{"environment":"staging","synthetic":true}'),
  ('customer-b@example.invalid', now(), '{"environment":"staging","synthetic":true}');

insert into public.orders (order_number, customer_id, status, total)
select 'SYNTHETIC-0001', p.id, 'pending', 10
from public.profiles p where p.email = 'customer-a@example.invalid';
