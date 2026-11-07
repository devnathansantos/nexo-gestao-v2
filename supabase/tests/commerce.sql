-- Disposable PostgreSQL/PGlite database only. Run after both migrations.
-- Every fixture and temporary helper is rolled back. Unexpected success or an
-- unexpected SQLSTATE fails the suite instead of being swallowed as expected.
begin;

create function pg_temp.commerce_assert(value boolean, label text) returns void
language plpgsql as $$
begin
  if value is distinct from true then raise exception 'FAIL: %', label; end if;
end;
$$;

create function pg_temp.commerce_expect_error(statement text, expected_state text, label text, expected_message text default null) returns void
language plpgsql as $$
declare actual_state text; actual_message text;
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics actual_state = returned_sqlstate, actual_message = message_text;
    if actual_state = expected_state and (expected_message is null or actual_message = expected_message) then return; end if;
    raise exception 'FAIL: % expected SQLSTATE %, got % (%)', label, expected_state, actual_state, sqlerrm;
  end;
  raise exception 'FAIL: % unexpectedly succeeded', label;
end;
$$;

-- A test-only failure after actual header/counter writes and one item INSERT.
-- Ordinary invalid-input tests above DML cannot demonstrate transaction rollback.
-- The sentinel is a valid business string and the exact error message proves
-- this trigger, rather than an earlier validation, produced the expected error.
create function pg_temp.commerce_fail_item_insert() returns trigger
language plpgsql set search_path = '' as $$
declare header public.quotes%rowtype; previous_document jsonb;
begin
  if new.name <> 'NEXO_TEST_FAIL_ITEM_INSERT' then return new; end if;
  select * into header from public.quotes where id = new.quote_id;
  if not found then raise exception 'FAIL: forced item failure ran before header write'; end if;
  if not exists (
    select 1 from nexo_private.quote_counters counter
    where counter.company_id = header.company_id and counter.last_number >= header.number
  ) then raise exception 'FAIL: forced item failure ran before counter write'; end if;
  if not exists (
    select 1 from public.quote_items item
    where item.quote_id = new.quote_id and item.name = 'Serviço ajustado'
  ) then raise exception 'FAIL: forced item failure ran before the first line INSERT'; end if;
  if current_setting('commerce.fail_mode', true) = 'create' then
    if header.title <> 'TESTE HEADER CRIADO' then raise exception 'FAIL: expected newly created header was not visible'; end if;
  elsif current_setting('commerce.fail_mode', true) = 'edit' then
    previous_document := current_setting('commerce.quote_a1')::jsonb;
    if header.title <> 'TESTE HEADER EDITADO'
      or header.updated_at <= (previous_document ->> 'updated_at')::timestamptz then
      raise exception 'FAIL: forced item failure ran before header UPDATE';
    end if;
    if exists (
      select 1 from public.quote_items item
      where item.quote_id = new.quote_id and item.id in (
        select (old_item ->> 'id')::uuid from jsonb_array_elements(previous_document -> 'items') old_item
      )
    ) then raise exception 'FAIL: forced item failure ran before old lines DELETE'; end if;
  else raise exception 'FAIL: unexpected forced item failure context';
  end if;
  raise exception 'NEXO_TEST_FORCED_ITEM_FAILURE' using errcode = '22023';
end;
$$;
create trigger commerce_force_item_failure
  before insert on public.quote_items
  for each row execute function pg_temp.commerce_fail_item_insert();

