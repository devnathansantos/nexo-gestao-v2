import type { Quote } from "./types";
export type Operation = {
  id: string;
  company_id: string;
  request_id: string;
  kind: "sale" | "expense";
  quote_id: string | null;
  customer_id: string | null;
  counterparty: string;
  description: string;
  category: string;
  occurred_on: string;
  due_on: string;
  amount_cents: number;
  notes: string;
  quote_snapshot: Quote | null;
  created_at: string;
  created_by: string;
  voided_at: string | null;
  void_reason: string | null;
};
export type PaymentMethod =
  | "pix"
  | "cash"
  | "debit"
  | "credit"
  | "transfer"
  | "boleto"
  | "other";
export type Payment = {
  id: string;
  company_id: string;
  operation_id: string;
  request_id: string;
  amount_cents: number;
  paid_on: string;
  method: PaymentMethod;
  reference: string;
  created_at: string;
  created_by: string;
  voided_at: string | null;
  void_reason: string | null;
};
export type FinanceRow = Operation & { paid_cents: number };
export type OperationDetail = Operation & { payments: Payment[] };
export type FinanceSummary = {
  sales_cents: string;
  expenses_cents: string;
  received_cents: string;
  paid_cents: string;
  receivable_cents: string;
  payable_cents: string;
  overdue_cents: string;
  sale_count: number;
  categories: { category: string; amount_cents: string }[];
};
export type FinancePage = {
  company_id: string | null;
  total: number;
  rows: FinanceRow[];
  summary: FinanceSummary;
};
export type ReturnCustomer = {
  id: string;
  company_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  last_sale_on: string | null;
  sale_count: number;
};
export type ReturnPage = {
  company_id: string | null;
  total: number;
  rows: ReturnCustomer[];
};
