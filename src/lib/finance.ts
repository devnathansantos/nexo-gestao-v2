import { supabase, supabaseConfigurationError } from "./supabase";
import { requireOnline } from "./errors";
import type { Json } from "../types";
import type { Operation, Payment, OperationDetail } from "../finance-types";

const numberFormat = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});
const dayFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });
export const paymentMethods = {
  pix: "PIX",
  cash: "Dinheiro",
  debit: "Cartão de débito",
  credit: "Cartão de crédito",
  transfer: "Transferência",
  boleto: "Boleto",
  other: "Outro",
} as const;
export function financeMoney(value: string | number | bigint) {
  const n = BigInt(value);
  const abs = n < 0n ? -n : n;
  return `${n < 0n ? "-" : ""}R$\u00a0${numberFormat.format(abs / 100n)},${String(abs % 100n).padStart(2, "0")}`;
}
export function todayBR() {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return `${p.find((x) => x.type === "year")!.value}-${p.find((x) => x.type === "month")!.value}-${p.find((x) => x.type === "day")!.value}`;
}
export const financeDate = (day: string) =>
  dayFormat.format(new Date(`${day}T12:00:00`));
export function financeClient() {
  requireOnline();
  if (!supabase)
    throw new Error(
      supabaseConfigurationError || "Configure a conexão da empresa.",
    );
  return supabase;
}
export function financeError(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error ? error.code : null;
  if (code === "42501")
    return "Sua sessão não permite acessar este registro. Entre novamente na empresa.";
  if (code === "22023" || code === "55000")
    return error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "Confira os valores e a situação do registro.";
  if (
    code === "23514" ||
    code === "23502" ||
    code === "22007" ||
    code === "22008" ||
    code === "22P02"
  )
    return "Confira datas, valores e campos obrigatórios.";
  if (error instanceof Error) return error.message;
  return "Não foi possível concluir. Confira a conexão e tente novamente.";
}
export async function financeCommand(
  companyId: string,
  action: string,
  payload: Record<string, Json | undefined>,
) {
  const { data, error } = await financeClient().rpc("nexo_finance_command", {
    p_action: action,
    p_payload: payload,
  });
  if (error) throw new Error(financeError(error));
  if (!data || data.company_id !== companyId)
    throw new Error(
      "A empresa em uso mudou. Confira a operação na conta de origem.",
    );
  return data;
}
export function assertFinanceExport(
  companyId: string,
  operations: readonly Operation[],
  payments: readonly Payment[],
) {
  if (!Array.isArray(operations) || !Array.isArray(payments))
    throw new Error(
      "Dados financeiros ausentes. Atualize o banco antes de exportar.",
    );
  const ids = new Set(operations.map((x) => x.id));
  if (
    ids.size !== operations.length ||
    new Set(payments.map((x) => x.id)).size !== payments.length
  )
    throw new Error("Registros financeiros duplicados.");
  for (const o of operations)
    if (
      o.company_id !== companyId ||
      !Number.isSafeInteger(o.amount_cents) ||
      o.amount_cents < 0 ||
      (o.quote_snapshot && o.quote_snapshot.company_id !== companyId)
    )
      throw new Error("Dados financeiros incompatíveis com esta empresa.");
  for (const p of payments)
    if (
      p.company_id !== companyId ||
      !ids.has(p.operation_id) ||
      !Number.isSafeInteger(p.amount_cents) ||
      p.amount_cents <= 0
    )
      throw new Error("Pagamento incompatível com os lançamentos da empresa.");
}
export function validDetail(
  companyId: string,
  data: OperationDetail | null,
): OperationDetail {
  if (
    !data ||
    data.company_id !== companyId ||
    !Array.isArray(data.payments) ||
    data.payments.some(
      (p) => p.company_id !== companyId || p.operation_id !== data.id,
    )
  )
    throw new Error("Lançamento indisponível para esta empresa.");
  return data;
}
