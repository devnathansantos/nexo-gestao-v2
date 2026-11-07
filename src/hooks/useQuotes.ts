import { useCallback, useEffect, useRef, useState } from "react";
import type { Quote, QuoteInput, QuoteStatus } from "../types";
import { supabase, supabaseConfigurationError } from "../lib/supabase";
import {
  commerceError,
  normalizeQuoteInput,
  quoteStatusLabels,
} from "../lib/commerce";
import { requireOnline } from "../lib/errors";

type State = {
  companyId: string | null;
  quotes: Quote[];
  loading: boolean;
  error: string | null;
};

function requireScope(companyId: string | null) {
  if (!supabase)
    throw new Error(
      supabaseConfigurationError ||
        "Configure o Supabase para acessar os orçamentos.",
    );
  if (!companyId)
    throw new Error("Entre na empresa antes de acessar os orçamentos.");
  requireOnline();
  return { client: supabase, companyId };
}

function scopedQuote(quote: Quote, companyId: string): Quote {
  if (
    !quote ||
    quote.company_id !== companyId ||
    !Array.isArray(quote.items) ||
    quote.items.some((item) => item.quote_id !== quote.id)
  ) {
    throw new Error(
      "Não foi possível confirmar o orçamento desta empresa. Atualize a lista.",
    );
  }
  return {
    ...quote,
    items: [...quote.items].sort(
      (a, b) => a.position - b.position || a.id.localeCompare(b.id),
    ),
  };
}

export function useQuotes(companyId: string | null | undefined) {
  const scope = companyId || null;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const epoch = useRef(0);
  const pendingRead = useRef<AbortController | null>(null);
  const alive = useRef(false);
  const [state, setState] = useState<State>({
    companyId: scope,
    quotes: [],
    loading: Boolean(scope),
    error: null,
  });

  const reload = useCallback(async (): Promise<Quote[]> => {
    const version = ++epoch.current;
    pendingRead.current?.abort();
    const controller = new AbortController();
    pendingRead.current = controller;
    if (!scope) {
      setState({ companyId: null, quotes: [], loading: false, error: null });
      throw new Error("Entre na empresa antes de acessar os orçamentos.");
    }
    setState((previous) => ({
      companyId: scope,
      quotes: previous.companyId === scope ? previous.quotes : [],
      loading: true,
      error: null,
    }));
    try {
      const { client } = requireScope(scope);
      const rows: Quote[] = [];
      let expectedCount: number | null | undefined;
      for (let offset = 0; ; ) {
        const { data, count, error } = await client
          .from("quotes")
          .select("*,items:quote_items(*)", { count: "exact" })
          .eq("company_id", scope)
          .order("created_at", { ascending: false })
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
            "A empresa ou a consulta mudou. Atualize os orçamentos.",
          );
        if (expectedCount === undefined) expectedCount = count;
        if (count !== expectedCount)
          throw new Error(
            "Os orçamentos mudaram durante a consulta. Tente novamente.",
          );
        rows.push(...data.map((quote) => scopedQuote(quote, scope)));
        offset += data.length;
        if (count !== null && offset >= count) break;
        if (count === null && data.length < 500) break;
        if (data.length === 0)
          throw new Error(
            "Os orçamentos mudaram durante a consulta. Tente novamente.",
          );
      }
      const quotes = [
        ...new Map(rows.map((quote) => [quote.id, quote])).values(),
      ];
      if (
        quotes.length !== rows.length ||
        !alive.current ||
        epoch.current !== version ||
        scopeRef.current !== scope
      )
        throw new Error(
          "A empresa ou os orçamentos mudaram. Atualize a lista.",
        );
      setState({ companyId: scope, quotes, loading: false, error: null });
      return quotes;
    } catch (cause) {
      const message = commerceError(
        cause,
        "Não foi possível carregar os orçamentos. Tente novamente.",
      );
      if (
        alive.current &&
        epoch.current === version &&
        scopeRef.current === scope
      ) {
        setState((previous) => ({
          companyId: scope,
          quotes: previous.companyId === scope ? previous.quotes : [],
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
    (row: Quote, expectedScope: string): Quote => {
      if (!alive.current || scopeRef.current !== expectedScope)
        throw new Error(
          "A empresa em uso mudou. Abra a conta anterior para conferir a operação.",
        );
      const quote = scopedQuote(row, expectedScope);
      ++epoch.current;
      setState((previous) => ({
        companyId: expectedScope,
        quotes: [
          quote,
          ...(previous.companyId === expectedScope
            ? previous.quotes.filter((item) => item.id !== quote.id)
            : []),
        ].sort(
          (a, b) =>
            b.created_at.localeCompare(a.created_at) ||
            a.id.localeCompare(b.id),
        ),
        loading: false,
        error: null,
      }));
      void reload().catch(() => {});
      return quote;
    },
    [reload],
  );

  const save = useCallback(
    async (input: QuoteInput): Promise<Quote> => {
      const { client, companyId: expectedScope } = requireScope(scope);
      const payload = {
        ...normalizeQuoteInput(input),
        company_id: expectedScope,
      };
      const { data, error } = await client.rpc("nexo_save_quote", {
        p_payload: payload,
      });
      if (error)
        throw new Error(
          commerceError(
            error,
            "Não foi possível salvar o orçamento. Tente novamente.",
          ),
        );
      return commit(data, expectedScope);
    },
    [scope, commit],
  );

  const setStatus = useCallback(
    async (quote: Quote, status: QuoteStatus): Promise<Quote> => {
      const { client, companyId: expectedScope } = requireScope(scope);
      scopedQuote(quote, expectedScope);
      if (!Object.hasOwn(quoteStatusLabels, status))
        throw new Error("A situação do orçamento é inválida.");
      const { data, error } = await client.rpc("nexo_set_quote_status", {
        p_quote_id: quote.id,
        p_status: status,
        p_expected_updated_at: quote.updated_at,
      });
      if (error)
        throw new Error(
          commerceError(
            error,
            "Não foi possível alterar a situação do orçamento. Tente novamente.",
          ),
        );
      return commit(data, expectedScope);
    },
    [scope, commit],
  );

  const remove = useCallback(
    async (quote: Quote): Promise<void> => {
      const { client, companyId: expectedScope } = requireScope(scope);
      scopedQuote(quote, expectedScope);
      if (quote.status !== "draft")
        throw new Error("Somente orçamentos em rascunho podem ser excluídos.");
      const { error } = await client.rpc("nexo_delete_quote", {
        p_quote_id: quote.id,
        p_expected_updated_at: quote.updated_at,
      });
      if (error)
        throw new Error(
          commerceError(
            error,
            "Não foi possível excluir o orçamento. Tente novamente.",
          ),
        );
      if (!alive.current || scopeRef.current !== expectedScope)
        throw new Error(
          "A empresa em uso mudou. Abra a conta anterior para conferir a operação.",
        );
      ++epoch.current;
      setState((previous) => ({
        companyId: expectedScope,
        quotes:
          previous.companyId === expectedScope
            ? previous.quotes.filter((item) => item.id !== quote.id)
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
      : { quotes: [], loading: Boolean(scope), error: null };
  return {
    quotes: current.quotes,
    loading: current.loading,
    error: current.error,
    reload,
    save,
    setStatus,
    remove,
  };
}
