import type { Operation, Payment } from "../finance-types";
import { assertFinanceExport } from "./finance";
import type {
  CatalogItem,
  Company,
  CompanyExport,
  Customer,
  Quote,
} from "../types";
import { supabase, supabaseConfigurationError } from "./supabase";
import { friendlyError, requireOnline } from "./errors";

/** The RPC reads all export rows in one PostgreSQL snapshot under the caller's RLS. */
export async function fetchCompanyExport(
  expectedCompanyId: string,
): Promise<CompanyExport> {
  if (!supabase)
    throw new Error(
      supabaseConfigurationError || "O Supabase ainda não está configurado.",
    );
  if (!expectedCompanyId)
    throw new Error("Entre na empresa antes de exportar seus dados.");
  requireOnline();
  const { data, error } = await supabase.rpc("nexo_export_company_data");
  if (error)
    throw new Error(
      friendlyError(
        error,
        "Não foi possível exportar os dados atualizados. Tente novamente.",
      ),
    );
  if (
    !data ||
    !data.company ||
    data.company.id !== expectedCompanyId ||
    !Array.isArray(data.customers) ||
    !Array.isArray(data.catalog_items) ||
    !Array.isArray(data.quotes)
  ) {
    throw new Error(
      "Não foi possível confirmar os dados desta empresa. A exportação foi interrompida.",
    );
  }
  assertExportScope(
    data.company,
    data.customers,
    data.catalog_items,
    data.quotes,
  );
  assertFinanceExport(expectedCompanyId, data.operations, data.payments);
  return {
    operations: data.operations,
    payments: data.payments,
    company: data.company,
    customers: data.customers,
    catalog_items: data.catalog_items,
    quotes: data.quotes,
  };
}

function assertExportScope(
  company: Company,
  customers: readonly Customer[],
  catalogItems: readonly CatalogItem[],
  quotes: readonly Quote[],
): void {
  if (
    [...customers, ...catalogItems, ...quotes].some(
      (row) => !row || row.company_id !== company.id,
    )
  ) {
    throw new Error(
      "O arquivo contém dados de outra empresa; todos devem pertencer à mesma empresa. A exportação foi interrompida.",
    );
  }
  const customerIds = new Set(customers.map((customer) => customer.id));
  const catalogIds = new Set(catalogItems.map((item) => item.id));
  const quoteIds = new Set(quotes.map((quote) => quote.id));
  if (
    customerIds.size !== customers.length ||
    catalogIds.size !== catalogItems.length ||
    quoteIds.size !== quotes.length
  ) {
    throw new Error(
      "O arquivo contém registros duplicados. A exportação foi interrompida.",
    );
  }
  const itemIds = new Set<string>();
  for (const quote of quotes) {
    if (
      (quote.customer_id !== null && !customerIds.has(quote.customer_id)) ||
      !Array.isArray(quote.items)
    ) {
      throw new Error(
        "Os vínculos do orçamento não pertencem à empresa. A exportação foi interrompida.",
      );
    }
    for (const item of quote.items) {
      if (
        !item ||
        item.quote_id !== quote.id ||
        (item.catalog_item_id !== null &&
          !catalogIds.has(item.catalog_item_id)) ||
        itemIds.has(item.id)
      ) {
        throw new Error(
          "Os itens do orçamento não pertencem aos dados desta empresa. A exportação foi interrompida.",
        );
      }
      itemIds.add(item.id);
    }
  }
}

