begin;

-- Financial records are append-only through RPCs, with explicit correction reasons.
create table if not exists public.operations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  request_id uuid not null,
  kind text not null check (kind in ('sale','expense')),
  quote_id uuid unique references public.quotes(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  counterparty text not null default '' check (length(counterparty) <= 160),
  description text not null check (length(btrim(description)) between 2 and 240),
  category text not null check (length(btrim(category)) between 2 and 80),
  occurred_on date not null check (isfinite(occurred_on) and occurred_on >= date '1900-01-01'),
  due_on date not null check (isfinite(due_on) and due_on >= occurred_on),
  amount_cents bigint not null check (amount_cents between 0 and 1000000000000),
  notes text not null default '' check (length(notes) <= 4000),
  quote_snapshot jsonb,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid not null,
  voided_at timestamptz,
  void_reason text,
  check ((voided_at is null and void_reason is null) or (voided_at is not null and length(btrim(void_reason)) between 3 and 500)),
  unique(company_id,request_id),
  unique(id,company_id)
);
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  operation_id uuid not null,
  request_id uuid not null,
  amount_cents bigint not null check (amount_cents between 1 and 1000000000000),
  paid_on date not null check (isfinite(paid_on) and paid_on >= date '1900-01-01'),
  method text not null check (method in ('pix','cash','debit','credit','transfer','boleto','other')),
  reference text not null default '' check (length(reference) <= 240),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid not null,
  voided_at timestamptz,
  void_reason text,
  check ((voided_at is null and void_reason is null) or (voided_at is not null and length(btrim(void_reason)) between 3 and 500)),
  foreign key(operation_id,company_id) references public.operations(id,company_id) on delete restrict,
  unique(company_id,request_id)
);
create index if not exists operations_company_date_idx on public.operations(company_id,occurred_on desc,id);
create index if not exists operations_customer_idx on public.operations(company_id,customer_id,occurred_on desc) where voided_at is null and kind='sale';
create index if not exists operations_due_idx on public.operations(company_id,due_on) where voided_at is null;
create index if not exists payments_operation_idx on public.payments(operation_id) where voided_at is null;
create index if not exists payments_company_date_idx on public.payments(company_id,paid_on,id) where voided_at is null;

