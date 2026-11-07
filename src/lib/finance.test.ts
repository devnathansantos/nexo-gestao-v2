import { describe, expect, it } from "vitest";
import { assertFinanceExport, financeMoney } from "./finance";
import { financialCsv } from "./exports";
import type { CompanyExport } from "../types";
import type { Operation, Payment } from "../finance-types";
const operation: Operation = {
  id: "o",
  company_id: "a",
  request_id: "r",
  kind: "sale",
  quote_id: null,
  customer_id: null,
  counterparty: "Cliente",
  description: '=HYPERLINK("x")',
  category: "Serviços",
  occurred_on: "2025-12-31",
  due_on: "2026-01-10",
  amount_cents: 10001,
  notes: "",
  quote_snapshot: null,
  created_at: "2026-01-01",
  created_by: "u",
  voided_at: null,
  void_reason: null,
};
const payment: Payment = {
  id: "p",
  operation_id: "o",
  company_id: "a",
  request_id: "p1",
  amount_cents: 4000,
  paid_on: "2026-01-10",
  method: "pix",
  reference: "@soma",
  created_at: "2026-01-10",
  created_by: "u",
  voided_at: null,
  void_reason: null,
};
const snapshot = {
  company: { id: "a" },
  customers: [],
  catalog_items: [],
  quotes: [],
  operations: [operation],
  payments: [payment],
} as unknown as CompanyExport;
describe("Financial accuracy and exports", () => {
  it("formats aggregates beyond JS safe integers exactly", () =>
    expect(financeMoney("900719925474099101")).toBe(
      "R$\u00a09.007.199.254.740.991,01",
    ));
  it("formats negative cash movement without rounding drift", () =>
    expect(financeMoney(-1)).toBe("-R$\u00a00,01"));
  it("keeps operation and payment in their respective years", () => {
    expect(financialCsv(snapshot, "2026", "operations")).not.toContain(
      "HYPERLINK",
    );
    expect(financialCsv(snapshot, "2025", "operations")).toContain("100,01");
    expect(financialCsv(snapshot, "2026", "payments")).toContain("40,00");
    expect(financialCsv(snapshot, "2025", "payments")).not.toContain("40,00");
  });
  it("protects spreadsheet cells and records direction", () => {
    const csv = financialCsv(snapshot, "2026", "payments");
    expect(csv).toContain('"Entrada"');
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'@soma");
  });
  it("retains explicitly identified corrections in reports", () => {
    const csv = financialCsv(
      {
        ...snapshot,
        payments: [
          { ...payment, voided_at: "2026-02-01", void_reason: "Duplicado" },
        ],
      },
      "2026",
      "payments",
    );
    expect(csv).toContain("Duplicado");
    expect(csv).toContain('"0,00";"40,00"');
    expect(csv).toContain("2026-02-01");
  });
  it("rejects a financial record from another company", () =>
    expect(() =>
      assertFinanceExport("a", [{ ...operation, company_id: "b" }], []),
    ).toThrow(/empresa/));
  it("rejects payment links outside the snapshot", () =>
    expect(() =>
      assertFinanceExport(
        "a",
        [operation],
        [{ ...payment, operation_id: "other" }],
      ),
    ).toThrow(/Pagamento/));
  it("rejects duplicate payment records", () =>
    expect(() =>
      assertFinanceExport("a", [operation], [payment, payment]),
    ).toThrow(/duplicados/));
  it("rejects amounts already rounded by JSON parsing", () =>
    expect(() =>
      assertFinanceExport(
        "a",
        [{ ...operation, amount_cents: Number.MAX_SAFE_INTEGER + 1 }],
        [],
      ),
    ).toThrow(/empresa/));
  it("requires financial arrays rather than silently omitting records", () =>
    expect(() =>
      assertFinanceExport("a", undefined as unknown as Operation[], []),
    ).toThrow(/ausentes/));
});
