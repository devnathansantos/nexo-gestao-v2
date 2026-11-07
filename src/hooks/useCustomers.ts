import { useCallback, useEffect, useRef, useState } from "react";
import type { Customer, CustomerInput } from "../types";
import { supabase, supabaseConfigurationError } from "../lib/supabase";
import { normalizeCustomer } from "../lib/validation";
import { friendlyError, requireOnline } from "../lib/errors";

type CustomerState = {
  companyId: string | null;
  customers: Customer[];
  loading: boolean;
  error: string | null;
};

function requireScope(companyId: string | null | undefined) {
  if (!supabase)
    throw new Error(
      supabaseConfigurationError || "O Supabase ainda não está configurado.",
    );
  if (!companyId)
    throw new Error(
      "Entre na conta da empresa antes de acessar seus clientes.",
    );
  requireOnline();
  return { client: supabase, companyId };
}

export function useCustomers(companyId: string | null | undefined) {
  const scope = companyId || null;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const epoch = useRef(0);
  const pendingRead = useRef<AbortController | null>(null);
  const alive = useRef(false);
  const [state, setState] = useState<CustomerState>({
    companyId: scope,
    customers: [],
    loading: Boolean(scope),
    error: null,
  });

  const reload = useCallback(async (): Promise<Customer[]> => {
    const version = ++epoch.current;
    pendingRead.current?.abort();
    const controller = new AbortController();
    pendingRead.current = controller;
    if (!scope) {
      setState({ companyId: null, customers: [], loading: false, error: null });
      throw new Error(
        "Entre na conta da empresa antes de acessar seus clientes.",
      );
    }
    setState((previous) => ({
      companyId: scope,
      customers: previous.companyId === scope ? previous.customers : [],
      loading: true,
      error: null,
    }));
    try {
      const { client } = requireScope(scope);
      const rows: Customer[] = [];
      const pageSize = 500;
      let expectedCount: number | null | undefined;
      // Supabase limits individual responses. Paginate so exports are not silently truncated.
      for (let offset = 0; ; ) {
        const {
          data,
          count,
          error: queryError,
        } = await client
          .from("customers")
          .select("*", { count: "exact" })
          .eq("company_id", scope)
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(offset, offset + pageSize - 1)
          .abortSignal(controller.signal);
        if (queryError) throw queryError;
        if (
          !alive.current ||
          epoch.current !== version ||
          scopeRef.current !== scope
        ) {
          throw new Error(
            "A consulta foi interrompida porque a sessão ou a empresa mudou. Tente novamente.",
          );
        }
        if (expectedCount === undefined) expectedCount = count;
        if (
          count !== expectedCount ||
          data.some((customer) => customer.company_id !== scope)
        ) {
          throw new Error(
            "A lista de clientes mudou durante a leitura. Tente atualizar novamente.",
          );
        }
        rows.push(...data);
        offset += data.length;
        if (count !== null && offset >= count) break;
        if (count === null && data.length < pageSize) break;
        if (data.length === 0)
          throw new Error(
            "Os clientes mudaram durante a leitura. Atualize a lista antes de exportar.",
          );
      }
      if (
        alive.current &&
        epoch.current === version &&
        scopeRef.current === scope
      ) {
        const customers = [
          ...new Map(rows.map((row) => [row.id, row])).values(),
        ];
        if (customers.length !== rows.length)
          throw new Error(
            "A lista de clientes mudou durante a leitura. Tente atualizar novamente.",
          );
        setState({ companyId: scope, customers, loading: false, error: null });
        return customers;
      }
      throw new Error(
        "A consulta foi interrompida porque a sessão ou a empresa mudou. Tente novamente.",
      );
    } catch (cause) {
      const message = friendlyError(
        cause,
        "Não foi possível carregar os clientes. Tente novamente.",
      );
      if (
        alive.current &&
        epoch.current === version &&
        scopeRef.current === scope
      ) {
        setState((previous) => ({
          companyId: scope,
          customers: previous.companyId === scope ? previous.customers : [],
          loading: false,
          error: message,
        }));
      }
      throw new Error(message);
    }
  }, [scope]);

  useEffect(() => {
    alive.current = true;
    void reload().catch(() => {});
    return () => {
      alive.current = false;
      pendingRead.current?.abort();
      ++epoch.current;
    };
  }, [reload]);

  const create = useCallback(
    async (input: CustomerInput): Promise<Customer> => {
      const { client, companyId: expectedScope } = requireScope(scope);
      const fields = normalizeCustomer(input);
      const { data, error: queryError } = await client
        .from("customers")
        .insert({ ...fields, company_id: expectedScope })
        .select("*")
        .single();
      if (queryError)
        throw new Error(
          friendlyError(
            queryError,
            "Não foi possível salvar o cliente. Confira os dados e tente novamente.",
          ),
        );
      if (alive.current && scopeRef.current === expectedScope) {
        ++epoch.current;
        setState((previous) => ({
          companyId: expectedScope,
          customers: [
            data,
            ...(previous.companyId === expectedScope
              ? previous.customers.filter((row) => row.id !== data.id)
              : []),
          ],
          loading: false,
          error: null,
        }));
        void reload().catch(() => {});
      }
      return data;
    },
    [scope, reload],
  );

  const update = useCallback(
    async (id: string, input: CustomerInput): Promise<Customer> => {
      const { client, companyId: expectedScope } = requireScope(scope);
      const fields = normalizeCustomer(input);
      const { data, error: queryError } = await client
        .from("customers")
        .update(fields)
        .eq("id", id)
        .eq("company_id", expectedScope)
        .select("*")
        .single();
      if (queryError)
        throw new Error(
          friendlyError(
            queryError,
            "Não foi possível atualizar o cliente. Tente novamente.",
          ),
        );
      if (alive.current && scopeRef.current === expectedScope) {
        ++epoch.current;
        setState((previous) => ({
          companyId: expectedScope,
          customers:
            previous.companyId === expectedScope
              ? previous.customers.map((row) =>
                  row.id === data.id ? data : row,
                )
              : [],
          loading: false,
          error: null,
        }));
        void reload().catch(() => {});
      }
      return data;
    },
    [scope, reload],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      const { client, companyId: expectedScope } = requireScope(scope);
      const { data, error: queryError } = await client
        .from("customers")
        .delete()
        .eq("id", id)
        .eq("company_id", expectedScope)
        .select("id")
        .maybeSingle();
      if (queryError)
        throw new Error(
          friendlyError(
            queryError,
            "Não foi possível excluir o cliente. Tente novamente.",
          ),
        );
      if (!data)
        throw new Error(
          "O cliente não foi encontrado ou não pertence a esta empresa.",
        );
      if (alive.current && scopeRef.current === expectedScope) {
        ++epoch.current;
        setState((previous) => ({
          companyId: expectedScope,
          customers:
            previous.companyId === expectedScope
              ? previous.customers.filter((row) => row.id !== id)
              : [],
          loading: false,
          error: null,
        }));
        void reload().catch(() => {});
      }
    },
    [scope, reload],
  );

  const current =
    state.companyId === scope
      ? state
      : { customers: [], loading: Boolean(scope), error: null };
  return {
    customers: current.customers,
    loading: current.loading,
    error: current.error,
    reload,
    create,
    update,
    remove,
  };
}
