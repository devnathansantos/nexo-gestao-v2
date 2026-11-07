import Pagination from "../Pagination";
import { usePagination } from "../../hooks/usePagination";
import { useMemo, useState, type FormEvent } from "react";
import {
  Check,
  CircleAlert,
  FilterX,
  LoaderCircle,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import Modal from "../Modal";
import {
  formatMoney,
  normalizeCatalogInput,
  parseMoney,
} from "../../lib/commerce";
import type { CatalogInput, CatalogItem } from "../../types";
import "./CatalogPage.css";

export interface CatalogPageProps {
  items: CatalogItem[];
  loading: boolean;
  error: string | null;
  online: boolean;
  onCreate: (input: CatalogInput) => Promise<unknown>;
  onUpdate: (id: string, input: CatalogInput) => Promise<unknown>;
  onRemove: (id: string) => Promise<void>;
  onReload: () => Promise<unknown>;
  onNotice: (message: string) => void;
}

type KindFilter = "all" | "product" | "service";
type StatusFilter = "all" | "active" | "inactive";

function searchable(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR");
}

function displayError(cause: unknown, fallback: string) {
  if (!(cause instanceof Error)) return fallback;
  const message = cause.message.trim();
  return message.length <= 260 &&
    !/sqlstate|postgres|schema|relation|jwt|api.?key|https?:\/\//i.test(
      message,
    ) &&
    /[ãáâéêíóôõúç]|^(Não|Informe|Use|O |A |Os |As |Preço|Nome|Unidade|Descrição|Confira|Escolha|Este|Esse|Tente|Aguarde)/i.test(
      message,
    )
    ? message
    : fallback;
}

function KindBadge({ kind }: { kind: CatalogItem["kind"] }) {
  const Icon = kind === "product" ? Package : Wrench;
  return (
    <span className={`catalog-kind ${kind}`}>
      <Icon size={13} aria-hidden="true" />
      {kind === "product" ? "Produto" : "Serviço"}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`catalog-status ${active ? "" : "inactive"}`}>
      <span />
      {active ? "Ativo" : "Inativo"}
    </span>
  );
}

interface EditorProps {
  item: CatalogItem | null;
  online: boolean;
  onClose: () => void;
  onSave: (input: CatalogInput) => Promise<void>;
}

