begin;

-- Additive second stage: apply after 202611030001_company_customers.sql.
create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('product', 'service')),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  description text check (description is null or char_length(description) <= 4000),
  unit text not null default 'un' check (char_length(btrim(unit)) between 1 and 20),
  price_cents integer not null default 0 check (price_cents between 0 and 1000000000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  request_id uuid not null default gen_random_uuid(),
  number integer not null check (number > 0),
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null check (char_length(btrim(customer_name)) between 2 and 160),
  customer_email text,
  customer_phone text,
  customer_document text,
  company_name text not null check (char_length(btrim(company_name)) between 2 and 120),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  valid_until date,
  notes text check (notes is null or char_length(notes) <= 4000),
  payment_terms text check (payment_terms is null or char_length(payment_terms) <= 4000),
  status text not null default 'draft' check (status in ('draft', 'sent', 'approved', 'declined')),
  subtotal_cents bigint not null check (subtotal_cents between 0 and 1000000000000),
  discount_cents bigint not null default 0 check (discount_cents between 0 and subtotal_cents),
  total_cents bigint not null check (total_cents = subtotal_cents - discount_cents),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, number),
  unique (company_id, request_id)
);

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  catalog_item_id uuid references public.catalog_items(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 2 and 160),
  unit text not null check (char_length(btrim(unit)) between 1 and 20),
  quantity_milli integer not null check (quantity_milli between 1 and 1000000000),
  unit_price_cents integer not null check (unit_price_cents between 0 and 1000000000),
  line_total_cents bigint not null check (
    line_total_cents between 0 and 1000000000000
    and line_total_cents = floor((quantity_milli::numeric * unit_price_cents + 500) / 1000)
  ),
  position integer not null check (position between 1 and 100),
  unique (quote_id, position)
);

create index if not exists catalog_items_company_name_idx on public.catalog_items(company_id, name);
create index if not exists quotes_company_created_idx on public.quotes(company_id, created_at desc, id);
create index if not exists quotes_customer_idx on public.quotes(customer_id);
create index if not exists quote_items_catalog_idx on public.quote_items(catalog_item_id);

create schema if not exists nexo_private;
revoke all on schema nexo_private from public, anon, authenticated;
create table if not exists nexo_private.quote_counters (
  company_id uuid primary key references public.companies(id) on delete cascade,
  last_number integer not null check (last_number > 0)
);
alter table nexo_private.quote_counters enable row level security;
revoke all on nexo_private.quote_counters from public, anon, authenticated;

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and (
      (tablename = 'catalog_items' and policyname not in ('nexo_catalog_select', 'nexo_catalog_insert', 'nexo_catalog_update', 'nexo_catalog_delete'))
      or (tablename = 'quotes' and policyname <> 'nexo_quote_select')
      or (tablename = 'quote_items' and policyname <> 'nexo_quote_item_select')
    )
  ) then
    raise exception 'Existing catalog/quote policies require review before installing NEXO.';
  end if;
end;
$$;

drop trigger if exists nexo_catalog_updated_at on public.catalog_items;
create trigger nexo_catalog_updated_at before update on public.catalog_items
  for each row execute function public.nexo_set_updated_at();

-- Optimistic-concurrency tokens must change even inside the same transaction.
create or replace function nexo_private.touch_quote_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;
revoke all on function nexo_private.touch_quote_updated_at() from public, anon, authenticated;
drop trigger if exists nexo_quote_updated_at on public.quotes;
create trigger nexo_quote_updated_at before update on public.quotes
  for each row execute function nexo_private.touch_quote_updated_at();

alter table public.catalog_items enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
revoke all on public.catalog_items, public.quotes, public.quote_items from public, anon, authenticated;
revoke all (id, company_id, kind, name, description, unit, price_cents, active, created_at, updated_at)
  on public.catalog_items from public, anon, authenticated;
revoke all (id, company_id, request_id, number, customer_id, customer_name, customer_email, customer_phone,
  customer_document, company_name, title, valid_until, notes, payment_terms, status,
  subtotal_cents, discount_cents, total_cents, created_at, updated_at)
  on public.quotes from public, anon, authenticated;
revoke all (id, quote_id, catalog_item_id, name, unit, quantity_milli, unit_price_cents, line_total_cents, position)
  on public.quote_items from public, anon, authenticated;
grant select, delete on public.catalog_items to authenticated;
grant insert (company_id, kind, name, description, unit, price_cents, active) on public.catalog_items to authenticated;
grant update (kind, name, description, unit, price_cents, active) on public.catalog_items to authenticated;
grant select on public.quotes, public.quote_items to authenticated;

