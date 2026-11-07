import { lazy, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CloudOff,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  CircleDollarSign,
  HeartHandshake,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  MoreHorizontal,
  Pencil,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserRoundCheck,
  UserRoundPlus,
  UsersRound,
  WifiOff,
  X,
} from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import AuthScreen from "./components/AuthScreen";
import Modal from "./components/Modal";
import { DeviceLock, PinSettings } from "./components/DeviceLock";
import { useAuth } from "./hooks/useAuth";
import { useCustomers } from "./hooks/useCustomers";
import { useCatalog } from "./hooks/useCatalog";
import { useQuotes } from "./hooks/useQuotes";
import { useDeviceLock } from "./hooks/useDeviceLock";
import {
  isSupabaseConfigured,
  supabaseConfigurationError,
} from "./lib/supabase";
import ModuleBoundary from "./components/ModuleBoundary";
import Pagination from "./components/Pagination";
import { usePagination } from "./hooks/usePagination";
import type { Customer, CustomerInput } from "./types";

const CustomerDialog = lazy(
  () => import("./components/customers/CustomerDialog"),
);
const CompanySettings = lazy(
  () => import("./components/company/CompanySettings"),
);
const CatalogPage = lazy(() => import("./components/commerce/CatalogPage"));
const QuotesPage = lazy(() => import("./components/commerce/QuotesPage"));
const CommercialOverview = lazy(
  () => import("./components/commerce/CommercialOverview"),
);

const FinancePage = lazy(() => import("./components/finance/FinancePage"));
const ReturnPage = lazy(() => import("./components/finance/ReturnPage"));

type View =
  | "overview"
  | "customers"
  | "quotes"
  | "catalog"
  | "finance"
  | "retention"
  | "company"
  | "security"
  | "exports";
const navigation: { id: View; label: string; icon: typeof UsersRound }[] = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "customers", label: "Clientes", icon: UsersRound },
  { id: "quotes", label: "Orçamentos", icon: FileText },
  { id: "catalog", label: "Catálogo", icon: Package },
  { id: "finance", label: "Financeiro", icon: CircleDollarSign },
  { id: "retention", label: "Retorno de clientes", icon: HeartHandshake },
  { id: "company", label: "Minha empresa", icon: Building2 },
  { id: "security", label: "Segurança", icon: ShieldCheck },
  { id: "exports", label: "Exportações", icon: ArrowDownToLine },
];
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });
const date = (value: string) => dateFormatter.format(new Date(value));
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Não foi possível concluir. Tente novamente.";

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

function Brand() {
  return (
    <div className="brand">
      <img
        className="nexo-original-logo"
        src={`${import.meta.env.BASE_URL}nexo-logo.png`}
        alt="NEXO Gestão"
        width="112"
        height="112"
      />
    </div>
  );
}