do $$
declare t text; cols text;
begin
  foreach t in array array['operations','payments'] loop
    if exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname<>'nexo_finance_select') then
      raise exception 'Existing finance policies require review.';
    end if;
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid=format('public.%I',t)::regclass and attnum>0 and not attisdropped;
    execute format('revoke all (%s) on public.%I from public, anon, authenticated',cols,t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('drop policy if exists nexo_finance_select on public.%I',t);
    execute format('create policy nexo_finance_select on public.%I for select to authenticated using (exists(select 1 from public.companies c where c.id=company_id and c.owner_id=(select auth.uid())))',t);
  end loop;
end;
$$;

create or replace function public.nexo_finance_command(p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  c public.companies%rowtype; o public.operations%rowtype; p public.payments%rowtype;
  q public.quotes%rowtype; customer public.customers%rowtype;
  rid uuid; oid uuid; cid uuid; amount bigint; paid bigint; day date; due date; kind text; reason text;
begin
  if auth.uid() is null then raise exception 'Entre na empresa.' using errcode='42501'; end if;
  -- Company serialization protects request IDs across different operations as well.
  select * into c from public.companies where owner_id=auth.uid() for update;
  if not found then raise exception 'Empresa indisponível.' using errcode='42501'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Dados inválidos.' using errcode='22023'; end if;
  if p_action in ('create','convert','pay') then
    rid := (p_payload->>'request_id')::uuid;
    if rid is null then raise exception 'Identificador da operação obrigatório.' using errcode='22023'; end if;
  end if;
  if p_action in ('create','convert') then
    select * into o from public.operations where company_id=c.id and request_id=rid;
    if found then return to_jsonb(o); end if;
    day := (p_payload->>'occurred_on')::date; due := (p_payload->>'due_on')::date;
    if day is null or due is null then raise exception 'Informe as datas.' using errcode='22023'; end if;
    if p_action='convert' then
      select * into q from public.quotes where id=(p_payload->>'quote_id')::uuid and company_id=c.id for update;
      if not found then raise exception 'Orçamento indisponível.' using errcode='42501'; end if;
      select * into o from public.operations where quote_id=q.id;
      if found then return to_jsonb(o); end if;
      if q.status<>'approved' then raise exception 'Aprove o orçamento antes de converter.' using errcode='55000'; end if;
      insert into public.operations(company_id,request_id,kind,quote_id,customer_id,counterparty,description,category,occurred_on,due_on,amount_cents,notes,quote_snapshot,created_by)
      values(c.id,rid,'sale',q.id,q.customer_id,q.customer_name,q.title,'Vendas e serviços',day,due,q.total_cents,coalesce(q.notes,''),nexo_private.quote_document(q.id),auth.uid()) returning * into o;
    else
      kind := p_payload->>'kind';
      if kind is null or kind not in ('sale','expense') then raise exception 'Tipo inválido.' using errcode='22023'; end if;
      if coalesce(p_payload->>'amount_cents','') !~ '^[0-9]+$' then raise exception 'Informe centavos inteiros.' using errcode='22023'; end if;
      amount := (p_payload->>'amount_cents')::bigint;
      cid := nullif(p_payload->>'customer_id','')::uuid;
      if cid is not null then
        select * into customer from public.customers where id=cid and company_id=c.id and active;
        if not found or kind<>'sale' then raise exception 'Cliente indisponível.' using errcode='42501'; end if;
      end if;
      insert into public.operations(company_id,request_id,kind,customer_id,counterparty,description,category,occurred_on,due_on,amount_cents,notes,created_by)
      values(c.id,rid,kind,cid,case when cid is not null then customer.name else btrim(coalesce(p_payload->>'counterparty','')) end,btrim(p_payload->>'description'),btrim(p_payload->>'category'),day,due,amount,coalesce(p_payload->>'notes',''),auth.uid()) returning * into o;
    end if;
    return to_jsonb(o);
  elsif p_action='pay' then
    select * into p from public.payments where company_id=c.id and request_id=rid;
    if found then return to_jsonb(p); end if;
    select * into o from public.operations where id=(p_payload->>'operation_id')::uuid and company_id=c.id for update;
    if not found then raise exception 'Lançamento indisponível.' using errcode='42501'; end if;
    if o.voided_at is not null then raise exception 'Lançamento anulado.' using errcode='55000'; end if;
    if coalesce(p_payload->>'amount_cents','') !~ '^[0-9]+$' then raise exception 'Informe centavos inteiros.' using errcode='22023'; end if;
    amount := (p_payload->>'amount_cents')::bigint;
    day := (p_payload->>'paid_on')::date;
    if day is null or day > (now() at time zone 'America/Sao_Paulo')::date then raise exception 'Informe a data efetiva, sem pagamento futuro.' using errcode='22023'; end if;
    select coalesce(sum(amount_cents),0) into paid from public.payments where operation_id=o.id and voided_at is null;
    if amount<=0 or amount>o.amount_cents-paid then raise exception 'O valor ultrapassa o saldo em aberto.' using errcode='22023'; end if;
    insert into public.payments(company_id,operation_id,request_id,amount_cents,paid_on,method,reference,created_by)
    values(c.id,o.id,rid,amount,day,p_payload->>'method',coalesce(p_payload->>'reference',''),auth.uid()) returning * into p;
    return to_jsonb(p);
  elsif p_action in ('void_operation','void_payment') then
    reason:=btrim(p_payload->>'reason');
    if reason is null or length(reason) not between 3 and 500 then raise exception 'Explique o motivo da correção.' using errcode='22023'; end if;
    if p_action='void_operation' then
      select * into o from public.operations where id=(p_payload->>'id')::uuid and company_id=c.id for update;
      if not found then raise exception 'Lançamento indisponível.' using errcode='42501'; end if;
      if o.voided_at is not null then return to_jsonb(o); end if;
      if exists(select 1 from public.payments where operation_id=o.id and voided_at is null) then raise exception 'Corrija os pagamentos antes de anular o lançamento.' using errcode='55000'; end if;
      update public.operations set voided_at=clock_timestamp(),void_reason=reason where id=o.id returning * into o;
      return to_jsonb(o);
    else
      select * into p from public.payments where id=(p_payload->>'id')::uuid and company_id=c.id;
      if not found then raise exception 'Pagamento indisponível.' using errcode='42501'; end if;
      perform 1 from public.operations where id=p.operation_id for update;
      if p.voided_at is not null then return to_jsonb(p); end if;
      update public.payments set voided_at=clock_timestamp(),void_reason=reason where id=p.id returning * into p;
      return to_jsonb(p);
    end if;
  end if;
  raise exception 'Ação inválida.' using errcode='22023';
end;
$$;
revoke all on function public.nexo_finance_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.nexo_finance_command(text,jsonb) to authenticated;

-- Page and aggregates come from a single database snapshot; no whole-company download.
create or replace function public.nexo_finance_page(p_month date,p_kind text default 'all',p_query text default '',p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; start_day date; end_day date;
begin
  if p_month is null or not isfinite(p_month) or p_offset is null or p_offset<0 or p_kind is null or p_kind not in ('all','sale','expense') or length(coalesce(p_query,''))>160 then raise exception 'Filtro inválido.' using errcode='22023'; end if;
  start_day:=date_trunc('month',p_month)::date; end_day:=(start_day+interval '1 month')::date;
  with own as (select id from public.companies where owner_id=(select auth.uid())),
  balances as (
    select o.*,coalesce((select sum(p.amount_cents) from public.payments p where p.operation_id=o.id and p.voided_at is null),0)::bigint as paid_cents
    from public.operations o join own on own.id=o.company_id
  ), monthly as (select * from balances where occurred_on>=start_day and occurred_on<end_day),
  filtered as (select * from monthly where (p_kind='all' or kind=p_kind) and (coalesce(p_query,'')='' or strpos(lower(description||' '||counterparty||' '||category),lower(p_query))>0)),
  cash as (select p.*,o.kind from public.payments p join public.operations o on o.id=p.operation_id join own on own.id=p.company_id where p.voided_at is null and o.voided_at is null and p.paid_on>=start_day and p.paid_on<end_day)
  select jsonb_build_object(
    'company_id',(select id from own),'total',(select count(*) from filtered),
    'rows',coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_on desc,x.created_at desc,x.id) from (select * from filtered order by occurred_on desc,created_at desc,id limit 30 offset p_offset)x),'[]'::jsonb),
    'summary',jsonb_build_object(
      'sales_cents',(select coalesce(sum(amount_cents),0)::text from monthly where kind='sale' and voided_at is null),
      'expenses_cents',(select coalesce(sum(amount_cents),0)::text from monthly where kind='expense' and voided_at is null),
      'received_cents',(select coalesce(sum(amount_cents),0)::text from cash where kind='sale'),
      'paid_cents',(select coalesce(sum(amount_cents),0)::text from cash where kind='expense'),
      'receivable_cents',(select coalesce(sum(amount_cents-paid_cents),0)::text from balances where kind='sale' and voided_at is null),
      'payable_cents',(select coalesce(sum(amount_cents-paid_cents),0)::text from balances where kind='expense' and voided_at is null),
      'overdue_cents',(select coalesce(sum(amount_cents-paid_cents),0)::text from balances where voided_at is null and due_on<(now() at time zone 'America/Sao_Paulo')::date),
      'sale_count',(select count(*) from monthly where kind='sale' and voided_at is null),
      'categories',coalesce((select jsonb_agg(to_jsonb(x)) from (select category,sum(amount_cents)::text as amount_cents from monthly where kind='expense' and voided_at is null group by category order by sum(amount_cents) desc,category)x),'[]'::jsonb)
    )
  ) into result;
  return result;
