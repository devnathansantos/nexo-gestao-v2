-- NEXO V2: relações reais, dados da empresa e metas mensais.
-- Migração aditiva: mantém todas as colunas e os registros existentes.

alter table public.nexo_vehicles add column if not exists client_id uuid;
alter table public.nexo_services add column if not exists client_id uuid;
alter table public.nexo_services add column if not exists vehicle_id uuid;
alter table public.nexo_quotes add column if not exists client_id uuid;
alter table public.nexo_quotes add column if not exists vehicle_id uuid;
alter table public.nexo_employee_payments add column if not exists employee_id uuid;

create unique index if not exists nexo_clients_id_user_uidx on public.nexo_clients (id, user_id);
create unique index if not exists nexo_vehicles_id_user_uidx on public.nexo_vehicles (id, user_id);
create unique index if not exists nexo_vehicles_id_client_user_uidx on public.nexo_vehicles (id, client_id, user_id);
create unique index if not exists nexo_employees_id_user_uidx on public.nexo_employees (id, user_id);

-- Liga dados antigos somente quando o nome corresponde a um único cadastro do usuário.
update public.nexo_vehicles v
set client_id = c.id
from public.nexo_clients c
where v.user_id = c.user_id
  and lower(trim(v.cliente)) = lower(trim(c.nome))
  and v.client_id is null
  and (select count(*) from public.nexo_clients c2
       where c2.user_id = v.user_id and lower(trim(c2.nome)) = lower(trim(v.cliente))) = 1;

update public.nexo_services s
set client_id = c.id
from public.nexo_clients c
where s.user_id = c.user_id
  and lower(trim(s.cliente)) = lower(trim(c.nome))
  and s.client_id is null
  and (select count(*) from public.nexo_clients c2
       where c2.user_id = s.user_id and lower(trim(c2.nome)) = lower(trim(s.cliente))) = 1;

update public.nexo_quotes q
set client_id = c.id
from public.nexo_clients c
where q.user_id = c.user_id
  and lower(trim(q.cliente)) = lower(trim(c.nome))
  and q.client_id is null
  and (select count(*) from public.nexo_clients c2
       where c2.user_id = q.user_id and lower(trim(c2.nome)) = lower(trim(q.cliente))) = 1;

update public.nexo_services s
set vehicle_id = v.id
from public.nexo_vehicles v
where s.user_id = v.user_id and s.client_id = v.client_id
  and lower(trim(s.veiculo)) = lower(trim(v.modelo))
  and s.vehicle_id is null
  and (select count(*) from public.nexo_vehicles v2
       where v2.user_id = s.user_id and v2.client_id = s.client_id
         and lower(trim(v2.modelo)) = lower(trim(s.veiculo))) = 1;

update public.nexo_quotes q
set vehicle_id = v.id
from public.nexo_vehicles v
where q.user_id = v.user_id and q.client_id = v.client_id
  and lower(trim(q.veiculo)) = lower(trim(v.modelo))
  and q.vehicle_id is null
  and (select count(*) from public.nexo_vehicles v2
       where v2.user_id = q.user_id and v2.client_id = q.client_id
         and lower(trim(v2.modelo)) = lower(trim(q.veiculo))) = 1;

update public.nexo_employee_payments p
set employee_id = e.id
from public.nexo_employees e
where p.user_id = e.user_id
  and lower(trim(p.funcionario)) = lower(trim(e.nome))
  and p.employee_id is null
  and (select count(*) from public.nexo_employees e2
       where e2.user_id = p.user_id and lower(trim(e2.nome)) = lower(trim(p.funcionario))) = 1;

