import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('application entry points, local modules and public asset exist', () => {
  for (const path of [
    '../index.html',
    '../src/main.jsx',
    '../src/App.jsx',
    '../src/App.css',
    '../src/index.css',
    '../src/lib/data.js',
    '../src/lib/supabaseClient.js',
    '../public/nexo-mark.svg',
  ]) assert.equal(existsSync(new URL(path, import.meta.url)), true, `Missing ${path}`);
});

test('all operational tables used by the app are created and protected by RLS', () => {
  const data = read('../src/lib/data.js');
  const migration = read('../supabase/migrations/202610210002_nexo_schema_operacional.sql');
  const tables = [
    'nexo_clients', 'nexo_services', 'nexo_expenses', 'nexo_employees',
    'nexo_employee_payments', 'nexo_quotes', 'nexo_catalog', 'nexo_vehicles',
  ];
  for (const table of tables) {
    assert.ok(data.includes(`'${table}'`), `Data layer must map ${table}`);
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}\\s*\\(`, 'i'), `${table} must be created`);
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'), `${table} must enable RLS`);
    for (const action of ['select', 'insert', 'update', 'delete']) {
      assert.match(migration, new RegExp(`create policy ${table}_${action}_own`, 'i'), `${table} needs its ${action} policy`);
    }
  }
});

test('relational settings migration adds relationships, company settings and monthly goals', () => {
  const migration = read('../supabase/migrations/202610210003_nexo_relational_settings.sql');
  for (const token of [
    'nexo_vehicles add column if not exists client_id',
    'nexo_services add column if not exists client_id',
    'nexo_services add column if not exists vehicle_id',
    'nexo_quotes add column if not exists client_id',
    'nexo_quotes add column if not exists vehicle_id',
    'nexo_employee_payments add column if not exists employee_id',
    'public.nexo_company_settings', 'public.nexo_monthly_goals',
    'nexo_clients_sync_name', 'nexo_vehicles_sync_name', 'nexo_employees_sync_name',
  ]) assert.ok(migration.includes(token), `Migration is missing: ${token}`);
});

test('public environment example does not assign a secret key', () => {
  const lines = read('../.env.example').split(/\r?\n/).filter((line) => /^\s*VITE_[A-Z0-9_]+\s*=/.test(line));
  assert.ok(lines.some((line) => /^VITE_SUPABASE_URL\s*=/.test(line)));
  assert.ok(lines.some((line) => /^VITE_SUPABASE_PUBLISHABLE_KEY\s*=/.test(line)));
  assert.ok(!lines.some((line) => /service_role|sb_secret_|password|secret/i.test(line)));
});

test('production app has no demo entry point or in-memory write fallback', () => {
  const app = read('../src/App.jsx');
  const styles = read('../src/App.css');
  assert.doesNotMatch(app, /demonstração|demo-button|onDemo|makeId\(/i);
  assert.match(app, /saved = await saveRecord\(supabase, schema\.list, editingRecordId, payload\)/);
  assert.match(app, /await deleteRecordFromDatabase\(supabase, list, row\.id\)/);
  assert.match(app, /screen === 'database-error'/);
  assert.doesNotMatch(styles, /\.demo-button|\.preview-banner/);
});

test('GitHub Pages workflow uses the lockfile and tests before deployment', () => {
  const workflow = read('../.github/workflows/deploy.yml');
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /VITE_BASE_PATH: \/\$\{\{ github\.event\.repository\.name \}\}\//);
  assert.match(workflow, /needs: build/);
});