insert into auth.users(id, email, raw_user_meta_data) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'commerce-a@example.test', '{"company_name":"Empresa A Comércio"}'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'commerce-b@example.test', '{"company_name":"Empresa B Comércio"}');
select set_config('commerce.company_a', (select id::text from public.companies where owner_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), true);
select set_config('commerce.company_b', (select id::text from public.companies where owner_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'), true);

insert into public.customers(id, company_id, name, email, phone, document) values
  ('33333333-3333-4333-8333-333333333333', current_setting('commerce.company_a')::uuid, 'Cliente A Original', 'cliente-a@example.test', '11999999999', '12345678901'),
  ('44444444-4444-4444-8444-444444444444', current_setting('commerce.company_b')::uuid, 'Cliente B', 'cliente-b@example.test', null, null);
select set_config('commerce.customer_a', '33333333-3333-4333-8333-333333333333', true);
select set_config('commerce.customer_b', '44444444-4444-4444-8444-444444444444', true);
insert into public.catalog_items(company_id, kind, name, unit, price_cents)
values (current_setting('commerce.company_b')::uuid, 'product', 'Produto B', 'un', 2500);
select set_config('commerce.catalog_b', (select id::text from public.catalog_items where name = 'Produto B'), true);

select set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', true);
set local role authenticated;
insert into public.catalog_items(company_id, kind, name, description, unit, price_cents)
values (current_setting('commerce.company_a')::uuid, 'service', 'Serviço A Catálogo', 'Descrição A', 'h', 10000);
select set_config('commerce.catalog_a', (select id::text from public.catalog_items where name = 'Serviço A Catálogo'), true);
select pg_temp.commerce_assert((select count(*) = 1 from public.catalog_items), 'catalog select isolates company A');
select pg_temp.commerce_assert(not exists(select 1 from public.catalog_items where id = current_setting('commerce.catalog_b')::uuid), 'known foreign catalog ID is hidden');
update public.catalog_items set price_cents = 10100, active = false where id = current_setting('commerce.catalog_a')::uuid;
select pg_temp.commerce_assert((select price_cents = 10100 and not active from public.catalog_items), 'own catalog update succeeds');
update public.catalog_items set active = true where id = current_setting('commerce.catalog_a')::uuid;
insert into public.catalog_items(company_id, kind, name, unit, price_cents)
values (current_setting('commerce.company_a')::uuid, 'product', 'Temporário para excluir', 'un', 0);
delete from public.catalog_items where name = 'Temporário para excluir';
select pg_temp.commerce_assert((select count(*) = 1 from public.catalog_items), 'own catalog create/delete succeeds');

select pg_temp.commerce_expect_error(format(
  'insert into public.catalog_items(company_id,kind,name,unit,price_cents) values (%L::uuid,''product'',''Intruso'',''un'',1)', current_setting('commerce.company_b')
), '42501', 'cross-company catalog insert');
select pg_temp.commerce_expect_error(format(
  'update public.catalog_items set company_id=%L::uuid where id=%L::uuid', current_setting('commerce.company_b'), current_setting('commerce.catalog_a')
), '42501', 'catalog tenant is immutable');
do $$
declare affected bigint;
begin
  update public.catalog_items set name = 'Invadido' where id = current_setting('commerce.catalog_b')::uuid;
  get diagnostics affected = row_count;
  perform pg_temp.commerce_assert(affected = 0, 'cross-company catalog update changes no rows');
  delete from public.catalog_items where id = current_setting('commerce.catalog_b')::uuid;
  get diagnostics affected = row_count;
  perform pg_temp.commerce_assert(affected = 0, 'cross-company catalog delete changes no rows');
end;
$$;

select set_config('commerce.payload_a', jsonb_build_object(
  'company_id', current_setting('commerce.company_a'), 'customer_id', current_setting('commerce.customer_a'),
  'title', 'Orçamento A', 'valid_until', '2026-12-31', 'notes', 'Observação da proposta', 'payment_terms', 'PIX na entrega',
  'discount_cents', 1, 'subtotal_cents', 1, 'total_cents', 1, 'status', 'approved',
  'customer_name', 'Cliente forjado', 'company_name', 'Empresa forjada',
  'items', jsonb_build_array(
    jsonb_build_object('catalog_item_id', current_setting('commerce.catalog_a'), 'name', 'Serviço ajustado', 'unit', 'h', 'quantity_milli', 1500, 'unit_price_cents', 101),
    jsonb_build_object('catalog_item_id', null, 'name', 'Material extra', 'unit', 'un', 'quantity_milli', 1000, 'unit_price_cents', 249)
  )
)::text, true);

-- Failing on a later item must not leave the quote, its first item or a consumed
-- number behind. The first successful number below must still be 1.
select pg_temp.commerce_expect_error(format('select public.nexo_save_quote(%L::jsonb)',
  jsonb_set(current_setting('commerce.payload_a')::jsonb, '{items,1,quantity_milli}', '0'::jsonb)
), '22023', 'invalid second item rolls back all quote work');
select pg_temp.commerce_assert((select count(*) = 0 from public.quotes), 'invalid quote leaves no header');
select pg_temp.commerce_assert((select count(*) = 0 from public.quote_items), 'invalid quote leaves no lines');

select set_config('commerce.fail_mode', 'create', true);
select pg_temp.commerce_expect_error(format('select public.nexo_save_quote(%L::jsonb)',
  jsonb_set(current_setting('commerce.payload_a')::jsonb, '{items,1,name}', '"NEXO_TEST_FAIL_ITEM_INSERT"'::jsonb)
    || '{"title":"TESTE HEADER CRIADO"}'::jsonb
), '22023', 'failure after created header/counter/first line rolls back the whole RPC', 'NEXO_TEST_FORCED_ITEM_FAILURE');
select pg_temp.commerce_assert((select count(*) = 0 from public.quotes), 'post-DML create failure leaves no header');
select pg_temp.commerce_assert((select count(*) = 0 from public.quote_items), 'post-DML create failure leaves no first or second line');
reset role;
select pg_temp.commerce_assert(not exists(
  select 1 from nexo_private.quote_counters where company_id = current_setting('commerce.company_a')::uuid
), 'post-DML create failure rolls back the counter row itself');
set local role authenticated;
select set_config('commerce.fail_mode', '', true);

select set_config('commerce.request_id', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', true);
select set_config('commerce.quote_a1', public.nexo_save_quote(
  current_setting('commerce.payload_a')::jsonb || jsonb_build_object('request_id', current_setting('commerce.request_id'))
)::text, true);
select pg_temp.commerce_assert((current_setting('commerce.quote_a1')::jsonb ->> 'number')::int = 1, 'first valid company A number is 1');
select pg_temp.commerce_assert((current_setting('commerce.quote_a1')::jsonb ->> 'status') = 'draft', 'new status ignores forged approved payload');
select pg_temp.commerce_assert((current_setting('commerce.quote_a1')::jsonb ->> 'subtotal_cents')::bigint = 401, 'subtotal rounds each line, never trusts payload total');
select pg_temp.commerce_assert((current_setting('commerce.quote_a1')::jsonb ->> 'total_cents')::bigint = 400, 'fixed discount is applied server-side');
select pg_temp.commerce_assert((current_setting('commerce.quote_a1')::jsonb -> 'items' -> 0 ->> 'line_total_cents')::bigint = 152, 'one-and-a-half times 101 rounds half-up to 152');
select pg_temp.commerce_assert(current_setting('commerce.quote_a1')::jsonb ->> 'customer_name' = 'Cliente A Original', 'customer snapshot comes from database');
select pg_temp.commerce_assert(current_setting('commerce.quote_a1')::jsonb ->> 'company_name' = 'Empresa A Comércio', 'company snapshot comes from database');
select pg_temp.commerce_assert(jsonb_array_length(current_setting('commerce.quote_a1')::jsonb -> 'items') = 2, 'full RPC response includes every item');
select pg_temp.commerce_assert(current_setting('commerce.quote_a1')::jsonb -> 'items' -> 0 ->> 'name' = 'Serviço ajustado', 'authorized custom line description is retained');
select pg_temp.commerce_assert((
  public.nexo_save_quote(current_setting('commerce.payload_a')::jsonb || jsonb_build_object(
    'request_id', current_setting('commerce.request_id'), 'title', 'Retry não deve editar',
    'customer_id', current_setting('commerce.customer_b'), 'items', '[]'::jsonb
  ))
) = current_setting('commerce.quote_a1')::jsonb, 'idempotent retry returns original quote without edits, validation side effects or another number');

select pg_temp.commerce_expect_error(format(
  'insert into public.quotes(company_id,title) values (%L::uuid,''Escrita direta'')', current_setting('commerce.company_a')
), '42501', 'direct quote insertion is denied');
select pg_temp.commerce_expect_error(format(
  'update public.quotes set status=''approved'' where id=%L::uuid', current_setting('commerce.quote_a1')::jsonb ->> 'id'
), '42501', 'direct quote status update is denied');
select pg_temp.commerce_expect_error('delete from public.quotes', '42501', 'direct quote delete is denied');
select pg_temp.commerce_expect_error(format(
  'insert into public.quote_items(quote_id,name,unit,quantity_milli,unit_price_cents,line_total_cents,position) values (%L::uuid,''Intruso'',''un'',1000,1,1,99)', current_setting('commerce.quote_a1')::jsonb ->> 'id'
), '42501', 'direct item insertion is denied');
select pg_temp.commerce_expect_error('update public.quote_items set name=''Forjado''', '42501', 'direct item update is denied');
select pg_temp.commerce_expect_error('delete from public.quote_items', '42501', 'direct item delete is denied');
select pg_temp.commerce_expect_error('select * from nexo_private.quote_counters', '42501', 'private counter cannot be read by browser');

select pg_temp.commerce_expect_error(format('select public.nexo_save_quote(%L::jsonb)',
  current_setting('commerce.payload_a')::jsonb || jsonb_build_object('company_id', current_setting('commerce.company_b'))
), '42501', 'save cannot select another company');
select pg_temp.commerce_expect_error(format('select public.nexo_save_quote(%L::jsonb)',
  current_setting('commerce.payload_a')::jsonb || jsonb_build_object('customer_id', current_setting('commerce.customer_b'))
), '42501', 'save cannot snapshot another company customer');
select pg_temp.commerce_expect_error(format('select public.nexo_save_quote(%L::jsonb)',
  jsonb_set(current_setting('commerce.payload_a')::jsonb, '{items,0,catalog_item_id}', to_jsonb(current_setting('commerce.catalog_b')))
), '42501', 'save cannot link another company catalog item');
select pg_temp.commerce_expect_error(format('select public.nexo_save_quote(%L::jsonb)',
  current_setting('commerce.payload_a')::jsonb || '{"customer_id":null}'::jsonb
), '22023', 'new quote requires customer');
select pg_temp.commerce_expect_error(format('select public.nexo_save_quote(%L::jsonb)',
  current_setting('commerce.payload_a')::jsonb || '{"items":[]}'::jsonb
), '22023', 'empty items are rejected');
select pg_temp.commerce_expect_error(format('select public.nexo_save_quote(%L::jsonb)',
  current_setting('commerce.payload_a')::jsonb || jsonb_build_object('items', (
    select jsonb_agg(current_setting('commerce.payload_a')::jsonb -> 'items' -> 0) from generate_series(1,101)
  ))
), '22023', 'more than 100 items are rejected');
select pg_temp.commerce_expect_error(format('select public.nexo_save_quote(%L::jsonb)',
  current_setting('commerce.payload_a')::jsonb || '{"discount_cents":402}'::jsonb
), '22023', 'discount cannot exceed computed subtotal');
select pg_temp.commerce_expect_error(format('select public.nexo_save_quote(%L::jsonb)',
  current_setting('commerce.payload_a')::jsonb || '{"discount_cents":-1}'::jsonb
), '22023', 'negative discount is rejected');
select pg_temp.commerce_expect_error(format('select public.nexo_save_quote(%L::jsonb)',
  jsonb_set(jsonb_set(current_setting('commerce.payload_a')::jsonb, '{items,0,quantity_milli}', '1000000000'), '{items,0,unit_price_cents}', '1000000000')
), '22023', 'computed total above 1e12 cents is rejected');
select pg_temp.commerce_expect_error(format('select public.nexo_save_quote(%L::jsonb)',
  jsonb_set(current_setting('commerce.payload_a')::jsonb, '{items,0,quantity_milli}', '1000000001')
), '22023', 'quantity bound is enforced even when computed line total would fit');
select pg_temp.commerce_expect_error(format('select public.nexo_save_quote(%L::jsonb)',
  jsonb_set(current_setting('commerce.payload_a')::jsonb, '{items,0,unit_price_cents}', '1000000001')
), '22023', 'price bound is enforced even when computed line total would fit');
select pg_temp.commerce_expect_error(format('select public.nexo_save_quote(%L::jsonb)',
  jsonb_set(current_setting('commerce.payload_a')::jsonb, '{items,0,quantity_milli}', '1.5')
), '22023', 'quantity must be an integer number of thousandths');
select pg_temp.commerce_expect_error(format('select public.nexo_save_quote(%L::jsonb)',
  current_setting('commerce.payload_a')::jsonb || '{"valid_until":"2026-02-31"}'::jsonb
), '22023', 'impossible calendar date is rejected');

update public.catalog_items set name = 'Catálogo renomeado', price_cents = 90000 where id = current_setting('commerce.catalog_a')::uuid;
update public.customers set name = 'Cliente A Atualizado', email = 'novo-a@example.test' where id = current_setting('commerce.customer_a')::uuid;
select pg_temp.commerce_assert((select customer_name = 'Cliente A Original' from public.quotes), 'saved customer snapshot does not change on customer edit');
select pg_temp.commerce_assert((select name = 'Serviço ajustado' and unit_price_cents = 101 from public.quote_items where catalog_item_id = current_setting('commerce.catalog_a')::uuid), 'saved line snapshot does not change on catalog edit');

select pg_temp.commerce_expect_error(format('select public.nexo_save_quote(%L::jsonb)',
  current_setting('commerce.payload_a')::jsonb || jsonb_build_object('id', current_setting('commerce.quote_a1')::jsonb ->> 'id')
), '40001', 'draft edit requires expected_updated_at');
select pg_temp.commerce_expect_error(format('select public.nexo_save_quote(%L::jsonb)',
  jsonb_set(current_setting('commerce.payload_a')::jsonb, '{items,1,quantity_milli}', '0'::jsonb)
    || jsonb_build_object('id', current_setting('commerce.quote_a1')::jsonb ->> 'id', 'expected_updated_at', current_setting('commerce.quote_a1')::jsonb ->> 'updated_at')
), '22023', 'invalid draft replacement is atomic');
select pg_temp.commerce_assert((
  select quote = current_setting('commerce.quote_a1')::jsonb
  from jsonb_array_elements(public.nexo_export_company_data() -> 'quotes') quote
  where quote ->> 'id' = current_setting('commerce.quote_a1')::jsonb ->> 'id'
), 'failed replacement preserves header, snapshots, lines and optimistic token exactly');
select set_config('commerce.fail_mode', 'edit', true);
select pg_temp.commerce_expect_error(format('select public.nexo_save_quote(%L::jsonb)',
  jsonb_set(current_setting('commerce.payload_a')::jsonb, '{items,1,name}', '"NEXO_TEST_FAIL_ITEM_INSERT"'::jsonb)
    || jsonb_build_object('id', current_setting('commerce.quote_a1')::jsonb ->> 'id', 'expected_updated_at', current_setting('commerce.quote_a1')::jsonb ->> 'updated_at', 'title', 'TESTE HEADER EDITADO')
), '22023', 'failure after header UPDATE/old lines DELETE/new line INSERT is atomic', 'NEXO_TEST_FORCED_ITEM_FAILURE');
select pg_temp.commerce_assert((
  select quote = current_setting('commerce.quote_a1')::jsonb
  from jsonb_array_elements(public.nexo_export_company_data() -> 'quotes') quote
  where quote ->> 'id' = current_setting('commerce.quote_a1')::jsonb ->> 'id'
), 'post-DML edit failure restores exact header, snapshots, old line IDs and optimistic token');
reset role;
select pg_temp.commerce_assert((
  select last_number = 1 from nexo_private.quote_counters where company_id = current_setting('commerce.company_a')::uuid
), 'post-DML edit failure leaves company sequence unchanged');
drop trigger commerce_force_item_failure on public.quote_items;
drop function pg_temp.commerce_fail_item_insert();
set local role authenticated;
select set_config('commerce.fail_mode', '', true);
select set_config('commerce.quote_a1_before_edit', current_setting('commerce.quote_a1'), true);
select set_config('commerce.quote_a1', public.nexo_save_quote(
  current_setting('commerce.payload_a')::jsonb || jsonb_build_object(
    'id', current_setting('commerce.quote_a1')::jsonb ->> 'id',
    'expected_updated_at', current_setting('commerce.quote_a1')::jsonb ->> 'updated_at',
    'title', 'Orçamento A editado'
  )
)::text, true);
select pg_temp.commerce_assert(current_setting('commerce.quote_a1')::jsonb ->> 'id' = current_setting('commerce.quote_a1_before_edit')::jsonb ->> 'id', 'draft edit retains ID');
select pg_temp.commerce_assert((current_setting('commerce.quote_a1')::jsonb ->> 'number')::int = 1, 'draft edit retains number');
select pg_temp.commerce_assert((current_setting('commerce.quote_a1')::jsonb ->> 'updated_at')::timestamptz > (current_setting('commerce.quote_a1_before_edit')::jsonb ->> 'updated_at')::timestamptz, 'successful edit advances optimistic token');
select pg_temp.commerce_assert((select count(*) = 2 from public.quote_items), 'draft item replacement leaves no duplicate lines');
select pg_temp.commerce_expect_error(format('select public.nexo_save_quote(%L::jsonb)',
  current_setting('commerce.payload_a')::jsonb || jsonb_build_object(
    'id', current_setting('commerce.quote_a1')::jsonb ->> 'id',
    'expected_updated_at', current_setting('commerce.quote_a1_before_edit')::jsonb ->> 'updated_at'
  )
), '40001', 'stale draft edit cannot overwrite latest quote');
select pg_temp.commerce_expect_error(format('select public.nexo_set_quote_status(%L::uuid,''sent'',%L::timestamptz)',
  current_setting('commerce.quote_a1')::jsonb ->> 'id', current_setting('commerce.quote_a1_before_edit')::jsonb ->> 'updated_at'
), '40001', 'status transition requires latest optimistic token');
select pg_temp.commerce_expect_error(format('select public.nexo_set_quote_status(%L::uuid,''approved'',%L::timestamptz)',
  current_setting('commerce.quote_a1')::jsonb ->> 'id', current_setting('commerce.quote_a1')::jsonb ->> 'updated_at'
), '55000', 'draft cannot jump directly to approved');

select set_config('commerce.quote_a1', public.nexo_set_quote_status(
  (current_setting('commerce.quote_a1')::jsonb ->> 'id')::uuid, 'sent',
  (current_setting('commerce.quote_a1')::jsonb ->> 'updated_at')::timestamptz
)::text, true);
select pg_temp.commerce_assert(current_setting('commerce.quote_a1')::jsonb ->> 'status' = 'sent', 'draft can become sent');
select pg_temp.commerce_expect_error(format('select public.nexo_save_quote(%L::jsonb)',
  current_setting('commerce.payload_a')::jsonb || jsonb_build_object('id', current_setting('commerce.quote_a1')::jsonb ->> 'id', 'expected_updated_at', current_setting('commerce.quote_a1')::jsonb ->> 'updated_at')
), '55000', 'sent quote cannot be edited');
select pg_temp.commerce_expect_error(format('select public.nexo_delete_quote(%L::uuid,%L::timestamptz)',
  current_setting('commerce.quote_a1')::jsonb ->> 'id', current_setting('commerce.quote_a1')::jsonb ->> 'updated_at'
), '55000', 'sent quote cannot be deleted');
select set_config('commerce.quote_a1', public.nexo_set_quote_status(
  (current_setting('commerce.quote_a1')::jsonb ->> 'id')::uuid, 'draft',
  (current_setting('commerce.quote_a1')::jsonb ->> 'updated_at')::timestamptz
)::text, true);
select pg_temp.commerce_assert(current_setting('commerce.quote_a1')::jsonb ->> 'status' = 'draft', 'sent can return to draft');
select set_config('commerce.quote_a1', public.nexo_set_quote_status(
  (current_setting('commerce.quote_a1')::jsonb ->> 'id')::uuid, 'sent',
  (current_setting('commerce.quote_a1')::jsonb ->> 'updated_at')::timestamptz
)::text, true);
select set_config('commerce.quote_a1', public.nexo_set_quote_status(
  (current_setting('commerce.quote_a1')::jsonb ->> 'id')::uuid, 'approved',
  (current_setting('commerce.quote_a1')::jsonb ->> 'updated_at')::timestamptz
)::text, true);
select pg_temp.commerce_assert(current_setting('commerce.quote_a1')::jsonb ->> 'status' = 'approved', 'sent can become approved');
select pg_temp.commerce_expect_error(format('select public.nexo_set_quote_status(%L::uuid,''draft'',%L::timestamptz)',
  current_setting('commerce.quote_a1')::jsonb ->> 'id', current_setting('commerce.quote_a1')::jsonb ->> 'updated_at'
), '55000', 'approved is terminal');
select pg_temp.commerce_expect_error(format('select public.nexo_delete_quote(%L::uuid,%L::timestamptz)',
  current_setting('commerce.quote_a1')::jsonb ->> 'id', current_setting('commerce.quote_a1')::jsonb ->> 'updated_at'
), '55000', 'approved quote cannot be deleted');

select set_config('commerce.quote_a2', public.nexo_save_quote(current_setting('commerce.payload_a')::jsonb)::text, true);
select pg_temp.commerce_assert((current_setting('commerce.quote_a2')::jsonb ->> 'number')::int = 2, 'failed attempts and edits do not consume quote numbers');
select set_config('commerce.quote_a2', public.nexo_set_quote_status(
  (current_setting('commerce.quote_a2')::jsonb ->> 'id')::uuid, 'sent',
  (current_setting('commerce.quote_a2')::jsonb ->> 'updated_at')::timestamptz
)::text, true);
select set_config('commerce.quote_a2', public.nexo_set_quote_status(
  (current_setting('commerce.quote_a2')::jsonb ->> 'id')::uuid, 'declined',
  (current_setting('commerce.quote_a2')::jsonb ->> 'updated_at')::timestamptz
)::text, true);
select pg_temp.commerce_assert(current_setting('commerce.quote_a2')::jsonb ->> 'status' = 'declined', 'sent can become declined');
select pg_temp.commerce_expect_error(format('select public.nexo_set_quote_status(%L::uuid,''sent'',%L::timestamptz)',
  current_setting('commerce.quote_a2')::jsonb ->> 'id', current_setting('commerce.quote_a2')::jsonb ->> 'updated_at'
), '55000', 'declined is terminal');
select pg_temp.commerce_expect_error(format('select public.nexo_delete_quote(%L::uuid,%L::timestamptz)',
  current_setting('commerce.quote_a2')::jsonb ->> 'id', current_setting('commerce.quote_a2')::jsonb ->> 'updated_at'
), '55000', 'declined quote cannot be deleted');

select set_config('commerce.quote_a3', public.nexo_save_quote(current_setting('commerce.payload_a')::jsonb)::text, true);
select pg_temp.commerce_assert((current_setting('commerce.quote_a3')::jsonb ->> 'number')::int = 3, 'third successful quote gets 3');
select set_config('commerce.quote_a3_before_edit', current_setting('commerce.quote_a3'), true);
select set_config('commerce.quote_a3', public.nexo_save_quote(
  current_setting('commerce.payload_a')::jsonb || jsonb_build_object(
    'id', current_setting('commerce.quote_a3')::jsonb ->> 'id',
    'expected_updated_at', current_setting('commerce.quote_a3')::jsonb ->> 'updated_at',
    'title', 'Rascunho atualizado antes da exclusão'
  )
)::text, true);
select pg_temp.commerce_expect_error(format('select public.nexo_delete_quote(%L::uuid,%L::timestamptz)',
  current_setting('commerce.quote_a3')::jsonb ->> 'id', current_setting('commerce.quote_a3_before_edit')::jsonb ->> 'updated_at'
), '40001', 'stale deletion cannot remove a draft');
select public.nexo_delete_quote(
  (current_setting('commerce.quote_a3')::jsonb ->> 'id')::uuid,
  (current_setting('commerce.quote_a3')::jsonb ->> 'updated_at')::timestamptz
);
select pg_temp.commerce_assert(not exists(select 1 from public.quotes where id = (current_setting('commerce.quote_a3')::jsonb ->> 'id')::uuid), 'draft deletion removes header');
select pg_temp.commerce_assert(not exists(select 1 from public.quote_items where quote_id = (current_setting('commerce.quote_a3')::jsonb ->> 'id')::uuid), 'draft deletion removes every line atomically');
select set_config('commerce.quote_a4', public.nexo_save_quote(current_setting('commerce.payload_a')::jsonb)::text, true);
select pg_temp.commerce_assert((current_setting('commerce.quote_a4')::jsonb ->> 'number')::int = 4, 'deleted quote number is never reused');

-- A second company gets its own sequence, and cannot access A's quote or lines.
reset role;
select set_config('request.jwt.claim.sub', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', true);
set local role authenticated;
select pg_temp.commerce_assert((select count(*) = 0 from public.quotes), 'company B cannot read company A quotes');
select pg_temp.commerce_assert((select count(*) = 0 from public.quote_items), 'company B cannot read company A quote lines');
select set_config('commerce.payload_b', (current_setting('commerce.payload_a')::jsonb || jsonb_build_object(
  'company_id', current_setting('commerce.company_b'), 'customer_id', current_setting('commerce.customer_b'),
  'items', jsonb_build_array(jsonb_build_object('catalog_item_id', current_setting('commerce.catalog_b'), 'name', 'Produto B proposta', 'unit', 'un', 'quantity_milli', 1000, 'unit_price_cents', 2500))
))::text, true);
select set_config('commerce.quote_b1', public.nexo_save_quote(
  current_setting('commerce.payload_b')::jsonb || jsonb_build_object('request_id', current_setting('commerce.request_id'))
)::text, true);
select pg_temp.commerce_assert((current_setting('commerce.quote_b1')::jsonb ->> 'number')::int = 1, 'company B numbering starts at 1 independently');
select pg_temp.commerce_assert(current_setting('commerce.quote_b1')::jsonb ->> 'id' <> current_setting('commerce.quote_a1')::jsonb ->> 'id', 'same request UUID in another company creates its own quote');
select pg_temp.commerce_expect_error(format('select public.nexo_save_quote(%L::jsonb)',
  current_setting('commerce.payload_b')::jsonb || jsonb_build_object('id', current_setting('commerce.quote_a4')::jsonb ->> 'id', 'expected_updated_at', current_setting('commerce.quote_a4')::jsonb ->> 'updated_at')
), '42501', 'RPC cannot edit another company quote');
select pg_temp.commerce_expect_error(format('select public.nexo_set_quote_status(%L::uuid,''sent'',%L::timestamptz)',
  current_setting('commerce.quote_a4')::jsonb ->> 'id', current_setting('commerce.quote_a4')::jsonb ->> 'updated_at'
), '42501', 'RPC cannot change another company quote status');
select pg_temp.commerce_expect_error(format('select public.nexo_delete_quote(%L::uuid,%L::timestamptz)',
  current_setting('commerce.quote_a4')::jsonb ->> 'id', current_setting('commerce.quote_a4')::jsonb ->> 'updated_at'
), '42501', 'RPC cannot delete another company quote');
select pg_temp.commerce_assert((
  select payload -> 'company' ->> 'id' = current_setting('commerce.company_b')
    and jsonb_array_length(payload -> 'catalog_items') = 1
    and jsonb_array_length(payload -> 'quotes') = 1
    and payload -> 'quotes' -> 0 ->> 'id' = current_setting('commerce.quote_b1')::jsonb ->> 'id'
    and jsonb_array_length(payload -> 'quotes' -> 0 -> 'items') = 1
  from (select public.nexo_export_company_data() payload) snapshot
), 'company B snapshot exports catalog and quote lines without company A data');
select set_config('commerce.quote_b_max', public.nexo_save_quote(
  current_setting('commerce.payload_b')::jsonb || jsonb_build_object(
    'discount_cents', 0,
    'items', jsonb_build_array(jsonb_build_object('catalog_item_id', current_setting('commerce.catalog_b'), 'name', 'Valor máximo permitido', 'unit', 'un', 'quantity_milli', 1000000, 'unit_price_cents', 1000000000))
  )
)::text, true);
select pg_temp.commerce_assert((current_setting('commerce.quote_b_max')::jsonb ->> 'total_cents')::bigint = 1000000000000, 'exact 1e12-cent boundary remains representable and valid');

reset role;
select set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', true);
set local role authenticated;
select pg_temp.commerce_assert(not exists(select 1 from public.quotes where id = (current_setting('commerce.quote_b1')::jsonb ->> 'id')::uuid), 'company A cannot read company B known quote ID');
select pg_temp.commerce_assert(not exists(select 1 from public.quote_items where quote_id = (current_setting('commerce.quote_b1')::jsonb ->> 'id')::uuid), 'company A cannot read company B known line parent ID');

-- Deleting a customer/catalog reference must preserve the printed snapshots.
delete from public.customers where id = current_setting('commerce.customer_a')::uuid;
select pg_temp.commerce_assert((select customer_id is null and customer_name = 'Cliente A Atualizado' from public.quotes where id = (current_setting('commerce.quote_a4')::jsonb ->> 'id')::uuid), 'deleting customer nulls reference but retains quote snapshot');
select set_config('commerce.quote_a4', (
  select item::text from jsonb_array_elements(public.nexo_export_company_data() -> 'quotes') item
  where item ->> 'id' = current_setting('commerce.quote_a4')::jsonb ->> 'id'
), true);
select set_config('commerce.quote_a4', public.nexo_save_quote(
  current_setting('commerce.payload_a')::jsonb || jsonb_build_object(
    'id', current_setting('commerce.quote_a4')::jsonb ->> 'id',
    'expected_updated_at', current_setting('commerce.quote_a4')::jsonb ->> 'updated_at',
    'customer_id', null, 'customer_name', 'Snapshot forjado após exclusão'
  )
)::text, true);
select pg_temp.commerce_assert(current_setting('commerce.quote_a4')::jsonb ->> 'customer_name' = 'Cliente A Atualizado', 'editing orphaned draft preserves trusted customer snapshot');
delete from public.catalog_items where id = current_setting('commerce.catalog_a')::uuid;
select pg_temp.commerce_assert((
  select catalog_item_id is null and name = 'Serviço ajustado' and unit_price_cents = 101
  from public.quote_items where quote_id = (current_setting('commerce.quote_a4')::jsonb ->> 'id')::uuid and position = (select min(position) from public.quote_items where quote_id = (current_setting('commerce.quote_a4')::jsonb ->> 'id')::uuid)
), 'deleting catalog item retains printable name and price snapshot');
insert into public.catalog_items(company_id, kind, name, unit, price_cents)
values (current_setting('commerce.company_a')::uuid, 'product', 'Produto novo A', 'un', 1);
select pg_temp.commerce_assert((
  select payload -> 'company' ->> 'id' = current_setting('commerce.company_a')
    and payload -> 'customers' = '[]'::jsonb
    and jsonb_array_length(payload -> 'catalog_items') = 1
    and jsonb_array_length(payload -> 'quotes') = 3
    and not exists (
      select 1 from jsonb_array_elements(payload -> 'quotes') quote
      where quote ->> 'company_id' <> current_setting('commerce.company_a')
        or jsonb_array_length(quote -> 'items') <> 2
    )
  from (select public.nexo_export_company_data() payload) snapshot
), 'company A snapshot exports all own catalog/quotes/items after customer and catalog deletion');

reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
select pg_temp.commerce_assert((select count(*) = 0 from public.catalog_items), 'missing claim sees no catalog');
select pg_temp.commerce_assert((select count(*) = 0 from public.quotes), 'missing claim sees no quotes');
select pg_temp.commerce_assert((select count(*) = 0 from public.quote_items), 'missing claim sees no quote lines');
select pg_temp.commerce_expect_error(format('select public.nexo_save_quote(%L::jsonb)', current_setting('commerce.payload_b')), '42501', 'missing claim cannot call definer save');

set local role anon;
select pg_temp.commerce_expect_error('select * from public.catalog_items', '42501', 'anonymous catalog read');
select pg_temp.commerce_expect_error('select * from public.quotes', '42501', 'anonymous quote read');
select pg_temp.commerce_expect_error('select * from public.quote_items', '42501', 'anonymous quote item read');
select pg_temp.commerce_expect_error(format('select public.nexo_save_quote(%L::jsonb)', current_setting('commerce.payload_b')), '42501', 'anonymous save RPC');
select pg_temp.commerce_expect_error(format('select public.nexo_set_quote_status(%L::uuid,''sent'',%L::timestamptz)', current_setting('commerce.quote_b1')::jsonb ->> 'id', current_setting('commerce.quote_b1')::jsonb ->> 'updated_at'), '42501', 'anonymous status RPC');
select pg_temp.commerce_expect_error(format('select public.nexo_delete_quote(%L::uuid,%L::timestamptz)', current_setting('commerce.quote_b1')::jsonb ->> 'id', current_setting('commerce.quote_b1')::jsonb ->> 'updated_at'), '42501', 'anonymous delete RPC');
select pg_temp.commerce_expect_error('select public.nexo_export_company_data()', '42501', 'anonymous full snapshot RPC');

reset role;
select 'PASS: catalog CRUD/RLS, atomic quote RPCs, rounding, snapshots, optimistic concurrency, transitions, counters and full export' as result;
rollback;
