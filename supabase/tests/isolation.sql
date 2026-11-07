-- Run after bootstrap.sql and the migration, in a disposable PostgreSQL DB.
-- Transaction rollback leaves no test accounts/customers behind. An assertion
-- or unexpected SQL error fails the run (use psql --set ON_ERROR_STOP=1).
begin;

create function pg_temp.assert_true(value boolean, label text) returns void
language plpgsql as $$
begin
  if value is distinct from true then
    raise exception 'FAIL: %', label;
  end if;
end;
$$;

insert into auth.users(id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'empresa-a@example.test', '{"company_name":"Empresa A","owner_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","company_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'empresa-b@example.test', '{"company_name":"Empresa B"}');

select pg_temp.assert_true((select count(*) = 2 from public.companies), 'signup provisions exactly two companies');
select pg_temp.assert_true((select name = 'Empresa A' from public.companies where owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'signup associates company with auth user');
select pg_temp.assert_true((
  select not prosecdef and provolatile = 's' and pronargs = 0
  from pg_catalog.pg_proc where oid = 'public.nexo_export_company_data'::regproc
), 'snapshot RPC is stable, security invoker and accepts no tenant parameter');

do $$
begin
  begin
    insert into auth.users(id, raw_user_meta_data) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '{}');
    raise exception 'FAIL: signup without company name accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    insert into auth.users(id, raw_user_meta_data) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '{"company_name":" "}');
    raise exception 'FAIL: blank company name accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    insert into auth.users(id, raw_user_meta_data) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '{"company_name":123}');
    raise exception 'FAIL: non-string company name accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;
select pg_temp.assert_true(not exists(select 1 from auth.users where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 'failed signup is atomic');

insert into public.customers (id, company_id, name) values
  ('11111111-1111-4111-8111-111111111111', (select id from public.companies where owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'Cliente A'),
  ('22222222-2222-4222-8222-222222222222', (select id from public.companies where owner_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'Cliente B');

-- Give tests known UUIDs as untrusted client input without leaking rows through
-- an elevated query during the assertions themselves.
select set_config('test.company_a', (select id::text from public.companies where owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), true);
select set_config('test.company_b', (select id::text from public.companies where owner_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
set local role authenticated;

select pg_temp.assert_true((select count(*) = 1 from public.companies), 'company A sees only itself');
select pg_temp.assert_true((select count(*) = 1 from public.customers), 'company A sees only its customer');
select pg_temp.assert_true(not exists(select 1 from public.customers where id = '22222222-2222-4222-8222-222222222222'), 'known foreign customer ID does not leak data');
select pg_temp.assert_true((
  select payload -> 'company' ->> 'id' = current_setting('test.company_a')
    and payload -> 'company' ->> 'owner_id' = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    and pg_catalog.jsonb_array_length(payload -> 'customers') = 1
    and payload -> 'customers' -> 0 ->> 'id' = '11111111-1111-4111-8111-111111111111'
  from (select public.nexo_export_company_data() as payload) snapshot
), 'company A snapshot contains only company A and its customer');

insert into public.customers(company_id, name, email, phone, notes)
values (current_setting('test.company_a')::uuid, 'Novo cliente A', 'cliente@example.test', '11999999999', 'Nota interna');
select pg_temp.assert_true((select count(*) = 2 from public.customers), 'own company can insert customer');
select pg_temp.assert_true((
  select payload -> 'customers' = (
    select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(customer) order by created_at desc, id asc)
    from public.customers customer
  )
  from (select public.nexo_export_company_data() as payload) snapshot
), 'snapshot includes every own customer in the documented stable order');
update public.customers set name = 'Cliente A editado', active = false where id = '11111111-1111-4111-8111-111111111111';
select pg_temp.assert_true((select name = 'Cliente A editado' and not active from public.customers where id = '11111111-1111-4111-8111-111111111111'), 'own company can update customer');

do $$
declare affected bigint;
begin
  begin
    insert into public.customers(company_id, name) values (current_setting('test.company_b')::uuid, 'Intruso');
    raise exception 'FAIL: cross-company customer insert accepted';
  exception when insufficient_privilege then null;
  end;
  update public.customers set name = 'Invadido' where id = '22222222-2222-4222-8222-222222222222';
  get diagnostics affected = row_count;
  perform pg_temp.assert_true(affected = 0, 'cross-company update affects zero rows');
  delete from public.customers where id = '22222222-2222-4222-8222-222222222222';
  get diagnostics affected = row_count;
  perform pg_temp.assert_true(affected = 0, 'cross-company delete affects zero rows');
  update public.companies set name = 'Empresa invadida' where id = current_setting('test.company_b')::uuid;
  get diagnostics affected = row_count;
  perform pg_temp.assert_true(affected = 0, 'cross-company display name update affects zero rows');
  begin
    update public.customers set company_id = current_setting('test.company_b')::uuid where id = '11111111-1111-4111-8111-111111111111';
    raise exception 'FAIL: customer tenant transfer accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.companies set owner_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    raise exception 'FAIL: company ownership transfer accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.companies(owner_id, name) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Empresa forjada');
    raise exception 'FAIL: browser company insert accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.companies;
    raise exception 'FAIL: browser company delete accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

update public.companies set name = 'Empresa A renomeada';
select pg_temp.assert_true((select name = 'Empresa A renomeada' from public.companies), 'own company can update its display name');
delete from public.customers where name = 'Novo cliente A';
select pg_temp.assert_true((select count(*) = 1 from public.customers), 'own company can delete customer');

reset role;
-- Independently exercise WITH CHECK, even if a future change accidentally
-- broadens the column grants. The temporary grant is test-only and rolled back.
grant update (company_id) on public.customers to authenticated;
set local role authenticated;
do $$
begin
  begin
    update public.customers set company_id = current_setting('test.company_b')::uuid
      where id = '11111111-1111-4111-8111-111111111111';
    raise exception 'FAIL: RLS WITH CHECK allowed a tenant transfer with a broader column grant';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
revoke update (company_id) on public.customers from authenticated;

-- Auth metadata is editable profile data and must never select the tenant.
update auth.users set raw_user_meta_data = jsonb_build_object('company_name', 'Empresa B', 'company_id', current_setting('test.company_b'), 'owner_id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role authenticated;
select pg_temp.assert_true(not exists(select 1 from public.customers where id = '22222222-2222-4222-8222-222222222222'), 'forged metadata does not change authorization');
select pg_temp.assert_true(public.nexo_export_company_data() -> 'company' ->> 'id' = current_setting('test.company_a'), 'forged metadata does not change snapshot company');

reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
set local role authenticated;
select pg_temp.assert_true((select count(*) = 1 from public.customers), 'company B sees only its customer');
select pg_temp.assert_true((select name = 'Cliente B' from public.customers), 'cross-company attempts did not change company B data');
select pg_temp.assert_true(not exists(select 1 from public.customers where id = '11111111-1111-4111-8111-111111111111'), 'company B cannot see company A customer');
select pg_temp.assert_true((
  select payload -> 'company' ->> 'id' = current_setting('test.company_b')
    and pg_catalog.jsonb_array_length(payload -> 'customers') = 1
    and payload -> 'customers' -> 0 ->> 'id' = '22222222-2222-4222-8222-222222222222'
  from (select public.nexo_export_company_data() as payload) snapshot
), 'company B snapshot contains only company B and its customer');
delete from public.customers;
select pg_temp.assert_true(public.nexo_export_company_data() -> 'customers' = '[]'::jsonb, 'empty snapshot customers are an array instead of null');

reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
select pg_temp.assert_true((select count(*) = 0 from public.companies), 'missing user claim sees zero companies');
select pg_temp.assert_true((select count(*) = 0 from public.customers), 'missing user claim sees zero customers');
select pg_temp.assert_true(public.nexo_export_company_data() is null, 'snapshot returns null without an owned company');

set local role anon;
do $$
begin
  begin
    perform * from public.companies;
    raise exception 'FAIL: anonymous company select accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.customers;
    raise exception 'FAIL: anonymous customer select accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.customers(company_id, name) values (current_setting('test.company_a')::uuid, 'Anônimo');
    raise exception 'FAIL: anonymous customer insert accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.customers set name = 'Anônimo';
    raise exception 'FAIL: anonymous customer update accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.customers;
    raise exception 'FAIL: anonymous customer delete accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.nexo_export_company_data();
    raise exception 'FAIL: anonymous snapshot RPC accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
select 'PASS: signup, ownership, customer CRUD, tenant isolation, snapshot RPC, metadata forgery and anonymous access' as result;
rollback;
