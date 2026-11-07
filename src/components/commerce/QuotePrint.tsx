import {
  formatMoney,
  formatQuantity,
  quoteStatusLabels,
} from "../../lib/commerce";
import type { Quote } from "../../types";
import "./QuotePrint.css";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });

function printDate(value: string | null): string {
  if (!value) return "Não definida";
  const parsed =
    value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : dateFormatter.format(parsed);
}

/** Print data is the saved quote snapshot, never a live customer/company lookup. */
export default function QuotePrint({ quote }: { quote: Quote }) {
  return (
    <article
      className="quote-print-document"
      aria-label={`Orçamento ${quote.number} para impressão`}
    >
      <header className="quote-print-header">
        <div className="quote-print-brand">
          <img
            className="nexo-original-logo"
            src={`${import.meta.env.BASE_URL}nexo-logo.png`}
            alt="NEXO Gestão"
          />
        </div>
        <div className="quote-print-number">
          <span>ORÇAMENTO</span>
          <strong>#{String(quote.number).padStart(4, "0")}</strong>
          <small>{quoteStatusLabels[quote.status]}</small>
        </div>
      </header>
      <div className="quote-print-company">
        <span>PROPOSTA DE</span>
        <h1>{quote.company_name}</h1>
        <p>{quote.title}</p>
      </div>
      <section className="quote-print-parties">
        <div>
          <h2>Preparado para</h2>
          <strong>{quote.customer_name}</strong>
          {quote.customer_document && <p>{quote.customer_document}</p>}
          {quote.customer_email && <p>{quote.customer_email}</p>}
          {quote.customer_phone && <p>{quote.customer_phone}</p>}
        </div>
        <div>
          <h2>Informações da proposta</h2>
          <p>
            <span>Emissão</span>
            <strong>{printDate(quote.created_at)}</strong>
          </p>
          <p>
            <span>Validade</span>
            <strong>{printDate(quote.valid_until)}</strong>
          </p>
        </div>
      </section>
      <table className="quote-print-table">
        <thead>
          <tr>
            <th>Descrição</th>
            <th>Quantidade</th>
            <th>Valor unitário</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {quote.items.map((item) => (
            <tr key={item.id}>
              <td>
                <strong>{item.name}</strong>
              </td>
              <td>
                {formatQuantity(item.quantity_milli)} {item.unit}
              </td>
              <td>{formatMoney(item.unit_price_cents)}</td>
              <td>{formatMoney(item.line_total_cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <section className="quote-print-totals">
        <p>
          <span>Subtotal</span>
          <strong>{formatMoney(quote.subtotal_cents)}</strong>
        </p>
        <p>
          <span>Desconto</span>
          <strong>− {formatMoney(quote.discount_cents)}</strong>
        </p>
        <p className="quote-print-grand-total">
          <span>Total da proposta</span>
          <strong>{formatMoney(quote.total_cents)}</strong>
        </p>
      </section>
      {quote.payment_terms && (
        <section className="quote-print-notes">
          <h2>Condições de pagamento</h2>
          <p>{quote.payment_terms}</p>
        </section>
      )}
      {quote.notes && (
        <section className="quote-print-notes">
          <h2>Observações</h2>
          <p>{quote.notes}</p>
        </section>
      )}
      <footer className="quote-print-footer">
        Proposta comercial emitida por {quote.company_name} · NEXO Gestão
        <br />
        Este documento não é uma nota fiscal nem comprova pagamento.
      </footer>
    </article>
  );
}
