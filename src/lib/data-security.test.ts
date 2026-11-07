import { describe, expect, it } from "vitest";
import type { Company, Customer } from "../types";
import { createCompanyBackup, csvCell, customersToCsv } from "./exports";
import {
  normalizeCompanyName,
  normalizeCustomer,
  validatePassword,
} from "./validation";
import { readSupabaseConfig } from "./supabase-config";

const company: Company = {
  id: "company-a",
  owner_id: "private-auth-identity",
  name: "Empresa A",
  created_at: "2026-11-03T12:00:00Z",
  updated_at: "2026-11-03T12:00:00Z",
};
const customer: Customer = {
  id: "customer-a",
  company_id: company.id,
  name: "Ana Silva",
  email: "ana@example.com",
  phone: "+55 11 99999-0000",
  document: null,
  notes: 'Observação; com "aspas"\ne quebra de linha',
  active: true,
  created_at: "2026-11-03T12:00:00Z",
  updated_at: "2026-11-03T12:00:00Z",
};

describe("customer input boundary", () => {
  it("trims fields, stores blank optional values as null and preserves an inactive customer", () => {
    expect(
      normalizeCustomer({
        name: "  Ana Silva ",
        email: " ana@example.com ",
        phone: "   ",
        notes: "",
        active: false,
      }),
    ).toEqual({
      name: "Ana Silva",
      email: "ana@example.com",
      phone: null,
      document: null,
      notes: null,
      active: false,
    });
  });

  it.each([
    { name: "  " },
    { name: "A".repeat(161) },
    { name: "Ana", email: "sem-endereco" },
    { name: "Ana", phone: "1".repeat(41) },
    { name: "Ana", notes: "x".repeat(4001) },
  ])(
    "rejects invalid fields before sending a customer to the database: %o",
    (input) => {
      expect(() => normalizeCustomer(input)).toThrow();
    },
  );

  it("enforces company length and the approved password minimum without trimming a password", () => {
    expect(normalizeCompanyName("  Empresa A  ")).toBe("Empresa A");
    expect(() => normalizeCompanyName("X")).toThrow();
    expect(() => normalizeCompanyName("X".repeat(121))).toThrow();
    expect(() => validatePassword("123456789")).toThrow();
    expect(() => validatePassword(" 12345678 ")).not.toThrow();
  });
});

describe("spreadsheet export safety", () => {
  it.each([
    '=HYPERLINK("https://example.com")',
    "+1+1",
    "-1+1",
    "@SUM(1,2)",
    "  =1+1",
    "\t=1+1",
    "\ntexto",
  ])("neutralizes a potentially interpreted spreadsheet cell %j", (text) => {
    expect(csvCell(text).startsWith("\"'")).toBe(true);
  });

  it("escapes embedded quotes and preserves semicolons and line breaks inside quoted cells", () => {
    expect(csvCell('Nome; "Teste"\nsegunda linha')).toBe(
      '"Nome; ""Teste""\nsegunda linha"',
    );
    const output = customersToCsv([customer]);
    expect(output.startsWith('\uFEFF"Nome";')).toBe(true);
    expect(output).toContain('"\'+55 11 99999-0000"');
    expect(output).toContain('"Observação; com ""aspas""\ne quebra de linha"');
    expect(output.endsWith("\r\n")).toBe(true);
  });
});

describe("company data export scope", () => {
  it("rejects customers from a second company instead of leaking them into the file", () => {
    expect(() =>
      createCompanyBackup(
        company,
        [{ ...customer, company_id: "company-b" }],
        [],
        [],
      ),
    ).toThrow(/outra empresa/);
  });

  it("includes all supplied customers and excludes authentication identities and unknown privileged properties", () => {
    const source = {
      ...company,
      password: "never-export-password",
      pin: "never-export-pin",
    };
    const backup = createCompanyBackup(
      source,
      [customer, { ...customer, id: "customer-b" }],
      [],
      [],
    );
    const json = JSON.stringify(backup);
    expect(backup.version).toBe(3);
    expect(backup.scope).toEqual([
      "company",
      "customers",
      "catalog_items",
      "quotes",
      "operations",
      "payments",
    ]);
    expect(backup.counts.customers).toBe(2);
    expect(backup.customers).toHaveLength(2);
    expect(json).not.toContain(source.owner_id);
    expect(json).not.toContain(source.password);
    expect(json).not.toContain(source.pin);
  });
});

describe("browser Supabase configuration", () => {
  const jwt = (role: string) =>
    `header.${btoa(JSON.stringify({ role }))}.signature`;

  it("accepts public keys and a local development URL", () => {
    expect(
      readSupabaseConfig(
        "https://example.supabase.co/",
        "sb_publishable_public-example",
      ),
    ).toEqual({
      url: "https://example.supabase.co",
      key: "sb_publishable_public-example",
      error: null,
    });
    expect(
      readSupabaseConfig("http://localhost:54321", jwt("anon")).error,
    ).toBeNull();
  });

  it.each([
    "sb_secret_never-public",
    jwt("service_role"),
    jwt("authenticated"),
    "not-a-public-key",
  ])("rejects privileged or malformed browser keys: %s", (key) => {
    const result = readSupabaseConfig("https://example.supabase.co", key);
    expect(result.error).not.toBeNull();
    expect(result.key).toBeNull();
    expect(result.error).not.toContain(key);
  });

  it.each([
    "http://example.supabase.co",
    "https://example.supabase.co/rest/v1",
    "https://user:password@example.supabase.co",
  ])("rejects unsafe project URL shapes: %s", (url) => {
    expect(
      readSupabaseConfig(url, "sb_publishable_example").error,
    ).not.toBeNull();
  });

  it("reports missing configuration without creating a fake authenticated backend", () => {
    expect(readSupabaseConfig(undefined, undefined).error).toMatch(/Configure/);
  });
});
