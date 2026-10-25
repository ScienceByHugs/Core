-- Schema fingerprint for the nexus./core. backend (schemas public and
-- private, plus the auth/storage pieces this app adds). Run it on two
-- databases; matching hashes mean the same structure. Read-only.
with s as (select oid, nspname from pg_namespace where nspname in ('public','private')),
lines(part, line) as (
  select 'columns', format('%s.%s.%s %s %s %s %s', s.nspname, c.relname, a.attname, format_type(a.atttypid,a.atttypmod), a.attnotnull, a.attidentity, coalesce(pg_get_expr(d.adbin,d.adrelid),''))
    from pg_class c join s on s.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where c.relkind='r'
  union all
  select 'constraints', format('%s.%s %s %s', s.nspname, c.relname, k.conname, replace(pg_get_constraintdef(k.oid), 'public.', ''))
    from pg_constraint k join pg_class c on c.oid=k.conrelid join s on s.oid=c.relnamespace
  union all
  select 'indexes', pg_get_indexdef(i.indexrelid)
    from pg_index i join pg_class c on c.oid=i.indrelid join s on s.oid=c.relnamespace
  union all
  select 'policies', format('%s.%s %s %s %s %s %s %s', schemaname, tablename, policyname, permissive, cmd, roles::text, coalesce(qual,''), coalesce(with_check,''))
    from pg_policies where schemaname in ('public','private') or (schemaname='storage' and policyname like 'avatar_%')
  union all
  select 'triggers', pg_get_triggerdef(t.oid)
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and (n.nspname in ('public','private') or (n.nspname='auth' and c.relname='users'))
  union all
  select 'functions', format('%s.%s(%s) %s', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), md5(pg_get_functiondef(p.oid)))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
  union all
  select 'function_access', format('%s.%s(%s) %s', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
      coalesce((select string_agg(case when g.grantee=0 then 'PUBLIC' else pg_get_userbyid(g.grantee) end, ',' order by 1)
                from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) g
                where g.privilege_type='EXECUTE' and (g.grantee=0 or pg_get_userbyid(g.grantee) in ('anon','authenticated','service_role'))), '-'))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
  union all
  select 'table_grants', format('%s.%s %s %s', table_schema, table_name, grantee, privilege_type)
    from information_schema.role_table_grants where table_schema in ('public','private') and grantee in ('anon','authenticated','service_role')
  union all
  select 'column_grants', format('%s.%s.%s %s %s', table_schema, table_name, column_name, grantee, privilege_type)
    from information_schema.column_privileges where table_schema in ('public','private') and grantee in ('anon','authenticated')
  union all
  select 'rls', format('%s.%s %s %s', s.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity)
    from pg_class c join s on s.oid=c.relnamespace where c.relkind='r'
)
select part, count(*) n, md5(string_agg(line, E'\n' order by line collate "C")) hash
from lines group by part order by part;