/** Quoted CSV still needs formula protection when opened by spreadsheet software. */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text))
    text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function customersToCsv(customers: readonly Customer[]): string {
  const headers = [
    "Nome",
    "E-mail",
    "Telefone",
    "Documento",
    "Observações",
    "Situação",
    "Cadastro",
    "Atualização",
  ];
  const rows = customers.map((customer) => [
    customer.name,
    customer.email,
    customer.phone,
    customer.document,
    customer.notes,
    customer.active ? "Ativo" : "Inativo",
    customer.created_at,
    customer.updated_at,
  ]);
  return (
    "\uFEFF" +
    [headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n") +
    "\r\n"
  );
}

export function createCompanyBackup(
  company: Company,
  customers: readonly Customer[],
  catalogItems: readonly CatalogItem[],
  quotes: readonly Quote[],
  operations: readonly Operation[] = [],
  payments: readonly Payment[] = [],
) {
  assertFinanceExport(company.id, operations, payments);
  assertExportScope(company, customers, catalogItems, quotes);
  return {
    format: "nexo-company-data",
    version: 3,
    exported_at: new Date().toISOString(),
    scope: [
      "company",
      "customers",
      "catalog_items",
      "quotes",
      "operations",
      "payments",
    ],
    operations,
    payments,
    notice:
      "Exportação da empresa, clientes, catálogo, orçamentos, operações e pagamentos. A restauração ainda não está disponível nesta versão.",
    company: {
      id: company.id,
      name: company.name,
      created_at: company.created_at,
      updated_at: company.updated_at,
    },
    customers: customers.map((customer) => ({
      id: customer.id,
      company_id: customer.company_id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      document: customer.document,
      notes: customer.notes,
      active: customer.active,
      created_at: customer.created_at,
      updated_at: customer.updated_at,
    })),
    catalog_items: catalogItems.map((item) => ({
      id: item.id,
      company_id: item.company_id,
      kind: item.kind,
      name: item.name,
      description: item.description,
      unit: item.unit,
      price_cents: item.price_cents,
      active: item.active,
      created_at: item.created_at,
      updated_at: item.updated_at,
    })),
    quotes: quotes.map((quote) => ({
      id: quote.id,
      request_id: quote.request_id,
      company_id: quote.company_id,
      number: quote.number,
      customer_id: quote.customer_id,
      customer_name: quote.customer_name,
      customer_email: quote.customer_email,
      customer_phone: quote.customer_phone,
      customer_document: quote.customer_document,
      company_name: quote.company_name,
      title: quote.title,
      valid_until: quote.valid_until,
      notes: quote.notes,
      payment_terms: quote.payment_terms,
      status: quote.status,
      subtotal_cents: quote.subtotal_cents,
      discount_cents: quote.discount_cents,
      total_cents: quote.total_cents,
      created_at: quote.created_at,
      updated_at: quote.updated_at,
      items: quote.items.map((item) => ({
        id: item.id,
        quote_id: item.quote_id,
        catalog_item_id: item.catalog_item_id,
        name: item.name,
        unit: item.unit,
        quantity_milli: item.quantity_milli,
        unit_price_cents: item.unit_price_cents,
        line_total_cents: item.line_total_cents,
        position: item.position,
      })),
    })),
    counts: {
      operations: operations.length,
      payments: payments.length,
      customers: customers.length,
      catalog_items: catalogItems.length,
      quotes: quotes.length,
    },
  };
}

function downloadFile(contents: string, fileName: string, type: string): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCustomersCsv(customers: readonly Customer[]): void {
  downloadFile(
    customersToCsv(customers),
    `nexo-clientes-${new Date().toISOString().slice(0, 10)}.csv`,
    "text/csv;charset=utf-8",
  );
}

export function downloadCompanyBackup(
  company: Company,
  customers: readonly Customer[],
  catalogItems: readonly CatalogItem[],
  quotes: readonly Quote[],
  operations: readonly Operation[] = [],
  payments: readonly Payment[] = [],
): void {
  const backup = createCompanyBackup(
    company,
    customers,
    catalogItems,
    quotes,
    operations,
    payments,
  );
  downloadFile(
    JSON.stringify(backup, null, 2),
    `nexo-empresa-${new Date().toISOString().slice(0, 10)}.json`,
    "application/json;charset=utf-8",
  );
}

/** Separate competence and cash exports so a spreadsheet never sums both as revenue. */
export function financialCsv(
  snapshot: CompanyExport,
  year: string,
  mode: "operations" | "payments",
): string {
  if (!/^\d{4}$/.test(year)) throw new Error("Ano inválido.");
  assertFinanceExport(
    snapshot.company.id,
    snapshot.operations,
    snapshot.payments,
  );
  const byId = new Map(snapshot.operations.map((o) => [o.id, o]));
  const decimal = (cents: number) =>
    `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
  const rows: unknown[][] =
    mode === "operations"
      ? [
          [
            "ID",
            "Tipo",
            "Competência",
            "Vencimento",
            "Descrição",
            "Categoria",
            "Favorecido",
            "Valor contabilizado (R$)",
            "Valor original (R$)",
            "ID orçamento",
            "Anulado em",
            "Motivo da anulação",
          ],
          ...snapshot.operations
            .filter((o) => o.occurred_on.startsWith(year + "-"))
            .map((o) => [
              o.id,
              o.kind === "sale" ? "Venda/serviço" : "Despesa",
              o.occurred_on,
              o.due_on,
              o.description,
              o.category,
              o.counterparty,
              decimal(o.voided_at ? 0 : o.amount_cents),
              decimal(o.amount_cents),
              o.quote_id,
              o.voided_at,
              o.void_reason,
            ]),
        ]
      : [
          [
            "ID pagamento",
            "ID operação",
            "Direção",
            "Data efetiva",
            "Descrição",
            "Categoria",
            "Favorecido",
            "Valor contabilizado (R$)",
            "Valor original (R$)",
            "Forma",
            "Referência",
            "Anulado em",
            "Motivo da anulação",
          ],
          ...snapshot.payments
            .filter((p) => p.paid_on.startsWith(year + "-"))
            .map((p) => {
              const o = byId.get(p.operation_id)!;
              return [
                p.id,
                o.id,
                o.kind === "sale" ? "Entrada" : "Saída",
                p.paid_on,
                o.description,
                o.category,
                o.counterparty,
                decimal(p.voided_at || o.voided_at ? 0 : p.amount_cents),
                decimal(p.amount_cents),
                p.method,
                p.reference,
                p.voided_at,
                p.void_reason,
              ];
            }),
        ];
  return (
    "\uFEFF" +
    rows.map((row) => row.map(csvCell).join(";")).join("\r\n") +
    "\r\n"
  );
}
export function downloadFinancialCsv(
  snapshot: CompanyExport,
  year: string,
  mode: "operations" | "payments",
) {
  downloadFile(
    financialCsv(snapshot, year, mode),
    `nexo-${mode === "operations" ? "operacoes" : "caixa"}-${year}.csv`,
    "text/csv;charset=utf-8",
  );
}
