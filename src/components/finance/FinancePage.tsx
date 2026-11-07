import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CircleDollarSign,
  FileDown,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import Modal from "../Modal";
import Pagination from "../Pagination";
import { useCompanyQuery } from "../../hooks/useCompanyQuery";
import {
  financeClient,
  financeCommand,
  financeDate,
  financeError,
  financeMoney,
  paymentMethods,
  todayBR,
  validDetail,
} from "../../lib/finance";
import { parseMoney } from "../../lib/commerce";
import type { Company, Customer, Quote } from "../../types";
import type {
  Operation,
  OperationDetail,
  Payment,
  PaymentMethod,
} from "../../finance-types";
import "./FinancePage.css";

type Props = {
  company: Company;
  customers: Customer[];
  quotes: Quote[];
  online: boolean;
  onNotice: (text: string) => void;
};
const categories = [
  "Vendas e serviços",
  "Produtos",
  "Fornecedores",
  "Funcionários e comissões",
  "Aluguel",
  "Energia",
  "Água",
  "Internet",
  "Transporte",
  "Manutenção",
  "Equipamentos",
  "Tributos",
  "Outros",
];
function NewOperation({
  companyId,
  customers,
  quotes,
  kind,
  online,
  onClose,
  onSaved,
}: {
  companyId: string;
  customers: Customer[];
  quotes: Quote[];
  kind: "sale" | "expense";
  online: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [quoteId, setQuoteId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [description, setDescription] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [category, setCategory] = useState(
    kind === "sale" ? "Vendas e serviços" : "Outros",
  );
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState(todayBR);
  const [due, setDue] = useState(todayBR);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = quotes.find((q) => q.id === quoteId);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !online) return;
    setBusy(true);
    setError("");
    try {
      const row = await financeCommand(
        companyId,
        quoteId ? "convert" : "create",
        {
          request_id: requestId,
          quote_id: quoteId || undefined,
          kind,
          customer_id: customerId || null,
          counterparty,
          description,
          category,
          amount_cents: quoteId ? undefined : parseMoney(amount),
          occurred_on: day,
          due_on: due,
          notes,
        },
      );
      onSaved(row.id);
    } catch (e) {
      setError(financeError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        kind === "sale" ? "Registrar venda / serviço" : "Registrar despesa"
      }
      description="Registre o fato e o vencimento. O pagamento será lançado separadamente, na data em que acontecer."
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit} className="finance-form">
        <fieldset disabled={busy || !online}>
          {kind === "sale" && (
            <label className="finance-wide">
              Origem
              <select
                aria-label="Origem da venda"
                value={quoteId}
                onChange={(e) => setQuoteId(e.target.value)}
              >
                <option value="">Venda ou serviço avulso</option>
                {quotes
                  .filter((q) => q.status === "approved")
                  .map((q) => (
                    <option key={q.id} value={q.id}>
                      ORC-{String(q.number).padStart(4, "0")} · {q.title}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {selected ? (
            <div className="finance-wide finance-info">
              <strong>
                {selected.customer_name} · {financeMoney(selected.total_cents)}
              </strong>
              <p>
                Itens, desconto e condições serão preservados. Cada orçamento
                gera uma única operação.
              </p>
            </div>
          ) : (
            <>
              <label className="finance-wide">
                Descrição
                <input
                  required
                  minLength={2}
                  maxLength={240}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              {kind === "sale" ? (
                <label className="finance-wide">
                  Cliente
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                  >
                    <option value="">Sem cliente vinculado</option>
                    {customers
                      .filter((c) => c.active)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
              ) : (
                <label className="finance-wide">
                  Fornecedor / favorecido
                  <input
                    maxLength={160}
                    value={counterparty}
                    onChange={(e) => setCounterparty(e.target.value)}
                  />
                </label>
              )}
              <label>
                Valor total (R$)
                <input
                  required
                  inputMode="decimal"
                  placeholder="0,00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label>
                Categoria
                <input
                  required
                  minLength={2}
                  maxLength={80}
                  list="finance-categories"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
                <datalist id="finance-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
              <label className="finance-wide">
                Observações
                <textarea
                  maxLength={4000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </>
          )}
          <label>
            Data da operação
            <input
              type="date"
              required
              min="1900-01-01"
              value={day}
              onChange={(e) => {
                setDay(e.target.value);
                if (due < e.target.value) setDue(e.target.value);
              }}
            />
          </label>
          <label>
            Vencimento
            <input
              type="date"
              required
              min={day}
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </label>
        </fieldset>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {!online && (
          <p className="notice" role="status">
            Conecte-se à internet para registrar.
          </p>
        )}
        <div className="finance-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button className="button primary" disabled={busy || !online}>
            {busy ? "Registrando…" : "Registrar operação"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function PaymentForm({
  operation,
  online,
  onClose,
  onSaved,
}: {
  operation: OperationDetail;
  online: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [requestId] = useState(() => crypto.randomUUID());
  const paid = operation.payments
    .filter((p) => !p.voided_at)
    .reduce((s, p) => s + p.amount_cents, 0);
  const pending = operation.amount_cents - paid;
  const [amount, setAmount] = useState(
    `${Math.floor(pending / 100)},${String(pending % 100).padStart(2, "0")}`,
  );
  const [day, setDay] = useState(todayBR);
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !online) return;
    setBusy(true);
    setError("");
    try {
      await financeCommand(operation.company_id, "pay", {
        request_id: requestId,
        operation_id: operation.id,
        amount_cents: parseMoney(amount),
        paid_on: day,
        method,
        reference,
      });
      onSaved();
    } catch (e) {
      setError(financeError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        operation.kind === "sale"
          ? "Registrar recebimento"
          : "Registrar pagamento"
      }
      description={`Saldo em aberto: ${financeMoney(pending)}. Informe somente o valor efetivamente movimentado.`}
      onClose={onClose}
      busy={busy}
    >
      <form className="finance-form" onSubmit={submit}>
        <fieldset disabled={busy || !online}>
          <label>
            Valor movimentado (R$)
            <input
              required
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label>
            Data efetiva
            <input
              required
              type="date"
              min="1900-01-01"
              max={todayBR()}
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </label>
          <label>
            Forma de pagamento
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            >
              {Object.entries(paymentMethods).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Referência / comprovante
            <input
              maxLength={240}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
        </fieldset>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <div className="finance-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button className="button primary" disabled={busy || !online}>
            {busy ? "Registrando…" : "Confirmar pagamento"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Detail({
  id,
  companyId,
  online,
  onClose,
  onChanged,
}: {
  id: string;
  companyId: string;
  online: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [pay, setPay] = useState(false);
  const [correction, setCorrection] = useState<Operation | Payment | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(
    async (signal: AbortSignal) => {
      const { data, error } = await financeClient()
        .rpc("nexo_operation_detail", { p_id: id })
        .abortSignal(signal);
      if (error) throw error;
      return validDetail(companyId, data);
    },
    [id, companyId],
  );
  const detail = useCompanyQuery(companyId, load);
  const o = detail.data;
  const paid =
    o?.payments
      .filter((p) => !p.voided_at)
      .reduce((s, p) => s + p.amount_cents, 0) || 0;
  async function correct(e: FormEvent) {
    e.preventDefault();
    if (!correction || busy || !online) return;
    setBusy(true);
    setError("");
    try {
      await financeCommand(
        companyId,
        "operation_id" in correction ? "void_payment" : "void_operation",
        { id: correction.id, reason },
      );
      setCorrection(null);
      setReason("");
      await detail.reload();
      onChanged();
    } catch (e) {
      setError(financeError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Modal
        title={o?.description || "Detalhes da operação"}
        description={
          o
            ? `${o.kind === "sale" ? "Venda / serviço" : "Despesa"} · ${o.counterparty || "Sem favorecido informado"}`
            : "Consultando o histórico…"
        }
        onClose={onClose}
      >
        <div className="finance-detail">
          {detail.loading && <p role="status">Carregando histórico…</p>}
          {detail.error && (
            <p className="notice error" role="alert">
              {detail.error}
              <button
                className="text-button"
                onClick={() => void detail.reload()}
              >
                Tentar novamente
              </button>
            </p>
          )}
          {o && (
            <>
              <div className="finance-detail-grid">
                <div>
                  <small>Valor da operação</small>
                  <strong>{financeMoney(o.amount_cents)}</strong>
                </div>
                <div>
                  <small>{o.kind === "sale" ? "Recebido" : "Pago"}</small>
                  <strong>{financeMoney(paid)}</strong>
                </div>
                <div>
                  <small>Em aberto</small>
                  <strong>
                    {o.voided_at
                      ? "Anulado"
                      : financeMoney(o.amount_cents - paid)}
                  </strong>
                </div>
                <div>
                  <small>Competência / vencimento</small>
                  <strong>
                    {financeDate(o.occurred_on)} / {financeDate(o.due_on)}
                  </strong>
                </div>
              </div>
              <p>
                <b>Categoria:</b> {o.category}
              </p>
              {o.quote_snapshot && (
                <p>
                  Origem: ORC-{String(o.quote_snapshot.number).padStart(4, "0")}{" "}
                  · {o.quote_snapshot.items.length} itens preservados.
                </p>
              )}
              {o.notes && <p className="finance-notes">{o.notes}</p>}
              {o.voided_at && (
                <p className="notice">Anulado: {o.void_reason}</p>
              )}
              <h3>Histórico de pagamentos</h3>
              {!o.payments.length ? (
                <p className="muted">Nenhum pagamento registrado.</p>
              ) : (
                <ul className="finance-payment-list">
                  {o.payments.map((p) => (
                    <li key={p.id}>
                      <div>
                        <strong>{financeMoney(p.amount_cents)}</strong>
                        <span>
                          {financeDate(p.paid_on)} · {paymentMethods[p.method]}
                        </span>
                        {p.reference && <small>{p.reference}</small>}
                        {p.voided_at && <small>Anulado: {p.void_reason}</small>}
                      </div>
                      {!p.voided_at && (
                        <button
                          className="text-button"
                          disabled={!online}
                          onClick={() => {
                            setError("");
                            setCorrection(p);
                          }}
                        >
                          Corrigir lançamento
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="finance-actions">
                {!o.voided_at && paid < o.amount_cents && (
                  <button
                    className="button primary"
                    disabled={!online}
                    onClick={() => setPay(true)}
                  >
                    {o.kind === "sale"
                      ? "Registrar recebimento"
                      : "Registrar pagamento"}
                  </button>
                )}
                {!o.voided_at && paid === 0 && (
                  <button
                    className="button secondary"
                    disabled={!online}
                    onClick={() => {
                      setError("");
                      setCorrection(o);
                    }}
                  >
                    Anular operação
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </Modal>
      {o && pay && (
        <PaymentForm
          operation={o}
          online={online}
          onClose={() => setPay(false)}
          onSaved={() => {
            setPay(false);
            void detail.reload();
            onChanged();
          }}
        />
      )}
      {correction && (
        <Modal
          title="Corrigir lançamento incorreto"
          description="A anulação preserva o registro e seu motivo no histórico. Use para corrigir erros de lançamento; uma devolução real de dinheiro precisa de um lançamento financeiro próprio."
          onClose={() => setCorrection(null)}
          busy={busy}
        >
          <form className="finance-form" onSubmit={correct}>
            <label>
              Motivo da correção
              <textarea
                required
                minLength={3}
                maxLength={500}
                disabled={busy}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <div className="finance-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setCorrection(null)}
                disabled={busy}
              >
                Cancelar
              </button>
              <button className="button danger" disabled={busy || !online}>
                Confirmar anulação
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export default function FinancePage({
  company,
  customers,
  quotes,
  online,
  onNotice,
}: Props) {
  const [month, setMonth] = useState(() => todayBR().slice(0, 7));
  const [kind, setKind] = useState("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [create, setCreate] = useState<"sale" | "expense" | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);
  const load = useCallback(
    async (signal: AbortSignal) => {
      const { data, error } = await financeClient()
        .rpc("nexo_finance_page", {
          p_month: month + "-01",
          p_kind: kind,
          p_query: query,
          p_offset: (page - 1) * 30,
        })
        .abortSignal(signal);
      if (error) throw error;
      if (data.rows.some((r) => r.company_id !== company.id))
        throw new Error("Dados de outra empresa recusados.");
      return data;
    },
    [month, kind, query, page, company.id],
  );
  const result = useCompanyQuery(company.id, load);
  const data = result.data;
  const s = data?.summary;
  async function exportYear(mode: "operations" | "payments") {
    if (exportBusy || !online) return;
    setExportBusy(true);
    try {
      const { fetchCompanyExport, downloadFinancialCsv } = await import(
        "../../lib/exports"
      );
      const snapshot = await fetchCompanyExport(company.id);
      downloadFinancialCsv(snapshot, month.slice(0, 4), mode);
      onNotice("Relatório anual exportado com IDs e histórico de anulações.");
    } catch (e) {
      onNotice(financeError(e));
    } finally {
      setExportBusy(false);
    }
  }
  const cards = s
    ? [
        ["Vendas e serviços", s.sales_cents, "Pela data da operação, no mês"],
        ["Despesas", s.expenses_cents, "Pela data da operação, no mês"],
        ["Recebido", s.received_cents, "Pela data efetiva do recebimento"],
        ["Pago", s.paid_cents, "Pela data efetiva do pagamento"],
        [
          "Movimento líquido",
          String(BigInt(s.received_cents) - BigInt(s.paid_cents)),
          "Entradas − saídas do mês; sem saldo inicial",
        ],
        [
          "Ticket médio",
          s.sale_count
            ? String(
                (BigInt(s.sales_cents) + BigInt(Math.floor(s.sale_count / 2))) /
                  BigInt(s.sale_count),
              )
            : "0",
          `${s.sale_count} vendas/serviços no mês`,
        ],
      ]
    : [];
  return (
    <div className="finance-page">
      <section className="finance-heading">
        <div>
          <span className="eyebrow">CONTROLE FINANCEIRO</span>
          <h1>Clareza em cada movimento.</h1>
          <p>Saiba o que vendeu, o que recebeu e para onde o dinheiro foi.</p>
        </div>
        <div className="finance-actions">
          <button
            className="button secondary"
            disabled={!online}
            onClick={() => setCreate("expense")}
          >
            <ArrowUpRight size={17} />
            Nova despesa
          </button>
          <button
            className="button primary"
            disabled={!online}
            onClick={() => setCreate("sale")}
          >
            <Plus size={17} />
            Nova venda / serviço
          </button>
        </div>
      </section>
      <section className="card finance-controls">
        <label>
          Período
          <input
            aria-label="Período financeiro"
            type="month"
            min="1900-01"
            value={month}
            onChange={(e) => {
              if (e.target.value) {
                setMonth(e.target.value);
                setPage(1);
              }
            }}
          />
        </label>
        <button
          className="button secondary"
          disabled={!online || result.loading}
          onClick={() => void result.reload()}
        >
          <RefreshCw size={16} />
          Atualizar
        </button>
        <span>Datas no fuso de São Paulo · Valores em reais</span>
      </section>
      {result.error && (
        <div className="notice error" role="alert">
          {result.error}
        </div>
      )}
      {result.loading ? (
        <div className="card module-loading" role="status">
          Consultando seus movimentos…
        </div>
      ) : (
        <>
          <section className="finance-metrics">
            {cards.map(([title, value, description]) => (
              <article className="card" key={title}>
                <span>
                  <CircleDollarSign size={16} />
                  {title}
                </span>
                <strong>{financeMoney(value)}</strong>
                <small>{description}</small>
              </article>
            ))}
          </section>
          {s && (
            <section className="card finance-balances">
              <div>
                <small>A receber · todos os períodos</small>
                <strong>{financeMoney(s.receivable_cents)}</strong>
              </div>
              <div>
                <small>A pagar · todos os períodos</small>
                <strong>{financeMoney(s.payable_cents)}</strong>
              </div>
              <div>
                <small>Vencido · a pagar + a receber</small>
                <strong>{financeMoney(s.overdue_cents)}</strong>
              </div>
            </section>
          )}
        </>
      )}
      <section className="card">
        <div className="finance-toolbar">
          <h2>Lançamentos</h2>
          <label className="finance-search">
            <Search size={17} />
            <input
              type="search"
              aria-label="Buscar lançamentos"
              placeholder="Descrição, cliente ou categoria"
              value={search}
              maxLength={160}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="Tipo de lançamento"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Todos os tipos</option>
            <option value="sale">Vendas e serviços</option>
            <option value="expense">Despesas</option>
          </select>
        </div>
        {!result.loading && data && !data.rows.length && (
          <div className="finance-empty">
            <CircleDollarSign size={32} />
            <h3>Nenhum lançamento neste filtro.</h3>
            <p>
              Registre uma venda, converta um orçamento aprovado ou organize
              suas despesas.
            </p>
          </div>
        )}
        {data && (
          <>
            <div className="finance-table-scroll">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Operação</th>
                    <th>Competência / vencimento</th>
                    <th>Total</th>
                    <th>Movimentado</th>
                    <th>Situação</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <span className={`finance-kind ${o.kind}`}>
                          {o.kind === "sale" ? (
                            <ArrowDownLeft size={14} />
                          ) : (
                            <ArrowUpRight size={14} />
                          )}{" "}
                          {o.kind === "sale" ? "Venda / serviço" : "Despesa"}
                        </span>
                        <strong>{o.description}</strong>
                        <small>{o.counterparty || o.category}</small>
                      </td>
                      <td>
                        {financeDate(o.occurred_on)}
                        <small>Vence {financeDate(o.due_on)}</small>
                      </td>
                      <td>{financeMoney(o.amount_cents)}</td>
                      <td>{financeMoney(o.paid_cents)}</td>
                      <td>
                        <span className="status">
                          {o.voided_at
                            ? "Anulado"
                            : o.paid_cents === o.amount_cents
                              ? "Quitado"
                              : o.paid_cents > 0
                                ? "Parcial"
                                : o.due_on < todayBR()
                                  ? "Vencido"
                                  : "Em aberto"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => setDetail(o.id)}
                          aria-label={`Detalhes de ${o.description}`}
                        >
                          Ver histórico
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              pages={Math.max(1, Math.ceil(data.total / 30))}
              total={data.total}
              from={data.total ? (page - 1) * 30 + 1 : 0}
              to={Math.min(page * 30, data.total)}
              onPage={setPage}
            />
          </>
        )}
      </section>
      {s && s.categories.length > 0 && (
        <section className="card finance-categories">
          <h2>Onde estão as despesas do mês</h2>
          {s.categories.map((c) => (
            <div key={c.category}>
              <span>{c.category}</span>
              <strong>{financeMoney(c.amount_cents)}</strong>
            </div>
          ))}
        </section>
      )}
      <section className="card finance-reports">
        <div>
          <FileDown size={23} />
          <h2>Seus números para conferir e compartilhar</h2>
          <p>
            Exporte o ano {month.slice(0, 4)} por competência ou por
            movimentação de caixa. Os arquivos incluem registros anulados
            identificados para conferência. São relatórios gerenciais para
            apoiar seu controle e seu contador; não calculam impostos.
          </p>
        </div>
        <div className="finance-actions">
          <button
            className="button secondary"
            disabled={!online || exportBusy}
            onClick={() => void exportYear("operations")}
          >
            CSV anual de operações
          </button>
          <button
            className="button secondary"
            disabled={!online || exportBusy}
            onClick={() => void exportYear("payments")}
          >
            CSV anual de caixa
          </button>
        </div>
      </section>
      {create && (
        <NewOperation
          companyId={company.id}
          customers={customers}
          quotes={quotes}
          kind={create}
          online={online}
          onClose={() => setCreate(null)}
          onSaved={(id) => {
            setCreate(null);
            setDetail(id);
            void result.reload();
            onNotice(
              "Operação registrada. Confira o histórico e registre o pagamento quando acontecer.",
            );
          }}
        />
      )}
      {detail && (
        <Detail
          key={detail}
          id={detail}
          companyId={company.id}
          online={online}
          onClose={() => setDetail(null)}
          onChanged={() => {
            void result.reload();
            onNotice("Histórico financeiro atualizado.");
          }}
        />
      )}
    </div>
  );
}