drop policy if exists nexo_catalog_select on public.catalog_items;
create policy nexo_catalog_select on public.catalog_items for select to authenticated using (
  exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid()))
);
drop policy if exists nexo_catalog_insert on public.catalog_items;
create policy nexo_catalog_insert on public.catalog_items for insert to authenticated with check (
  exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid()))
);
drop policy if exists nexo_catalog_update on public.catalog_items;
create policy nexo_catalog_update on public.catalog_items for update to authenticated using (
  exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid()))
) with check (
  exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid()))
);
drop policy if exists nexo_catalog_delete on public.catalog_items;
create policy nexo_catalog_delete on public.catalog_items for delete to authenticated using (
  exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid()))
);
drop policy if exists nexo_quote_select on public.quotes;
create policy nexo_quote_select on public.quotes for select to authenticated using (
  exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid()))
);
drop policy if exists nexo_quote_item_select on public.quote_items;
create policy nexo_quote_item_select on public.quote_items for select to authenticated using (
  exists (
    select 1 from public.quotes q join public.companies c on c.id = q.company_id
    where q.id = quote_id and c.owner_id = (select auth.uid())
  )
);

-- Private formatting helper: still checks the JWT owner, including when called
-- by a definer RPC. It is not an API available to browser roles.
create or replace function nexo_private.quote_document(p_quote_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select pg_catalog.to_jsonb(q) || pg_catalog.jsonb_build_object('items', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(i) order by i.position, i.id)
    from public.quote_items i where i.quote_id = q.id
  ), '[]'::jsonb))
  from public.quotes q join public.companies c on c.id = q.company_id
  where q.id = p_quote_id and c.owner_id = (select auth.uid());
$$;
revoke all on function nexo_private.quote_document(uuid) from public, anon, authenticated;

