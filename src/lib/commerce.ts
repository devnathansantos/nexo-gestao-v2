import type {
  CatalogInput,
  QuoteInput,
  QuoteLineInput,
  QuoteStatus,
} from "../types";
import { friendlyError } from "./errors";

export const MAX_UNIT_PRICE_CENTS = 1_000_000_000;
export const MAX_QUANTITY_MILLI = 1_000_000_000;
export const MAX_QUOTE_CENTS = 1_000_000_000_000;
export const MAX_QUOTE_ITEMS = 100;

export const quoteStatusLabels: Record<QuoteStatus, string> = {
  draft: "Rascunho",
  sent: "Enviado",
  approved: "Aprovado",
  declined: "Recusado",
};

export function commerceError(error: unknown, fallback: string): string {
  const code =
    error && typeof error === "object" && "code" in error ? error.code : null;
  if (code === "40001")
    return "Este orçamento foi alterado em outra sessão. Atualize a lista e confira a versão atual antes de tentar novamente.";
  if (code === "55000")
    return "Esta operação não está disponível para a situação atual do orçamento. Atualize a lista e confira o andamento.";
  if (code === "22023" || code === "22003")
    return "Confira os campos e os valores informados. O servidor recusou um dado fora das regras do orçamento.";
  return friendlyError(error, fallback);
}

function integer(
  value: number,
  label: string,
  min: number,
  max: number,
): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(
      `${label} deve estar entre ${min.toLocaleString("pt-BR")} e ${max.toLocaleString("pt-BR")}, em unidades inteiras.`,
    );
  }
  return value;
}

function text(value: string, label: string, min: number, max: number): string {
  if (typeof value !== "string") throw new Error(`${label} é inválido.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new Error(`${label} deve ter entre ${min} e ${max} caracteres.`);
  }
  return normalized;
}

function optionalText(
  value: string | null | undefined,
  label: string,
  max: number,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error(`${label} é inválido.`);
  const normalized = value.trim();
  if (normalized.length > max)
    throw new Error(`${label} deve ter no máximo ${max} caracteres.`);
  return normalized || null;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
function uuid(value: string, label: string): string {
  if (typeof value !== "string" || !uuidPattern.test(value))
    throw new Error(`${label} é inválido.`);
  return value;
}

function parseDecimal(
  value: string,
  decimals: number,
  min: number,
  max: number,
  label: string,
): number {
  if (typeof value !== "string")
    throw new Error(`Informe ${label.toLowerCase()} em formato decimal.`);
  const normalized = value.trim();
  const pattern =
    decimals === 2 ? /^\d+(?:[.,]\d{1,2})?$/u : /^\d+(?:[.,]\d{1,3})?$/u;
  if (normalized.length > 64 || !pattern.test(normalized)) {
    throw new Error(
      `${label} inválido. Use apenas números e até ${decimals} casas decimais, sem separador de milhar.`,
    );
  }
  const [whole, fraction = ""] = normalized.split(/[.,]/u);
  const scale = 10n ** BigInt(decimals);
  const result = BigInt(whole) * scale + BigInt(fraction.padEnd(decimals, "0"));
  if (result < BigInt(min) || result > BigInt(max))
    throw new Error(`${label} fora do limite permitido.`);
  return Number(result);
}

/** Decimal input is converted without binary floating-point arithmetic. */
export function parseMoney(value: string): number {
  return parseDecimal(value, 2, 0, MAX_QUOTE_CENTS, "Valor");
}

export function parseQuantity(value: string): number {
  return parseDecimal(value, 3, 1, MAX_QUANTITY_MILLI, "Quantidade");
}

const wholeNumberFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});

export function formatMoney(cents: number): string {
  if (!Number.isSafeInteger(cents))
    throw new Error("O valor monetário deve ser um inteiro em centavos.");
  const amount = BigInt(cents);
  const absolute = amount < 0n ? -amount : amount;
  const whole = wholeNumberFormatter.format(absolute / 100n);
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${amount < 0n ? "-" : ""}R$\u00a0${whole},${fraction}`;
}

export function formatQuantity(milli: number): string {
  integer(milli, "A quantidade", 1, MAX_QUANTITY_MILLI);
  const value = BigInt(milli);
  const fraction = (value % 1000n)
    .toString()
    .padStart(3, "0")
    .replace(/0+$/u, "");
  return `${value / 1000n}${fraction ? `,${fraction}` : ""}`;
}

export function calculateQuoteTotals(
  items: readonly Pick<QuoteLineInput, "quantity_milli" | "unit_price_cents">[],
  discountCents: number,
): {
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  line_totals: number[];
} {
  if (
    !Array.isArray(items) ||
    items.length < 1 ||
    items.length > MAX_QUOTE_ITEMS
  ) {
    throw new Error(
      `O orçamento precisa ter entre 1 e ${MAX_QUOTE_ITEMS} itens.`,
    );
  }
  integer(discountCents, "O desconto em centavos", 0, MAX_QUOTE_CENTS);
  let subtotal = 0n;
  const line_totals = items.map((item) => {
    integer(
      item.quantity_milli,
      "A quantidade em milésimos",
      1,
      MAX_QUANTITY_MILLI,
    );
    integer(
      item.unit_price_cents,
      "O preço em centavos",
      0,
      MAX_UNIT_PRICE_CENTS,
    );
    const line =
      (BigInt(item.quantity_milli) * BigInt(item.unit_price_cents) + 500n) /
      1000n;
    subtotal += line;
    if (line > BigInt(MAX_QUOTE_CENTS) || subtotal > BigInt(MAX_QUOTE_CENTS)) {
      throw new Error("O total do orçamento excede o limite permitido.");
    }
    return Number(line);
  });
  if (BigInt(discountCents) > subtotal)
    throw new Error("O desconto não pode ser maior que o subtotal.");
  return {
    subtotal_cents: Number(subtotal),
    discount_cents: discountCents,
    total_cents: Number(subtotal - BigInt(discountCents)),
    line_totals,
  };
}

export function normalizeCatalogInput(input: CatalogInput): CatalogInput {
  if (input.kind !== "product" && input.kind !== "service")
    throw new Error("Escolha produto ou serviço.");
  if (typeof input.active !== "boolean")
    throw new Error("A situação do item é inválida.");
  return {
    kind: input.kind,
    name: text(input.name, "O nome do item", 2, 160),
    description: optionalText(input.description, "A descrição", 4000),
    unit: text(input.unit, "A unidade", 1, 20),
    price_cents: integer(
      input.price_cents,
      "O preço em centavos",
      0,
      MAX_UNIT_PRICE_CENTS,
    ),
    active: input.active,
  };
}

function dateOnly(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
    value.startsWith("0000")
  )
    throw new Error("A validade deve ser uma data válida.");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw new Error("A validade deve ser uma data válida.");
  return value;
}

