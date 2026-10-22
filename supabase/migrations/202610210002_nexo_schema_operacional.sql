-- NEXO V2: esquema operacional revisado. Execute o arquivo inteiro no Supabase SQL Editor.
-- Cria as tabelas de negócio e aplica RLS com políticas por usuário autenticado.

create table if not exists public.nexo_clients (
  id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    nome text not null, telefone text, email text,
    status text not null default 'Ativo' check (status in ('Ativo','Inativo')),
    observacao text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.nexo_services (
  id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    cliente text not null, servico text not null, veiculo text,
    valor numeric(12,2) not null default 0 check (valor >= 0),
    data date, pagamento text not null default 'Pendente', status text,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.nexo_expenses (
  id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    descricao text not null, categoria text, valor numeric(12,2) not null default 0 check (valor >= 0),
    data date, pagamento text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.nexo_employees (
  id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    nome text not null, telefone text, funcao text,
    comissao numeric(5,2) not null default 0 check (comissao >= 0 and comissao <= 100),
    status text not null default 'Ativo' check (status in ('Ativo','Inativo')),
    created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.nexo_employee_payments (
  id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    funcionario text not null, descricao text, valor numeric(12,2) not null default 0 check (valor >= 0),
    data date, metodo text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.nexo_quotes (
  id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    cliente text not null, servico text not null, veiculo text, valor numeric(12,2) not null default 0 check (valor >= 0),
    validade date, situacao text not null default 'Em elaboração' check (situacao in ('Em elaboração','Enviado','Aprovado','Recusado')),
    created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.nexo_catalog (
  id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    nome text not null, descricao text, valor numeric(12,2) not null default 0 check (valor >= 0), duracao text,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.nexo_vehicles (
  id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    cliente text not null, modelo text not null, placa text, cor text,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

alter table public.nexo_clients enable row level security;
drop policy if exists nexo_clients_select_own on public.nexo_clients;
create policy nexo_clients_select_own on public.nexo_clients for select to authenticated using (auth.uid() = user_id);
drop policy if exists nexo_clients_insert_own on public.nexo_clients;
create policy nexo_clients_insert_own on public.nexo_clients for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists nexo_clients_update_own on public.nexo_clients;
create policy nexo_clients_update_own on public.nexo_clients for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists nexo_clients_delete_own on public.nexo_clients;
create policy nexo_clients_delete_own on public.nexo_clients for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on public.nexo_clients to authenticated;

alter table public.nexo_services enable row level security;
drop policy if exists nexo_services_select_own on public.nexo_services;
create policy nexo_services_select_own on public.nexo_services for select to authenticated using (auth.uid() = user_id);
drop policy if exists nexo_services_insert_own on public.nexo_services;
create policy nexo_services_insert_own on public.nexo_services for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists nexo_services_update_own on public.nexo_services;
create policy nexo_services_update_own on public.nexo_services for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists nexo_services_delete_own on public.nexo_services;
create policy nexo_services_delete_own on public.nexo_services for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on public.nexo_services to authenticated;

alter table public.nexo_expenses enable row level security;
drop policy if exists nexo_expenses_select_own on public.nexo_expenses;
create policy nexo_expenses_select_own on public.nexo_expenses for select to authenticated using (auth.uid() = user_id);
drop policy if exists nexo_expenses_insert_own on public.nexo_expenses;
create policy nexo_expenses_insert_own on public.nexo_expenses for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists nexo_expenses_update_own on public.nexo_expenses;
create policy nexo_expenses_update_own on public.nexo_expenses for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists nexo_expenses_delete_own on public.nexo_expenses;
create policy nexo_expenses_delete_own on public.nexo_expenses for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on public.nexo_expenses to authenticated;

alter table public.nexo_employees enable row level security;
drop policy if exists nexo_employees_select_own on public.nexo_employees;
create policy nexo_employees_select_own on public.nexo_employees for select to authenticated using (auth.uid() = user_id);
drop policy if exists nexo_employees_insert_own on public.nexo_employees;
create policy nexo_employees_insert_own on public.nexo_employees for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists nexo_employees_update_own on public.nexo_employees;
create policy nexo_employees_update_own on public.nexo_employees for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists nexo_employees_delete_own on public.nexo_employees;
create policy nexo_employees_delete_own on public.nexo_employees for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on public.nexo_employees to authenticated;

alter table public.nexo_employee_payments enable row level security;
drop policy if exists nexo_employee_payments_select_own on public.nexo_employee_payments;
create policy nexo_employee_payments_select_own on public.nexo_employee_payments for select to authenticated using (auth.uid() = user_id);
drop policy if exists nexo_employee_payments_insert_own on public.nexo_employee_payments;
create policy nexo_employee_payments_insert_own on public.nexo_employee_payments for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists nexo_employee_payments_update_own on public.nexo_employee_payments;
create policy nexo_employee_payments_update_own on public.nexo_employee_payments for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists nexo_employee_payments_delete_own on public.nexo_employee_payments;
create policy nexo_employee_payments_delete_own on public.nexo_employee_payments for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on public.nexo_employee_payments to authenticated;

alter table public.nexo_quotes enable row level security;
drop policy if exists nexo_quotes_select_own on public.nexo_quotes;
create policy nexo_quotes_select_own on public.nexo_quotes for select to authenticated using (auth.uid() = user_id);
drop policy if exists nexo_quotes_insert_own on public.nexo_quotes;
create policy nexo_quotes_insert_own on public.nexo_quotes for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists nexo_quotes_update_own on public.nexo_quotes;
create policy nexo_quotes_update_own on public.nexo_quotes for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists nexo_quotes_delete_own on public.nexo_quotes;
create policy nexo_quotes_delete_own on public.nexo_quotes for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on public.nexo_quotes to authenticated;

alter table public.nexo_catalog enable row level security;
drop policy if exists nexo_catalog_select_own on public.nexo_catalog;
create policy nexo_catalog_select_own on public.nexo_catalog for select to authenticated using (auth.uid() = user_id);
drop policy if exists nexo_catalog_insert_own on public.nexo_catalog;
create policy nexo_catalog_insert_own on public.nexo_catalog for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists nexo_catalog_update_own on public.nexo_catalog;
create policy nexo_catalog_update_own on public.nexo_catalog for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists nexo_catalog_delete_own on public.nexo_catalog;
create policy nexo_catalog_delete_own on public.nexo_catalog for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on public.nexo_catalog to authenticated;

alter table public.nexo_vehicles enable row level security;
drop policy if exists nexo_vehicles_select_own on public.nexo_vehicles;
create policy nexo_vehicles_select_own on public.nexo_vehicles for select to authenticated using (auth.uid() = user_id);
drop policy if exists nexo_vehicles_insert_own on public.nexo_vehicles;
create policy nexo_vehicles_insert_own on public.nexo_vehicles for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists nexo_vehicles_update_own on public.nexo_vehicles;
create policy nexo_vehicles_update_own on public.nexo_vehicles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists nexo_vehicles_delete_own on public.nexo_vehicles;
create policy nexo_vehicles_delete_own on public.nexo_vehicles for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on public.nexo_vehicles to authenticated;

create index if not exists nexo_clients_user_created_idx on public.nexo_clients (user_id, created_at desc);
create index if not exists nexo_services_user_date_idx on public.nexo_services (user_id, data desc);
create index if not exists nexo_expenses_user_date_idx on public.nexo_expenses (user_id, data desc);
create index if not exists nexo_employees_user_created_idx on public.nexo_employees (user_id, created_at desc);
create index if not exists nexo_employee_payments_user_date_idx on public.nexo_employee_payments (user_id, data desc);
create index if not exists nexo_quotes_user_created_idx on public.nexo_quotes (user_id, created_at desc);
create index if not exists nexo_catalog_user_created_idx on public.nexo_catalog (user_id, created_at desc);
create index if not exists nexo_vehicles_user_created_idx on public.nexo_vehicles (user_id, created_at desc);

-- Fim da migração do esquema operacional do NEXO V2.
