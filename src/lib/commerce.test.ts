import { describe, expect, it } from "vitest";
import type { CatalogInput, QuoteInput } from "../types";
import {
  calculateQuoteTotals,
  commerceError,
  formatMoney,
  formatQuantity,
  normalizeCatalogInput,
  normalizeQuoteInput,
  parseMoney,
  parseQuantity,
} from "./commerce";

const customerId = "11111111-1111-4111-8111-111111111111";
const quoteId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const catalogInput: CatalogInput = {
  kind: "service",
  name: "Consultoria",
  description: null,
  unit: "hora",
  price_cents: 1234,
  active: true,
};
const quoteInput: QuoteInput = {
  customer_id: customerId,
  title: "Proposta comercial",
  discount_cents: 0,
  items: [
    {
      name: "Consultoria",
      unit: "hora",
      quantity_milli: 1000,
      unit_price_cents: 1234,
    },
  ],
};

describe("decimal input without floating-point conversions", () => {
  it.each([
    ["12,34", 1234],
    ["12.34", 1234],
    ["12,3", 1230],
    ["0", 0],
    [" 00012 ", 1200],
    ["10000000000,00", 1_000_000_000_000],
  ] as const)("parses %s to %i cents", (text, cents) => {
    expect(parseMoney(text)).toBe(cents);
  });
  it.each([
    "",
    "1.000",
    "1.234,56",
    "1,234.56",
    "R$ 12,00",
    "-1",
    "+1",
    "NaN",
    "Infinity",
    "1e3",
    ".50",
    "12.",
    "12 34",
    "10000000000.01",
  ])("rejects invalid or ambiguous monetary input %j", (value) => {
    expect(() => parseMoney(value)).toThrow();
  });
  it.each([
    ["1,5", 1500],
    ["1.5", 1500],
    ["0.001", 1],
    ["1", 1000],
    ["1000000,000", 1_000_000_000],
  ] as const)("parses quantity %s to %i thousandths", (text, milli) => {
    expect(parseQuantity(text)).toBe(milli);
    expect(parseQuantity(formatQuantity(milli))).toBe(milli);
  });
  it.each(["0", "-1", "0.0001", "1,234.567", "1e3", "1000000,001", "NaN"])(
    "rejects invalid quantity %j",
    (value) => {
      expect(() => parseQuantity(value)).toThrow();
    },
  );
  it("formats exact cents and quantities including limits without fractional arithmetic", () => {
    expect(formatMoney(1)).toBe("R$\u00a00,01");
    expect(formatMoney(1_000_000_000_000)).toBe("R$\u00a010.000.000.000,00");
    expect(formatMoney(-1234)).toBe("-R$\u00a012,34");
    expect(formatQuantity(1500)).toBe("1,5");
    expect(formatQuantity(1001)).toBe("1,001");
    expect(() => formatMoney(1.5)).toThrow();
  });
});

describe("quote totals match the server's integer half-up rounding per line", () => {
  it("rounds half a cent upward and smaller fractions downward", () => {
    const result = calculateQuoteTotals(
      [
        { quantity_milli: 1, unit_price_cents: 499 },
        { quantity_milli: 1, unit_price_cents: 500 },
        { quantity_milli: 1500, unit_price_cents: 101 },
      ],
      3,
    );
    expect(result).toEqual({
      subtotal_cents: 153,
      discount_cents: 3,
      total_cents: 150,
      line_totals: [0, 1, 152],
    });
  });
  it("sums individually rounded lines instead of rounding an aggregated product", () => {
    expect(
      calculateQuoteTotals(
        [
          { quantity_milli: 500, unit_price_cents: 1 },
          { quantity_milli: 500, unit_price_cents: 1 },
        ],
        0,
      ).subtotal_cents,
    ).toBe(2);
  });
  it("allows a zero-cost quote and a discount equal to its subtotal", () => {
    expect(
      calculateQuoteTotals([{ quantity_milli: 1000, unit_price_cents: 0 }], 0)
        .total_cents,
    ).toBe(0);
    expect(calculateQuoteTotals(quoteInput.items, 1234).total_cents).toBe(0);
  });
  it("accepts the total boundary and rejects arithmetic overflow and excessive discounts", () => {
    const atLimit = [
      { quantity_milli: 1_000_000, unit_price_cents: 1_000_000_000 },
    ];
    expect(calculateQuoteTotals(atLimit, 0).total_cents).toBe(
      1_000_000_000_000,
    );
    expect(() => calculateQuoteTotals([...atLimit, ...atLimit], 0)).toThrow(
      /limite/,
    );
    expect(() =>
      calculateQuoteTotals(
        [{ quantity_milli: 1_000_000_000, unit_price_cents: 1_000_000_000 }],
        0,
      ),
    ).toThrow(/limite/);
    expect(() => calculateQuoteTotals(quoteInput.items, 1235)).toThrow(
      /desconto/,
    );
  });
  it("enforces item count and safe integer quantities and prices", () => {
    expect(() => calculateQuoteTotals([], 0)).toThrow();
    expect(() =>
      calculateQuoteTotals(
        Array.from({ length: 101 }, () => quoteInput.items[0]),
        0,
      ),
    ).toThrow();
    for (const value of [-1, 0, 1.5, NaN, Infinity, 1_000_000_001]) {
      expect(() =>
        calculateQuoteTotals(
          [{ quantity_milli: value, unit_price_cents: 1 }],
          0,
        ),
      ).toThrow();
    }
    for (const value of [-1, 1.5, NaN, Infinity, 1_000_000_001]) {
      expect(() =>
        calculateQuoteTotals(
          [{ quantity_milli: 1000, unit_price_cents: value }],
          0,
        ),
      ).toThrow();
    }
  });
});