export function normalizeQuoteInput(input: QuoteInput): QuoteInput {
  const id = input.id === undefined ? undefined : uuid(input.id, "O orçamento");
  const requestId =
    input.request_id === undefined
      ? undefined
      : uuid(input.request_id, "A identificação da operação");
  let expectedUpdatedAt: string | undefined;
  if (id) {
    if (
      typeof input.expected_updated_at !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T/u.test(input.expected_updated_at) ||
      !Number.isFinite(Date.parse(input.expected_updated_at))
    ) {
      throw new Error(
        "Atualize o orçamento antes de editar. A versão carregada é inválida.",
      );
    }
    expectedUpdatedAt = input.expected_updated_at;
  } else if (input.expected_updated_at !== undefined) {
    throw new Error("Um orçamento novo não deve informar uma versão anterior.");
  }
  const customerId =
    input.customer_id === null && id
      ? null
      : uuid(input.customer_id as string, "O cliente");
  if (
    !Array.isArray(input.items) ||
    input.items.length < 1 ||
    input.items.length > MAX_QUOTE_ITEMS
  )
    throw new Error(`Inclua entre 1 e ${MAX_QUOTE_ITEMS} itens no orçamento.`);
  const items = input.items.map((item) => ({
    catalog_item_id:
      item.catalog_item_id === undefined || item.catalog_item_id === null
        ? null
        : uuid(item.catalog_item_id, "O item do catálogo"),
    name: text(item.name, "O nome do item", 2, 160),
    unit: text(item.unit, "A unidade", 1, 20),
    quantity_milli: item.quantity_milli,
    unit_price_cents: item.unit_price_cents,
  }));
  calculateQuoteTotals(items, input.discount_cents);
  return {
    ...(id ? { id, expected_updated_at: expectedUpdatedAt } : {}),
    ...(requestId ? { request_id: requestId } : {}),
    customer_id: customerId,
    title: text(input.title, "O título", 2, 160),
    valid_until: dateOnly(input.valid_until),
    notes: optionalText(input.notes, "As observações", 4000),
    payment_terms: optionalText(
      input.payment_terms,
      "As condições de pagamento",
      4000,
    ),
    discount_cents: input.discount_cents,
    items,
  };
}
