import { ArrowRight, CheckCheck, FileText, Package, Send } from "lucide-react";
import type { CatalogItem, Quote } from "../../types";
import { formatMoney, quoteStatusLabels } from "../../lib/commerce";
import "./CommercialOverview.css";

function sumQuoteValues(quotes: Quote[]) {
  const cents = quotes.reduce(
    (sum, quote) => sum + BigInt(quote.total_cents),
    0n,
  );
  if (cents <= BigInt(Number.MAX_SAFE_INTEGER))
    return formatMoney(Number(cents));
  return `R$ ${new Intl.NumberFormat("pt-BR").format(cents / 100n)},${String(cents % 100n).padStart(2, "0")}`;
}

export default function CommercialOverview({
  quotes,
  catalog,
  loading,
  error,
  onQuotes,
  onCatalog,
}: {
  quotes: Quote[];
  catalog: CatalogItem[];
  loading: boolean;
  error: string | null;
  onQuotes: () => void;
  onCatalog: () => void;
}) {
  const sent = quotes.filter((quote) => quote.status === "sent");
  const approved = quotes.filter((quote) => quote.status === "approved");
  const activeItems = catalog.filter((item) => item.active).length;
  const unavailable = loading || Boolean(error);
  return (
    <section
      className="card business-overview"
      aria-labelledby="business-overview-title"
    >
      <div className="panel-heading">
        <div>
          <h2 id="business-overview-title">Seus próximos negócios</h2>
          <p>Do primeiro orçamento à proposta aprovada.</p>
        </div>
        <button className="text-button" onClick={onQuotes}>
          Ver orçamentos
          <ArrowRight size={14} />
        </button>
      </div>
      <div className="business-metrics">
        <div>
          <span>
            <Send size={15} />
            Em negociação
          </span>
          <strong>{unavailable ? "—" : sumQuoteValues(sent)}</strong>
          <small>
            {unavailable
              ? "Aguardando seus dados"
              : `${sent.length} ${sent.length === 1 ? "orçamento enviado" : "orçamentos enviados"}`}
          </small>
        </div>
        <div>
          <span>
            <CheckCheck size={16} />
            Em propostas aprovadas
          </span>
          <strong>{unavailable ? "—" : sumQuoteValues(approved)}</strong>
          <small>Não representa valores recebidos.</small>
        </div>
        <div>
          <span>
            <Package size={16} />
            Seu catálogo
          </span>
          <strong>{unavailable ? "—" : activeItems}</strong>
          <small>
            {activeItems === 1
              ? "produto ou serviço ativo"
              : "produtos e serviços ativos"}
          </small>
        </div>
      </div>
      {error ? (
        <div className="business-loading">
          <FileText size={21} />
          <p>Os dados comerciais não puderam ser carregados.</p>
          <button className="text-button" onClick={onQuotes}>
            Abrir orçamentos e tentar novamente
            <ArrowRight size={14} />
          </button>
        </div>
      ) : loading ? (
        <p className="business-loading" role="status">
          Carregando suas propostas…
        </p>
      ) : quotes.length ? (
        <div className="business-recent">
          <div className="business-list-title">ORÇAMENTOS RECENTES</div>
          {quotes.slice(0, 3).map((quote) => (
            <div className="business-quote" key={quote.id}>
              <span className="business-quote-symbol">
                <FileText size={19} />
              </span>
              <div>
                <strong>
                  ORC-{String(quote.number).padStart(4, "0")}{" "}
                  <span>· {quote.title}</span>
                </strong>
                <small>{quote.customer_name}</small>
              </div>
              <span className={`business-status ${quote.status}`}>
                {quoteStatusLabels[quote.status]}
              </span>
              <strong className="business-quote-value">
                {formatMoney(quote.total_cents)}
              </strong>
            </div>
          ))}
        </div>
      ) : (
        <div className="business-empty">
          <span className="business-quote-symbol">
            <FileText size={22} />
          </span>
          <div>
            <h3>O próximo negócio começa com uma boa proposta.</h3>
            <p>
              Organize os produtos e serviços que oferece e prepare seu primeiro
              orçamento.
            </p>
          </div>
          <button className="button secondary" onClick={onCatalog}>
            Organizar catálogo
            <ArrowRight size={14} />
          </button>
        </div>
      )}
    </section>
  );
}