describe("catalog and quote payload boundaries", () => {
  it("normalizes catalog fields without copying privileged or unrelated fields", () => {
    expect(
      normalizeCatalogInput({
        ...catalogInput,
        name: "  Consultoria  ",
        unit: " hora ",
        description: "  ",
      }),
    ).toEqual(catalogInput);
    expect(
      normalizeCatalogInput({
        ...catalogInput,
        company_id: "another-company",
      } as CatalogInput),
    ).not.toHaveProperty("company_id");
    expect(() =>
      normalizeCatalogInput({
        ...catalogInput,
        kind: "other",
      } as unknown as CatalogInput),
    ).toThrow();
    expect(() =>
      normalizeCatalogInput({ ...catalogInput, unit: "x".repeat(21) }),
    ).toThrow();
    expect(() =>
      normalizeCatalogInput({ ...catalogInput, price_cents: 1_000_000_001 }),
    ).toThrow();
  });
  it("keeps the stable creation request id but ignores supplied customer snapshots", () => {
    const input = {
      ...quoteInput,
      request_id: requestId,
      customer_name: "Injected name",
      company_name: "Injected company",
    };
    const normalized = normalizeQuoteInput(input);
    expect(normalized.request_id).toBe(requestId);
    expect(normalized.items[0].catalog_item_id).toBeNull();
    expect(normalized).not.toHaveProperty("customer_name");
    expect(normalized).not.toHaveProperty("company_name");
    expect(() =>
      normalizeQuoteInput({ ...quoteInput, request_id: "invalid" }),
    ).toThrow();
  });
  it("requires a selected customer for a new quote and an optimistic version for edits", () => {
    expect(() =>
      normalizeQuoteInput({ ...quoteInput, customer_id: null }),
    ).toThrow();
    expect(() => normalizeQuoteInput({ ...quoteInput, id: quoteId })).toThrow(
      /versão/,
    );
    expect(() =>
      normalizeQuoteInput({
        ...quoteInput,
        expected_updated_at: "2026-11-04T00:00:00Z",
      }),
    ).toThrow(/novo/);
    const expected_updated_at = "2026-11-04T00:00:00.123456+00:00";
    const edit = normalizeQuoteInput({
      ...quoteInput,
      id: quoteId,
      expected_updated_at,
      customer_id: null,
    });
    expect(edit.customer_id).toBeNull();
    expect(edit.expected_updated_at).toBe(expected_updated_at);
    expect(() =>
      normalizeQuoteInput({
        ...quoteInput,
        id: quoteId,
        expected_updated_at,
        customer_id: "",
      }),
    ).toThrow();
  });
  it("rejects impossible dates and oversized text fields", () => {
    expect(
      normalizeQuoteInput({ ...quoteInput, valid_until: "2024-02-29" })
        .valid_until,
    ).toBe("2024-02-29");
    for (const valid_until of [
      "2025-02-29",
      "2026-04-31",
      "0000-01-01",
      "2026-13-01",
      "2026-01-01T00:00:00Z",
    ]) {
      expect(() => normalizeQuoteInput({ ...quoteInput, valid_until })).toThrow(
        /data/,
      );
    }
    expect(() =>
      normalizeQuoteInput({ ...quoteInput, notes: "x".repeat(4001) }),
    ).toThrow();
    expect(() => normalizeQuoteInput({ ...quoteInput, title: " " })).toThrow();
  });
  it("explains concurrency conflicts and forbidden quote transitions", () => {
    expect(commerceError({ code: "40001" }, "fallback")).toMatch(
      /outra sessão/,
    );
    expect(commerceError({ code: "55000" }, "fallback")).toMatch(/situação/);
    expect(commerceError({ code: "42501" }, "fallback")).toMatch(/permissão/);
  });
});
