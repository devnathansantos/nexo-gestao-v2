import { useCallback, useEffect, useRef, useState } from "react";
import { financeError } from "../lib/finance";

/** Scoped and cancellable. Caller memoizes the loader; no cache across accounts. */
export function useCompanyQuery<T extends { company_id: string | null }>(
  companyId: string,
  load: (signal: AbortSignal) => Promise<T>,
) {
  const [state, setState] = useState<{
    key: typeof load;
    companyId: string;
    data: T | null;
    loading: boolean;
    error: string | null;
  }>({ key: load, companyId, data: null, loading: true, error: null });
  const ref = useRef({ companyId, load });
  ref.current = { companyId, load };
  const pending = useRef<AbortController | null>(null);
  const alive = useRef(false);
  const reload = useCallback(async () => {
    if (!alive.current) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setState((prev) => ({
      key: load,
      companyId,
      data:
        prev.companyId === companyId && prev.key === load ? prev.data : null,
      loading: true,
      error: null,
    }));
    try {
      const data = await load(controller.signal);
      if (
        controller.signal.aborted ||
        ref.current.companyId !== companyId ||
        ref.current.load !== load
      )
        return;
      if (data.company_id !== companyId)
        throw new Error("A empresa em uso mudou. Entre novamente.");
      setState({ key: load, companyId, data, loading: false, error: null });
    } catch (error) {
      if (
        !controller.signal.aborted &&
        ref.current.companyId === companyId &&
        ref.current.load === load
      )
        setState({
          key: load,
          companyId,
          data: null,
          loading: false,
          error: financeError(error),
        });
    }
  }, [companyId, load]);
  useEffect(() => {
    alive.current = true;
    void reload();
    return () => {
      alive.current = false;
      pending.current?.abort();
    };
  }, [reload]);
  return {
    ...(state.companyId === companyId && state.key === load
      ? state
      : { data: null, loading: true, error: null }),
    reload,
  };
}
