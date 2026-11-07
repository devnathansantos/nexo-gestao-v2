import { randomUUID } from "node:crypto";
export function createFinanceFixture({ customers, quotes, companies }) {
  const operations = [],
    payments = [];
  const paid = (o) =>
    payments
      .filter((p) => p.operation_id === o.id && !p.voided_at)
      .reduce((sum, p) => sum + p.amount_cents, 0);
  async function handle(path, body, user, respond) {
    const own = () => operations.filter((o) => o.company_id === user.companyId);
    const sum = (rows) =>
      String(rows.reduce((sum, r) => sum + r.amount_cents, 0));
    if (path === "/rest/v1/rpc/nexo_finance_command") {
      const x = body.p_payload;
      const action = body.p_action;
      const now = new Date().toISOString();
      if (action === "create" || action === "convert") {
        const existing = own().find(
          (o) =>
            o.request_id === x.request_id ||
            (x.quote_id && o.quote_id === x.quote_id),
        );
        if (existing) return respond(existing);
        const q = x.quote_id
          ? quotes.find(
              (q) => q.id === x.quote_id && q.company_id === user.companyId,
            )
          : null;
        if (action === "convert" && q?.status !== "approved")
          return respond(
            {
              code: "55000",
              message: "Aprove o orçamento antes de converter.",
            },
            400,
          );
        const c = customers.find(
          (c) => c.id === x.customer_id && c.company_id === user.companyId,
        );
        const o = {
          id: randomUUID(),
          company_id: user.companyId,
          request_id: x.request_id,
          kind: q ? "sale" : x.kind,
          quote_id: q?.id || null,
          customer_id: q?.customer_id || c?.id || null,
          counterparty: q?.customer_name || c?.name || x.counterparty || "",
          description: q?.title || x.description,
          category: q ? "Vendas e serviços" : x.category,
          occurred_on: x.occurred_on,
          due_on: x.due_on,
          amount_cents: q?.total_cents ?? x.amount_cents,
          notes: q?.notes || x.notes || "",
          quote_snapshot: q ? structuredClone(q) : null,
          created_at: now,
          created_by: user.id,
          voided_at: null,
          void_reason: null,
        };
        operations.push(o);
        return respond(o);
      }
      if (action === "pay") {
        const replay = payments.find(
          (p) =>
            p.company_id === user.companyId && p.request_id === x.request_id,
        );
        if (replay) return respond(replay);
        const o = own().find((o) => o.id === x.operation_id);
        if (!o)
          return respond(
            { code: "42501", message: "Lançamento indisponível." },
            403,
          );
        if (
          o.voided_at ||
          x.amount_cents <= 0 ||
          x.amount_cents > o.amount_cents - paid(o)
        )
          return respond(
            { code: "22023", message: "O valor ultrapassa o saldo em aberto." },
            400,
          );
        const p = {
          ...x,
          id: randomUUID(),
          company_id: user.companyId,
          created_at: now,
          created_by: user.id,
          voided_at: null,
          void_reason: null,
        };
        payments.push(p);
        return respond(p);
      }
      if (action === "void_operation" || action === "void_payment") {
        const row = (action === "void_operation" ? operations : payments).find(
          (r) => r.id === x.id && r.company_id === user.companyId,
        );
        if (!row)
          return respond({ code: "42501", message: "Indisponível." }, 403);
        if (action === "void_operation" && paid(row) > 0)
          return respond(
            {
              code: "55000",
              message: "Corrija os pagamentos antes de anular o lançamento.",
            },
            400,
          );
        row.voided_at = now;
        row.void_reason = x.reason;
        return respond(row);
      }
    }
    if (path === "/rest/v1/rpc/nexo_operation_detail") {
      const o = own().find((o) => o.id === body.p_id);
      return respond(
        o
          ? { ...o, payments: payments.filter((p) => p.operation_id === o.id) }
          : null,
      );
    }
    if (path === "/rest/v1/rpc/nexo_finance_page") {
      const month = body.p_month.slice(0, 7);
      const monthly = own().filter((o) => o.occurred_on.startsWith(month));
      const active = monthly.filter((o) => !o.voided_at);
      const filtered = monthly.filter(
        (o) =>
          (body.p_kind === "all" || o.kind === body.p_kind) &&
          `${o.description} ${o.counterparty} ${o.category}`
            .toLowerCase()
            .includes((body.p_query || "").toLowerCase()),
      );
      const cash = payments
        .filter(
          (p) =>
            p.company_id === user.companyId &&
            !p.voided_at &&
            p.paid_on.startsWith(month),
        )
        .map((p) => ({
          ...p,
          kind: operations.find((o) => o.id === p.operation_id).kind,
        }));
      const categories = [
        ...new Set(
          active.filter((o) => o.kind === "expense").map((o) => o.category),
        ),
      ].map((category) => ({
        category,
        amount_cents: sum(
          active.filter((o) => o.kind === "expense" && o.category === category),
        ),
      }));
      return respond({
        company_id: user.companyId,
        total: filtered.length,
        rows: filtered
          .sort(
            (a, b) =>
              b.occurred_on.localeCompare(a.occurred_on) ||
              b.created_at.localeCompare(a.created_at),
          )
          .slice(body.p_offset, body.p_offset + 30)
          .map((o) => ({ ...o, paid_cents: paid(o) })),
        summary: {
          sales_cents: sum(active.filter((o) => o.kind === "sale")),
          expenses_cents: sum(active.filter((o) => o.kind === "expense")),
          received_cents: sum(cash.filter((o) => o.kind === "sale")),
          paid_cents: sum(cash.filter((o) => o.kind === "expense")),
          receivable_cents: String(
            own()
              .filter((o) => !o.voided_at && o.kind === "sale")
              .reduce((s, o) => s + o.amount_cents - paid(o), 0),
          ),
          payable_cents: String(
            own()
              .filter((o) => !o.voided_at && o.kind === "expense")
              .reduce((s, o) => s + o.amount_cents - paid(o), 0),
          ),
          overdue_cents: "0",
          sale_count: active.filter((o) => o.kind === "sale").length,
          categories,
        },
      });
    }
    if (path === "/rest/v1/rpc/nexo_customer_return") {
      const rows = customers
        .filter((c) => c.company_id === user.companyId && c.active)
        .map((c) => {
          const history = own()
            .filter(
              (o) =>
                o.customer_id === c.id && o.kind === "sale" && !o.voided_at,
            )
            .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
          return {
            ...c,
            last_sale_on: history[0]?.occurred_on || null,
            sale_count: history.length,
          };
        })
        .filter(
          (c) =>
            (!c.last_sale_on ||
              (Date.now() - new Date(c.last_sale_on).getTime()) / 86400000 >=
                body.p_days) &&
            `${c.name} ${c.phone}`
              .toLowerCase()
              .includes((body.p_query || "").toLowerCase()),
        );
      return respond({
        company_id: user.companyId,
        total: rows.length,
        rows: rows.slice(body.p_offset, body.p_offset + 30),
      });
    }
    return undefined;
  }
  return { operations, payments, handle };
}
