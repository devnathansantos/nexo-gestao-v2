begin;

-- Additive foundation. Apply to a reviewed Supabase project; never reset an
-- existing database to install this migration.
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 160),
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 40),
  document text check (document is null or char_length(document) <= 40),
  notes text check (notes is null or char_length(notes) <= 4000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_company_name_idx
  on public.customers (company_id, name);

-- Existing permissive policies are OR-ed with these policies in PostgreSQL.
-- Refuse to silently retain an unrelated policy that could expose tenant data.
do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and (
        (tablename = 'companies' and policyname not in ('nexo_company_select', 'nexo_company_update'))
        or (tablename = 'customers' and policyname not in (
          'nexo_customer_select', 'nexo_customer_insert', 'nexo_customer_update', 'nexo_customer_delete'
        ))
      )
  ) then
    raise exception 'Existing companies/customers policies require review before installing NEXO.';
  end if;
end;
$$;

create or replace function public.nexo_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.nexo_set_updated_at() from public, anon, authenticated;

drop trigger if exists nexo_companies_updated_at on public.companies;
create trigger nexo_companies_updated_at
  before update on public.companies
  for each row execute function public.nexo_set_updated_at();

drop trigger if exists nexo_customers_updated_at on public.customers;
create trigger nexo_customers_updated_at
  before update on public.customers
  for each row execute function public.nexo_set_updated_at();

-- The supplied name is untrusted descriptive data, never an authorization
-- claim. Ownership always comes from the newly created auth.users row.
create or replace function public.nexo_create_company_for_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  company_name text;
begin
  if jsonb_typeof(new.raw_user_meta_data -> 'company_name') is distinct from 'string' then
    raise exception 'Informe o nome da empresa.' using errcode = '22023';
  end if;
  company_name := btrim(new.raw_user_meta_data ->> 'company_name');
  if char_length(company_name) not between 2 and 120 then
    raise exception 'O nome da empresa deve ter entre 2 e 120 caracteres.' using errcode = '22023';
  end if;

  insert into public.companies (owner_id, name)
    values (new.id, company_name);
  return new;
end;
$$;

revoke all on function public.nexo_create_company_for_user() from public, anon, authenticated;

drop trigger if exists nexo_auth_user_company on auth.users;
create trigger nexo_auth_user_company
  after insert on auth.users
  for each row execute function public.nexo_create_company_for_user();

alter table public.companies enable row level security;
alter table public.customers enable row level security;

-- Explicit table and column privileges complement RLS. Browser clients cannot
-- create/delete companies, transfer ownership, or rewrite immutable fields.
revoke all on public.companies from public, anon, authenticated;
revoke all on public.customers from public, anon, authenticated;
revoke all (id, owner_id, name, created_at, updated_at)
  on public.companies from public, anon, authenticated;
revoke all (id, company_id, name, email, phone, document, notes, active, created_at, updated_at)
  on public.customers from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.companies to authenticated;
grant update (name) on public.companies to authenticated;
grant select, delete on public.customers to authenticated;
grant insert (company_id, name, email, phone, document, notes, active)
  on public.customers to authenticated;
grant update (name, email, phone, document, notes, active)
  on public.customers to authenticated;

drop policy if exists nexo_company_select on public.companies;
create policy nexo_company_select on public.companies
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists nexo_company_update on public.companies;
create policy nexo_company_update on public.companies
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists nexo_customer_select on public.customers;
create policy nexo_customer_select on public.customers
  for select to authenticated
  using (exists (
    select 1 from public.companies c
    where c.id = company_id and c.owner_id = (select auth.uid())
  ));

drop policy if exists nexo_customer_insert on public.customers;
create policy nexo_customer_insert on public.customers
  for insert to authenticated
  with check (exists (
    select 1 from public.companies c
    where c.id = company_id and c.owner_id = (select auth.uid())
  ));

drop policy if exists nexo_customer_update on public.customers;
create policy nexo_customer_update on public.customers
  for update to authenticated
  using (exists (
    select 1 from public.companies c
    where c.id = company_id and c.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.companies c
    where c.id = company_id and c.owner_id = (select auth.uid())
  ));

drop policy if exists nexo_customer_delete on public.customers;
create policy nexo_customer_delete on public.customers
  for delete to authenticated
  using (exists (
    select 1 from public.companies c
    where c.id = company_id and c.owner_id = (select auth.uid())
  ));

-- Export company + every customer from one PostgreSQL statement snapshot.
-- SECURITY INVOKER preserves the caller's grants/RLS; no client-supplied tenant
-- identifier or elevated function owner is used to choose the exported company.
create or replace function public.nexo_export_company_data()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'company', pg_catalog.to_jsonb(c),
    'customers', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(customer)
        order by customer.created_at desc, customer.id asc
      )
      from public.customers customer
      where customer.company_id = c.id
    ), '[]'::jsonb)
  )
  from public.companies c
  where c.owner_id = (select auth.uid());
$$;

revoke all on function public.nexo_export_company_data() from public, anon, authenticated;
grant execute on function public.nexo_export_company_data() to authenticated;

commit;
