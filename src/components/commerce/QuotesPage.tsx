import Pagination from "../Pagination";
import { usePagination } from "../../hooks/usePagination";
import { useMemo, useState, type FormEvent } from "react";
import {
  Check,
  CheckCheck,
  ChevronRight,
  FileText,
  LoaderCircle,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import Modal from "../Modal";
import {
  calculateQuoteTotals,
  formatMoney,
  formatQuantity,
  parseMoney,
  parseQuantity,
  quoteStatusLabels,
} from "../../lib/commerce";
import type {
  CatalogItem,
  Company,
  Customer,
  Quote,
  QuoteInput,
  QuoteStatus,
} from "../../types";
import QuotePrint from "./QuotePrint";
import "./QuotesPage.css";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });

interface QuotesPageProps {
  company: Company;
  customers: Customer[];
  catalog: CatalogItem[];
  quotes: Quote[];
  loading: boolean;
  error: string | null;
  online: boolean;
  onSave(input: QuoteInput): Promise<Quote>;
  onStatus(quote: Quote, status: QuoteStatus): Promise<unknown>;
  onRemove(quote: Quote): Promise<void>;
  onReload(): Promise<unknown>;
  onNotice(message: string): void;
}

type DraftItem = {
  key: string;
  catalog_item_id: string | null;
  name: string;
  unit: string;
  quantity: string;
  price: string;
};
type Confirmation =
  | { kind: "status"; quote: Quote; status: QuoteStatus }
  | { kind: "remove"; quote: Quote };
const number = (value: number) => `#${String(value).padStart(4, "0")}`;
const inputMoney = (cents: number) =>
  `${BigInt(cents) / 100n},${(BigInt(cents) % 100n).toString().padStart(2, "0")}`;
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Não foi possível concluir. Tente novamente.";
const date = (value: string | null) =>
  value
    ? dateFormatter.format(
        new Date(value.length === 10 ? `${value}T12:00:00` : value),
      )
    : "Sem validade definida";
const newItem = (): DraftItem => ({
  key: crypto.randomUUID(),
  catalog_item_id: null,
  name: "",
  unit: "un",
  quantity: "1",
  price: "0,00",
});

function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  return (
    <span className={`quote-status quote-status-${status}`}>
      {quoteStatusLabels[status]}
    </span>
  );
}

