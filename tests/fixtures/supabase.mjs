import { createFinanceFixture } from "./finance.mjs";
import { randomUUID } from "node:crypto";

// This is deliberately a browser/API fixture, not a substitute for database RLS tests.
export const fixtureOrigin = "https://nexo-fixture.supabase.co";
export const fixturePassword = "Senha-segura-2026";
const now = "2026-11-03T12:00:00.000Z";

export function createSupabaseFixture() {
  const users = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email: "empresa-a@example.test",
      companyName: "Empresa Aurora",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      companyId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      email: "empresa-b@example.test",
      companyName: "Empresa Horizonte",
    },
  ];
  const userResponse = (user) => ({
    id: user.id,
    email: user.email,
    aud: "authenticated",
    role: "authenticated",
    email_confirmed_at: now,
    confirmed_at: now,
    phone: "",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { company_name: user.companyName },
    identities: [],
    created_at: now,
    updated_at: now,
  });
  const companies = users.map((user) => ({
    id: user.companyId,
    owner_id: user.id,
    name: user.companyName,
    created_at: now,
    updated_at: now,
  }));
  const customers = users.map((user, i) => ({
    id: `00000000-0000-4000-8000-00000000000${i + 1}`,
    company_id: user.companyId,
    name: i === 0 ? "Cliente exclusivo Aurora" : "Cliente exclusivo Horizonte",
    email:
      i === 0
        ? "cliente-aurora@example.test"
        : "cliente-horizonte@example.test",
    phone: "11999990000",
    document: null,
    notes: null,
    active: true,
    created_at: now,
    updated_at: now,
  }));
  const catalogItems = users.map((user, i) => ({
    id: `10000000-0000-4000-8000-00000000000${i + 1}`,
    company_id: user.companyId,
    kind: "service",
    name: i === 0 ? "Serviço exclusivo Aurora" : "Serviço exclusivo Horizonte",
    description: "Item fictício para verificar a interface por empresa.",
    unit: "un",
    price_cents: 1250,
    active: true,
    created_at: now,
    updated_at: now,
  }));
  const quotes = users.map((user, i) => {
    const id = `20000000-0000-4000-8000-00000000000${i + 1}`;
    return {
      id,
      request_id: randomUUID(),
      company_id: user.companyId,
      customer_id: customers[i].id,
      customer_name: customers[i].name,
      customer_email: customers[i].email,
      customer_phone: customers[i].phone,
      customer_document: customers[i].document,
      company_name: user.companyName,
      title:
        i === 0
          ? "Orçamento exclusivo Aurora"
          : "Orçamento exclusivo Horizonte",
      number: 1,
      status: "draft",
      valid_until: null,
      notes: null,
      payment_terms: null,
      subtotal_cents: 1250,
      discount_cents: 0,
      total_cents: 1250,
      items: [
        {
          id: randomUUID(),
          quote_id: id,
          catalog_item_id: catalogItems[i].id,
          name: catalogItems[i].name,
          unit: "un",
          quantity_milli: 1000,
          unit_price_cents: 1250,
          line_total_cents: 1250,
          position: 0,
        },
      ],
      created_at: now,
      updated_at: now,
    };
  });
  let revision = 0;
  const timestamp = () => new Date(Date.now() + ++revision).toISOString();
  const calls = [];
  const unexpected = [];
  const sessionFor = (user) => {
    const time = Math.floor(Date.now() / 1000);
    const encode = (object) =>
      Buffer.from(JSON.stringify(object)).toString("base64url");
    const access_token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ iss: `${fixtureOrigin}/auth/v1`, aud: "authenticated", sub: user.id, email: user.email, role: "authenticated", iat: time, exp: time + 3600 })}.Zml4dHVyZS1ub3QtYS1yZWFsLXNpZ25hdHVyZQ`;
    return {
      access_token,
      token_type: "bearer",
      expires_in: 3600,
      expires_at: time + 3600,
      refresh_token: `fixture-refresh-${user.id}`,
      user: userResponse(user),
    };
  };
  const userFromRequest = (request) => {
    const token = request.headers().authorization?.replace(/^Bearer\s+/i, "");
    try {
      const payload = JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString(),
      );
      return users.find((user) => user.id === payload.sub);
    } catch {
      return undefined;
    }
  };
  const matches = (row, key, search) => {
    const condition = search.get(key);
    return !condition || condition === `eq.${row[key]}`;
  };

  const finance = createFinanceFixture({ customers, quotes, companies });

  async function route(route) {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
      "access-control-allow-headers": "*",
      "access-control-expose-headers": "content-range, x-supabase-api-version",
      "content-type": "application/json",
      "x-supabase-api-version": "2024-01-01",
    };
    const respond = (body, status = 200, extraHeaders = {}) =>
      route.fulfill({
        status,
        headers: { ...headers, ...extraHeaders },
        body: status === 204 ? undefined : JSON.stringify(body),
      });
    if (method === "OPTIONS") return respond(null, 204);
    const body = request.postDataJSON();
    calls.push({ method, path: url.pathname, search: url.search, body });
    if (url.pathname === "/auth/v1/token") {
      const user =
        url.searchParams.get("grant_type") === "refresh_token"
          ? users.find(
              (item) => body.refresh_token === `fixture-refresh-${item.id}`,
            )
          : users.find(
              (item) =>
                item.email === body.email && body.password === fixturePassword,
            );
      if (!user)
        return respond(
          {
            code: "invalid_credentials",
            error_code: "invalid_credentials",
            msg: "Invalid login credentials",
          },
          400,
        );
      return respond(sessionFor(user));
    }
    if (url.pathname === "/auth/v1/user") {
      const user = userFromRequest(request);
      if (!user) return respond({ code: "bad_jwt", msg: "Invalid user" }, 401);
      return respond({ user: userResponse(user) });
    }
    if (url.pathname === "/auth/v1/logout") return respond(null, 204);
    if (url.pathname === "/auth/v1/recover") return respond({});
    if (url.pathname === "/auth/v1/signup") {
      const user = {
        id: randomUUID(),
        email: body.email,
        companyName: body.data.company_name,
      };
      return respond({
        user: {
          ...userResponse(user),
          email_confirmed_at: null,
          confirmed_at: null,
        },
      });
    }
    const user = userFromRequest(request);
    if (!user)
      return respond(
        { code: "42501", message: "Fixture authentication required" },
        401,
      );
    const acceptObject = request.headers().accept?.includes("vnd.pgrst.object");
    if (
      url.pathname.startsWith("/rest/v1/rpc/nexo_finance_") ||
      [
        "/rest/v1/rpc/nexo_operation_detail",
        "/rest/v1/rpc/nexo_customer_return",
      ].includes(url.pathname)
    ) {
      return finance.handle(url.pathname, body, user, respond);
    }

    if (
      url.pathname === "/rest/v1/rpc/nexo_export_company_data" &&
      method === "POST"
    ) {
      return respond({
        company: companies.find((row) => row.owner_id === user.id),
        customers: customers.filter((row) => row.company_id === user.companyId),
        operations: finance.operations.filter(
          (row) => row.company_id === user.companyId,
        ),
        payments: finance.payments.filter(
          (row) => row.company_id === user.companyId,
        ),
        catalog_items: catalogItems.filter(
          (row) => row.company_id === user.companyId,
        ),
        quotes: quotes.filter((row) => row.company_id === user.companyId),
      });
    }
    if (url.pathname === "/rest/v1/rpc/nexo_save_quote" && method === "POST") {
      const payload = body.p_payload;
      const replay =
        !payload.id && payload.company_id === user.companyId
          ? quotes.find(
              (row) =>
                row.company_id === user.companyId &&
                row.request_id === payload.request_id,
            )
          : undefined;
      if (replay) return respond(replay);
      const existing = payload.id
        ? quotes.find(
            (row) => row.id === payload.id && row.company_id === user.companyId,
          )
        : undefined;
      const customer = customers.find(
        (row) =>
          row.id === payload.customer_id && row.company_id === user.companyId,
      );
      if (
        payload.company_id !== user.companyId ||
        !customer ||
        (payload.id && !existing)
      )
        return respond(
          { code: "42501", message: "Fixture company mismatch" },
          403,
        );
      if (existing && existing.status !== "draft")
        return respond(
          { code: "P0001", message: "Somente rascunhos podem ser editados." },
          400,
        );
      if (existing && payload.expected_updated_at !== existing.updated_at)
        return respond(
          {
            code: "40001",
            message: "Este orçamento foi alterado. Atualize os dados.",
          },
          409,
        );
      const id = existing?.id || randomUUID();
      const items = [];
      for (const [position, item] of (payload.items || []).entries()) {
        const catalogItem = item.catalog_item_id
          ? catalogItems.find(
              (row) =>
                row.id === item.catalog_item_id &&
                row.company_id === user.companyId,
            )
          : undefined;
        if (item.catalog_item_id && !catalogItem)
          return respond(
            { code: "42501", message: "Fixture catalog company mismatch" },
            403,
          );
        if (
          !Number.isInteger(item.quantity_milli) ||
          item.quantity_milli <= 0 ||
          !Number.isInteger(item.unit_price_cents) ||
          item.unit_price_cents < 0
        )
          return respond(
            { code: "22023", message: "Quantidade ou preço inválido." },
            400,
          );
        items.push({
          id: randomUUID(),
          quote_id: id,
          catalog_item_id: item.catalog_item_id || null,
          name: item.name,
          unit: item.unit || "un",
          quantity_milli: item.quantity_milli,
          unit_price_cents: item.unit_price_cents,
          line_total_cents: Math.round(
            (item.quantity_milli * item.unit_price_cents) / 1000,
          ),
          position,
        });
      }
      const subtotal = items.reduce(
        (sum, item) => sum + item.line_total_cents,
        0,
      );
      const discount = payload.discount_cents || 0;
      if (
        !items.length ||
        !Number.isInteger(discount) ||
        discount < 0 ||
        discount > subtotal
      )
        return respond(
          { code: "22023", message: "Itens ou desconto inválidos." },
          400,
        );
      const company = companies.find((row) => row.id === user.companyId);
      const row = {
        id,
        request_id: existing?.request_id || payload.request_id,
        company_id: user.companyId,
        customer_id: customer.id,
        customer_name: customer.name,
        customer_email: customer.email,
        customer_phone: customer.phone,
        customer_document: customer.document,
        company_name: company.name,
        title: payload.title,
        number:
          existing?.number ||
          Math.max(
            0,
            ...quotes
              .filter((row) => row.company_id === user.companyId)
              .map((row) => row.number),
          ) + 1,
        status: existing?.status || "draft",
        valid_until: payload.valid_until || null,
        notes: payload.notes || null,
        payment_terms: payload.payment_terms || null,
        subtotal_cents: subtotal,
        discount_cents: discount,
        total_cents: subtotal - discount,
        items,
        created_at: existing?.created_at || timestamp(),
        updated_at: timestamp(),
      };
      if (existing) quotes.splice(quotes.indexOf(existing), 1, row);
      else quotes.push(row);
      return respond(row);
    }
    if (
      url.pathname === "/rest/v1/rpc/nexo_set_quote_status" &&
      method === "POST"
    ) {
      const row = quotes.find(
        (quote) =>
          quote.id === body.p_quote_id && quote.company_id === user.companyId,
      );
      if (!row)
        return respond(
          { code: "42501", message: "Fixture company mismatch" },
          403,
        );
      if (row.updated_at !== body.p_expected_updated_at)
        return respond(
          {
            code: "40001",
            message: "Este orçamento foi alterado. Atualize os dados.",
          },
          409,
        );
      const allowed = {
        draft: ["sent"],
        sent: ["draft", "approved", "declined"],
        approved: [],
        declined: [],
      };
      if (!allowed[row.status].includes(body.p_status))
        return respond(
          { code: "22023", message: "Transição de situação inválida." },
          400,
        );
      Object.assign(row, { status: body.p_status, updated_at: timestamp() });
      return respond(row);
    }
    if (
      url.pathname === "/rest/v1/rpc/nexo_delete_quote" &&
      method === "POST"
    ) {
      const row = quotes.find(
        (quote) =>
          quote.id === body.p_quote_id && quote.company_id === user.companyId,
      );
      if (!row)
        return respond(
          { code: "42501", message: "Fixture company mismatch" },
          403,
        );
      if (row.updated_at !== body.p_expected_updated_at)
        return respond(
          {
            code: "40001",
            message: "Este orçamento foi alterado. Atualize os dados.",
          },
          409,
        );
      if (row.status !== "draft")
        return respond(
          { code: "22023", message: "Somente rascunhos podem ser excluídos." },
          400,
        );
      quotes.splice(quotes.indexOf(row), 1);
      return respond(null);
    }
    if (
      url.pathname === "/rest/v1/catalog_items" ||
      url.pathname === "/rest/v1/quotes"
    ) {
      const collection = url.pathname.endsWith("catalog_items")
        ? catalogItems
        : quotes;
      const rows = collection.filter(
        (row) =>
          row.company_id === user.companyId &&
          matches(row, "company_id", url.searchParams) &&
          matches(row, "id", url.searchParams),
      );
      if (method === "GET") {
        rows.sort(
          (a, b) =>
            b.created_at.localeCompare(a.created_at) ||
            a.id.localeCompare(b.id),
        );
        const offset = Number(url.searchParams.get("offset") || 0);
        const limit = Number(url.searchParams.get("limit") || 1000);
        const selected = rows.slice(offset, offset + limit);
        return respond(acceptObject ? (selected[0] ?? null) : selected, 200, {
          "content-range": `${selected.length ? offset : 0}-${selected.length ? offset + selected.length - 1 : 0}/${rows.length}`,
        });
      }
      if (collection === catalogItems) {
        if (method === "POST") {
          if (body.company_id !== user.companyId)
            return respond(
              { code: "42501", message: "Fixture company mismatch" },
              403,
            );
          const row = {
            ...body,
            id: randomUUID(),
            created_at: timestamp(),
            updated_at: timestamp(),
          };
          collection.push(row);
          return respond(acceptObject ? row : [row], 201);
        }
        if (method === "PATCH") {
          for (const row of rows)
            Object.assign(row, body, { updated_at: timestamp() });
          return respond(acceptObject ? (rows[0] ?? null) : rows);
        }
        if (method === "DELETE") {
          for (const row of rows) {
            collection.splice(collection.indexOf(row), 1);
            for (const quote of quotes)
              for (const item of quote.items)
                if (item.catalog_item_id === row.id)
                  item.catalog_item_id = null;
          }
          return respond(acceptObject ? (rows[0] ?? null) : rows);
        }
      }
    }
    if (url.pathname === "/rest/v1/companies") {
      const rows = companies.filter(
        (row) =>
          row.owner_id === user.id &&
          matches(row, "owner_id", url.searchParams) &&
          matches(row, "id", url.searchParams),
      );
      if (method === "PATCH") {
        for (const row of rows) {
          row.name = body.name;
          row.updated_at = new Date().toISOString();
        }
      }
      return respond(acceptObject ? (rows[0] ?? null) : rows);
    }
    if (url.pathname === "/rest/v1/customers") {
      let rows = customers.filter(
        (row) =>
          row.company_id === user.companyId &&
          matches(row, "company_id", url.searchParams) &&
          matches(row, "id", url.searchParams),
      );
      if (method === "GET") {
        rows.sort(
          (a, b) =>
            b.created_at.localeCompare(a.created_at) ||
            a.id.localeCompare(b.id),
        );
        const offset = Number(url.searchParams.get("offset") || 0);
        const limit = Number(url.searchParams.get("limit") || 1000);
        const selected = rows.slice(offset, offset + limit);
        return respond(acceptObject ? (selected[0] ?? null) : selected, 200, {
          "content-range": `${selected.length ? offset : 0}-${selected.length ? offset + selected.length - 1 : 0}/${rows.length}`,
        });
      }
      if (method === "POST") {
        if (body.company_id !== user.companyId)
          return respond(
            { code: "42501", message: "Fixture company mismatch" },
            403,
          );
        const row = {
          ...body,
          id: randomUUID(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        customers.push(row);
        return respond(acceptObject ? row : [row], 201);
      }
      if (method === "PATCH") {
        for (const row of rows)
          Object.assign(row, body, { updated_at: new Date().toISOString() });
        return respond(acceptObject ? (rows[0] ?? null) : rows);
      }
      if (method === "DELETE") {
        for (const row of rows) {
          customers.splice(customers.indexOf(row), 1);
          for (const quote of quotes)
            if (quote.customer_id === row.id) quote.customer_id = null;
        }
        return respond(acceptObject ? (rows[0] ?? null) : rows);
      }
    }
    unexpected.push(`${method} ${url.pathname}`);
    return respond({ message: "Unimplemented fixture request" }, 501);
  }

  return {
    finance,
    users,
    companies,
    customers,
    catalogItems,
    quotes,
    calls,
    unexpected,
    sessionFor,
    route,
  };
}