create or replace function public.nexo_save_quote(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_company public.companies%rowtype;
  v_previous public.quotes%rowtype;
  v_customer public.customers%rowtype;
  v_quote_id uuid;
  v_request_id uuid;
  v_customer_id uuid;
  v_catalog_id uuid;
  v_expected timestamptz;
  v_new boolean;
  v_title text;
  v_notes text;
  v_payment text;
  v_date date;
  v_item jsonb;
  v_items jsonb := '[]'::jsonb;
  v_name text;
  v_unit text;
  v_qty numeric;
  v_price numeric;
  v_line bigint;
  v_subtotal bigint := 0;
  v_discount numeric;
  v_position integer := 0;
  v_number integer;
begin
  if v_user is null then raise exception 'Entre na conta da empresa.' using errcode = '42501'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Informe os dados do orçamento.' using errcode = '22023';
  end if;
  select * into v_company from public.companies
    where id = (p_payload ->> 'company_id')::uuid and owner_id = v_user;
  if not found then raise exception 'Empresa não disponível para esta conta.' using errcode = '42501'; end if;

  v_quote_id := (p_payload ->> 'id')::uuid;
  v_new := v_quote_id is null;
  if v_new then
    v_request_id := coalesce((p_payload ->> 'request_id')::uuid, gen_random_uuid());
    -- Serialize new quotes for this company before looking up an idempotency
    -- key, including the first request when its counter does not exist yet.
    perform 1 from public.companies where id = v_company.id and owner_id = v_user for update;
    select id into v_quote_id from public.quotes
      where company_id = v_company.id and request_id = v_request_id;
    if found then return nexo_private.quote_document(v_quote_id); end if;
  else
    select * into v_previous from public.quotes where id = v_quote_id and company_id = v_company.id for update;
    if not found then raise exception 'Orçamento não disponível para esta empresa.' using errcode = '42501'; end if;
    v_expected := (p_payload ->> 'expected_updated_at')::timestamptz;
    if v_expected is null or v_expected is distinct from v_previous.updated_at then
      raise exception 'O orçamento mudou. Atualize a lista antes de editar.' using errcode = '40001';
    end if;
    if v_previous.status <> 'draft' then
      raise exception 'Somente rascunhos podem ser editados.' using errcode = '55000';
    end if;
  end if;

  v_customer_id := (p_payload ->> 'customer_id')::uuid;
  if v_customer_id is null and v_new then
    raise exception 'Selecione um cliente para o orçamento.' using errcode = '22023';
  end if;
  if v_customer_id is not null then
    select * into v_customer from public.customers where id = v_customer_id and company_id = v_company.id;
    if not found then raise exception 'Cliente não disponível para esta empresa.' using errcode = '42501'; end if;
  end if;

  v_title := btrim(p_payload ->> 'title');
  if jsonb_typeof(p_payload -> 'title') is distinct from 'string' or char_length(v_title) not between 2 and 160 then
    raise exception 'O título deve ter entre 2 e 160 caracteres.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload -> 'notes') not in ('string', 'null')
    or jsonb_typeof(p_payload -> 'payment_terms') not in ('string', 'null') then
    raise exception 'Confira as observações e condições de pagamento.' using errcode = '22023';
  end if;
  v_notes := nullif(btrim(p_payload ->> 'notes'), '');
  v_payment := nullif(btrim(p_payload ->> 'payment_terms'), '');
  if char_length(v_notes) > 4000 or char_length(v_payment) > 4000 then
    raise exception 'Observações e condições podem ter até 4000 caracteres.' using errcode = '22023';
  end if;
  if p_payload ->> 'valid_until' is not null then
    if p_payload ->> 'valid_until' !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Informe uma data de validade válida.' using errcode = '22023';
    end if;
    begin
      v_date := (p_payload ->> 'valid_until')::date;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Informe uma data de validade válida.' using errcode = '22023';
    end;
  end if;

  if jsonb_typeof(p_payload -> 'items') is distinct from 'array' then
    raise exception 'Inclua os itens do orçamento.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_payload -> 'items') not between 1 and 100 then
    raise exception 'O orçamento precisa ter entre 1 e 100 itens.' using errcode = '22023';
  end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_payload -> 'items') loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'Confira os itens do orçamento.' using errcode = '22023';
    end if;
    v_name := btrim(v_item ->> 'name');
    v_unit := btrim(v_item ->> 'unit');
    if jsonb_typeof(v_item -> 'name') is distinct from 'string' or char_length(v_name) not between 2 and 160
      or jsonb_typeof(v_item -> 'unit') is distinct from 'string' or char_length(v_unit) not between 1 and 20 then
      raise exception 'Confira a descrição e a unidade de cada item.' using errcode = '22023';
    end if;
    if jsonb_typeof(v_item -> 'quantity_milli') is distinct from 'number'
      or jsonb_typeof(v_item -> 'unit_price_cents') is distinct from 'number' then
      raise exception 'Informe quantidade e preço válidos.' using errcode = '22023';
    end if;
    v_qty := (v_item ->> 'quantity_milli')::numeric;
    v_price := (v_item ->> 'unit_price_cents')::numeric;
    if v_qty <> trunc(v_qty) or v_qty not between 1 and 1000000000
      or v_price <> trunc(v_price) or v_price not between 0 and 1000000000 then
      raise exception 'Quantidade ou preço fora do limite permitido.' using errcode = '22023';
    end if;
    v_catalog_id := (v_item ->> 'catalog_item_id')::uuid;
    if v_catalog_id is not null then
      perform 1 from public.catalog_items where id = v_catalog_id and company_id = v_company.id;
      if not found then raise exception 'Item do catálogo não disponível para esta empresa.' using errcode = '42501'; end if;
    end if;
    v_line := floor((v_qty * v_price + 500) / 1000)::bigint;
    v_subtotal := v_subtotal + v_line;
    if v_line > 1000000000000 or v_subtotal > 1000000000000 then
      raise exception 'O total do orçamento excede o limite permitido.' using errcode = '22023';
    end if;
    v_position := v_position + 1;
    v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'catalog_item_id', v_catalog_id, 'name', v_name, 'unit', v_unit,
      'quantity_milli', v_qty::integer, 'unit_price_cents', v_price::integer,
      'line_total_cents', v_line, 'position', v_position
    ));
  end loop;

  if jsonb_typeof(p_payload -> 'discount_cents') is distinct from 'number' then
    raise exception 'Informe o desconto em centavos.' using errcode = '22023';
  end if;
  v_discount := (p_payload ->> 'discount_cents')::numeric;
  if v_discount <> trunc(v_discount) or v_discount not between 0 and v_subtotal then
    raise exception 'O desconto não pode superar o subtotal.' using errcode = '22023';
  end if;

  if v_new then
    insert into nexo_private.quote_counters(company_id, last_number) values (v_company.id, 1)
      on conflict (company_id) do update set last_number = nexo_private.quote_counters.last_number + 1
      returning last_number into v_number;
    insert into public.quotes(company_id, request_id, number, customer_id, customer_name, customer_email, customer_phone,
      customer_document, company_name, title, valid_until, notes, payment_terms, status, subtotal_cents, discount_cents, total_cents)
    values (v_company.id, v_request_id, v_number, v_customer_id, v_customer.name, v_customer.email, v_customer.phone,
      v_customer.document, v_company.name, v_title, v_date, v_notes, v_payment, 'draft', v_subtotal, v_discount::bigint, v_subtotal - v_discount::bigint)
    returning id into v_quote_id;
  else
    update public.quotes set
      customer_id = v_customer_id,
      customer_name = case when v_customer_id is null then v_previous.customer_name else v_customer.name end,
      customer_email = case when v_customer_id is null then v_previous.customer_email else v_customer.email end,
      customer_phone = case when v_customer_id is null then v_previous.customer_phone else v_customer.phone end,
      customer_document = case when v_customer_id is null then v_previous.customer_document else v_customer.document end,
      company_name = v_company.name, title = v_title, valid_until = v_date, notes = v_notes, payment_terms = v_payment,
      subtotal_cents = v_subtotal, discount_cents = v_discount::bigint, total_cents = v_subtotal - v_discount::bigint
      where id = v_quote_id and company_id = v_company.id;
    delete from public.quote_items where quote_id = v_quote_id;
  end if;
  insert into public.quote_items(quote_id, catalog_item_id, name, unit, quantity_milli, unit_price_cents, line_total_cents, position)
  select v_quote_id, i.catalog_item_id, i.name, i.unit, i.quantity_milli, i.unit_price_cents, i.line_total_cents, i.position
    from pg_catalog.jsonb_to_recordset(v_items) as i(
      catalog_item_id uuid, name text, unit text, quantity_milli integer,
      unit_price_cents integer, line_total_cents bigint, position integer
    );
  return nexo_private.quote_document(v_quote_id);