function QuoteEditor({
  quote,
  customers,
  catalog,
  online,
  onClose,
  onSave,
}: {
  quote: Quote | null;
  customers: Customer[];
  catalog: CatalogItem[];
  online: boolean;
  onClose(): void;
  onSave(input: QuoteInput): Promise<unknown>;
}) {
  const [customerId, setCustomerId] = useState(quote?.customer_id ?? "");
  const [requestId] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState(quote?.title ?? "");
  const [validUntil, setValidUntil] = useState(quote?.valid_until ?? "");
  const [notes, setNotes] = useState(quote?.notes ?? "");
  const [paymentTerms, setPaymentTerms] = useState(quote?.payment_terms ?? "");
  const [discount, setDiscount] = useState(
    inputMoney(quote?.discount_cents ?? 0),
  );
  const [items, setItems] = useState<DraftItem[]>(() =>
    quote
      ? quote.items.map((item) => ({
          key: item.id,
          catalog_item_id: item.catalog_item_id,
          name: item.name,
          unit: item.unit,
          quantity: formatQuantity(item.quantity_milli),
          price: inputMoney(item.unit_price_cents),
        }))
      : [newItem()],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowedCustomers = customers.filter(
    (customer) => customer.active || customer.id === quote?.customer_id,
  );
  const activeCatalog = catalog.filter((item) => item.active);
  const allowsRemovedCustomer = Boolean(quote && quote.customer_id === null);

  const parsed = useMemo(() => {
    try {
      const normalized = items.map((item) => ({
        catalog_item_id: item.catalog_item_id,
        name: item.name.trim(),
        unit: item.unit.trim(),
        quantity_milli: parseQuantity(item.quantity),
        unit_price_cents: parseMoney(item.price),
      }));
      const discountCents = parseMoney(discount);
      return {
        normalized,
        discountCents,
        totals: calculateQuoteTotals(normalized, discountCents),
        error: null,
      };
    } catch (error) {
      return {
        normalized: null,
        discountCents: 0,
        totals: null,
        error: message(error),
      };
    }
  }, [items, discount]);

  function updateItem(
    key: string,
    field: "name" | "unit" | "quantity" | "price",
    value: string,
  ) {
    setItems((current) =>
      current.map((item) =>
        item.key === key ? { ...item, [field]: value } : item,
      ),
    );
  }

  function addCatalogItem(id: string) {
    const selected = activeCatalog.find((item) => item.id === id);
    if (!selected || items.length >= 100) return;
    const added = {
      ...newItem(),
      catalog_item_id: selected.id,
      name: selected.name,
      unit: selected.unit,
      price: inputMoney(selected.price_cents),
    };
    setItems((current) =>
      current.length === 1 &&
      !current[0].name.trim() &&
      current[0].price === "0,00" &&
      current[0].catalog_item_id === null
        ? [added]
        : [...current, added],
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (!online) {
      setError("Conecte-se à internet para salvar o orçamento.");
      return;
    }
    if (!customerId && !allowsRemovedCustomer) {
      setError("Selecione um cliente para este orçamento.");
      return;
    }
    if (parsed.error || !parsed.normalized) {
      setError(parsed.error || "Revise as quantidades e os valores dos itens.");
      return;
    }
    if (
      items.some((item) => item.name.trim().length < 2 || !item.unit.trim())
    ) {
      setError("Preencha a descrição e a unidade de todos os itens.");
      return;
    }
    setBusy(true);
    try {
      await onSave({
        ...(quote
          ? { id: quote.id, expected_updated_at: quote.updated_at }
          : { request_id: requestId }),
        customer_id: customerId || null,
        title: title.trim(),
        valid_until: validUntil || null,
        notes: notes.trim() || null,
        payment_terms: paymentTerms.trim() || null,
        discount_cents: parsed.discountCents,
        items: parsed.normalized,
      });
      onClose();
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={
        quote ? `Editar orçamento ${number(quote.number)}` : "Novo orçamento"
      }
      description="Monte uma proposta com produtos, serviços e condições claras."
      onClose={onClose}
      busy={busy}
    >
      <form className="quote-editor" onSubmit={submit}>
        <div className="quote-form-grid">
          <label className="quote-field-wide">
            Cliente
            <select
              aria-label="Cliente"
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              required={!allowsRemovedCustomer}
              disabled={busy}
            >
              {allowsRemovedCustomer ? (
                <option value="">
                  Cliente removido · manter dados deste orçamento
                </option>
              ) : (
                <option value="">Selecione o cliente</option>
              )}
              {allowedCustomers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.id === quote?.customer_id
                    ? quote.customer_name
                    : customer.name}
                  {!customer.active ? " (inativo)" : ""}
                </option>
              ))}
            </select>
            {!allowedCustomers.length && !allowsRemovedCustomer && (
              <small>
                Cadastre um cliente ativo na área Clientes antes de criar o
                orçamento.
              </small>
            )}
            {quote && (
              <small>
                Os dados ficam preservados na proposta. Ao salvar uma revisão, o
                cadastro do cliente selecionado será consultado novamente.
              </small>
            )}
          </label>
          <label>
            Título da proposta
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ex.: Fornecimento de produtos e serviços"
              required
              minLength={2}
              maxLength={160}
              disabled={busy}
            />
          </label>
          <label>
            Válido até
            <input
              type="date"
              value={validUntil}
              onChange={(event) => setValidUntil(event.target.value)}
              disabled={busy}
            />
          </label>
        </div>
        <section
          className="quote-editor-items"
          aria-labelledby="quote-editor-items-title"
        >
          <div className="quote-section-head">
            <div>
              <h3 id="quote-editor-items-title">Itens da proposta</h3>
              <p>
                Preços e quantidades podem ser ajustados para este orçamento.
              </p>
            </div>
            <span>{items.length}/100 itens</span>
          </div>
          <div className="quote-add-item">
            <label className="sr-only" htmlFor="quote-catalog-select">
              Adicionar item do catálogo
            </label>
            <select
              id="quote-catalog-select"
              value=""
              onChange={(event) => addCatalogItem(event.target.value)}
              disabled={busy || items.length >= 100 || !activeCatalog.length}
            >
              <option value="">
                {activeCatalog.length
                  ? "Adicionar produto ou serviço do catálogo…"
                  : "Nenhum item ativo no catálogo"}
              </option>
              {activeCatalog.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {formatMoney(item.price_cents)}/{item.unit}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="button secondary"
              disabled={busy || items.length >= 100}
              onClick={() => setItems((current) => [...current, newItem()])}
            >
              <Plus size={15} />
              Linha personalizada
            </button>
          </div>
          <div className="quote-item-column-labels" aria-hidden="true">
            <span>Descrição / unidade</span>
            <span>Quantidade</span>
            <span>Valor unitário</span>
            <span>Total</span>
            <span />
          </div>
          <div className="quote-draft-items">
            {items.map((item, index) => (
              <div className="quote-draft-item" key={item.key}>
                <div className="quote-item-description">
                  <label>
                    <span className="quote-mobile-label">
                      Descrição do item {index + 1}
                    </span>
                    <input
                      aria-label={`Descrição do item ${index + 1}`}
                      value={item.name}
                      onChange={(event) =>
                        updateItem(item.key, "name", event.target.value)
                      }
                      placeholder="Produto ou serviço"
                      minLength={2}
                      maxLength={160}
                      required
                      disabled={busy}
                    />
                  </label>
                  <label className="quote-unit-field">
                    <span>Unidade</span>
                    <input
                      aria-label={`Unidade do item ${index + 1}`}
                      value={item.unit}
                      onChange={(event) =>
                        updateItem(item.key, "unit", event.target.value)
                      }
                      placeholder="un, h, kg…"
                      maxLength={20}
                      required
                      disabled={busy}
                    />
                  </label>
                </div>
                <label>
                  <span className="quote-mobile-label">Quantidade</span>
                  <input
                    aria-label={`Quantidade do item ${index + 1}`}
                    type="text"
                    inputMode="decimal"
                    value={item.quantity}
                    onChange={(event) =>
                      updateItem(item.key, "quantity", event.target.value)
                    }
                    placeholder="1"
                    maxLength={20}
                    required
                    disabled={busy}
                  />
                </label>
                <label>
                  <span className="quote-mobile-label">
                    Valor unitário (R$)
                  </span>
                  <input
                    aria-label={`Valor unitário do item ${index + 1}`}
                    type="text"
                    inputMode="decimal"
                    value={item.price}
                    onChange={(event) =>
                      updateItem(item.key, "price", event.target.value)
                    }
                    placeholder="0,00"
                    maxLength={24}
                    required
                    disabled={busy}
                  />
                </label>
                <div className="quote-line-total">
                  <span className="quote-mobile-label">Total do item</span>
                  <strong>
                    {parsed.totals
                      ? formatMoney(parsed.totals.line_totals[index])
                      : "—"}
                  </strong>
                </div>
                <button
                  className="icon-button danger-icon quote-item-remove"
                  type="button"
                  aria-label={`Remover item ${index + 1}`}
                  disabled={busy || items.length <= 1}
                  onClick={() =>
                    setItems((current) =>
                      current.filter((row) => row.key !== item.key),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>
        <div className="quote-editor-bottom">
          <div className="quote-editor-texts">
            <label>
              Condições de pagamento
              <textarea
                value={paymentTerms}
                onChange={(event) => setPaymentTerms(event.target.value)}
                placeholder="Ex.: pagamento via Pix na aprovação."
                rows={3}
                maxLength={4000}
                disabled={busy}
              />
            </label>
            <label>
              Observações
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Detalhes do fornecimento, prazos ou orientações."
                rows={3}
                maxLength={4000}
                disabled={busy}
              />
            </label>
          </div>
          <div className="quote-editor-totals">
            <p>
              <span>Subtotal</span>
              <strong>
                {parsed.totals
                  ? formatMoney(parsed.totals.subtotal_cents)
                  : "—"}
              </strong>
            </p>
            <label>
              Desconto (R$)
              <input
                type="text"
                inputMode="decimal"
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
                placeholder="0,00"
                maxLength={24}
                required
                disabled={busy}
              />
            </label>
            <p className="quote-total-line">
              <span>Total da proposta</span>
              <strong>
                {parsed.totals ? formatMoney(parsed.totals.total_cents) : "—"}
              </strong>
            </p>
            <small>
              Quantidades aceitam até 3 casas decimais. Valores em reais, com
              até 2 casas.
            </small>
          </div>
        </div>
        {!online && (
          <div className="notice error" role="status">
            Sem conexão. Você precisa estar online para salvar.
          </div>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <footer className="modal-footer quote-editor-footer">
          <span>O orçamento será salvo como rascunho.</span>
          <div>
            <button
              className="button secondary"
              type="button"
              onClick={onClose}
              disabled={busy}
            >
              Cancelar
            </button>
            <button
              className="button primary"
              type="submit"
              disabled={
                busy ||
                !online ||
                (!allowedCustomers.length && !allowsRemovedCustomer)
              }
            >
              {busy ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <Check size={15} />
              )}
              Salvar rascunho
            </button>
          </div>
        </footer>
      </form>
    </Modal>
  );
}

function QuoteDetails({
  quote,
  online,
  onClose,
  onEdit,
  onTransition,
}: {
  quote: Quote;
  online: boolean;
  onClose(): void;
  onEdit(): void;
  onTransition(status: QuoteStatus): void;
}) {
  return (
    <Modal
      title={`Orçamento ${number(quote.number)}`}
      description="Confira a proposta e os dados preservados na sua emissão."
      onClose={onClose}
    >
      <div className="quote-details">
        <div className="quote-detail-title">
          <div>
            <span>{quote.company_name}</span>
            <h3>{quote.title}</h3>
          </div>
          <QuoteStatusBadge status={quote.status} />
        </div>
        <div className="quote-detail-grid">
          <div>
            <h4>Cliente</h4>
            <strong>{quote.customer_name}</strong>
            {quote.customer_document && <p>{quote.customer_document}</p>}
            {quote.customer_email && <p>{quote.customer_email}</p>}
            {quote.customer_phone && <p>{quote.customer_phone}</p>}
          </div>
          <div>
            <h4>Datas</h4>
            <p>
              Criado em <strong>{date(quote.created_at)}</strong>
            </p>
            <p>
              Validade <strong>{date(quote.valid_until)}</strong>
            </p>
          </div>
        </div>
        <div className="quote-detail-table-wrap">
          <table className="quote-detail-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Quantidade</th>
                <th>Valor unitário</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {quote.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>
                    {formatQuantity(item.quantity_milli)} {item.unit}
                  </td>
                  <td>{formatMoney(item.unit_price_cents)}</td>
                  <td>{formatMoney(item.line_total_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="quote-detail-totals">
          <p>
            <span>Subtotal</span>
            <strong>{formatMoney(quote.subtotal_cents)}</strong>
          </p>
          <p>
            <span>Desconto</span>
            <strong>− {formatMoney(quote.discount_cents)}</strong>
          </p>
          <p>
            <span>Total</span>
            <strong>{formatMoney(quote.total_cents)}</strong>
          </p>
        </div>
        {quote.payment_terms && (
          <div className="quote-detail-notes">
            <h4>Condições de pagamento</h4>
            <p>{quote.payment_terms}</p>
          </div>
        )}
        {quote.notes && (
          <div className="quote-detail-notes">
            <h4>Observações</h4>
            <p>{quote.notes}</p>
          </div>
        )}
        <p className="quote-detail-hint">
          Alterações posteriores no cadastro da empresa ou do cliente não mudam
          os dados já registrados nesta proposta.
        </p>
        <div className="quote-detail-actions">
          <button
            className="button secondary"
            type="button"
            onClick={() => window.print()}
          >
            <Printer size={15} />
            Imprimir / salvar PDF
          </button>
          {quote.status === "draft" && (
            <>
              <button
                className="button secondary"
                type="button"
                onClick={onEdit}
                disabled={!online}
              >
                <Pencil size={15} />
                Editar rascunho
              </button>
              <button
                className="button primary"
                type="button"
                onClick={() => onTransition("sent")}
                disabled={!online}
              >
                <Send size={15} />
                Marcar como enviado
              </button>
            </>
          )}
          {quote.status === "sent" && (
            <>
              <button
                className="button secondary"
                type="button"
                onClick={() => onTransition("draft")}
                disabled={!online}
              >
                Voltar a rascunho
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => onTransition("declined")}
                disabled={!online}
              >
                Marcar recusado
              </button>
              <button
                className="button primary"
                type="button"
                onClick={() => onTransition("approved")}
                disabled={!online}
              >
                <CheckCheck size={15} />
                Marcar aprovado
              </button>
            </>
          )}
        </div>
        <QuotePrint quote={quote} />
      </div>
    </Modal>
  );
}

export default function QuotesPage({
  company,
  customers,
  catalog,
  quotes,
  loading,
  error,
  online,
  onSave,
  onStatus,
  onRemove,
  onReload,
  onNotice,
}: QuotesPageProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<QuoteStatus | "all">("all");
  const [editor, setEditor] = useState<{ quote: Quote | null } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const detail = detailId
    ? quotes.find((quote) => quote.id === detailId)
    : undefined;
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return quotes.filter(
      (quote) =>
        (status === "all" || quote.status === status) &&
        (!term ||
          `${quote.number} ${quote.title} ${quote.customer_name}`
            .toLocaleLowerCase("pt-BR")
            .includes(term)),
    );
  }, [quotes, status, search]);
  const pagination = usePagination(
    filtered,
    JSON.stringify([company.id, search, status]),
  );
  const counts = {
    draft: quotes.filter((quote) => quote.status === "draft").length,
    sent: quotes.filter((quote) => quote.status === "sent").length,
    approved: quotes.filter((quote) => quote.status === "approved").length,
  };

  async function confirm() {
    if (!confirmation || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      if (confirmation.kind === "remove") {
        await onRemove(confirmation.quote);
        onNotice(`Orçamento ${number(confirmation.quote.number)} excluído.`);
        setDetailId((current) =>
          current === confirmation.quote.id ? null : current,
        );
      } else {
        await onStatus(confirmation.quote, confirmation.status);
        onNotice(
          `Orçamento atualizado: ${quoteStatusLabels[confirmation.status].toLocaleLowerCase("pt-BR")}.`,
        );
      }
      setConfirmation(null);
    } catch (error) {
      setActionError(message(error));
    } finally {
      setBusy(false);
    }
  }

  function beginStatus(quote: Quote, next: QuoteStatus) {
    setDetailId(null);
    setActionError(null);
    setConfirmation({ kind: "status", quote, status: next });
  }

  return (
    <div className="quote-page" data-company-id={company.id}>
      <div className="quote-summary">
        <div>
          <span>Em elaboração</span>
          <strong>
            {counts.draft}
            <small>rascunhos</small>
          </strong>
        </div>
        <div>
          <span>Aguardando resposta</span>
          <strong>
            {counts.sent}
            <small>enviados</small>
          </strong>
        </div>
        <div>
          <span>Negócios aprovados</span>
          <strong>
            {counts.approved}
            <small>orçamentos</small>
          </strong>
        </div>
      </div>
      <section className="card quote-list">
        <div className="quote-toolbar">
          <label className="quote-search">
            <Search size={17} />
            <span className="sr-only">Buscar orçamentos</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar cliente, título ou número…"
            />
            {search && (
              <button
                className="icon-button"
                type="button"
                onClick={() => setSearch("")}
                aria-label="Limpar busca"
              >
                <X size={15} />
              </button>
            )}
          </label>
          <div className="quote-toolbar-actions">
            <label>
              <span className="sr-only">Filtrar situação do orçamento</span>
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as QuoteStatus | "all")
                }
              >
                <option value="all">Todas as situações</option>
                {Object.entries(quoteStatusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="icon-button"
              type="button"
              disabled={loading || !online}
              aria-label="Atualizar orçamentos"
              onClick={() => {
                void onReload().catch((failure) => onNotice(message(failure)));
              }}
            >
              <RefreshCw size={17} className={loading ? "spin" : undefined} />
            </button>
            <button
              className="button primary"
              type="button"
              disabled={!online}
              onClick={() => setEditor({ quote: null })}
            >
              <Plus size={15} />
              Novo orçamento
            </button>
          </div>
        </div>
        {error && (
          <div className="notice error quote-list-error" role="alert">
            {error}
          </div>
        )}
        {loading && !quotes.length ? (
          <div className="quote-empty" role="status">
            <LoaderCircle className="spin" size={28} />
            <h2>Buscando seus orçamentos</h2>
            <p>Carregando as propostas salvas para sua empresa.</p>
          </div>
        ) : !filtered.length ? (
          <div className="quote-empty">
            <span className="quote-empty-symbol">
              <FileText size={27} />
            </span>
            <h2>
              {quotes.length
                ? "Nenhum orçamento com esses filtros"
                : "O próximo negócio começa com uma proposta"}
            </h2>
            <p>
              {quotes.length
                ? "Ajuste a busca ou a situação para encontrar o que procura."
                : "Reúna produtos, serviços e condições em um orçamento claro para o seu cliente."}
            </p>
            {!quotes.length && (
              <button
                className="button primary"
                type="button"
                disabled={!online}
                onClick={() => setEditor({ quote: null })}
              >
                <Plus size={15} />
                Criar primeiro orçamento
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="quote-table-scroll">
              <table className="quote-list-table">
                <thead>
                  <tr>
                    <th>Orçamento</th>
                    <th>Cliente</th>
                    <th>Validade</th>
                    <th>Valor total</th>
                    <th>Situação</th>
                    <th>
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.items.map((quote) => (
                    <tr key={quote.id}>
                      <td>
                        <button
                          className="quote-title-button"
                          type="button"
                          onClick={() => setDetailId(quote.id)}
                        >
                          <span>{number(quote.number)}</span>
                          <strong>{quote.title}</strong>
                        </button>
                      </td>
                      <td>
                        <strong>{quote.customer_name}</strong>
                        <small>{date(quote.created_at)}</small>
                      </td>
                      <td>{date(quote.valid_until)}</td>
                      <td className="quote-value">
                        {formatMoney(quote.total_cents)}
                      </td>
                      <td>
                        <QuoteStatusBadge status={quote.status} />
                      </td>
                      <td>
                        <div className="quote-row-actions">
                          <button
                            className="icon-button"
                            type="button"
                            aria-label={`Visualizar orçamento ${number(quote.number)}`}
                            onClick={() => setDetailId(quote.id)}
                          >
                            <ChevronRight size={18} />
                          </button>
                          {quote.status === "draft" && (
                            <>
                              <button
                                className="icon-button"
                                type="button"
                                disabled={!online}
                                aria-label={`Editar orçamento ${number(quote.number)}`}
                                onClick={() => setEditor({ quote })}
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                className="icon-button danger-icon"
                                type="button"
                                disabled={!online}
                                aria-label={`Excluir orçamento ${number(quote.number)}`}
                                onClick={() => {
                                  setActionError(null);
                                  setConfirmation({ kind: "remove", quote });
                                }}
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination} />
            <div className="quote-table-footer">
              <span>
                {filtered.length} de {quotes.length}{" "}
                {quotes.length === 1 ? "orçamento" : "orçamentos"}
              </span>
              <span>Dados salvos no espaço da sua empresa</span>
            </div>
          </>
        )}
      </section>
      <p className="quote-manual-note">
        <Send size={14} />
        “Enviado” é um registro manual do acompanhamento. O NEXO não envia
        e-mails ou mensagens ao cliente.
      </p>
      {editor && (
        <QuoteEditor
          quote={editor.quote}
          customers={customers}
          catalog={catalog}
          online={online}
          onClose={() => setEditor(null)}
          onSave={async (input) => {
            const result = await onSave(input);
            onNotice(
              input.id
                ? "Rascunho atualizado. Confira os dados da proposta."
                : "Orçamento salvo. Confira os dados da proposta.",
            );
            setDetailId(result.id);
            return result;
          }}
        />
      )}
      {detail && !editor && !confirmation && (
        <QuoteDetails
          quote={detail}
          online={online}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            setDetailId(null);
            setEditor({ quote: detail });
          }}
          onTransition={(next) => beginStatus(detail, next)}
        />
      )}
      {confirmation && (
        <Modal
          title={
            confirmation.kind === "remove"
              ? "Excluir este rascunho?"
              : `Marcar orçamento como ${quoteStatusLabels[confirmation.status].toLocaleLowerCase("pt-BR")}?`
          }
          description={
            confirmation.kind === "remove"
              ? `${number(confirmation.quote.number)} · ${confirmation.quote.title}. Esta ação não pode ser desfeita.`
              : `${number(confirmation.quote.number)} · ${confirmation.quote.customer_name}`
          }
          onClose={() => setConfirmation(null)}
          busy={busy}
        >
          <div className="quote-confirm">
            <p>
              {confirmation.kind === "remove"
                ? "Somente este orçamento e seus itens serão excluídos. O cadastro do cliente e os itens do catálogo serão preservados."
                : confirmation.status === "sent"
                  ? "Confirme depois de compartilhar a proposta com o cliente. Esta ação muda apenas a situação; nenhuma mensagem será enviada automaticamente."
                  : confirmation.status === "approved" ||
                      confirmation.status === "declined"
                    ? "Ao confirmar esta decisão, o orçamento ficará encerrado e não poderá ser editado ou excluído. A aprovação não registra recebimento nem movimenta estoque."
                    : "A proposta voltará para elaboração, permitindo revisar itens, valores e condições antes de um novo envio."}
            </p>
            {actionError && (
              <div className="notice error" role="alert">
                {actionError}
              </div>
            )}
            <div className="quote-confirm-actions">
              <button
                className="button secondary"
                type="button"
                disabled={busy}
                onClick={() => setConfirmation(null)}
              >
                Cancelar
              </button>
              <button
                className={`button ${confirmation.kind === "remove" ? "danger" : "primary"}`}
                type="button"
                disabled={busy || !online}
                onClick={() => void confirm()}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={15} />
                ) : confirmation.kind === "remove" ? (
                  <Trash2 size={15} />
                ) : (
                  <Check size={15} />
                )}
                Confirmar{" "}
                {confirmation.kind === "remove" ? "exclusão" : "alteração"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
