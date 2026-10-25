-- Rollback-only checks for research-account verification. Uses the synthetic
-- staging fixtures plus two throwaway users that exist only in this transaction.
begin;
create temp table rv (admin_id uuid, applicant uuid, other uuid, webmail uuid, unconfirmed uuid, app_id uuid, webmail_app uuid);
grant select, update on rv to authenticated, anon;
insert into rv (admin_id, applicant, other)
select (select id from auth.users where raw_app_meta_data->>'role'='admin' and raw_app_meta_data->>'environment'='staging' limit 1),
       (select id from auth.users where email like 'customer-b%' limit 1),
       (select id from auth.users where email like 'customer-a%' limit 1);
with w as (
  insert into auth.users (email, email_confirmed_at, raw_app_meta_data)
  values ('rollback-webmail@gmail.com', now(), '{"environment":"staging","synthetic":true}') returning id
), n as (
  insert into auth.users (email, email_confirmed_at, raw_app_meta_data)
  values ('rollback-unconfirmed@example.invalid', null, '{"environment":"staging","synthetic":true}') returning id
)
update rv set webmail = (select id from w), unconfirmed = (select id from n);

create temp table rv_form as select jsonb_build_object(
  'institution_name', 'Rollback Test University', 'department', 'Biochemistry', 'role_title', 'Postdoctoral researcher',
  'principal_investigator', 'Dr. Example', 'research_summary', 'Rollback-only application text used to exercise the verification checks.',
  'terms_version', '2026-10-25') as f;
grant select on rv_form to authenticated;

-- Unconfirmed email cannot apply.
select set_config('request.jwt.claims', jsonb_build_object('sub', unconfirmed, 'role', 'authenticated')::text, true) from rv;
set local role authenticated;
do $$ declare ok boolean := false; begin
  begin perform public.submit_research_application((select f from rv_form)); exception when insufficient_privilege then ok := true; end;
  assert ok, 'Unconfirmed email must not be able to apply';
end $$;
reset role;

-- Personal webmail is refused at submission.
select set_config('request.jwt.claims', jsonb_build_object('sub', webmail, 'role', 'authenticated')::text, true) from rv;
set local role authenticated;
do $$ declare ok boolean := false; begin
  begin perform public.submit_research_application((select f from rv_form)); exception when invalid_parameter_value then ok := true; end;
  assert ok, 'Webmail applications must be refused';
  assert not private.is_verified_researcher(), 'Webmail user is not verified';
end $$;
reset role;

-- Institutional applicant: submit, one pending at a time, own rows only, no self-review.
select set_config('request.jwt.claims', jsonb_build_object('sub', applicant, 'role', 'authenticated')::text, true) from rv;
set local role authenticated;
do $$ declare r jsonb; ok boolean := false; begin
  ok := false;
  begin perform public.submit_research_application((select f from rv_form) || '{"terms_version":""}'); exception when invalid_parameter_value then ok := true; end;
  assert ok, 'Terms must be accepted';
  ok := false;
  begin perform public.submit_research_application((select f from rv_form) || jsonb_build_object('document_path', gen_random_uuid()::text || '/letter.pdf')); exception when insufficient_privilege then ok := true; end;
  assert ok, 'Document outside own folder must be refused';
  r := public.submit_research_application((select f from rv_form) || jsonb_build_object('document_path', (select applicant from rv)::text || '/letter.pdf'));
  assert r->>'status' = 'pending';
  update rv set app_id = (r->>'id')::uuid;
  ok := false;
  begin perform public.submit_research_application((select f from rv_form)); exception when unique_violation then ok := true; end;
  assert ok, 'Only one pending application at a time';
  assert (select count(*) from public.research_applications) = 1, 'Applicant sees only their own application';
  assert not private.is_verified_researcher(), 'Pending is not verified';
  assert (select count(*) from public.products) = 0, 'Pending applicant sees no products';
  ok := false;
  begin perform public.review_research_application((select applicant from rv), (select app_id from rv), 'approved', null); exception when insufficient_privilege then ok := true; end;
  assert ok, 'Applicants cannot call the review function';
  ok := false;
  begin insert into public.research_applications (auth_user_id, status, institution_name, role_title, principal_investigator, institutional_email, research_summary, terms_version)
    values ((select applicant from rv), 'approved', 'x', 'xx', 'xx', 'a@b.co', repeat('x', 40), 't'); exception when insufficient_privilege then ok := true; end;
  assert ok, 'Applicants cannot write applications directly';
