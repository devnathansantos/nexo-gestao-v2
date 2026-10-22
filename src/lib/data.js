export const TABLES = Object.freeze({
  clients: 'nexo_clients',
  services: 'nexo_services',
  expenses: 'nexo_expenses',
  employees: 'nexo_employees',
  employeePayments: 'nexo_employee_payments',
  quotes: 'nexo_quotes',
  catalog: 'nexo_catalog',
  vehicles: 'nexo_vehicles',
});

export const EMPTY_RECORDS = Object.freeze(Object.fromEntries(Object.keys(TABLES).map((key) => [key, []])));

export function fromDatabaseRow(row) {
  if (!row) return row;
  const { created_at, updated_at, user_id, ...fields } = row;
  return { ...fields, createdAt: created_at || '' };
}

export function toDatabasePayload(values) {
  const payload = {};
  for (const [key, rawValue] of Object.entries(values || {})) {
    if (['id', 'createdAt', 'created_at', 'updatedAt', 'updated_at', 'user_id'].includes(key)) continue;
    if (rawValue === '' || rawValue === undefined) payload[key] = null;
    else if (['valor', 'comissao'].includes(key)) payload[key] = Number(rawValue);
    else payload[key] = rawValue;
  }
  return payload;
}

export function buildRecordPayload(type, values, records) {
  const payload = toDatabasePayload(values);
  const find = (list, id) => (records[list] || []).find((row) => row.id === id);
  if (type === 'vehicle') payload.cliente = find('clients', values.client_id)?.nome || '';
  if (['service', 'quote'].includes(type)) {
    payload.cliente = find('clients', values.client_id)?.nome || '';
    payload.veiculo = find('vehicles', values.vehicle_id)?.modelo || values.veiculo || null;
  }
  if (type === 'employeePayment') payload.funcionario = find('employees', values.employee_id)?.nome || '';
  return payload;
}

async function loadAllRows(client, table, orderBy, ascending = false) {
  const pageSize = 500;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    let query = client.from(table).select('*').order(orderBy, { ascending });
    if (table !== 'nexo_monthly_goals') query = query.order('id', { ascending: true });
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

export async function loadWorkspace(client) {
  const entries = await Promise.all(Object.entries(TABLES).map(async ([list, table]) => {
    const rows = await loadAllRows(client, table, 'created_at');
    return [list, rows.map(fromDatabaseRow)];
  }));
  const [{ data: company, error: companyError }, goals] = await Promise.all([
    client.from('nexo_company_settings').select('*').maybeSingle(),
    loadAllRows(client, 'nexo_monthly_goals', 'month'),
  ]);
  if (companyError) throw companyError;
  return {
    records: Object.fromEntries(entries),
    company: company || null,
    goals: goals || [],
  };
}

export async function saveRecord(client, list, id, payload) {
  const table = TABLES[list];
  if (!table) throw new Error('Tipo de cadastro inválido.');
  const result = id
    ? await client.from(table).update(payload).eq('id', id).select('*').single()
    : await client.from(table).insert(payload).select('*').single();
  if (result.error) throw result.error;
  return fromDatabaseRow(result.data);
}

export async function deleteRecord(client, list, id) {
  const table = TABLES[list];
  if (!table) throw new Error('Tipo de cadastro inválido.');
  const { data, error } = await client.from(table).delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Registro não encontrado ou sem permissão para exclusão.');
}

export async function saveCompany(client, userId, values) {
  const { data, error } = await client.from('nexo_company_settings').upsert({
    user_id: userId,
    nome: values.name.trim(),
    telefone: values.phone.trim() || null,
    email: values.email.trim() || null,
    cidade: values.city.trim() || null,
  }, { onConflict: 'user_id' }).select('*').single();
  if (error) throw error;
  return { name: data.nome, phone: data.telefone || '', email: data.email || '', city: data.cidade || '' };
}

export async function saveMonthlyGoal(client, userId, month, amount) {
  const { data, error } = await client.from('nexo_monthly_goals').upsert({
    user_id: userId,
    month: `${month}-01`,
    valor: Number(amount),
  }, { onConflict: 'user_id,month' }).select('*').single();
  if (error) throw error;
  return data;
}