end;
$$;
revoke all on function public.nexo_finance_page(date,text,text,integer) from public,anon,authenticated;
grant execute on function public.nexo_finance_page(date,text,text,integer) to authenticated;

create or replace function public.nexo_operation_detail(p_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select to_jsonb(o)||jsonb_build_object('payments',coalesce((select jsonb_agg(to_jsonb(p) order by p.paid_on desc,p.created_at desc,p.id) from public.payments p where p.operation_id=o.id),'[]'::jsonb))
  from public.operations o where o.id=p_id;
$$;
revoke all on function public.nexo_operation_detail(uuid) from public,anon,authenticated;
grant execute on function public.nexo_operation_detail(uuid) to authenticated;

create or replace function public.nexo_customer_return(p_days integer default 60,p_offset integer default 0,p_query text default '')
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  if p_days is null or p_days<1 or p_days>3650 or p_offset is null or p_offset<0 or length(coalesce(p_query,''))>160 then raise exception 'Filtro inválido.' using errcode='22023'; end if;
  with own as (select id from public.companies where owner_id=(select auth.uid())),
  customers as (
    select c.id,c.company_id,c.name,c.phone,c.email,s.last_sale_on,s.sale_count
    from public.customers c join own on own.id=c.company_id
    left join lateral (select max(occurred_on) as last_sale_on,count(*) as sale_count from public.operations o where o.customer_id=c.id and o.company_id=c.company_id and o.kind='sale' and o.voided_at is null and o.occurred_on<=(now() at time zone 'America/Sao_Paulo')::date)s on true
    where c.active and (s.last_sale_on is null or s.last_sale_on<=(now() at time zone 'America/Sao_Paulo')::date-p_days)
      and (coalesce(p_query,'')='' or strpos(lower(c.name||' '||coalesce(c.phone,'')),lower(p_query))>0)
  ) select jsonb_build_object('company_id',(select id from own),'total',(select count(*) from customers),'rows',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from customers order by last_sale_on nulls first,name,id limit 30 offset p_offset)x),'[]'::jsonb)) into result;
  return result;
end;
$$;
revoke all on function public.nexo_customer_return(integer,integer,text) from public,anon,authenticated;
grant execute on function public.nexo_customer_return(integer,integer,text) to authenticated;

create or replace function public.nexo_export_company_data()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'company', pg_catalog.to_jsonb(c),
    'operations', coalesce((select jsonb_agg(to_jsonb(o) order by o.occurred_on,o.id) from public.operations o where o.company_id=c.id),'[]'::jsonb),
    'payments', coalesce((select jsonb_agg(to_jsonb(p) order by p.paid_on,p.id) from public.payments p where p.company_id=c.id),'[]'::jsonb),
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
