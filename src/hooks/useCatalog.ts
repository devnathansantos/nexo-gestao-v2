import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogInput, CatalogItem } from "../types";
import { supabase, supabaseConfigurationError } from "../lib/supabase";
import { commerceError, normalizeCatalogInput } from "../lib/commerce";
import { requireOnline } from "../lib/errors";

type State = {
  companyId: string | null;
  items: CatalogItem[];
  loading: boolean;
  error: string | null;
};

function requireScope(companyId: string | null) {
  if (!supabase)
    throw new Error(
      supabaseConfigurationError ||
        "Configure o Supabase para acessar o catálogo.",
    );
  if (!companyId)
    throw new Error("Entre na empresa antes de acessar o catálogo.");
  requireOnline();
  return { client: supabase, companyId };
}

export function useCatalog(companyId: string | null | undefined) {
  const scope = companyId || null;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const epoch = useRef(0);
  const pendingRead = useRef<AbortController | null>(null);
  const alive = useRef(false);
  const [state, setState] = useState<State>({
    companyId: scope,
    items: [],
    loading: Boolean(scope),
    error: null,
  });

  const reload = useCallback(async (): Promise<CatalogItem[]> => {
    const version = ++epoch.current;
    pendingRead.current?.abort();
    const controller = new AbortController();
    pendingRead.current = controller;
    if (!scope) {
      setState({ companyId: null, items: [], loading: false, error: null });
      throw new Error("Entre na empresa antes de acessar o catálogo.");
    }
    setState((previous) => ({
      companyId: scope,
      items: previous.companyId === scope ? previous.items : [],
      loading: true,
      error: null,
    }));
    try {
      const { client } = requireScope(scope);
      const rows: CatalogItem[] = [];
      let expectedCount: number | null | undefined;
      for (let offset = 0; ; ) {
        const { data, count, error } = await client
          .from("catalog_items")
          .select("*", { count: "exact" })
          .eq("company_id", scope)
          .order("name", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, offset + 499)
          .abortSignal(controller.signal);
        if (error) throw error;
        if (
          !alive.current ||
          epoch.current !== version ||
          scopeRef.current !== scope
        )
          throw new Error(
            "A empresa ou a consulta mudou. Atualize o catálogo.",
          );
        if (expectedCount === undefined) expectedCount = count;
        if (
          count !== expectedCount ||
          data.some((item) => item.company_id !== scope)
        )
          throw new Error(
            "O catálogo mudou durante a consulta. Tente novamente.",
          );
        rows.push(...data);
        offset += data.length;
        if (count !== null && offset >= count) break;
        if (count === null && data.length < 500) break;
        if (data.length === 0)
          throw new Error(
            "O catálogo mudou durante a consulta. Tente novamente.",
          );
      }
      const items = [...new Map(rows.map((item) => [item.id, item])).values()];
      if (
        items.length !== rows.length ||
        !alive.current ||
        epoch.current !== version ||
        scopeRef.current !== scope
      )
        throw new Error("A empresa ou o catálogo mudou. Atualize a lista.");
      setState({ companyId: scope, items, loading: false, error: null });
      return items;
    } catch (cause) {
      const message = commerceError(
        cause,
        "Não foi possível carregar o catálogo. Tente novamente.",
      );
      if (
        alive.current &&
        epoch.current === version &&
        scopeRef.current === scope
      ) {
        setState((previous) => ({
          companyId: scope,
          items: previous.companyId === scope ? previous.items : [],
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

  const commit = useCallback(
    (item: CatalogItem, expectedScope: string) => {
      if (
        !alive.current ||
        scopeRef.current !== expectedScope ||
        item.company_id !== expectedScope
      ) {
        throw new Error(
          "A empresa em uso mudou. Abra a conta anterior para conferir a operação.",
        );
      }
      ++epoch.current;
      setState((previous) => ({
        companyId: expectedScope,
        items: [
          item,
          ...(previous.companyId === expectedScope
            ? previous.items.filter((row) => row.id !== item.id)
            : []),
        ].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
        loading: false,
        error: null,
      }));
      void reload().catch(() => {});
    },
    [reload],
  );

  const create = useCallback(
    async (input: CatalogInput): Promise<CatalogItem> => {
      const { client, companyId: expectedScope } = requireScope(scope);
      const fields = normalizeCatalogInput(input);
      const { data, error } = await client
        .from("catalog_items")
        .insert({ ...fields, company_id: expectedScope })
        .select("*")
        .single();
      if (error)
        throw new Error(
          commerceError(
            error,
            "Não foi possível cadastrar o item. Tente novamente.",
          ),
        );
      commit(data, expectedScope);
      return data;
    },
    [scope, commit],
  );

  const update = useCallback(
    async (id: string, input: CatalogInput): Promise<CatalogItem> => {
      const { client, companyId: expectedScope } = requireScope(scope);
      const { data, error } = await client
        .from("catalog_items")
        .update(normalizeCatalogInput(input))
        .eq("id", id)
        .eq("company_id", expectedScope)
        .select("*")
        .single();
      if (error)
        throw new Error(
          commerceError(
            error,
            "Não foi possível atualizar o item. Tente novamente.",
          ),
        );
      commit(data, expectedScope);
      return data;
    },
    [scope, commit],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      const { client, companyId: expectedScope } = requireScope(scope);
      const { data, error } = await client
        .from("catalog_items")
        .delete()
        .eq("id", id)
        .eq("company_id", expectedScope)
        .select("id")
        .maybeSingle();
      if (error)
        throw new Error(
          commerceError(
            error,
            "Não foi possível excluir o item. Tente novamente.",
          ),
        );
      if (!data) throw new Error("O item não foi encontrado nesta empresa.");
      if (!alive.current || scopeRef.current !== expectedScope)
        throw new Error(
          "A empresa em uso mudou. Abra a conta anterior para conferir a operação.",
        );
      ++epoch.current;
      setState((previous) => ({
        companyId: expectedScope,
        items:
          previous.companyId === expectedScope
            ? previous.items.filter((item) => item.id !== id)
            : [],
        loading: false,
        error: null,
      }));
      void reload().catch(() => {});
    },
    [scope, reload],
  );

  const current =
    state.companyId === scope
      ? state
      : { items: [], loading: Boolean(scope), error: null };
  return {
    items: current.items,
    loading: current.loading,
    error: current.error,
    reload,
    create,
    update,
    remove,
  };
}
