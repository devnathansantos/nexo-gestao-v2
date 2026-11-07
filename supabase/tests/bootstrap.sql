-- ONLY for an empty, disposable PostgreSQL database, never a real Supabase
-- project. This supplies the auth interface the application migration uses.
create schema auth;
create role anon nologin;
create role authenticated nologin;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