-- Chaves compostas impedem que um usuário associe registros pertencentes a outra conta.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'nexo_vehicles_client_owner_fkey') then
    alter table public.nexo_vehicles add constraint nexo_vehicles_client_owner_fkey
      foreign key (client_id, user_id) references public.nexo_clients (id, user_id)
      on delete set null (client_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nexo_services_client_owner_fkey') then
    alter table public.nexo_services add constraint nexo_services_client_owner_fkey
      foreign key (client_id, user_id) references public.nexo_clients (id, user_id)
      on delete set null (client_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nexo_services_vehicle_client_owner_fkey') then
    alter table public.nexo_services add constraint nexo_services_vehicle_client_owner_fkey
      foreign key (vehicle_id, client_id, user_id) references public.nexo_vehicles (id, client_id, user_id)
      on delete set null (vehicle_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nexo_quotes_client_owner_fkey') then
    alter table public.nexo_quotes add constraint nexo_quotes_client_owner_fkey
      foreign key (client_id, user_id) references public.nexo_clients (id, user_id)
      on delete set null (client_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nexo_quotes_vehicle_client_owner_fkey') then
    alter table public.nexo_quotes add constraint nexo_quotes_vehicle_client_owner_fkey
      foreign key (vehicle_id, client_id, user_id) references public.nexo_vehicles (id, client_id, user_id)
      on delete set null (vehicle_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nexo_employee_payments_employee_owner_fkey') then
    alter table public.nexo_employee_payments add constraint nexo_employee_payments_employee_owner_fkey
      foreign key (employee_id, user_id) references public.nexo_employees (id, user_id)
      on delete set null (employee_id);
  end if;
end $$;

create table if not exists public.nexo_company_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  telefone text,
  email text,
  cidade text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nexo_monthly_goals (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month date not null,
  valor numeric(12,2) not null check (valor > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, month),
  check (extract(day from month) = 1)
);

alter table public.nexo_company_settings enable row level security;
drop policy if exists nexo_company_settings_select_own on public.nexo_company_settings;
create policy nexo_company_settings_select_own on public.nexo_company_settings for select to authenticated using (auth.uid() = user_id);
drop policy if exists nexo_company_settings_insert_own on public.nexo_company_settings;
create policy nexo_company_settings_insert_own on public.nexo_company_settings for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists nexo_company_settings_update_own on public.nexo_company_settings;
create policy nexo_company_settings_update_own on public.nexo_company_settings for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists nexo_company_settings_delete_own on public.nexo_company_settings;
create policy nexo_company_settings_delete_own on public.nexo_company_settings for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on public.nexo_company_settings to authenticated;

alter table public.nexo_monthly_goals enable row level security;
drop policy if exists nexo_monthly_goals_select_own on public.nexo_monthly_goals;
create policy nexo_monthly_goals_select_own on public.nexo_monthly_goals for select to authenticated using (auth.uid() = user_id);
drop policy if exists nexo_monthly_goals_insert_own on public.nexo_monthly_goals;
create policy nexo_monthly_goals_insert_own on public.nexo_monthly_goals for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists nexo_monthly_goals_update_own on public.nexo_monthly_goals;
create policy nexo_monthly_goals_update_own on public.nexo_monthly_goals for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists nexo_monthly_goals_delete_own on public.nexo_monthly_goals;
create policy nexo_monthly_goals_delete_own on public.nexo_monthly_goals for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on public.nexo_monthly_goals to authenticated;

create or replace function public.nexo_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.nexo_sync_client_name()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.nome is distinct from old.nome then
    update public.nexo_vehicles set cliente = new.nome where client_id = new.id and user_id = new.user_id;
    update public.nexo_services set cliente = new.nome where client_id = new.id and user_id = new.user_id;
    update public.nexo_quotes set cliente = new.nome where client_id = new.id and user_id = new.user_id;
  end if;
  return new;
end;
$$;

create or replace function public.nexo_sync_vehicle_name()
returns trigger language plpgsql security definer set search_path = '' as $$
declare display_name text;
begin
  if new.modelo is distinct from old.modelo or new.placa is distinct from old.placa then
    display_name = new.modelo;
    update public.nexo_services set veiculo = display_name where vehicle_id = new.id and user_id = new.user_id;
    update public.nexo_quotes set veiculo = display_name where vehicle_id = new.id and user_id = new.user_id;
  end if;
  return new;
end;
$$;

create or replace function public.nexo_sync_employee_name()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.nome is distinct from old.nome then
    update public.nexo_employee_payments set funcionario = new.nome where employee_id = new.id and user_id = new.user_id;
  end if;
  return new;
end;
$$;

revoke all on function public.nexo_sync_client_name() from public, anon, authenticated;
revoke all on function public.nexo_sync_vehicle_name() from public, anon, authenticated;
revoke all on function public.nexo_sync_employee_name() from public, anon, authenticated;

drop trigger if exists nexo_clients_sync_name on public.nexo_clients;
create trigger nexo_clients_sync_name after update of nome on public.nexo_clients for each row execute function public.nexo_sync_client_name();
drop trigger if exists nexo_vehicles_sync_name on public.nexo_vehicles;
create trigger nexo_vehicles_sync_name after update of modelo, placa on public.nexo_vehicles for each row execute function public.nexo_sync_vehicle_name();
drop trigger if exists nexo_employees_sync_name on public.nexo_employees;
create trigger nexo_employees_sync_name after update of nome on public.nexo_employees for each row execute function public.nexo_sync_employee_name();

do $$ declare t text; begin
  foreach t in array array['nexo_clients','nexo_services','nexo_expenses','nexo_employees','nexo_employee_payments','nexo_quotes','nexo_catalog','nexo_vehicles','nexo_company_settings','nexo_monthly_goals'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.nexo_set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;

create index if not exists nexo_services_client_user_idx on public.nexo_services (client_id, user_id);
create index if not exists nexo_services_vehicle_client_user_idx on public.nexo_services (vehicle_id, client_id, user_id);
create index if not exists nexo_quotes_client_user_idx on public.nexo_quotes (client_id, user_id);
create index if not exists nexo_quotes_vehicle_client_user_idx on public.nexo_quotes (vehicle_id, client_id, user_id);
create index if not exists nexo_payments_employee_user_idx on public.nexo_employee_payments (employee_id, user_id);
