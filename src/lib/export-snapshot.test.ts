import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogItem, Company, Customer, Quote } from "../types";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("./supabase", () => ({
  supabase: { rpc },
  supabaseConfigurationError: null,
}));
import { createCompanyBackup, fetchCompanyExport } from "./exports";

const company: Company = {
  id: "company-a",
  owner_id: "owner-a",
  name: "Empresa A",
  created_at: "2026-11-03T12:00:00Z",
  updated_at: "2026-11-03T12:00:00Z",
};
const customer: Customer = {
  id: "customer-a",
  company_id: company.id,
  name: "Ana",
  email: null,
  phone: null,
  document: null,
  notes: null,
  active: true,
  created_at: "2026-11-03T12:00:00Z",
  updated_at: "2026-11-03T12:00:00Z",
};
const catalogItem: CatalogItem = {
  id: "catalog-a",
  company_id: company.id,
  kind: "service",
  name: "Consultoria",
  description: null,
  unit: "hora",
  price_cents: 12000,
  active: true,
  created_at: company.created_at,
  updated_at: company.updated_at,
};
const quote: Quote = {
  id: "quote-a",
  request_id: "request-a",
  company_id: company.id,
  number: 1,
  customer_id: customer.id,
  customer_name: customer.name,
  customer_email: null,
  customer_phone: null,
  customer_document: null,
  company_name: company.name,
  title: "Proposta",
  valid_until: null,
  notes: null,
  payment_terms: null,
  status: "draft",
  subtotal_cents: 12000,
  discount_cents: 0,
  total_cents: 12000,
  created_at: company.created_at,
  updated_at: company.updated_at,
  items: [
    {
      id: "line-a",
      quote_id: "quote-a",
      catalog_item_id: catalogItem.id,
      name: catalogItem.name,
      unit: "hora",
      quantity_milli: 1000,
      unit_price_cents: 12000,
      line_total_cents: 12000,
      position: 0,
    },
  ],
};

describe("export snapshot authorization boundary", () => {
  beforeEach(() => rpc.mockReset());

  it("gets the complete authorized export in one RPC, including more than a REST page", async () => {
    const customers = Array.from({ length: 1200 }, (_, index) => ({
      ...customer,
      id: `customer-${index}`,
    }));
    rpc.mockResolvedValue({
      data: {
        company,
        customers,
        catalog_items: [],
        quotes: [],
        operations: [],
        payments: [],
      },
      error: null,
    });
    const result = await fetchCompanyExport(company.id);
    expect(result.customers).toHaveLength(1200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("nexo_export_company_data");
  });

  it("rejects a snapshot from another session or company", async () => {
    rpc.mockResolvedValue({
      data: { company, customers: [customer], catalog_items: [], quotes: [] },
      error: null,
    });
    await expect(fetchCompanyExport("company-b")).rejects.toThrow(/confirmar/);
  });

  it("rejects an unexpected cross-company row inside an otherwise matching snapshot", async () => {
    rpc.mockResolvedValue({
      data: {
        company,
        customers: [{ ...customer, company_id: "company-b" }],
        catalog_items: [],
        quotes: [],
      },
      error: null,
    });
    await expect(fetchCompanyExport(company.id)).rejects.toThrow(
      /mesma empresa/,
    );
  });

  it("does not export after a database permission failure or missing company", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    await expect(fetchCompanyExport(company.id)).rejects.toThrow(/permissão/);
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(fetchCompanyExport(company.id)).rejects.toThrow(/confirmar/);
  });

  it("requires the new snapshot collections instead of silently exporting an old schema subset", async () => {
    rpc.mockResolvedValue({
      data: { company, customers: [customer] },
      error: null,
    });
    await expect(fetchCompanyExport(company.id)).rejects.toThrow(/confirmar/);
  });

  it("rejects foreign catalog records and quotes even when the company envelope is correct", async () => {
    rpc.mockResolvedValueOnce({
      data: {
        company,
        customers: [customer],
        catalog_items: [{ ...catalogItem, company_id: "company-b" }],
        quotes: [],
      },
      error: null,
    });
    await expect(fetchCompanyExport(company.id)).rejects.toThrow(
      /mesma empresa/,
    );
    rpc.mockResolvedValueOnce({
      data: {
        company,
        customers: [customer],
        catalog_items: [],
        quotes: [{ ...quote, company_id: "company-b" }],
      },
      error: null,
    });
    await expect(fetchCompanyExport(company.id)).rejects.toThrow(
      /mesma empresa/,
    );
  });

  it("rejects nested rows bound to another quote, customer, or catalog", async () => {
    for (const invalidQuote of [
      { ...quote, customer_id: "foreign-customer" },
      { ...quote, items: [{ ...quote.items[0], quote_id: "foreign-quote" }] },
      {
        ...quote,
        items: [{ ...quote.items[0], catalog_item_id: "foreign-catalog" }],
      },
    ]) {
      rpc.mockResolvedValueOnce({
        data: {
          company,
          customers: [customer],
          catalog_items: [catalogItem],
          quotes: [invalidQuote],
        },
        error: null,
      });
      await expect(fetchCompanyExport(company.id)).rejects.toThrow(
        /exportação foi interrompida/,
      );
    }
  });

  it("keeps archived snapshots with deleted nullable references and strips unrelated secret properties", () => {
    const archivedQuote = {
      ...quote,
      customer_id: null,
      secret: "never-export-quote-secret",
      items: [
        {
          ...quote.items[0],
          catalog_item_id: null,
          pin: "never-export-line-pin",
        },
      ],
    };
    const backup = createCompanyBackup(company, [], [], [archivedQuote]);
    expect(backup.version).toBe(3);
    expect(backup.counts).toEqual({
      operations: 0,
      payments: 0,
      customers: 0,
      catalog_items: 0,
      quotes: 1,
    });
    expect(backup.quotes[0].customer_name).toBe(customer.name);
    expect(backup.quotes[0].items[0].name).toBe(catalogItem.name);
    expect(JSON.stringify(backup)).not.toContain(archivedQuote.secret);
    expect(JSON.stringify(backup)).not.toContain(archivedQuote.items[0].pin);
    expect(JSON.stringify(backup)).not.toContain(company.owner_id);
  });
});