export default function App() {
  const auth = useAuth();
  const records = useCustomers(auth.company?.id);
  const catalog = useCatalog(auth.company?.id);
  const proposals = useQuotes(auth.company?.id);
  const deviceLock = useDeviceLock(auth.session?.user.id);
  const online = useOnline();
  const [view, setView] = useState<View>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<Customer | null | undefined>(
    undefined,
  );
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [toast, setToast] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [recoverPin, setRecoverPin] = useState(false);
  const [freshPassword, setFreshPassword] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<
    | (Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: string }>;
      })
    | null
  >(null);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 6500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const receive = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as typeof installPrompt);
    };
    const installed = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", receive);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", receive);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  const { resetAfterPassword } = deviceLock;
  useEffect(() => {
    if (recoverPin && freshPassword && auth.session?.user.id) {
      try {
        resetAfterPassword();
      } catch (error) {
        setToast(errorMessage(error));
      }
      setRecoverPin(false);
      setFreshPassword(false);
    }
  }, [recoverPin, freshPassword, auth.session?.user.id, resetAfterPassword]);
  useEffect(() => {
    setEditing(undefined);
    setDeleting(null);
    setQuery("");
    setFilter("all");
    setView("overview");
    setToast("");
  }, [auth.session?.user.id]);

  const go = (next: View) => {
    setView(next);
    setSidebarOpen(false);
    setQuery("");
  };
  const signOut = async () => {
    await auth.signOut();
    setEditing(undefined);
    setDeleting(null);
  };
  const exitAccount = () => {
    void signOut().catch((error) => setToast(errorMessage(error)));
  };
  const recover = async () => {
    setRecoverPin(true);
    setFreshPassword(false);
    await signOut();
  };
  const signIn = async (email: string, password: string) => {
    await auth.signIn(email, password);
    setFreshPassword(true);
  };
  const saveCustomer = async (input: CustomerInput) => {
    if (!online) throw new Error("Conecte-se à internet para salvar.");
    if (editing) await records.update(editing.id, input);
    else await records.create(input);
    setEditing(undefined);
    setToast(
      editing
        ? "Cliente atualizado com sucesso."
        : "Cliente cadastrado com sucesso.",
    );
  };
  const removeCustomer = async () => {
    if (!deleting || !online || deletingBusy) return;
    setDeletingBusy(true);
    setDeleteError("");
    try {
      await records.remove(deleting.id);
      void proposals.reload().catch(() => {});
      setDeleting(null);
      setToast("Cliente excluído.");
    } catch (failure) {
      setDeleteError(errorMessage(failure));
    } finally {
      setDeletingBusy(false);
    }
  };
  const exportData = async (format: "csv" | "json") => {
    if (!auth.company || exportBusy || !online) return;
    setExportBusy(true);
    try {
      const {
        fetchCompanyExport,
        downloadCompanyBackup,
        downloadCustomersCsv,
      } = await import("./lib/exports");
      const current = await fetchCompanyExport(auth.company.id);
      if (format === "csv") downloadCustomersCsv(current.customers);
      else
        downloadCompanyBackup(
          current.company,
          current.customers,
          current.catalog_items,
          current.quotes,
          current.operations,
          current.payments,
        );
      setToast(
        format === "csv"
          ? "Lista de clientes exportada."
          : "Arquivo da empresa, clientes, catálogo, orçamentos e financeiro exportado.",
      );
    } catch (failure) {
      setToast(errorMessage(failure));
    } finally {
      setExportBusy(false);
    }
  };
  const normalizedQuery = query.toLocaleLowerCase("pt-BR").trim();
  const filtered = useMemo(
    () =>
      records.customers.filter((customer) => {
        const matches = [
          customer.name,
          customer.email,
          customer.phone,
          customer.document,
        ].some((value) =>
          value?.toLocaleLowerCase("pt-BR").includes(normalizedQuery),
        );
        return (
          matches &&
          (filter === "all" || customer.active === (filter === "active"))
        );
      }),
    [records.customers, normalizedQuery, filter],
  );
  const customerPage = usePagination(
    filtered,
    JSON.stringify([auth.company?.id, normalizedQuery, filter]),
  );
  const activeCount = records.customers.filter(
    (customer) => customer.active,
  ).length;
  const emailCount = records.customers.filter(
    (customer) => customer.email,
  ).length;
  const latest = records.customers.slice(0, 5);
  const install = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
    }
  };

  if (auth.loading)
    return (
      <div className="boot-screen">
        <Brand />
        <LoaderCircle className="spin" size={25} />
        <p>Preparando seu espaço de trabalho…</p>
      </div>
    );
  if (!auth.session || auth.recoveringPassword)
    return (
      <>
        <AuthScreen
          configured={isSupabaseConfigured}
          configurationError={supabaseConfigurationError}
          recoveringPassword={auth.recoveringPassword}
          onSignIn={signIn}
          onSignUp={auth.signUp}
          onRequestPasswordReset={auth.requestPasswordReset}
          onUpdatePassword={auth.updatePassword}
        />
        {!online && (
          <div className="offline-auth" role="status">
            <WifiOff size={16} />
            Conecte-se à internet para acessar sua conta.
          </div>
        )}
      </>
    );
  if (deviceLock.locked)
    return (
      <DeviceLock lock={deviceLock} onRecover={recover} onSignOut={signOut} />
    );
  if (!auth.company)
    return (
      <main className="boot-screen">
        <Brand />
        <div className="card connection-card">
          <CloudOff size={36} />
          <h1>Não conseguimos abrir sua empresa</h1>
          <p>
            {auth.error ||
              "Confira sua conexão. Se o cadastro acabou de ser criado, tente carregar novamente."}
          </p>
          <div className="actions">
            <button
              className="button primary"
              disabled={!online}
              onClick={() =>
                void auth
                  .refreshCompany()
                  .catch((error) => setToast(errorMessage(error)))
              }
            >
              <RefreshCw size={16} />
              Tentar novamente
            </button>
            <button className="button secondary" onClick={exitAccount}>
              Sair da conta
            </button>
          </div>
        </div>
      </main>
    );
  const company = auth.company;
  const title =
    navigation.find((item) => item.id === view)?.label || "Visão geral";
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Pular para conteúdo
      </a>
      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Fechar menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`sidebar ${sidebarOpen ? "is-open" : ""}`}
        aria-label="Menu principal"
      >
        <Brand />
        <button className="workspace" onClick={() => go("company")}>
          <span className="avatar">{initials(company.name)}</span>
          <span>
            <strong>{company.name}</strong>
            <small>Seu espaço de trabalho</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <span className="nav-caption">SEU NEGÓCIO</span>
        <nav>
          {navigation.slice(0, 6).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-link ${view === id ? "active" : ""}`}
              onClick={() => go(id)}
              aria-current={view === id ? "page" : undefined}
            >
              <Icon size={19} />
              {label}
              {view === id && <span className="active-dot" />}
            </button>
          ))}
        </nav>
        <span className="nav-caption">SEU ESPAÇO</span>
        <nav>
          {navigation.slice(6).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-link ${view === id ? "active" : ""}`}
              onClick={() => go(id)}
              aria-current={view === id ? "page" : undefined}
            >
              <Icon size={19} />
              {label}
              {view === id && <span className="active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="note-symbol">
            <ShieldCheck size={18} />
          </span>
          <strong>Seu negócio tem seu espaço.</strong>
          <p>Os dados da sua empresa pertencem à sua conta.</p>
        </div>
        <div className="sidebar-bottom">
          {deviceLock.enabled && (
            <button className="nav-link" onClick={deviceLock.lock}>
              <LockKeyhole size={18} />
              Bloquear tela
            </button>
          )}
          <button className="nav-link" onClick={exitAccount}>
            <LogOut size={18} />
            Sair da conta
          </button>
          <div className="account">
            <span className="avatar">{initials(company.name)}</span>
            <div>
              <strong>Conta da empresa</strong>
              <small title={auth.session.user.email}>
                {auth.session.user.email}
              </small>
            </div>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu size={21} />
            </button>
            <Building2 size={16} />
            <span>Seu negócio</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <span className={`connection-status ${online ? "" : "is-offline"}`}>
              <span />
              {online ? "Conectado" : "Sem conexão"}
            </span>
            {deviceLock.enabled && (
              <button
                className="icon-button"
                onClick={deviceLock.lock}
                aria-label="Bloquear tela com PIN"
              >
                <LockKeyhole size={18} />
              </button>
            )}
            <button
              className="avatar account-button"
              onClick={() => go("company")}
              aria-label="Abrir dados da empresa"
            >
              {initials(company.name)}
            </button>
          </div>
        </header>
        {!online && (
          <div className="connectivity-banner" role="status">
            <WifiOff size={17} />
            Você está sem conexão. Conecte-se para salvar alterações ou exportar
            os dados atualizados.
          </div>
        )}
        {needRefresh && (
          <div className="update-banner" role="status">
            <RefreshCw size={16} />
            Uma nova versão do NEXO está disponível.
            <button onClick={() => void updateServiceWorker(true)}>
              Atualizar aplicativo
            </button>
          </div>
        )}
        <main id="main-content" className="content" tabIndex={-1}>
          <ModuleBoundary key={`${company.id}:${view}`}>
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  {view === "overview"
                    ? "SEU NEGÓCIO, EM PERSPECTIVA"
                    : view === "customers"
                      ? "RELACIONAMENTO QUE CRESCE"
                      : view === "quotes"
                        ? "DO PRIMEIRO CONTATO AO PRÓXIMO NEGÓCIO"
                        : view === "catalog"
                          ? "O QUE SUA EMPRESA OFERECE"
                          : "DO SEU JEITO"}
                </span>
                <h1>
                  {view === "overview" ? "Uma visão clara de tudo." : title}
                </h1>
                <p>
                  {view === "overview"
                    ? "Clientes, catálogo e propostas: seus próximos passos em um só lugar."
                    : view === "customers"
                      ? "Conheça seus clientes. Organize os contatos. Construa boas relações."
                      : view === "quotes"
                        ? "Prepare propostas claras, acompanhe as respostas e mantenha os detalhes organizados."
                        : view === "catalog"
                          ? "Produtos e serviços com preços de referência para agilizar seus orçamentos."
                          : view === "finance"
                            ? "Vendas, despesas e pagamentos com histórico e valores precisos."
                            : view === "retention"
                              ? "Use o histórico para cuidar do relacionamento com seus clientes."
                              : view === "company"
                                ? "As informações que identificam seu negócio."
                                : view === "security"
                                  ? "Cuide do acesso à sua conta e a este aparelho."
                                  : "Leve uma cópia dos seus dados com você."}
                </p>
              </div>
              {(view === "overview" || view === "customers") && (
                <button
                  className="button primary"
                  onClick={() => setEditing(null)}
                  disabled={!online || records.loading}
                >
                  <Plus size={17} />
                  Novo cliente
                </button>
              )}
            </div>
            {records.error && (view === "overview" || view === "customers") && (
              <div className="notice error" role="alert">
                <span>{records.error}</span>
                <button
                  className="text-button"
                  onClick={() => void records.reload().catch(() => {})}
                >
                  Tentar novamente
                </button>
              </div>
            )}
            {view === "overview" && (
              <>
                <section className="welcome-card">
                  <div className="welcome-copy">
                    <span className="hero-eyebrow">
                      <span />
                      UM BOM COMEÇO FAZ DIFERENÇA
                    </span>
                    <h2>
                      Seus próximos negócios começam com uma boa proposta.
                    </h2>
                    <p>
                      Organize o que você oferece, conheça seus clientes e
                      prepare orçamentos com cada detalhe no lugar.
                    </p>
                    <button
                      className="button hero-button"
                      onClick={() =>
                        records.customers.length
                          ? go("quotes")
                          : setEditing(null)
                      }
                      disabled={!online && !records.customers.length}
                    >
                      {records.customers.length
                        ? "Ver orçamentos"
                        : "Cadastrar primeiro cliente"}
                      <ArrowRight size={16} />
                    </button>
                  </div>
                  <div className="welcome-art" aria-hidden="true">
                    <div className="art-circle circle-one" />
                    <div className="art-circle circle-two" />
                    <div className="art-contact">
                      <div className="art-person">
                        <FileText size={33} />
                      </div>
                      <div className="art-line" />
                      <div className="art-line short" />
                      <span className="art-check">
                        <Check size={21} />
                      </span>
                    </div>
                    <div className="art-chip">
                      <ShieldCheck size={14} />
                      Tudo no seu espaço.
                    </div>
                  </div>
                </section>
                <section
                  className="stats-grid"
                  aria-label="Indicadores de clientes"
                >
                  <StatCard
                    label="Clientes cadastrados"
                    value={records.loading ? "—" : records.customers.length}
                    description="Sua carteira de relacionamentos"
                    icon={<UsersRound size={19} />}
                  />
                  <StatCard
                    label="Clientes ativos"
                    value={records.loading ? "—" : activeCount}
                    description="Relacionamentos em andamento"
                    icon={<UserRoundCheck size={19} />}
                  />
                  <StatCard
                    label="Contatos com e-mail"
                    value={records.loading ? "—" : emailCount}
                    description="Mais formas de manter contato"
                    icon={<UserRoundPlus size={19} />}
                  />
                </section>
                <CommercialOverview
                  quotes={proposals.quotes}
                  catalog={catalog.items}
                  loading={proposals.loading || catalog.loading}
                  error={proposals.error || catalog.error}
                  onQuotes={() => go("quotes")}
                  onCatalog={() => go("catalog")}
                />
                <div className="dashboard-grid">
                  <section className="card recent-card">
                    <div className="panel-heading">
                      <div>
                        <h2>Clientes mais recentes</h2>
                        <p>Os últimos contatos que chegaram à sua empresa.</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => go("customers")}
                      >
                        Ver todos
                        <ArrowRight size={14} />
                      </button>
                    </div>
                    {records.loading ? (
                      <Loading />
                    ) : latest.length ? (
                      <div className="recent-list">
                        {latest.map((customer) => (
                          <button
                            key={customer.id}
                            className="recent-customer"
                            onClick={() => {
                              go("customers");
                              setEditing(customer);
                            }}
                          >
                            <span className="avatar">
                              {initials(customer.name)}
                            </span>
                            <span>
                              <strong>{customer.name}</strong>
                              <small>
                                {customer.email ||
                                  customer.phone ||
                                  "Contato ainda não informado"}
                              </small>
                            </span>
                            <span
                              className={`status ${customer.active ? "" : "inactive"}`}
                            >
                              {customer.active ? "Ativo" : "Inativo"}
                            </span>
                            <ChevronRight size={15} />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <Empty
                        compact
                        onCreate={() => setEditing(null)}
                        disabled={!online}
                      />
                    )}
                  </section>
                  <section className="card care-card">
                    <span className="section-icon">
                      <ShieldCheck size={24} />
                    </span>
                    <h2>Organização que acompanha você.</h2>
                    <p>
                      Acesse sua conta no computador ou no celular. Seus
                      clientes ficam vinculados à sua empresa.
                    </p>
                    <div className="care-item">
                      <Check size={15} />
                      <span>Dados salvos na sua conta</span>
                    </div>
                    <div className="care-item">
                      <Check size={15} />
                      <span>Exportação dos cadastros</span>
                    </div>
                    <div className="care-item">
                      <Check size={15} />
                      <span>PIN opcional neste aparelho</span>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => go("security")}
                    >
                      Cuidar da minha segurança
                      <ArrowRight size={14} />
                    </button>
                  </section>
                </div>
              </>
            )}
            {view === "customers" && (
              <section className="card customers-card">
                <div className="customer-toolbar">
                  <div className="search-field">
                    <Search size={18} />
                    <input
                      aria-label="Buscar clientes"
                      placeholder="Buscar por nome, e-mail ou telefone…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {query && (
                      <button
                        className="icon-button"
                        onClick={() => setQuery("")}
                        aria-label="Limpar busca"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                  <div className="toolbar-actions">
                    <select
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      aria-label="Filtrar situação"
                    >
                      <option value="all">Todos os clientes</option>
                      <option value="active">Ativos</option>
                      <option value="inactive">Inativos</option>
                    </select>
                    <button
                      className="button secondary"
                      onClick={() => void exportData("csv")}
                      disabled={!online || records.loading || exportBusy}
                    >
                      <Download size={15} />
                      <span>Exportar CSV</span>
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => void records.reload().catch(() => {})}
                      disabled={!online || records.loading}
                      aria-label="Atualizar clientes"
                    >
                      <RefreshCw
                        size={17}
                        className={records.loading ? "spin" : ""}
                      />
                    </button>
                  </div>
                </div>
                {records.loading ? (
                  <Loading />
                ) : !records.customers.length ? (
                  <Empty onCreate={() => setEditing(null)} disabled={!online} />
                ) : !filtered.length ? (
                  <div className="empty-state">
                    <Search size={33} />
                    <h2>Nenhum resultado por aqui</h2>
                    <p>
                      Experimente outro nome ou altere o filtro de situação.
                    </p>
                    <button
                      className="text-button"
                      onClick={() => {
                        setQuery("");
                        setFilter("all");
                      }}
                    >
                      Limpar filtros
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Cliente</th>
                            <th>Contato</th>
                            <th>Situação</th>
                            <th>Cadastro</th>
                            <th>
                              <span className="sr-only">Ações</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {customerPage.items.map((customer) => (
                            <tr key={customer.id}>
                              <td>
                                <div className="table-person">
                                  <span className="avatar">
                                    {initials(customer.name)}
                                  </span>
                                  <span>
                                    <strong>{customer.name}</strong>
                                    <small>
                                      {customer.document ||
                                        "Documento não informado"}
                                    </small>
                                  </span>
                                </div>
                              </td>
                              <td>
                                <div className="contact-lines">
                                  <span>
                                    {customer.email || "E-mail não informado"}
                                  </span>
                                  <small>
                                    {customer.phone || "Telefone não informado"}
                                  </small>
                                </div>
                              </td>
                              <td>
                                <span
                                  className={`status ${customer.active ? "" : "inactive"}`}
                                >
                                  {customer.active ? "Ativo" : "Inativo"}
                                </span>
                              </td>
                              <td className="date-cell">
                                {date(customer.created_at)}
                              </td>
                              <td>
                                <div className="row-actions">
                                  <button
                                    className="icon-button"
                                    onClick={() => setEditing(customer)}
                                    disabled={!online}
                                    aria-label={`Editar ${customer.name}`}
                                  >
                                    <Pencil size={16} />
                                  </button>
                                  <button
                                    className="icon-button danger-icon"
                                    onClick={() => {
                                      setDeleting(customer);
                                      setDeleteError("");
                                    }}
                                    disabled={!online}
                                    aria-label={`Excluir ${customer.name}`}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Pagination {...customerPage} />
                    <div className="table-footer">
                      <span>
                        {filtered.length}{" "}
                        {filtered.length === 1 ? "cliente" : "clientes"}
                        {filtered.length !== records.customers.length &&
                          ` de ${records.customers.length}`}
                      </span>
                      <span>Informações vinculadas à sua empresa</span>
                    </div>
                  </>
                )}
              </section>
            )}
            {view === "catalog" && (
              <CatalogPage
                items={catalog.items}
                loading={catalog.loading}
                error={catalog.error}
                online={online}
                onCreate={catalog.create}
                onUpdate={catalog.update}
                onRemove={async (id) => {
                  await catalog.remove(id);
                  void proposals.reload().catch(() => {});
                }}
                onReload={catalog.reload}
                onNotice={setToast}
              />
            )}
            {view === "quotes" && (
              <QuotesPage
                company={company}
                customers={records.customers}
                catalog={catalog.items}
                quotes={proposals.quotes}
                loading={
                  proposals.loading || records.loading || catalog.loading
                }
                error={proposals.error || records.error || catalog.error}
                online={online}
                onSave={proposals.save}
                onStatus={proposals.setStatus}
                onRemove={proposals.remove}
                onReload={proposals.reload}
                onNotice={setToast}
              />
            )}
            {view === "finance" && (
              <FinancePage
                company={company}
                customers={records.customers}
                quotes={proposals.quotes}
                online={online}
                onNotice={setToast}
              />
            )}
            {view === "retention" && (
              <ReturnPage company={company} online={online} />
            )}
            {view === "company" && (
              <div className="settings-grid">
                <CompanySettings
                  key={company.id}
                  company={company}
                  onSaved={auth.refreshCompany}
                  online={online}
                />
                <section className="card settings-card">
                  <span className="section-icon">
                    <Download size={23} />
                  </span>
                  <h2>O NEXO, sempre por perto.</h2>
                  <p className="muted">
                    Instale o aplicativo para abrir seu espaço direto da tela
                    inicial.
                  </p>
                  {installPrompt && (
                    <button
                      className="button primary"
                      onClick={() => void install()}
                    >
                      <Download size={16} />
                      Instalar aplicativo
                    </button>
                  )}
                  <div className="install-instructions">
                    <h3>No iPhone</h3>
                    <p>
                      Abra no Safari, toque em Compartilhar e selecione{" "}
                      <strong>Adicionar à Tela de Início</strong>.
                    </p>
                    <h3>No Android ou computador</h3>
                    <p>
                      Use a opção <strong>Instalar aplicativo</strong> ou{" "}
                      <strong>Adicionar à tela inicial</strong> no menu do
                      navegador.
                    </p>
                  </div>
                  <p className="small-note">
                    <WifiOff size={15} />É necessário estar conectado para
                    entrar na conta e salvar alterações.
                  </p>
                </section>
              </div>
            )}
            {view === "security" && (
              <div className="settings-grid">
                <section className="card settings-card">
                  <span className="section-icon">
                    <LockKeyhole size={23} />
                  </span>
                  <h2>Um PIN para este aparelho</h2>
                  <p className="muted">
                    Uma proteção de tela opcional para quando o aplicativo ficar
                    aberto.
                  </p>
                  <PinSettings lock={deviceLock} />
                </section>
                <section className="card settings-card">
                  <span className="section-icon">
                    <ShieldCheck size={23} />
                  </span>
                  <h2>Acesso à conta</h2>
                  <div className="setting-info">
                    <span>E-mail de acesso</span>
                    <strong>{auth.session.user.email}</strong>
                  </div>
                  <p className="muted">
                    A senha protege o acesso à sua conta. O PIN apenas bloqueia
                    a tela neste aparelho e não funciona como verificação em
                    duas etapas.
                  </p>
                  <p className="small-note">
                    Para recuperar sua senha, saia da conta e use “Esqueci minha
                    senha” na tela de acesso.
                  </p>
                  <button className="button secondary" onClick={exitAccount}>
                    <LogOut size={16} />
                    Sair da conta
                  </button>
                </section>
              </div>
            )}
            {view === "exports" && (
              <>
                <section className="export-intro">
                  <ShieldCheck size={20} />
                  <div>
                    <strong>Uma cópia para guardar com cuidado.</strong>
                    <p>
                      Os arquivos podem conter dados pessoais dos clientes.
                      Armazene-os em um lugar seguro.
                    </p>
                  </div>
                </section>
                <div className="settings-grid">
                  <section className="card settings-card">
                    <span className="section-icon">
                      <FileSpreadsheet size={25} />
                    </span>
                    <h2>Lista de clientes</h2>
                    <p className="muted">
                      Exporte todos os clientes em uma planilha CSV, incluindo
                      contatos, situação e observações.
                    </p>
                    <div className="export-meta">
                      <span>Formato</span>
                      <strong>CSV · abre em planilhas</strong>
                    </div>
                    <button
                      className="button primary"
                      onClick={() => void exportData("csv")}
                      disabled={!online || records.loading || exportBusy}
                    >
                      {exportBusy ? (
                        <LoaderCircle size={16} className="spin" />
                      ) : (
                        <Download size={16} />
                      )}
                      Exportar clientes
                    </button>
                  </section>
                  <section className="card settings-card">
                    <span className="section-icon">
                      <FileJson size={25} />
                    </span>
                    <h2>Arquivo dos seus dados</h2>
                    <p className="muted">
                      Exporte os dados da empresa, clientes, catálogo e
                      orçamentos com seus respectivos itens.
                    </p>
                    <div className="export-meta">
                      <span>Formato</span>
                      <strong>JSON · versão 3</strong>
                    </div>
                    <button
                      className="button secondary"
                      onClick={() => void exportData("json")}
                      disabled={!online || records.loading || exportBusy}
                    >
                      {exportBusy ? (
                        <LoaderCircle size={16} className="spin" />
                      ) : (
                        <Download size={16} />
                      )}
                      Exportar dados
                    </button>
                    <p className="small-note">
                      Esta entrega permite exportar. A restauração será incluída
                      em uma próxima etapa. Senhas e PIN não entram no arquivo.
                    </p>
                  </section>
                </div>
              </>
            )}
          </ModuleBoundary>
          <footer className="app-footer">
            <span>
              NEXO Gestão <span className="footer-dot">·</span> Clareza para
              cuidar do seu negócio.
            </span>
            <span>{company.name}</span>
          </footer>
        </main>
      </div>
      <nav className="mobile-bottom-nav" aria-label="Acesso rápido">
        <button
          className={view === "overview" ? "active" : ""}
          onClick={() => go("overview")}
        >
          <LayoutDashboard size={20} />
          Visão geral
        </button>
        <button
          className={view === "customers" ? "active" : ""}
          onClick={() => go("customers")}
        >
          <UsersRound size={20} />
          Clientes
        </button>
        <button
          className="mobile-add"
          onClick={() => setEditing(null)}
          disabled={!online}
          aria-label="Adicionar cliente"
        >
          <Plus size={23} />
        </button>
        <button
          className={view === "quotes" ? "active" : ""}
          onClick={() => go("quotes")}
        >
          <FileText size={20} />
          Orçamentos
        </button>
        <button onClick={() => setSidebarOpen(true)}>
          <MoreHorizontal size={20} />
          Mais
        </button>
      </nav>
      {editing !== undefined && (
        <ModuleBoundary>
          <CustomerDialog
            customer={editing}
            onClose={() => setEditing(undefined)}
            onSave={saveCustomer}
            online={online}
          />
        </ModuleBoundary>
      )}
      {deleting && (
        <Modal
          title="Excluir este cliente?"
          description={`O cadastro de ${deleting.name} será removido da sua empresa. Esta ação não pode ser desfeita.`}
          onClose={() => setDeleting(null)}
          busy={deletingBusy}
        >
          <div className="delete-content">
            <p>
              Se deseja manter o histórico do contato, você pode editar o
              cliente e marcá-lo como inativo.
            </p>
            {deleteError && (
              <p className="notice error" role="alert">
                {deleteError}
              </p>
            )}
          </div>
          <div className="modal-footer">
            <button
              className="button secondary"
              onClick={() => setDeleting(null)}
              disabled={deletingBusy}
            >
              Cancelar
            </button>
            <button
              className="button danger"
              onClick={() => void removeCustomer()}
              disabled={deletingBusy || !online}
            >
              {deletingBusy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Trash2 size={16} />
              )}
              Excluir cliente
            </button>
          </div>
        </Modal>
      )}
      {toast && !deviceLock.locked && (
        <div className="toast" role="status">
          <CircleHelp size={18} />
          <span>{toast}</span>
          <button
            className="icon-button"
            onClick={() => setToast("")}
            aria-label="Fechar aviso"
          >
            <X size={16} />
          </button>
        </div>
      )}
      <DeviceLock lock={deviceLock} onRecover={recover} onSignOut={signOut} />
    </div>
  );
}

function StatCard({
  label,
  value,
  description,
  icon,
}: {
  label: string;
  value: number | string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <article className="card stat-card">
      <div>
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <p>{description}</p>
    </article>
  );
}
function Loading() {
  return (
    <div className="loading-block" role="status">
      <LoaderCircle className="spin" size={25} />
      <span>Carregando seus clientes…</span>
    </div>
  );
}
function Empty({
  onCreate,
  compact = false,
  disabled,
}: {
  onCreate: () => void;
  compact?: boolean;
  disabled: boolean;
}) {
  return (
    <div className={`empty-state ${compact ? "compact" : ""}`}>
      <span className="empty-symbol">
        <UsersRound size={29} />
      </span>
      <h2>Todo relacionamento tem um começo.</h2>
      <p>
        Adicione seu primeiro cliente e mantenha os contatos da empresa
        organizados em um só lugar.
      </p>
      <button
        className="button secondary"
        onClick={onCreate}
        disabled={disabled}
      >
        <Plus size={16} />
        Adicionar primeiro cliente
      </button>
    </div>
  );
}
