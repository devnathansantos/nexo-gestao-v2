import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecordPayload, fromDatabaseRow, toDatabasePayload } from '../src/lib/data.js';

test('payload conversion strips client-only fields, nulls blanks, and converts numbers', () => {
  assert.deepEqual(toDatabasePayload({ id: 'a', createdAt: 'today', user_id: 'ignored', valor: '35.50', comissao: '12.5', telefone: '' }), {
    valor: 35.5, comissao: 12.5, telefone: null,
  });
});

test('database timestamps map to the UI model', () => {
  assert.deepEqual(fromDatabaseRow({ id: 'x', nome: 'Cliente', user_id: 'u1', created_at: '2026-01-02', updated_at: '2026-01-03' }), {
    id: 'x', nome: 'Cliente', createdAt: '2026-01-02',
  });
});

test('record payloads preserve scoped relationship IDs and display labels', () => {
  const records = {
    clients: [{ id: 'client-1', nome: 'Ana' }],
    vehicles: [{ id: 'vehicle-1', client_id: 'client-1', modelo: 'Civic', placa: 'ABC1D23' }],
    employees: [{ id: 'employee-1', nome: 'Caio' }],
  };
  assert.deepEqual(buildRecordPayload('service', { client_id: 'client-1', vehicle_id: 'vehicle-1', servico: 'Polimento', valor: '200' }, records), {
    client_id: 'client-1', vehicle_id: 'vehicle-1', servico: 'Polimento', valor: 200, cliente: 'Ana', veiculo: 'Civic',
  });
  assert.deepEqual(buildRecordPayload('employeePayment', { employee_id: 'employee-1', valor: '100' }, records), {
    employee_id: 'employee-1', valor: 100, funcionario: 'Caio',
  });
});

function makeClient(result = { data: { id: 'record-1' }, error: null }) {
  const calls = [];
  const query = {
    insert(value) { calls.push(['insert', value]); return this; },
    update(value) { calls.push(['update', value]); return this; },
    delete() { calls.push(['delete']); return this; },
    upsert(value, options) { calls.push(['upsert', value, options]); return this; },
    eq(key, value) { calls.push(['eq', key, value]); return this; },
    select(value) { calls.push(['select', value]); return this; },
    single() { return Promise.resolve(result); },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
  };
  return { calls, from(table) { calls.push(['from', table]); return query; } };
}

test('database create and update use the correct table and row id', async () => {
  const { saveRecord } = await import('../src/lib/data.js');
  const client = makeClient({ data: { id: 'record-1', created_at: '2026-01-01' }, error: null });
  const created = await saveRecord(client, 'clients', null, { nome: 'Ana' });
  assert.equal(created.id, 'record-1');
  assert.deepEqual(client.calls.slice(0, 3), [['from', 'nexo_clients'], ['insert', { nome: 'Ana' }], ['select', '*']]);
  client.calls.length = 0;
  await saveRecord(client, 'clients', 'record-1', { nome: 'Ana B.' });
  assert.deepEqual(client.calls.slice(0, 4), [['from', 'nexo_clients'], ['update', { nome: 'Ana B.' }], ['eq', 'id', 'record-1'], ['select', '*']]);
});

test('database delete is scoped to the selected row and confirms it was deleted', async () => {
  const { deleteRecord } = await import('../src/lib/data.js');
  const client = makeClient({ data: [{ id: 'service-1' }], error: null });
  await deleteRecord(client, 'services', 'service-1');
  assert.deepEqual(client.calls, [['from', 'nexo_services'], ['delete'], ['eq', 'id', 'service-1'], ['select', 'id']]);
});

test('database delete reports when RLS or a missing record yields no deleted rows', async () => {
  const { deleteRecord } = await import('../src/lib/data.js');
  const client = makeClient({ data: [], error: null });
  await assert.rejects(deleteRecord(client, 'services', 'missing'), /sem permissão para exclusão/);
});

test('company profile and monthly goal use account-scoped upserts', async () => {
  const { saveCompany, saveMonthlyGoal } = await import('../src/lib/data.js');
  const companyClient = makeClient({ data: { nome: 'NEXO', telefone: null, email: 'contato@nexo.test', cidade: null }, error: null });
  const company = await saveCompany(companyClient, 'user-1', { name: 'NEXO', phone: '', email: 'contato@nexo.test', city: '' });
  assert.deepEqual(company, { name: 'NEXO', phone: '', email: 'contato@nexo.test', city: '' });
  assert.deepEqual(companyClient.calls[1][2], { onConflict: 'user_id' });

  const goalClient = makeClient({ data: { user_id: 'user-1', month: '2026-06-01', valor: 15000 }, error: null });
  const goal = await saveMonthlyGoal(goalClient, 'user-1', '2026-06', 15000);
  assert.equal(goal.valor, 15000);
  assert.deepEqual(goalClient.calls[1][2], { onConflict: 'user_id,month' });
});
