-- NEXO V2 — prova de conceito de conexão e Row Level Security.
-- Esta tabela é temporária para validar o fluxo Auth + Postgres + RLS.
-- Não armazena clientes, serviços, despesas nem dados financeiros reais.

create table if not exists public.nexo_connection_test (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  message text not null default 'Conexão inicial validada pelo NEXO V2',
  created_at timestamptz not null default now()
);

alter table public.nexo_connection_test enable row level security;

-- Recriação segura destas policies caso a migração seja executada novamente.
drop policy if exists "Users can read their own NEXO connection test" on public.nexo_connection_test;
drop policy if exists "Users can insert their own NEXO connection test" on public.nexo_connection_test;

create policy "Users can read their own NEXO connection test"
  on public.nexo_connection_test
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own NEXO connection test"
  on public.nexo_connection_test
  for insert
  to authenticated
  with check (auth.uid() = user_id);

grant select, insert on public.nexo_connection_test to authenticated;
