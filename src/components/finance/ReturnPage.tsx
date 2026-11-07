import { useCallback, useEffect, useState } from "react";
import { MessageCircle, RefreshCw, UsersRound } from "lucide-react";
import { useCompanyQuery } from "../../hooks/useCompanyQuery";
import { financeClient, financeDate } from "../../lib/finance";
import Pagination from "../Pagination";
import type { Company } from "../../types";
import "./FinancePage.css";
export default function ReturnPage({
  company,
  online,
}: {
  company: Company;
  online: boolean;
}) {
  const [days, setDays] = useState(60);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
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
        .rpc("nexo_customer_return", {
          p_days: days,
          p_offset: (page - 1) * 30,
          p_query: query,
        })
        .abortSignal(signal);
      if (error) throw error;
      if (data.rows.some((c) => c.company_id !== company.id))
        throw new Error("Cliente de outra empresa recusado.");
      return data;
    },
    [company.id, days, page, query],
  );
  const result = useCompanyQuery(company.id, load);
  const data = result.data;
  return (
    <div className="finance-page">
      <section className="finance-heading">
        <div>
          <span className="eyebrow">RELACIONAMENTO</span>
          <h1>Um bom motivo para voltar.</h1>
          <p>
            Reencontre clientes sem compra ou atendimento recente. A lista
            considera vendas e serviços registrados, não orçamentos.
          </p>
        </div>
        <UsersRound size={35} />
      </section>
      <section className="card finance-controls">
        <label>
          Sem atendimento há
          <select
            value={days}
            onChange={(e) => {
              setDays(Number(e.target.value));
              setPage(1);
            }}
          >
            <option value={30}>30 dias</option>
            <option value={60}>60 dias</option>
            <option value={90}>90 dias</option>
            <option value={180}>180 dias</option>
            <option value={365}>1 ano</option>
          </select>
        </label>
        <input
          type="search"
          aria-label="Buscar cliente para retorno"
          placeholder="Nome ou telefone"
          maxLength={160}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className="button secondary"
          disabled={!online || result.loading}
          onClick={() => void result.reload()}
        >
          <RefreshCw size={16} />
          Atualizar
        </button>
      </section>
      {result.error && (
        <p className="notice error" role="alert">
          {result.error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {result.loading && (
        <p role="status">Consultando o histórico dos clientes…</p>
      )}
      {data && (
        <section className="card finance-return-list">
          {!data.rows.length ? (
            <div className="finance-empty">
              <UsersRound size={30} />
              <h2>Nenhum cliente neste filtro.</h2>
              <p>
                Os retornos aparecem conforme você registra vendas e serviços.
              </p>
            </div>
          ) : (
            data.rows.map((c) => (
              <article key={c.id}>
                <div>
                  <h2>{c.name}</h2>
                  <p>{c.phone || "Telefone não cadastrado"}</p>
                  <small>
                    {c.last_sale_on
                      ? `Última operação: ${financeDate(c.last_sale_on)} · ${c.sale_count} no histórico`
                      : "Ainda sem venda ou serviço registrado"}
                  </small>
                </div>
                <button
                  className="button secondary"
                  onClick={() => {
                    const text = `Olá, ${c.name}! Aqui é da ${company.name}. Tudo bem? Gostaríamos de saber se podemos ajudar você novamente. Estamos à disposição!`;
                    void navigator.clipboard
                      .writeText(text)
                      .then(() =>
                        setMessage(
                          "Mensagem copiada. Revise e envie manualmente ao cliente pelo canal adequado.",
                        ),
                      )
                      .catch(() => setMessage(text));
                  }}
                >
                  <MessageCircle size={16} />
                  Copiar mensagem
                </button>
              </article>
            ))
          )}
          <Pagination
            page={page}
            pages={Math.max(1, Math.ceil(data.total / 30))}
            total={data.total}
            from={data.total ? (page - 1) * 30 + 1 : 0}
            to={Math.min(page * 30, data.total)}
            onPage={setPage}
          />
        </section>
      )}
      <p className="finance-footnote">
        Use os contatos fornecidos pelos clientes e respeite pedidos para não
        receber mensagens. Nenhuma mensagem é enviada automaticamente.
      </p>
    </div>
  );
}
