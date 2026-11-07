import type {
  Operation,
  Payment,
  FinancePage,
  OperationDetail,
  ReturnPage,
} from "./finance-types";
export type Company = {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type Customer = {
  id: string;
  company_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  document: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type CustomerInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
  document?: string | null;
  notes?: string | null;
  active?: boolean;
};

export type CustomerFields = {
  name: string;
  email: string | null;
  phone: string | null;
  document: string | null;
  notes: string | null;
  active: boolean;
};

export type CatalogKind = "product" | "service";
export type CatalogInput = {
  kind: CatalogKind;
  name: string;
  description: string | null;
  unit: string;
  price_cents: number;
  active: boolean;
};
export type CatalogItem = CatalogInput & {
  id: string;
  company_id: string;
  created_at: string;
  updated_at: string;
};

export type QuoteStatus = "draft" | "sent" | "approved" | "declined";
export type QuoteLineInput = {
  catalog_item_id?: string | null;
  name: string;
  unit: string;
  quantity_milli: number;
  unit_price_cents: number;
};
export type QuoteItem = {
  id: string;
  quote_id: string;
  catalog_item_id: string | null;
  name: string;
  unit: string;
  quantity_milli: number;
  unit_price_cents: number;
  line_total_cents: number;
  position: number;
};
export type QuoteInput = {
  id?: string;
  request_id?: string;
  customer_id: string | null;
  title: string;
  valid_until?: string | null;
  notes?: string | null;
  payment_terms?: string | null;
  discount_cents: number;
  expected_updated_at?: string;
  items: QuoteLineInput[];
};
export type Quote = {
  id: string;
  request_id: string;
  company_id: string;
  number: number;
  customer_id: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_document: string | null;
  company_name: string;
  title: string;
  valid_until: string | null;
  notes: string | null;
  payment_terms: string | null;
  status: QuoteStatus;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  created_at: string;
  updated_at: string;
  items: QuoteItem[];
};
export type CompanyExport = {
  operations: Operation[];
  payments: Payment[];
  company: Company;
  customers: Customer[];
  catalog_items: CatalogItem[];
  quotes: Quote[];
};
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Mirrors the initial migration. Authentication identities stay in auth.users. */
export type Database = {
  public: {
    Tables: {
      companies: {
        Row: Company;
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: { name?: string };
        Relationships: [];
      };
      customers: {
        Row: Customer;
        Insert: CustomerFields & {
          id?: string;
          company_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<CustomerFields>;
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      catalog_items: {
        Row: CatalogItem;
        Insert: CatalogInput & {
          company_id: string;
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<CatalogInput>;
        Relationships: [
          {
            foreignKeyName: "catalog_items_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      quotes: {
        Row: Omit<Quote, "items">;
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "quotes_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      quote_items: {
        Row: QuoteItem;
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey";
            columns: ["quote_id"];
            isOneToOne: false;
            referencedRelation: "quotes";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: {
      nexo_finance_command: {
        Args: { p_action: string; p_payload: Json };
        Returns: Operation | Payment;
      };
      nexo_finance_page: {
        Args: {
          p_month: string;
          p_kind?: string;
          p_query?: string;
          p_offset?: number;
        };
        Returns: FinancePage;
      };
      nexo_operation_detail: {
        Args: { p_id: string };
        Returns: OperationDetail | null;
      };
      nexo_customer_return: {
        Args: { p_days?: number; p_offset?: number; p_query?: string };
        Returns: ReturnPage;
      };

      nexo_export_company_data: {
        Args: Record<never, never>;
        Returns: CompanyExport | null;
      };
      nexo_save_quote: {
        Args: { p_payload: Json };
        Returns: Quote;
      };
      nexo_set_quote_status: {
        Args: {
          p_quote_id: string;
          p_status: QuoteStatus;
          p_expected_updated_at: string;
        };
        Returns: Quote;
      };
      nexo_delete_quote: {
        Args: { p_quote_id: string; p_expected_updated_at: string };
        Returns: null;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
