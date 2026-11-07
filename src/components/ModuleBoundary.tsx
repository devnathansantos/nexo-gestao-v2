import { Component, Suspense, type ReactNode } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";

class LoadErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <section className="card module-loading" role="alert">
          <p>
            Não foi possível abrir esta tela. Confira sua conexão e recarregue o
            site.
          </p>
          <button
            className="button secondary"
            onClick={() => window.location.reload()}
          >
            <RefreshCw size={16} />
            Recarregar site
          </button>
        </section>
      );
    return this.props.children;
  }
}

export default function ModuleBoundary({ children }: { children: ReactNode }) {
  return (
    <LoadErrorBoundary>
      <Suspense
        fallback={
          <div className="module-loading" role="status">
            <LoaderCircle className="spin" size={22} />
            <p>Abrindo sua tela…</p>
          </div>
        }
      >
        {children}
      </Suspense>
    </LoadErrorBoundary>
  );
}