end $$;
reset role;

-- Other users cannot see someone else's application.
select set_config('request.jwt.claims', jsonb_build_object('sub', other, 'role', 'authenticated')::text, true) from rv;
set local role authenticated;
do $$ begin
  assert (select count(*) from public.research_applications where id = (select app_id from rv)) = 0, 'Application leaked to another user';
end $$;
reset role;

-- Review rules (run as the server would, with the admin as actor).
do $$ declare r jsonb; ok boolean; ctx rv; begin
  select * into ctx from rv;
  ok := false;
  begin perform public.review_research_application(ctx.other, ctx.app_id, 'approved', null); exception when insufficient_privilege then ok := true; end;
  assert ok, 'Non-admin actor must be refused';
  ok := false;
  begin perform public.review_research_application(ctx.admin_id, ctx.app_id, 'denied', ''); exception when others then ok := true; end;
  assert ok, 'Denial needs a reason';
  r := public.review_research_application(ctx.admin_id, ctx.app_id, 'approved', 'Institution and role confirmed by phone.');
  assert r->>'status' = 'approved';
  assert (r->>'expires_at')::timestamptz between now() + interval '364 days' and now() + interval '366 days', 'Approval lasts one year';
  assert exists (select 1 from public.core_audit_events where entity_id = ctx.app_id::text and action = 'research_application.approved'), 'Decision must be audited';
  ok := false;
  begin perform public.review_research_application(ctx.admin_id, ctx.app_id, 'denied', 'Second decision'); exception when others then ok := true; end;
  assert ok, 'A decided application cannot be reviewed again';
  -- Webmail approval needs an explicit override (row inserted as the server could, for an owner-entered case).
  insert into public.research_applications (auth_user_id, institution_name, role_title, principal_investigator, institutional_email, research_summary, terms_version)
  values (ctx.webmail, 'Independent lab', 'Founder', 'Self', 'rollback-webmail@gmail.com', repeat('Independent research description. ', 3), '2026-10-25')
  returning id into ctx.webmail_app;
  ok := false;
  begin perform public.review_research_application(ctx.admin_id, ctx.webmail_app, 'approved', null); exception when others then ok := true; end;
  assert ok, 'Webmail approval without override must fail';
  r := public.review_research_application(ctx.admin_id, ctx.webmail_app, 'approved', 'Owner override after documents check', true);
  assert r->>'free_domain_override' = 'true', 'Override must be recorded';
end $$;

-- Approved applicant is verified; expiry and email changes end it.
select set_config('request.jwt.claims', jsonb_build_object('sub', applicant, 'role', 'authenticated')::text, true) from rv;
set local role authenticated;
do $$ begin assert private.is_verified_researcher(), 'Approved applicant must be verified'; end $$;
reset role;
update public.research_applications set expires_at = now() - interval '1 minute' where id = (select app_id from rv);
set local role authenticated;
do $$ begin assert not private.is_verified_researcher(), 'Expired approval must not verify'; end $$;
reset role;
update public.research_applications set expires_at = now() + interval '1 day' where id = (select app_id from rv);
update auth.users set email = 'changed-address@example.invalid' where id = (select applicant from rv);
set local role authenticated;
do $$ begin assert not private.is_verified_researcher(), 'Changing login email must end verification'; end $$;
reset role;

select 'PASS: confirmed email, webmail refusal, terms, own-folder documents, one pending, row isolation, no self-review, admin-only decisions, denial reason, audit, one-year expiry, webmail override, email-change revocation' as result;
rollback;