end;
$$;
revoke all on function public.nexo_save_quote(jsonb) from public, anon, authenticated;
grant execute on function public.nexo_save_quote(jsonb) to authenticated;

create or replace function public.nexo_set_quote_status(
  p_quote_id uuid, p_status text, p_expected_updated_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_quote public.quotes%rowtype;
begin
  if v_user is null then raise exception 'Entre na conta da empresa.' using errcode = '42501'; end if;
  select q.* into v_quote from public.quotes q join public.companies c on c.id = q.company_id
    where q.id = p_quote_id and c.owner_id = v_user for update of q;
  if not found then raise exception 'Orçamento não disponível para esta empresa.' using errcode = '42501'; end if;
  if p_expected_updated_at is null or p_expected_updated_at is distinct from v_quote.updated_at then
    raise exception 'O orçamento mudou. Atualize a lista antes de continuar.' using errcode = '40001';
  end if;
  if p_status is null or not (
    (v_quote.status = 'draft' and p_status = 'sent')
    or (v_quote.status = 'sent' and p_status in ('draft', 'approved', 'declined'))
  ) then
    raise exception 'Esta mudança de situação não é permitida.' using errcode = '55000';
  end if;
  update public.quotes set status = p_status where id = v_quote.id and company_id = v_quote.company_id;
  return nexo_private.quote_document(v_quote.id);
end;
$$;
revoke all on function public.nexo_set_quote_status(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.nexo_set_quote_status(uuid, text, timestamptz) to authenticated;

create or replace function public.nexo_delete_quote(p_quote_id uuid, p_expected_updated_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_quote public.quotes%rowtype;
begin
  if v_user is null then raise exception 'Entre na conta da empresa.' using errcode = '42501'; end if;
  select q.* into v_quote from public.quotes q join public.companies c on c.id = q.company_id
    where q.id = p_quote_id and c.owner_id = v_user for update of q;
  if not found then raise exception 'Orçamento não disponível para esta empresa.' using errcode = '42501'; end if;
  if p_expected_updated_at is null or p_expected_updated_at is distinct from v_quote.updated_at then
    raise exception 'O orçamento mudou. Atualize a lista antes de excluir.' using errcode = '40001';
  end if;
  if v_quote.status <> 'draft' then
    raise exception 'Somente rascunhos podem ser excluídos.' using errcode = '55000';
  end if;
  delete from public.quotes where id = v_quote.id and company_id = v_quote.company_id;
end;
$$;
revoke all on function public.nexo_delete_quote(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.nexo_delete_quote(uuid, timestamptz) to authenticated;

-- One read statement, with invoker RLS, for every business record in this stage.
create or replace function public.nexo_export_company_data()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'company', pg_catalog.to_jsonb(c),
    'customers', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) order by x.created_at desc, x.id)
      from public.customers x where x.company_id = c.id), '[]'::jsonb),
    'catalog_items', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) order by x.created_at desc, x.id)
      from public.catalog_items x where x.company_id = c.id), '[]'::jsonb),
    'quotes', coalesce((select pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(q) || pg_catalog.jsonb_build_object('items', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(i) order by i.position, i.id)
        from public.quote_items i where i.quote_id = q.id
      ), '[]'::jsonb)) order by q.created_at desc, q.id
    ) from public.quotes q where q.company_id = c.id), '[]'::jsonb)
  ) from public.companies c where c.owner_id = (select auth.uid());
$$;
revoke all on function public.nexo_export_company_data() from public, anon, authenticated;
grant execute on function public.nexo_export_company_data() to authenticated;

commit;