function CatalogEditor({ item, online, onClose, onSave }: EditorProps) {
  const [kind, setKind] = useState<CatalogInput["kind"]>(
    item?.kind ?? "product",
  );
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "un.");
  const [price, setPrice] = useState(
    item ? (item.price_cents / 100).toFixed(2).replace(".", ",") : "",
  );
  const [active, setActive] = useState(item?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!online) {
      setError("Conecte-se à internet para salvar este item.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const input = normalizeCatalogInput({
        kind,
        name,
        description: description.trim() || null,
        unit,
        price_cents: parseMoney(price),
        active,
      });
      await onSave(input);
    } catch (cause) {
      setError(
        displayError(
          cause,
          "Não foi possível salvar o item. Confira os campos e tente novamente.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={item ? "Editar item do catálogo" : "Novo item do catálogo"}
      description="Defina os produtos e serviços que sua empresa oferece."
      onClose={onClose}
      busy={busy}
    >
      <form className="catalog-editor" onSubmit={submit} aria-busy={busy}>
        <div className="catalog-form-grid">
          <label className="catalog-field catalog-field-wide">
            <span>
              Nome do item <span aria-hidden="true">*</span>
            </span>
            <input
              name="catalogName"
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              maxLength={160}
              required
              placeholder="Nome do produto ou serviço"
              disabled={busy}
            />
          </label>
          <label className="catalog-field">
            <span>Tipo do item</span>
            <select
              value={kind}
              onChange={(event) =>
                setKind(event.target.value as CatalogInput["kind"])
              }
              disabled={busy}
            >
              <option value="product">Produto</option>
              <option value="service">Serviço</option>
            </select>
          </label>
          <label className="catalog-field">
            <span>
              Unidade <span aria-hidden="true">*</span>
            </span>
            <input
              name="catalogUnit"
              list="catalog-unit-suggestions"
              autoComplete="off"
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              maxLength={20}
              required
              placeholder="Ex.: un., hora, kg"
              disabled={busy}
            />
            <datalist id="catalog-unit-suggestions">
              <option value="un." />
              <option value="hora" />
              <option value="kg" />
              <option value="litro" />
              <option value="diária" />
              <option value="sessão" />
              <option value="mês" />
            </datalist>
          </label>
          <label className="catalog-field catalog-field-wide">
            <span>
              Preço de referência (R$) <span aria-hidden="true">*</span>
            </span>
            <div className="catalog-price-input">
              <span aria-hidden="true">R$</span>
              <input
                name="catalogPrice"
                type="text"
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                required
                maxLength={20}
                placeholder="0,00"
                aria-describedby="catalog-price-hint"
                disabled={busy}
              />
            </div>
            <small id="catalog-price-hint">
              Use vírgula para centavos. Ex.: 25,90. O valor pode ser zero.
            </small>
          </label>
          <label className="catalog-field catalog-field-wide">
            <span>
              Descrição <small>Opcional</small>
            </span>
            <textarea
              name="catalogDescription"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={3000}
              placeholder="O que está incluído ou quais detalhes ajudam na hora de orçar?"
              disabled={busy}
            />
            <small>
              Essas informações ajudam a preparar os próximos orçamentos.
            </small>
          </label>
          <label className="catalog-active-field catalog-field-wide">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
              disabled={busy}
            />
            <span>
              <strong>Item ativo no catálogo</strong>
              <small>
                Desative os itens que sua empresa deixou de oferecer.
              </small>
            </span>
          </label>
        </div>
        {error && (
          <p className="catalog-message error" role="alert">
            <CircleAlert size={17} aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
        {!online && (
          <p className="catalog-message" role="status">
            Você está sem conexão. Conecte-se à internet para salvar.
          </p>
        )}
        <div className="catalog-modal-footer">
          <span>* Campos obrigatórios</span>
          <button
            type="button"
            className="catalog-button secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="catalog-button primary"
            disabled={busy || !online}
          >
            {busy ? (
              <LoaderCircle
                className="catalog-spin"
                size={17}
                aria-hidden="true"
              />
            ) : (
              <Check size={17} aria-hidden="true" />
            )}
            {busy ? "Salvando…" : "Salvar item"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function CatalogPage({
  items,
  loading,
  error,
  online,
  onCreate,
  onUpdate,
  onRemove,
  onReload,
  onNotice,
}: CatalogPageProps) {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [editing, setEditing] = useState<CatalogItem | null | undefined>(
    undefined,
  );
  const [deleting, setDeleting] = useState<CatalogItem | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [reloadBusy, setReloadBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const normalizedQuery = searchable(query.trim());
  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          (kindFilter === "all" || item.kind === kindFilter) &&
          (statusFilter === "all" ||
            item.active === (statusFilter === "active")) &&
          (!normalizedQuery ||
            searchable(
              `${item.name} ${item.description ?? ""} ${item.unit}`,
            ).includes(normalizedQuery)),
      ),
    [items, kindFilter, statusFilter, normalizedQuery],
  );
  const pagination = usePagination(
    filtered,
    JSON.stringify([normalizedQuery, kindFilter, statusFilter]),
  );
  const productCount = items.filter((item) => item.kind === "product").length;
  const serviceCount = items.length - productCount;

  function clearFilters() {
    setQuery("");
    setKindFilter("all");
    setStatusFilter("all");
  }

  async function reload() {
    if (!online || loading || reloadBusy) return;
    setReloadBusy(true);
    setActionError("");
    try {
      await onReload();
    } catch (cause) {
      setActionError(
        displayError(
          cause,
          "Não foi possível atualizar o catálogo. Tente novamente.",
        ),
      );
    } finally {
      setReloadBusy(false);
    }
  }

  async function save(input: CatalogInput) {
    if (!online) throw new Error("Conecte-se à internet para salvar o item.");
    const wasEditing = editing !== null && editing !== undefined;
    if (wasEditing) await onUpdate(editing.id, input);
    else await onCreate(input);
    setEditing(undefined);
    onNotice(
      wasEditing
        ? "Item do catálogo atualizado."
        : "Item adicionado ao catálogo.",
    );
  }

  function requestDelete(item: CatalogItem) {
    if (!online) return;
    setDeleteError("");
    setDeleting(item);
  }

  async function remove() {
    if (!deleting || deletingBusy || !online) return;
    setDeletingBusy(true);
    setDeleteError("");
    try {
      await onRemove(deleting.id);
      setDeleting(null);
      onNotice("Item excluído do catálogo.");
    } catch (cause) {
      setDeleteError(
        displayError(
          cause,
          "Não foi possível excluir o item. Tente novamente.",
        ),
      );
    } finally {
      setDeletingBusy(false);
    }
  }

  function actions(item: CatalogItem) {
    return (
      <div className="catalog-row-actions">
        <button
          type="button"
          className="catalog-icon-button"
          onClick={() => setEditing(item)}
          disabled={!online}
          aria-label={`Editar ${item.name}`}
        >
          <Pencil size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="catalog-icon-button catalog-danger-icon"
          onClick={() => requestDelete(item)}
          disabled={!online}
          aria-label={`Excluir ${item.name}`}
        >
          <Trash2 size={17} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <section
      className="catalog-page"
      aria-label="Catálogo de produtos e serviços"
    >
      <div className="catalog-topline">
        <p>
          <strong>{items.length}</strong>{" "}
          {items.length === 1 ? "item cadastrado" : "itens cadastrados"}
          <span aria-hidden="true">·</span>
          {productCount} {productCount === 1 ? "produto" : "produtos"}
          <span aria-hidden="true">·</span>
          {serviceCount} {serviceCount === 1 ? "serviço" : "serviços"}
        </p>
        <button
          type="button"
          className="catalog-button primary"
          onClick={() => setEditing(null)}
          disabled={!online}
        >
          <Plus size={18} aria-hidden="true" />
          Novo item
        </button>
      </div>
      {(error || actionError) && (
        <div className="catalog-message error" role="alert">
          <CircleAlert size={18} aria-hidden="true" />
          <span>{error || actionError}</span>
          <button
            type="button"
            className="catalog-text-button"
            onClick={() => void reload()}
            disabled={!online || loading || reloadBusy}
          >
            Tentar novamente
          </button>
        </div>
      )}
      <div className="catalog-card">
        <div className="catalog-toolbar">
          <div className="catalog-search">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              aria-label="Buscar no catálogo"
              placeholder="Buscar por nome ou descrição…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button
                type="button"
                className="catalog-icon-button"
                onClick={() => setQuery("")}
                aria-label="Limpar busca do catálogo"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="catalog-filter-group">
            <select
              aria-label="Filtrar tipo do item"
              value={kindFilter}
              onChange={(event) =>
                setKindFilter(event.target.value as KindFilter)
              }
            >
              <option value="all">Produtos e serviços</option>
              <option value="product">Produtos</option>
              <option value="service">Serviços</option>
            </select>
            <select
              aria-label="Filtrar situação do item"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
            >
              <option value="all">Todas as situações</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
            <button
              type="button"
              className="catalog-icon-button"
              onClick={() => void reload()}
              disabled={!online || loading || reloadBusy}
              aria-label="Atualizar catálogo"
            >
              <RefreshCw
                size={18}
                className={loading || reloadBusy ? "catalog-spin" : undefined}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
        {loading ? (
          <div className="catalog-empty catalog-loading" role="status">
            <LoaderCircle
              className="catalog-spin"
              size={26}
              aria-hidden="true"
            />
            <p>Organizando seu catálogo…</p>
          </div>
        ) : !items.length ? (
          <div className="catalog-empty">
            <span className="catalog-empty-symbol">
              <Package size={29} aria-hidden="true" />
            </span>
            <h2>O que sua empresa oferece?</h2>
            <p>
              Reúna produtos, serviços e preços de referência para preparar seus
              próximos orçamentos.
            </p>
            <button
              type="button"
              className="catalog-button primary"
              onClick={() => setEditing(null)}
              disabled={!online}
            >
              <Plus size={17} aria-hidden="true" />
              Cadastrar primeiro item
            </button>
          </div>
        ) : !filtered.length ? (
          <div className="catalog-empty">
            <span className="catalog-empty-symbol">
              <Search size={27} aria-hidden="true" />
            </span>
            <h2>Nenhum item encontrado</h2>
            <p>
              Tente outro termo ou altere os filtros para encontrar o que
              procura.
            </p>
            <button
              type="button"
              className="catalog-button secondary"
              onClick={clearFilters}
            >
              <FilterX size={17} aria-hidden="true" />
              Limpar filtros
            </button>
          </div>
        ) : (
          <>
            <div className="catalog-table-wrap">
              <table className="catalog-table">
                <thead>
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col">Tipo</th>
                    <th scope="col">Unidade</th>
                    <th scope="col">Preço de referência</th>
                    <th scope="col">Situação</th>
                    <th scope="col">
                      <span className="catalog-sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="catalog-item-info">
                          <span className={`catalog-item-symbol ${item.kind}`}>
                            {item.kind === "product" ? (
                              <Package size={20} aria-hidden="true" />
                            ) : (
                              <Wrench size={20} aria-hidden="true" />
                            )}
                          </span>
                          <span>
                            <strong>{item.name}</strong>
                            <small>
                              {item.description || "Sem descrição adicional"}
                            </small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <KindBadge kind={item.kind} />
                      </td>
                      <td>
                        <span className="catalog-unit">{item.unit}</span>
                      </td>
                      <td>
                        <strong className="catalog-price">
                          {formatMoney(item.price_cents)}
                        </strong>
                      </td>
                      <td>
                        <StatusBadge active={item.active} />
                      </td>
                      <td>{actions(item)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="catalog-mobile-list">
              {pagination.items.map((item) => (
                <article className="catalog-mobile-item" key={item.id}>
                  <div className="catalog-mobile-head">
                    <span className={`catalog-item-symbol ${item.kind}`}>
                      {item.kind === "product" ? (
                        <Package size={20} aria-hidden="true" />
                      ) : (
                        <Wrench size={20} aria-hidden="true" />
                      )}
                    </span>
                    <div>
                      <h3>{item.name}</h3>
                      <KindBadge kind={item.kind} />
                    </div>
                    <StatusBadge active={item.active} />
                  </div>
                  {item.description && (
                    <p className="catalog-mobile-description">
                      {item.description}
                    </p>
                  )}
                  <div className="catalog-mobile-bottom">
                    <div>
                      <strong className="catalog-price">
                        {formatMoney(item.price_cents)}
                      </strong>
                      <small>por {item.unit}</small>
                    </div>
                    {actions(item)}
                  </div>
                </article>
              ))}
            </div>
            <Pagination {...pagination} />
            <div className="catalog-list-footer">
              <span>
                {filtered.length === items.length
                  ? `${items.length} ${items.length === 1 ? "item" : "itens"}`
                  : `${filtered.length} de ${items.length} itens`}
              </span>
              <span>Produtos e serviços da sua empresa</span>
            </div>
          </>
        )}
      </div>
      <p className="catalog-footnote">
        Os preços são referências do catálogo. Cada orçamento mantém os valores
        definidos na sua criação.
      </p>
      {editing !== undefined && (
        <CatalogEditor
          key={editing?.id ?? "new"}
          item={editing}
          online={online}
          onClose={() => setEditing(undefined)}
          onSave={save}
        />
      )}
      {deleting && (
        <Modal
          title="Excluir item do catálogo?"
          description={`O item “${deleting.name}” será removido do catálogo da sua empresa.`}
          onClose={() => setDeleting(null)}
          busy={deletingBusy}
        >
          <div className="catalog-delete-content">
            <p>
              Orçamentos já criados mantêm os dados dos itens. A exclusão do
              catálogo não pode ser desfeita.
            </p>
            <p className="catalog-delete-tip">
              Quer apenas deixar de oferecer este item? Edite o cadastro e
              marque-o como inativo.
            </p>
            {deleteError && (
              <p className="catalog-message error" role="alert">
                <CircleAlert size={17} aria-hidden="true" />
                <span>{deleteError}</span>
              </p>
            )}
            {!online && (
              <p className="catalog-message" role="status">
                Conecte-se à internet para excluir.
              </p>
            )}
          </div>
          <div className="catalog-modal-footer">
            <button
              type="button"
              className="catalog-button secondary"
              onClick={() => setDeleting(null)}
              disabled={deletingBusy}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="catalog-button danger"
              onClick={() => void remove()}
              disabled={deletingBusy || !online}
            >
              {deletingBusy ? (
                <LoaderCircle
                  size={17}
                  className="catalog-spin"
                  aria-hidden="true"
                />
              ) : (
                <Trash2 size={17} aria-hidden="true" />
              )}
              {deletingBusy ? "Excluindo…" : "Excluir item"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
