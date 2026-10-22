import { useEffect, useMemo, useRef, useState } from 'react';
import { isSupabaseConfigured, supabase } from './lib/supabaseClient';
import { EMPTY_RECORDS, TABLES as DB_TABLES, buildRecordPayload, deleteRecord as deleteRecordFromDatabase, loadWorkspace, saveCompany, saveMonthlyGoal, saveRecord } from './lib/data';
import './App.css';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', group: 'principal' },
  { id: 'clients', label: 'Clientes', icon: 'users', group: 'principal' },
  { id: 'services', label: 'Serviços', icon: 'car', group: 'principal' },
  { id: 'expenses', label: 'Despesas', icon: 'wallet', group: 'principal' },
  { id: 'employees', label: 'Funcionários', icon: 'team', group: 'principal' },
  { id: 'analysis', label: 'Análises', icon: 'chart', group: 'principal' },
  { id: 'quotes', label: 'Orçamentos', icon: 'file', group: 'gestao' },
  { id: 'catalog', label: 'Catálogo', icon: 'layers', group: 'gestao' },
  { id: 'retention', label: 'Retorno de clientes', icon: 'return', group: 'gestao' },
  { id: 'manage', label: 'Gerenciar', icon: 'grid', group: 'gestao' },
  { id: 'settings', label: 'Configurações', icon: 'settings', group: 'sistema' },
];

const VIEWS = {
  clients: { title: 'Clientes', eyebrow: 'RELACIONAMENTO', description: 'Consulte os clientes e mantenha os contatos organizados.', add: 'Novo cliente', type: 'client', list: 'clients', emptyTitle: 'Sua carteira de clientes começa aqui', emptyText: 'Cadastre seu primeiro cliente para reunir contato e histórico de atendimento em um só lugar.', icon: 'users', columns: [['nome', 'Cliente'], ['telefone', 'Telefone'], ['email', 'E-mail'], ['status', 'Situação'], ['createdAt', 'Cadastro']] },
  services: { title: 'Serviços', eyebrow: 'OPERAÇÃO', description: 'Organize os atendimentos, valores e situação de cada serviço.', add: 'Novo serviço', type: 'service', list: 'services', emptyTitle: 'Nenhum serviço registrado', emptyText: 'Os atendimentos registrados aparecerão nesta lista, com valores e situação de pagamento.', icon: 'car', columns: [['servico', 'Serviço'], ['cliente', 'Cliente'], ['veiculo', 'Veículo'], ['valor', 'Valor'], ['pagamento', 'Pagamento']] },
  expenses: { title: 'Despesas', eyebrow: 'FINANCEIRO', description: 'Acompanhe os custos da empresa e mantenha as saídas organizadas.', add: 'Nova despesa', type: 'expense', list: 'expenses', emptyTitle: 'Nenhuma despesa registrada', emptyText: 'Registre os custos da operação para acompanhar melhor o resultado do negócio.', icon: 'wallet', columns: [['descricao', 'Descrição'], ['categoria', 'Categoria'], ['data', 'Data'], ['valor', 'Valor']] },
  employees: { title: 'Funcionários', eyebrow: 'EQUIPE', description: 'Mantenha os dados da equipe e as regras de comissão organizados.', add: 'Adicionar funcionário', type: 'employee', list: 'employees', emptyTitle: 'Sua equipe começa aqui', emptyText: 'Adicione os profissionais que trabalham com você para organizar os cadastros.', icon: 'team', columns: [['nome', 'Nome'], ['funcao', 'Função'], ['telefone', 'Telefone'], ['comissao', 'Comissão'], ['status', 'Situação']] },
  quotes: { title: 'Orçamentos', eyebrow: 'COMERCIAL', description: 'Prepare propostas e acompanhe o andamento de cada orçamento.', add: 'Novo orçamento', type: 'quote', list: 'quotes', emptyTitle: 'Nenhum orçamento criado', emptyText: 'Crie uma proposta para formalizar o serviço e apresentar o valor ao cliente.', icon: 'file', columns: [['cliente', 'Cliente'], ['servico', 'Serviço'], ['veiculo', 'Veículo'], ['valor', 'Valor'], ['situacao', 'Situação']] },
  catalog: { title: 'Catálogo de serviços', eyebrow: 'SERVIÇOS E PREÇOS', description: 'Organize os serviços oferecidos e os preços de referência da empresa.', add: 'Novo serviço no catálogo', type: 'catalog', list: 'catalog', emptyTitle: 'Seu catálogo começa aqui', emptyText: 'Cadastre os serviços e preços que a empresa oferece para agilizar os próximos orçamentos.', icon: 'layers', columns: [['nome', 'Serviço'], ['descricao', 'Descrição'], ['valor', 'Preço'], ['duracao', 'Duração']] },
};

const FORMS = {
  client: { title: 'Novo cliente', list: 'clients', fields: [
    { name: 'nome', label: 'Nome completo', required: true, placeholder: 'Nome do cliente' },
    { name: 'telefone', label: 'Telefone e WhatsApp', placeholder: '(00) 00000-0000', type: 'tel' },
    { name: 'email', label: 'E-mail', placeholder: 'cliente@email.com', type: 'email' },
    { name: 'status', label: 'Situação do cliente', type: 'select', options: ['Ativo', 'Inativo'] },
    { name: 'observacao', label: 'Observações', placeholder: 'Informações úteis sobre o cliente', wide: true },
  ] },
  service: { title: 'Novo serviço', list: 'services', fields: [
    { name: 'client_id', label: 'Cliente', required: true, type: 'select', optionsFrom: 'clients' },
    { name: 'vehicle_id', label: 'Veículo', type: 'select', optionsFrom: 'vehicles' },
    { name: 'servico', label: 'Serviço realizado', required: true, placeholder: 'Ex.: Higienização interna' },
    { name: 'valor', label: 'Valor (R$)', required: true, placeholder: '0,00', type: 'number', min: '0', step: '0.01' },
    { name: 'data', label: 'Data do atendimento', type: 'date' },
    { name: 'pagamento', label: 'Situação do pagamento', type: 'select', options: ['Pendente', 'Recebido'] },
  ] },
  expense: { title: 'Nova despesa', list: 'expenses', fields: [
    { name: 'descricao', label: 'Descrição', required: true, placeholder: 'Ex.: Compra de produtos' },
    { name: 'categoria', label: 'Categoria', type: 'select', options: ['Produtos', 'Combustível', 'Manutenção', 'Equipamentos', 'Aluguel', 'Energia', 'Água', 'Internet', 'Impostos', 'Outros'] },
    { name: 'valor', label: 'Valor (R$)', required: true, placeholder: '0,00', type: 'number', min: '0', step: '0.01' },
    { name: 'data', label: 'Data', type: 'date' },
    { name: 'pagamento', label: 'Forma de pagamento', type: 'select', options: ['PIX', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Transferência', 'Boleto', 'Outro'] },
  ] },
  employee: { title: 'Adicionar funcionário', list: 'employees', fields: [
    { name: 'nome', label: 'Nome completo', required: true, placeholder: 'Nome do profissional' },
    { name: 'telefone', label: 'Telefone', placeholder: '(00) 00000-0000', type: 'tel' },
    { name: 'funcao', label: 'Função', placeholder: 'Ex.: Estética automotiva' },
    { name: 'comissao', label: 'Comissão (%)', placeholder: '0', type: 'number', min: '0', max: '100', step: '0.1' },
    { name: 'status', label: 'Situação', type: 'select', options: ['Ativo', 'Inativo'] },
  ] },
  quote: { title: 'Novo orçamento', list: 'quotes', fields: [
    { name: 'client_id', label: 'Cliente', required: true, type: 'select', optionsFrom: 'clients' },
    { name: 'vehicle_id', label: 'Veículo', type: 'select', optionsFrom: 'vehicles' },
    { name: 'servico', label: 'Serviço proposto', required: true, placeholder: 'Serviço ou pacote' },
    { name: 'valor', label: 'Valor (R$)', required: true, placeholder: '0,00', type: 'number', min: '0', step: '0.01' },
    { name: 'validade', label: 'Válido até', type: 'date' },
    { name: 'situacao', label: 'Situação', type: 'select', options: ['Em elaboração', 'Enviado', 'Aprovado', 'Recusado'] },
  ] },
  catalog: { title: 'Adicionar ao catálogo', list: 'catalog', fields: [
    { name: 'nome', label: 'Nome do serviço', required: true, placeholder: 'Ex.: Polimento técnico' },
    { name: 'descricao', label: 'Descrição', placeholder: 'O que está incluído', wide: true },
    { name: 'valor', label: 'Preço de referência (R$)', required: true, placeholder: '0,00', type: 'number', min: '0', step: '0.01' },
    { name: 'duracao', label: 'Duração estimada', placeholder: 'Ex.: 3 horas' },
  ] },
  employeePayment: { title: 'Registrar pagamento', list: 'employeePayments', fields: [
    { name: 'employee_id', label: 'Funcionário', required: true, type: 'select', optionsFrom: 'employees' },
    { name: 'descricao', label: 'Descrição', placeholder: 'Ex.: Comissão da semana' },
    { name: 'valor', label: 'Valor pago (R$)', required: true, placeholder: '0,00', type: 'number', min: '0', step: '0.01' },
    { name: 'data', label: 'Data do pagamento', type: 'date' },
    { name: 'metodo', label: 'Forma de pagamento', type: 'select', options: ['PIX', 'Dinheiro', 'Transferência', 'Outro'] },
  ] },
  vehicle: { title: 'Novo veículo', list: 'vehicles', fields: [
    { name: 'client_id', label: 'Cliente responsável', required: true, type: 'select', optionsFrom: 'clients' },
    { name: 'modelo', label: 'Marca e modelo', required: true, placeholder: 'Ex.: Honda Civic' },
    { name: 'placa', label: 'Placa', placeholder: 'ABC1D23' },
    { name: 'cor', label: 'Cor', placeholder: 'Cor do veículo' },
  ] },
};


const ICON_CONTENT = {
  dashboard: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="3.5" width="7" height="4.5" rx="1.4"/><rect x="13.5" y="10" width="7" height="10.5" rx="1.4"/><rect x="3.5" y="13" width="7" height="7.5" rx="1.4"/></>,
  users: <><path d="M16 20v-1.5a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4V20"/><circle cx="10" cy="7.5" r="3.5"/><path d="M16.5 4.3a3.5 3.5 0 0 1 0 6.8M20 20v-1.5a4 4 0 0 0-2.8-3.8"/></>,
  car: <><path d="m5 11 1.7-4.2A2.2 2.2 0 0 1 8.8 5.5h6.4a2.2 2.2 0 0 1 2.1 1.3L19 11"/><path d="M3.5 11h17v6.5h-17z"/><path d="M5 17.5v2M19 17.5v2M3.5 14h3M17.5 14h3"/><circle cx="7" cy="15" r=".65"/><circle cx="17" cy="15" r=".65"/></>,
  wallet: <><rect x="3" y="5" width="18" height="15" rx="2.5"/><path d="M3 8h15a3 3 0 0 1 3 3v2h-5a2.5 2.5 0 0 1 0-5h4"/><path d="M16 11h.01"/></>,
  team: <><circle cx="9" cy="7" r="3.2"/><path d="M3 20v-1.3a4.3 4.3 0 0 1 4.3-4.3h3.4a4.3 4.3 0 0 1 4.3 4.3V20"/><path d="M16 4.3a3.2 3.2 0 0 1 0 6.2M17 14.6a4.2 4.2 0 0 1 4 4.1V20"/></>,
  chart: <><path d="M4 20V11M10 20V4M16 20v-7M22 20H2"/></>,
  file: <><path d="M13.5 3.5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10z"/><path d="M13 3.5V10h7M8 14h8M8 17h6"/></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
  return: <><path d="M4 10a8 8 0 0 1 13.7-5.7L20 6.5"/><path d="M20 2.8v3.7h-3.7M20 14a8 8 0 0 1-13.7 5.7L4 17.5"/><path d="M4 21.2v-3.7h3.7"/></>,
  grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></>,
  settings: <><circle cx="12" cy="12" r="3.2"/><path d="m19.4 15 .1.1 1.2 1-1.5 2.6-1.5-.5a7.8 7.8 0 0 1-1.8 1l-.3 1.6h-3l-.3-1.6a7.8 7.8 0 0 1-1.8-1l-1.5.5-1.5-2.6 1.2-1a7.7 7.7 0 0 1 0-2l-1.2-1 1.5-2.6 1.5.5a7.8 7.8 0 0 1 1.8-1l.3-1.6h3l.3 1.6a7.8 7.8 0 0 1 1.8 1l1.5-.5 1.5 2.6-1.2 1a7.7 7.7 0 0 1 .4 1.5 7.7 7.7 0 0 1-.4 1.5Z" transform="translate(-1 -1) scale(1.08)"/></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  arrow: <><path d="M5 12h14M13 5l7 7-7 7"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M7 3v4M17 3v4M3 10h18"/></>,
  check: <><path d="m5 12 4.3 4.3L19.5 6"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5M4 20h16"/></>,
  close: <><path d="m6 6 12 12M18 6 6 18"/></>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>,
  spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2L12 3Z"/><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z"/></>,
  eye: <><path d="M2.5 12s3.2-6 9.5-6 9.5 6 9.5 6-3.2 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></>,
};

function Icon({ name = 'grid', size = 20, className = '' }) {
  return <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{ICON_CONTENT[name] || ICON_CONTENT.grid}</svg>;
}

function Brand({ subtitle = true, small = false }) {
  return <div className={`brand ${small ? 'brand-small' : ''}`} aria-label="NEXO Gestão">
    <span className="brand-symbol"><svg viewBox="0 0 44 44" aria-hidden="true"><defs><linearGradient id="nexoBrandGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4ba2ff"/><stop offset="1" stopColor="#1768f5"/></linearGradient></defs><rect x="1" y="1" width="42" height="42" rx="14" fill="url(#nexoBrandGradient)"/><path d="M12 31V13l20 18V13" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="32" cy="13" r="2.2" fill="#b9e7ff"/></svg></span>
    <span className="brand-name"><strong>NEXO</strong>{subtitle && <small>GESTÃO</small>}</span>
  </div>;
}

function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
}
function parseMoney(value) { return Number(String(value ?? '').replace(',', '.')) || 0; }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function formatDate(value) { if (!value) return '—'; const date = new Date(`${value}T12:00:00`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('pt-BR').format(date); }
function monthKey(value) { if (!value) return ''; return String(value).slice(0, 7); }
function authErrorMessage(error) {
  const raw = String(error?.message || 'Não foi possível concluir o acesso.');
  if (/invalid login credentials/i.test(raw)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(raw)) return 'Confirme seu e-mail antes de entrar. Procure a mensagem de confirmação na caixa de entrada ou no spam.';
  if (/user already registered/i.test(raw)) return 'Este e-mail já possui uma conta. Volte para a tela de entrada.';
  if (/password should be at least|weak password/i.test(raw)) return 'Escolha uma senha mais forte, com pelo menos 6 caracteres.';
  if (/failed to fetch|network|fetch error/i.test(raw)) return 'Não foi possível conectar ao Supabase. Confira a conexão e as configurações do projeto.';
  return raw;
}

function LoginScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState({ name: '', company: '', email: '', password: '' });
  const registerMode = mode === 'register';
  const resetMode = mode === 'reset';
  async function submit(event) {
    event.preventDefault();
    setNotice('');
    if (!isSupabaseConfigured || !supabase) {
      setNotice('O acesso ao banco de dados não está configurado. Tente novamente mais tarde ou contate o administrador do sistema.');
      return;
    }
    setBusy(true);
    try {
      if (resetMode) {
        const { error } = await supabase.auth.resetPasswordForEmail(fields.email.trim(), { redirectTo: window.location.href });
        if (error) throw error;
        setNotice('Enviamos um link para redefinir sua senha. Confira sua caixa de entrada e o spam.');
      } else if (registerMode) {
        const { data, error } = await supabase.auth.signUp({
          email: fields.email.trim(),
          password: fields.password,
          options: { data: { full_name: fields.name.trim(), company_name: fields.company.trim() } },
        });
        if (error) throw error;
        if (data.session && data.user) {
          await onAuthenticated(data.user);
        } else {
          setNotice('Conta criada. Confirme seu e-mail pelo link enviado antes de entrar no NEXO. Confira também a pasta de spam.');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: fields.email.trim(),
          password: fields.password,
        });
        if (error) throw error;
        if (!data.user) throw new Error('A autenticação não retornou um usuário. Tente novamente.');
        await onAuthenticated(data.user);
      }
    } catch (error) {
      setNotice(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return <main className="login-screen">
    <div className="login-orb login-orb-one"/><div className="login-orb login-orb-two"/>
    <div className="login-shell">
      <section className="login-story">
        <Brand />
        <div className="login-story-copy">
          <span className="eyebrow light-eyebrow"><span className="eyebrow-dot"/> GESTÃO AUTOMOTIVA</span>
          <h1>Mais clareza<br/>para cuidar<br/>do seu negócio.</h1>
          <p>Uma visão organizada da operação, dos clientes e dos resultados da empresa.</p>
          <div className="story-points">
            <div><span className="story-icon"><Icon name="chart" size={19}/></span><span><strong>Indicadores em um só lugar</strong><small>Entenda o mês sem perder tempo.</small></span></div>
            <div><span className="story-icon"><Icon name="users" size={19}/></span><span><strong>Relacionamento organizado</strong><small>Clientes, atendimentos e retornos.</small></span></div>
            <div><span className="story-icon"><Icon name="shield" size={19}/></span><span><strong>Privacidade em primeiro lugar</strong><small>Acesso protegido por conta.</small></span></div>
          </div>
        </div>
        <div className="login-story-foot"><span>Controle claro. Rotina leve.</span><span>© {new Date().getFullYear()} NEXO Gestão</span></div>
      </section>
      <section className="login-panel glass-panel">
        <div className="login-card-head"><div className="login-mobile-brand"><Brand /></div><span className="login-chip"><Icon name="shield" size={14}/> Acesso privado</span></div>
        <div className="login-heading"><span className="eyebrow">{resetMode ? 'RECUPERAÇÃO DE ACESSO' : registerMode ? 'COMECE POR AQUI' : 'BEM-VINDO DE VOLTA'}</span><h2>{resetMode ? 'Redefina sua senha' : registerMode ? 'Crie seu acesso' : 'Entre no NEXO'}</h2><p>{resetMode ? 'Enviaremos um link seguro para seu e-mail.' : registerMode ? 'Prepare seu espaço de gestão para a empresa.' : 'Acesse seu espaço e acompanhe a operação.'}</p></div>
        <form className="login-form" onSubmit={submit}>
          {registerMode && <><label>Seu nome<input autoComplete="name" value={fields.name} onChange={(e)=>setFields({...fields,name:e.target.value})} placeholder="Como podemos chamar você?" required disabled={busy}/></label><label>Nome da empresa<input autoComplete="organization" value={fields.company} onChange={(e)=>setFields({...fields,company:e.target.value})} placeholder="Nome da empresa" required disabled={busy}/></label></>}
          <label>E-mail<input type="email" autoComplete="email" value={fields.email} onChange={(e)=>setFields({...fields,email:e.target.value})} placeholder="voce@empresa.com" required disabled={busy}/></label>
          {!resetMode && <label>Senha<span className="password-wrap"><input type={showPassword ? 'text' : 'password'} autoComplete={registerMode ? 'new-password' : 'current-password'} value={fields.password} onChange={(e)=>setFields({...fields,password:e.target.value})} placeholder={registerMode ? 'Crie uma senha segura' : 'Digite sua senha'} minLength={6} required disabled={busy}/><button type="button" className="password-toggle" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={()=>setShowPassword(!showPassword)} disabled={busy}><Icon name="eye" size={18}/></button></span></label>}
          {!registerMode && !resetMode && <div className="login-form-meta"><span className="remember-label"><span>Login seguro</span></span><span className="secure-hint"><Icon name="lock" size={13}/> Sessão privada</span></div>}
          <button className="button button-primary button-wide" type="submit" disabled={busy || !isSupabaseConfigured}>{busy ? 'Aguarde…' : resetMode ? 'Enviar link de recuperação' : registerMode ? 'Criar acesso' : 'Entrar no NEXO'} <Icon name="arrow" size={18}/></button>
        </form>
        {!isSupabaseConfigured && <div className="login-notice" role="status"><Icon name="shield" size={18}/><span>O sistema está temporariamente indisponível porque a conexão segura ainda não foi configurada.</span></div>}
        {notice && <div className="login-notice" role="status"><Icon name="shield" size={18}/><span>{notice}</span></div>}
        <div className="login-switch"><span>{resetMode ? 'Lembrou a senha?' : registerMode ? 'Já possui acesso?' : 'Ainda não tem uma conta?'}</span><button type="button" disabled={busy || !isSupabaseConfigured} onClick={()=>{setMode(resetMode || registerMode ? 'login' : 'register');setNotice('');}}>{resetMode || registerMode ? 'Voltar para entrar' : 'Criar conta'}</button></div>
        {!registerMode && !resetMode && <button type="button" className="text-button" disabled={!isSupabaseConfigured} onClick={()=>{setMode('reset');setNotice('');}}>Esqueci minha senha</button>}
        <p className="login-disclaimer">Acesse com sua conta para consultar e gerenciar os dados da empresa.</p>
      </section>
    </div>
  </main>;
}


function PasswordRecoveryScreen({ onComplete }) {
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setNotice('');
    try {
      const { data, error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await onComplete(data.user);
    } catch (error) { setNotice(authErrorMessage(error)); }
    finally { setBusy(false); }
  }
  return <main className="login-screen"><section className="login-panel glass-panel recovery-panel"><Brand/><div className="login-heading"><span className="eyebrow">RECUPERAÇÃO DE ACESSO</span><h2>Crie uma nova senha</h2><p>Escolha uma senha com pelo menos 6 caracteres.</p></div><form className="login-form" onSubmit={submit}><label>Nova senha<input type="password" minLength={6} required value={password} onChange={(event)=>setPassword(event.target.value)} autoComplete="new-password"/></label><button className="button button-primary button-wide" disabled={busy}>{busy?'Salvando…':'Salvar nova senha'}</button></form>{notice&&<div className="login-notice" role="status">{notice}</div>}</section></main>;
}

function EmptyState({ icon = 'layers', title, description, action, onAction }) {
  return <div className="empty-state"><div className="empty-art"><span className="empty-art-halo"/><span className="empty-art-icon"><Icon name={icon} size={28}/></span><i className="empty-art-dot dot-a"/><i className="empty-art-dot dot-b"/></div><h3>{title}</h3><p>{description}</p>{action && <button type="button" className="button button-secondary" onClick={onAction}><Icon name="plus" size={17}/>{action}</button>}</div>;
}

function StatusPill({ value }) {
  const text = value || '—';
  const lower = String(text).toLowerCase();
  let tone = 'neutral';
  if (/cancelado|recusado|inativo/.test(lower)) tone = 'danger';
  else if (/recebido|concluído|aprovado|ativo/.test(lower)) tone = 'success';
  else if (/pendente|agendado|enviado|elaboração|andamento|sem atendimento/.test(lower)) tone = 'warning';
  return <span className={`status-pill ${tone}`}><i/>{text}</span>;
}

function DataTable({ columns, rows, empty, onEdit, onDelete }) {
  if (!rows.length) return <EmptyState icon={empty.icon} title={empty.title} description={empty.text} action={empty.action} onAction={empty.onAction}/>;
  return <div className="table-wrap"><table><thead><tr>{columns.map(([key,label])=><th key={key}>{label}</th>)}{(onEdit || onDelete) && <th>Ações</th>}</tr></thead><tbody>{rows.map((row)=><tr key={row.id}>{columns.map(([key])=><td key={key}>{renderCell(key,row[key])}</td>)}{(onEdit || onDelete) && <td><div className="table-actions">{onEdit && <button type="button" className="table-action" onClick={()=>onEdit(row)}>Editar</button>}{onDelete && <button type="button" className="table-action table-action-danger" onClick={()=>onDelete(row)}>Excluir</button>}</div></td>}</tr>)}</tbody></table><div className="table-foot"><span>{rows.length} {rows.length === 1 ? 'registro' : 'registros'} exibidos</span><span>Dados sincronizados</span></div></div>;
}
function renderCell(key, value) {
  if (key === 'valor') return <strong className="table-money">{formatMoney(value)}</strong>;
  if (['status','situacao','pagamento'].includes(key)) return <StatusPill value={value}/>;
  if (key === 'comissao') return `${value || '0'}%`;
  if (key === 'data' || key === 'validade' || key === 'createdAt') return formatDate(value);
  if (key === 'email' && !value) return <span className="muted-cell">Não informado</span>;
  return value || <span className="muted-cell">—</span>;
}

export default function App() {
  const [screen, setScreen] = useState(isSupabaseConfigured ? 'checking' : 'login');
  const [authMode, setAuthMode] = useState('signed-out');
  const [authUser, setAuthUser] = useState(null);
  const [databaseStatus, setDatabaseStatus] = useState(isSupabaseConfigured ? 'checking' : 'not-configured');
  const [databaseError, setDatabaseError] = useState('');
  const [activeView, setActiveView] = useState('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [month, setMonth] = useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));
  const [goal, setGoal] = useState('');
  const [savedGoal, setSavedGoal] = useState(0);
  const [modalType, setModalType] = useState('');
  const [formData, setFormData] = useState({});
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  const [search, setSearch] = useState('');
  const [records, setRecords] = useState({ ...EMPTY_RECORDS });
  const [editingRecordId, setEditingRecordId] = useState(null);
  const [monthlyGoals, setMonthlyGoals] = useState([]);
  const [manageTab, setManageTab] = useState('clients');
  const [retentionDays, setRetentionDays] = useState('30');
  const [retentionSearch, setRetentionSearch] = useState('');
  const [company, setCompany] = useState({ name: 'Sua empresa', phone: '', email: '', city: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  async function checkDatabaseAccess() {
    if (!isSupabaseConfigured || !supabase) return 'not-configured';
    try {
      const checks = await Promise.all([...Object.values(DB_TABLES), 'nexo_company_settings', 'nexo_monthly_goals'].map((table) =>
        supabase.from(table).select(table === 'nexo_company_settings' || table === 'nexo_monthly_goals' ? 'user_id' : 'id').limit(1)
      ));
      const failedCheck = checks.find(({ error }) => error);
      if (failedCheck) {
        setDatabaseError(failedCheck.error.message);
        return 'needs-sql';
      }
      setDatabaseError('');
      return 'connected';
    } catch (error) {
      setDatabaseError(error.message || 'Falha ao consultar as tabelas do banco.');
      return 'needs-sql';
    }
  }

  async function loadRecordsFromDatabase(user = authUser) {
    if (!supabase) return null;
    const workspace = await loadWorkspace(supabase);
    setRecords(workspace.records);
    setMonthlyGoals(workspace.goals);
    if (workspace.company) setCompany({ name: workspace.company.nome, phone: workspace.company.telefone || '', email: workspace.company.email || '', city: workspace.company.cidade || '' });
    else if (user?.id && user?.user_metadata?.company_name) {
      const initial = { name: user.user_metadata.company_name, phone: '', email: '', city: '' };
      await saveCompany(supabase, user.id, initial);
      setCompany(initial);
    }
    return workspace;
  }

  async function handleAuthenticated(user) {
    setAuthUser(user);
    if (user?.user_metadata?.company_name) setCompany((current) => ({ ...current, name: user.user_metadata.company_name }));
    setAuthMode('authenticated');
    setScreen('checking');
    setActiveView('dashboard');
    setDatabaseStatus('checking');
    const status = await checkDatabaseAccess();
    if (status === 'connected') {
      try {
        await loadRecordsFromDatabase(user);
        setDatabaseStatus('connected');
        setScreen('app');
        notify('Login confirmado. Dados carregados do banco de dados.');
      } catch (error) {
        setDatabaseError(error.message || 'Não foi possível carregar os dados do banco.');
        setDatabaseStatus('needs-sql');
        setScreen('database-error');
        notify(error.message || 'Não foi possível carregar todos os dados do banco. Revise as migrações e as políticas RLS.');
      }
    } else {
      setDatabaseStatus(status);
      setScreen('database-error');
      if (status === 'needs-sql') notify('Login confirmado, mas falta validar o acesso às tabelas do banco.');
    }
  }

  async function handleSignOut() {
    if (authMode === 'authenticated' && supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) {
        notify('Não foi possível encerrar a sessão: ' + authErrorMessage(error));
        return;
      }
    }
    setAuthUser(null);
    setAuthMode('signed-out');
    setRecords({ ...EMPTY_RECORDS });
    setMonthlyGoals([]);
    setCompany({ name: 'Sua empresa', phone: '', email: '', city: '' });
    setDatabaseStatus(isSupabaseConfigured ? 'not-checked' : 'not-configured');
    setScreen('login');
  }

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return undefined;
    let alive = true;
    let recoveryRequested = false;
    const subscriptionResult = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (event === 'PASSWORD_RECOVERY') {
        recoveryRequested = true;
        setScreen('password-recovery');
      } else if (event === 'SIGNED_OUT') {
        setAuthUser(null);
        setAuthMode('signed-out');
        setRecords({ ...EMPTY_RECORDS });
        setMonthlyGoals([]);
        setCompany({ name: 'Sua empresa', phone: '', email: '', city: '' });
        setScreen('login');
      } else if (session?.user) {
        setAuthUser(session.user);
      }
    });
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!alive) return;
      if (recoveryRequested) { setScreen('password-recovery'); return; }
      if (error) {
        setScreen('login');
        setDatabaseStatus('not-checked');
        return;
      }
      if (data.session?.user) {
        setAuthUser(data.session.user);
        if (data.session.user?.user_metadata?.company_name) setCompany((current) => ({ ...current, name: data.session.user.user_metadata.company_name }));
        setAuthMode('authenticated');
        setScreen('checking');
        const status = await checkDatabaseAccess();
        if (!alive) return;
        if (status === 'connected') {
          try {
            await loadRecordsFromDatabase(data.session.user);
            if (alive) {
              setDatabaseStatus('connected');
              setScreen('app');
            }
          } catch (loadError) {
            if (alive) {
              setDatabaseError(loadError.message || 'Não foi possível carregar os dados do banco.');
              setDatabaseStatus('needs-sql');
              setScreen('database-error');
              notify(loadError.message || 'Não foi possível carregar todos os dados do banco. Revise as migrações e as políticas RLS.');
            }
          }
        } else {
          setDatabaseStatus(status);
          setScreen('database-error');
        }
      } else {
        setScreen('login');
        setDatabaseStatus('not-checked');
      }
    }).catch(() => {
      if (alive) { setScreen('login'); setDatabaseStatus('not-checked'); }
    });
    return () => { alive = false; subscriptionResult.data.subscription.unsubscribe(); };
  }, []);

    const monthKeyValue = `${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}`;
  const monthLabel = useMemo(()=>new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(month),[month]);
  useEffect(() => { const goalRow = monthlyGoals.find((item) => monthKey(item.month) === monthKeyValue); const amount = Number(goalRow?.valor) || 0; setSavedGoal(amount); setGoal(amount ? String(amount) : ''); }, [monthKeyValue, monthlyGoals]);
  const longDate = useMemo(()=>new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'numeric',month:'long'}).format(new Date()),[]);
  const periodServices = records.services.filter((r)=>monthKey(r.data)===monthKeyValue && r.status!=='Cancelado');
  const periodExpenses = records.expenses.filter((r)=>monthKey(r.data)===monthKeyValue);
  const periodEmployeePayments = records.employeePayments.filter((r)=>monthKey(r.data)===monthKeyValue);
  const revenue = periodServices.reduce((sum,r)=>sum+parseMoney(r.valor),0);
  const received = periodServices.filter(r=>r.pagamento==='Recebido').reduce((sum,r)=>sum+parseMoney(r.valor),0);
  const receivable = periodServices.filter(r=>r.pagamento!=='Recebido').reduce((sum,r)=>sum+parseMoney(r.valor),0);
  const expenseTotal = periodExpenses.reduce((sum,r)=>sum+parseMoney(r.valor),0);
  const payrollTotal = periodEmployeePayments.reduce((sum,r)=>sum+parseMoney(r.valor),0);
  const result = revenue-expenseTotal-payrollTotal;
  const goalProgress = savedGoal>0 ? Math.min(100,Math.round((revenue/savedGoal)*100)) : 0;
  const expenseCategories = Object.entries(periodExpenses.reduce((result,expense)=>{ const category=expense.categoria||'Outros'; result[category]=(result[category]||0)+parseMoney(expense.valor); return result; },{})).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxCategoryExpense = Math.max(1,...expenseCategories.map(([,value])=>value));
  const retentionThreshold = Math.max(30, Number(retentionDays)||30);
  const retentionToday = new Date(); retentionToday.setHours(12,0,0,0);
  const retentionList = records.clients.filter((client)=>client.status!=='Inativo').map((client)=>{
    const history=records.services.filter((service)=>(service.client_id===client.id||(!service.client_id&&service.cliente===client.nome))&&service.status!=='Cancelado'&&/^\d{4}-\d{2}-\d{2}$/.test(service.data||'')).sort((a,b)=>b.data.localeCompare(a.data));
    const last=history[0]?.data||'';
    const age=last?Math.floor((retentionToday-new Date(`${last}T12:00:00`))/86400000):null;
    return {client,last,age,count:history.length};
  }).filter((item)=>(item.age===null||item.age>=retentionThreshold)&&(!retentionSearch||`${item.client.nome} ${item.client.telefone||''}`.toLocaleLowerCase('pt-BR').includes(retentionSearch.toLocaleLowerCase('pt-BR')))).sort((a,b)=>(b.age??99999)-(a.age??99999));
  const revenueTrend = getRevenueTrend(month, records.services);
  const trendMax = Math.max(1000, Math.ceil(Math.max(0,...revenueTrend.map(item=>item.value))/5000)*5000);
  const formatAxis = (value) => value>=1000 ? `R$ ${Number(value/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})} mil` : formatMoney(value);

  function notify(message) {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(()=>setToast(''),4000);
  }
  function goTo(view) {
    setActiveView(view); setMobileMenuOpen(false); setSearch(''); window.scrollTo({top:0,behavior:'smooth'});
  }
  function openForm(type, row = null) {
    if (authMode !== 'authenticated' || !supabase || databaseStatus !== 'connected') {
      notify('O banco não está disponível. O cadastro não foi aberto.');
      return;
    }
    setModalType(type);
    setEditingRecordId(row?.id || null);
    const defaults = { data: todayISO(), ...(type === 'service' ? { pagamento: 'Pendente' } : {}), ...(type === 'expense' ? { categoria: 'Produtos', pagamento: 'PIX' } : {}), ...(type === 'client' || type === 'employee' ? { status: 'Ativo' } : {}), ...(type === 'quote' ? { situacao: 'Em elaboração' } : {}), ...(type === 'employeePayment' ? { metodo: 'PIX' } : {}) };
    setFormData(row ? { ...row, ...Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value ?? ''])) } : defaults);
    setMobileMenuOpen(false);
  }

  function closeRecordForm() {
    setModalType('');
    setEditingRecordId(null);
    setFormData({});
  }

  async function submitRecord(event) {
    event.preventDefault();
    const schema = FORMS[modalType];
    if (!schema || saving) return;
    if (authMode !== 'authenticated' || !supabase || databaseStatus !== 'connected') {
      notify('Não foi possível confirmar o banco. Nenhum dado foi salvo. Tente novamente quando a conexão estiver disponível.');
      return;
    }
    setSaving(true);
    try {
      const payload = buildRecordPayload(modalType, formData, records);
      let saved;
      saved = await saveRecord(supabase, schema.list, editingRecordId, payload);
      setRecords((current) => {
        const next = { ...current, [schema.list]: [saved, ...current[schema.list].filter((row) => row.id !== saved.id)] };
        if (schema.list === 'clients') {
          next.vehicles = current.vehicles.map((item) => item.client_id === saved.id ? { ...item, cliente: saved.nome } : item);
          next.services = current.services.map((item) => item.client_id === saved.id ? { ...item, cliente: saved.nome } : item);
          next.quotes = current.quotes.map((item) => item.client_id === saved.id ? { ...item, cliente: saved.nome } : item);
        } else if (schema.list === 'vehicles') {
          next.services = current.services.map((item) => item.vehicle_id === saved.id ? { ...item, veiculo: saved.modelo } : item);
          next.quotes = current.quotes.map((item) => item.vehicle_id === saved.id ? { ...item, veiculo: saved.modelo } : item);
        } else if (schema.list === 'employees') {
          next.employeePayments = current.employeePayments.map((item) => item.employee_id === saved.id ? { ...item, funcionario: saved.nome } : item);
        }
        return next;
      });
      closeRecordForm();
      notify(`${schema.title.replace(/^(Novo|Adicionar|Registrar) /, '')}: salvo com sucesso.`);
    } catch (error) {
      notify(`Não foi possível salvar: ${authErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function removeRecord(list, row) {
    if (authMode !== 'authenticated' || !supabase || databaseStatus !== 'connected') {
      notify('Não foi possível confirmar o banco. Nenhum dado foi excluído. Tente novamente quando a conexão estiver disponível.');
      return;
    }
    if (!window.confirm(`Excluir “${row.nome || row.descricao || row.servico || row.modelo || row.cliente || 'este registro'}”? Esta ação não pode ser desfeita.`)) return;
    try {
      await deleteRecordFromDatabase(supabase, list, row.id);
      setRecords((current) => {
        const next = { ...current, [list]: current[list].filter((item) => item.id !== row.id) };
        if (list === 'clients') {
          next.vehicles = current.vehicles.map((item) => item.client_id === row.id ? { ...item, client_id: null } : item);
          next.services = current.services.map((item) => item.client_id === row.id ? { ...item, client_id: null } : item);
          next.quotes = current.quotes.map((item) => item.client_id === row.id ? { ...item, client_id: null } : item);
        } else if (list === 'vehicles') {
          next.services = current.services.map((item) => item.vehicle_id === row.id ? { ...item, vehicle_id: null } : item);
          next.quotes = current.quotes.map((item) => item.vehicle_id === row.id ? { ...item, vehicle_id: null } : item);
        } else if (list === 'employees') {
          next.employeePayments = current.employeePayments.map((item) => item.employee_id === row.id ? { ...item, employee_id: null } : item);
        }
        return next;
      });
      notify('Registro excluído.');
    } catch (error) {
      notify(`Não foi possível excluir: ${authErrorMessage(error)}`);
    }
  }

  async function submitCompany(event) {
    event.preventDefault();
    if (authMode !== 'authenticated' || !supabase || databaseStatus !== 'connected' || !authUser?.id) {
      notify('Não foi possível confirmar o banco. O perfil não foi salvo. Tente novamente quando a conexão estiver disponível.');
      return;
    }
    try {
      const saved = await saveCompany(supabase, authUser.id, company);
      setCompany(saved);
      notify('Perfil da empresa salvo.');
    } catch (error) {
      notify(`Não foi possível salvar o perfil: ${authErrorMessage(error)}`);
    }
  }

  async function submitGoal(event) {
    event.preventDefault();
    if (authMode !== 'authenticated' || !supabase || databaseStatus !== 'connected' || !authUser?.id) {
      notify('Não foi possível confirmar o banco. A meta não foi salva. Tente novamente quando a conexão estiver disponível.');
      return;
    }
    const value = parseMoney(goal);
    if (value <= 0) { notify('Informe uma meta maior que zero.'); return; }
    try {
      const saved = await saveMonthlyGoal(supabase, authUser.id, monthKeyValue, value);
      setMonthlyGoals((current) => [saved, ...current.filter((item) => monthKey(item.month) !== monthKeyValue)]);
      setSavedGoal(value);
      notify('Meta mensal salva.');
    } catch (error) {
      notify(`Não foi possível salvar a meta: ${authErrorMessage(error)}`);
    }
  }
  function changeMonth(delta) { setMonth(current=>new Date(current.getFullYear(),current.getMonth()+delta,1)); }
  function downloadFile(filename, contents, mimeType) {
    const url=URL.createObjectURL(new Blob([contents],{type:mimeType}));
    const anchor=document.createElement('a'); anchor.href=url; anchor.download=filename; anchor.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function openClientFromRetention(name) { setActiveView('clients'); setSearch(name); setMobileMenuOpen(false); window.scrollTo({top:0,behavior:'smooth'}); }
  function openRetentionWhatsApp(item) {
    const digits=String(item.client.telefone||'').replace(/\D/g,'');
    if(digits.length<10){notify('Cadastre um telefone com DDD para preparar o WhatsApp.');return;}
    const phone=digits.startsWith('55')?digits:`55${digits}`;
    const message=item.last?`Olá, ${item.client.nome}! Tudo bem? Aqui é da ${company.name}. Faz ${item.age} dias desde o último atendimento do seu veículo. Gostaríamos de ajudar você a manter o carro bem cuidado. Vamos agendar um novo atendimento?`:`Olá, ${item.client.nome}! Tudo bem? Aqui é da ${company.name}. Estamos à disposição para cuidar do seu veículo. Quer conhecer nossos serviços e opções de atendimento?`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,'_blank','noopener,noreferrer');
  }
  function exportJson() {
    const backup={ generatedAt:new Date().toISOString(), source:'NEXO Gestão', company, monthlyGoals, records };
    downloadFile('nexo-backup.json',JSON.stringify(backup,null,2),'application/json;charset=utf-8');
    notify('Cópia dos dados carregados exportada em JSON.');
  }
  function exportCsv() {
    const services=records.services.map(r=>({Tipo:'Serviço',Descrição:r.servico,Cliente:r.cliente,Data:r.data,Valor:r.valor,Situação:r.status}));
    const expenses=records.expenses.map(r=>({Tipo:'Despesa',Descrição:r.descricao,Cliente:'',Data:r.data,Valor:r.valor,Situação:'Registrada'}));
    const payments=records.employeePayments.map(r=>({Tipo:'Pagamento da equipe',Descrição:r.descricao||'Pagamento',Cliente:r.funcionario,Data:r.data,Valor:r.valor,Situação:'Pago'}));
    const rows=[...services,...expenses,...payments];
    if (!rows.length) { notify('Não há registros para exportar.'); return; }
    const headers=Object.keys(rows[0]);
    const csv=[headers.join(';'),...rows.map(row=>headers.map(key=>`"${String(row[key]??'').replaceAll('"','""')}"`).join(';'))].join('\r\n');
    downloadFile('nexo-registros.csv','\ufeff'+csv,'text/csv;charset=utf-8;'); notify('Arquivo CSV exportado.');
  }

  if (screen === 'checking') return <main className="boot-screen"><div className="boot-card glass-panel"><span className="status-dot"/><Brand/><h1>Preparando seu espaço</h1><p>Validando sua sessão e carregando os dados da empresa…</p></div></main>;
  if (screen === 'database-error') return <main className="boot-screen"><div className="boot-card database-error-card glass-panel"><Brand/><span className="eyebrow">ACESSO TEMPORARIAMENTE INDISPONÍVEL</span><h1>Não foi possível carregar os dados</h1><p>Por segurança, o sistema não abriu os módulos porque não confirmou o acesso ao banco.</p>{databaseError && <div className="login-notice" role="alert"><Icon name="shield" size={18}/><span>{databaseError}</span></div>}<button type="button" className="button button-primary button-wide" onClick={()=>window.location.reload()}>Tentar novamente</button><button type="button" className="text-button" onClick={handleSignOut}>Sair da conta</button></div></main>;
  if (screen === 'password-recovery') return <PasswordRecoveryScreen onComplete={handleAuthenticated}/>;
  if (screen === 'login') return <LoginScreen onAuthenticated={handleAuthenticated}/>;

  const activeConfig = VIEWS[activeView];
  const activeList = activeConfig ? records[activeConfig.list] : [];
  const filteredRows = (activeList||[]).filter((row)=>Object.values(row).some((value)=>String(value??'').toLowerCase().includes(search.toLowerCase())));
  const metrics = [
    { label:'Faturamento', value:formatMoney(revenue), note:`${periodServices.length} ${periodServices.length===1?'serviço':'serviços'} no período`, icon:'chart', tone:'blue' },
    { label:'Recebido', value:formatMoney(received), note:'Pagamentos confirmados', icon:'check', tone:'green' },
    { label:'A receber', value:formatMoney(receivable), note:'Valores pendentes', icon:'clock', tone:'amber' },
    { label:'Despesas', value:formatMoney(expenseTotal), note:`${periodExpenses.length} ${periodExpenses.length===1?'lançamento':'lançamentos'}`, icon:'wallet', tone:'red' },
    { label:'Clientes', value:String(records.clients.length), note:'Total de clientes cadastrados', icon:'users', tone:'violet' },
    { label:'Resultado', value:formatMoney(result), note:'Faturamento menos despesas e equipe', icon:'chart', tone:result<0?'red':'green', prominent:true },
    { label:'Ticket médio', value:formatMoney(periodServices.length?revenue/periodServices.length:0), note:'Por serviço registrado', icon:'spark', tone:'blue' },
    { label:'Serviços', value:String(periodServices.length), note:'No período selecionado', icon:'car', tone:'blue' },
  ];

  return <div className="nexo-app">
    {mobileMenuOpen && <button className="mobile-scrim" type="button" aria-label="Fechar menu" onClick={()=>setMobileMenuOpen(false)}/>}
    <aside className={`sidebar glass-panel ${mobileMenuOpen?'sidebar-open':''}`} aria-label="Menu principal">
      <div className="sidebar-head"><Brand/><button type="button" className="icon-button sidebar-close" aria-label="Fechar menu" onClick={()=>setMobileMenuOpen(false)}><Icon name="close"/></button></div>
      <button type="button" className="company-switch" onClick={()=>goTo('settings')}><span className="company-avatar">{(company.name||'N').trim().charAt(0).toUpperCase()}</span><span className="company-copy"><strong>{company.name||'Sua empresa'}</strong><small>Estética automotiva</small></span><span className="company-chevron">⌄</span></button>
      <div className="nav-label">MENU PRINCIPAL</div>
      <nav className="side-nav">
        {NAV.filter(item=>item.group==='principal').map(item=><button key={item.id} type="button" className={`nav-item ${activeView===item.id?'active':''}`} onClick={()=>goTo(item.id)}><span className="nav-icon"><Icon name={item.icon} size={19}/></span><span>{item.label}</span>{activeView===item.id&&<i className="nav-selection"/>}</button>)}
        <div className="nav-label nav-label-gap">GESTÃO</div>
        {NAV.filter(item=>item.group==='gestao').map(item=><button key={item.id} type="button" className={`nav-item ${activeView===item.id?'active':''}`} onClick={()=>goTo(item.id)}><span className="nav-icon"><Icon name={item.icon} size={19}/></span><span>{item.label}</span>{activeView===item.id&&<i className="nav-selection"/>}</button>)}
      </nav>
      <div className="sidebar-bottom"><button type="button" className={`nav-item ${activeView==='settings'?'active':''}`} onClick={()=>goTo('settings')}><span className="nav-icon"><Icon name="settings" size={19}/></span><span>Configurações</span></button>
        <div className="sidebar-foot-status"><span className="status-dot"/> {databaseStatus === 'connected' ? 'Dados sincronizados' : databaseStatus === 'checking' ? 'Verificando conexão do banco…' : 'Banco indisponível · gravações bloqueadas'}</div>
        <div className="sidebar-user"><span className="user-avatar">{(authUser?.user_metadata?.full_name || authUser?.email || 'N').trim().charAt(0).toUpperCase()}</span><span className="user-copy"><strong>{authUser?.user_metadata?.full_name || 'Conta autenticada'}</strong><small>{authUser?.email}</small></span><button type="button" className="signout-button" aria-label="Sair da conta" onClick={handleSignOut}><Icon name="logout" size={17}/></button></div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar glass-panel"><button type="button" className="mobile-menu-toggle icon-button" aria-label="Abrir menu" onClick={()=>setMobileMenuOpen(true)}><span className="hamburger"/></button><div className="topbar-title"><span className="topbar-label">NEXO GESTÃO</span><h1>{activeView==='dashboard'?'Dashboard':activeConfig?.title||({analysis:'Análises',retention:'Retorno de clientes',manage:'Gerenciar cadastros',settings:'Configurações'}[activeView])}</h1></div><div className="topbar-actions"><div className="period-control"><button type="button" aria-label="Mês anterior" onClick={()=>changeMonth(-1)}><span>‹</span></button><button type="button" className="period-current" onClick={()=>setMonth(new Date(new Date().getFullYear(),new Date().getMonth(),1))}><Icon name="calendar" size={16}/><span>{monthLabel}</span></button><button type="button" aria-label="Próximo mês" onClick={()=>changeMonth(1)}><span>›</span></button></div><span className="topbar-separator"/><span className="today-label">{longDate}</span><span className="avatar-small">N</span></div></header>

      <div className="page-content">
        <div className={`connection-banner ${databaseStatus === 'connected' ? 'connection-banner-ready' : ''}`} role="status"><Icon name={databaseStatus === 'connected' ? 'shield' : 'lock'} size={17}/><span>{databaseStatus === 'connected' ? 'Conexão segura ativa. Os dados desta conta estão sincronizados com o banco.' : databaseStatus === 'checking' ? 'Verificando a conexão segura com o banco de dados.' : <>A conexão com o banco não foi confirmada. As gravações estão bloqueadas. {databaseError && <strong>Detalhe: {databaseError}</strong>}</>}</span></div>
        {activeView==='dashboard' && <>
          <section className="welcome-row"><div><span className="eyebrow">VISÃO GERAL DA OPERAÇÃO</span><h2>Olá, vamos aos números.</h2><p>Acompanhe os resultados e a rotina da empresa em um só lugar.</p></div><button type="button" className="button button-primary welcome-action" onClick={()=>openForm('service')}><Icon name="plus" size={19}/> Novo serviço</button></section>
          <section className="metric-grid" aria-label="Indicadores do período">{metrics.map((metric)=><article key={metric.label} className={`metric-card glass-card ${metric.prominent?'metric-prominent':''}`}><div className="metric-top"><span>{metric.label}</span><span className={`metric-icon ${metric.tone}`}><Icon name={metric.icon} size={20}/></span></div><strong className="metric-value">{metric.value}</strong><span className="metric-note">{metric.note}</span></article>)}</section>
          <section className="goal-card glass-card"><div className="goal-topline"><span className="goal-icon"><Icon name="spark" size={21}/></span><div className="goal-heading"><span className="section-kicker">PLANEJAMENTO</span><h3>Meta de faturamento</h3><p>Defina um objetivo para acompanhar o mês.</p></div><span className={`goal-status ${savedGoal>0?'set':'unset'}`}>{savedGoal>0?'Meta definida':'Sem meta definida'}</span></div><form className="goal-form" onSubmit={submitGoal}><label htmlFor="monthly-goal">Meta mensal (R$)</label><div className="goal-input-line"><div className="money-input"><span>R$</span><input id="monthly-goal" type="number" min="0.01" step="0.01" value={goal} onChange={(e)=>setGoal(e.target.value)} placeholder="15.000,00"/></div><button className="button button-secondary" type="submit" disabled={databaseStatus !== 'connected'}>Salvar meta</button></div><div className="goal-progress-copy"><span>{savedGoal>0?`${formatMoney(revenue)} de ${formatMoney(savedGoal)}`:'O progresso será calculado conforme o faturamento registrado.'}</span><strong>{goalProgress}%</strong></div><div className="progress-track"><span style={{width:`${goalProgress}%`}}/></div></form></section>
          <div className="dashboard-grid"><section className="surface-card revenue-panel"><div className="section-heading"><div><span className="section-kicker">ACOMPANHAMENTO</span><h3>Evolução do faturamento</h3><p>Últimos seis meses</p></div><button type="button" className="icon-button" aria-label="Abrir análises" onClick={()=>goTo('analysis')}><Icon name="arrow" size={18}/></button></div><div className="chart-legend"><span><i className="legend-blue"/> Faturamento</span><span className="quiet-label">{revenueTrend.some(item=>item.value>0)?'Serviços concluídos':'Aguardando os primeiros registros'}</span></div><div className="chart-area"><div className="chart-y-labels">{[trendMax,trendMax*2/3,trendMax/3,0].map((value,index)=><span key={index}>{formatAxis(value)}</span>)}</div><div className="chart-stage"><div className="chart-gridlines"><i/><i/><i/><i/></div>{revenueTrend.some(item=>item.value>0)?<div className="chart-bars" aria-label="Faturamento mensal dos últimos seis meses">{revenueTrend.map(item=><div className="chart-bar-col" key={item.key}><span className="chart-bar" style={{height:`${item.value>0?Math.max(3,item.value/trendMax*100):0}%`}} title={`${item.label}: ${formatMoney(item.value)}`} aria-label={`${item.label}: ${formatMoney(item.value)}`}/></div>)}</div>:<div className="chart-empty-message"><span><Icon name="chart" size={23}/></span><strong>Seu histórico aparecerá aqui</strong><small>Registre os atendimentos para acompanhar a evolução.</small></div>}<div className="chart-months">{revenueTrend.map(item=><span key={item.key}>{item.label}</span>)}</div></div></div></section>
            <section className="surface-card quick-panel"><div className="section-heading"><div><span className="section-kicker">ATALHOS</span><h3>Acesso rápido</h3><p>As tarefas mais comuns da operação.</p></div></div><div className="quick-list"><button type="button" onClick={()=>openForm('service')}><span className="quick-icon blue"><Icon name="car" size={19}/></span><span><strong>Registrar serviço</strong><small>Novo atendimento</small></span><Icon name="arrow" size={17}/></button><button type="button" onClick={()=>openForm('client')}><span className="quick-icon violet"><Icon name="users" size={19}/></span><span><strong>Cadastrar cliente</strong><small>Adicionar contato</small></span><Icon name="arrow" size={17}/></button><button type="button" onClick={()=>openForm('expense')}><span className="quick-icon red"><Icon name="wallet" size={19}/></span><span><strong>Lançar despesa</strong><small>Registrar um custo</small></span><Icon name="arrow" size={17}/></button><button type="button" onClick={()=>openForm('quote')}><span className="quick-icon green"><Icon name="file" size={19}/></span><span><strong>Criar orçamento</strong><small>Preparar proposta</small></span><Icon name="arrow" size={17}/></button></div></section>
            <section className="surface-card recent-panel"><div className="section-heading"><div><span className="section-kicker">MOVIMENTAÇÃO</span><h3>Serviços recentes</h3><p>Atendimentos do período selecionado.</p></div><button type="button" className="text-button" onClick={()=>goTo('services')}>Ver serviços <Icon name="arrow" size={15}/></button></div>{periodServices.length?<DataTable columns={VIEWS.services.columns} rows={periodServices.slice(0,5)} empty={{}}/>:<EmptyState icon="car" title="Nenhum atendimento por enquanto" description="Quando você registrar um serviço, os detalhes aparecerão aqui." action="Registrar serviço" onAction={()=>openForm('service')}/>}</section>
            <section className="surface-card team-panel"><div className="section-heading"><div><span className="section-kicker">EQUIPE</span><h3>Funcionários</h3><p>Profissionais cadastrados.</p></div><button type="button" className="icon-button" aria-label="Ver funcionários" onClick={()=>goTo('employees')}><Icon name="arrow" size={18}/></button></div>{records.employees.length?<div className="compact-record-list">{records.employees.slice(0,4).map(person=><div className="compact-record" key={person.id}><span className="person-initial">{(person.nome||'?').charAt(0).toUpperCase()}</span><span className="compact-record-copy"><strong>{person.nome}</strong><small>{person.funcao||'Profissional'}</small></span><span className="compact-record-end">{person.comissao||0}%</span></div>)}</div>:<EmptyState icon="team" title="Sua equipe, organizada" description="Adicione os profissionais para manter os cadastros em dia." action="Adicionar funcionário" onAction={()=>openForm('employee')}/>}</section>
            <section className="surface-card expense-breakdown-panel"><div className="section-heading"><div><span className="section-kicker">CONTROLE FINANCEIRO</span><h3>Despesas por categoria</h3><p>Distribuição dos custos do mês.</p></div><button type="button" className="icon-button" aria-label="Ver despesas" onClick={()=>goTo('expenses')}><Icon name="arrow" size={18}/></button></div>{expenseCategories.length?<div className="category-breakdown">{expenseCategories.map(([name,value])=><div className="category-row" key={name}><div><span>{name}</span><strong>{formatMoney(value)}</strong></div><div className="category-track"><span style={{width:`${Math.round(value/maxCategoryExpense*100)}%`}}/></div></div>)}</div>:<EmptyState icon="wallet" title="Sem despesas neste período" description="Ao registrar os custos, você verá como eles se distribuem por categoria." action="Nova despesa" onAction={()=>openForm('expense')}/>}</section>
            <section className="surface-card quote-panel"><div className="section-heading"><div><span className="section-kicker">COMERCIAL</span><h3>Orçamentos do período</h3><p>Propostas em acompanhamento.</p></div><button type="button" className="text-button" onClick={()=>goTo('quotes')}>Ver orçamentos <Icon name="arrow" size={15}/></button></div>{records.quotes.length?<div className="compact-record-list">{records.quotes.slice(0,4).map(quote=><div className="compact-record" key={quote.id}><span className="quick-icon blue"><Icon name="file" size={17}/></span><span className="compact-record-copy"><strong>{quote.cliente}</strong><small>{quote.servico}</small></span><span className="quote-value">{formatMoney(quote.valor)}</span></div>)}</div>:<EmptyState icon="file" title="Nenhuma proposta criada" description="Organize a próxima proposta antes de iniciar o atendimento." action="Novo orçamento" onAction={()=>openForm('quote')}/>}</section>
          </div>
        </>}

        {activeConfig && <section className="module-page"><div className="module-heading"><div className="module-heading-icon"><Icon name={activeConfig.icon} size={24}/></div><div><span className="eyebrow">{activeConfig.eyebrow}</span><h2>{activeConfig.title}</h2><p>{activeConfig.description}</p></div><button type="button" className="button button-primary module-action" onClick={()=>openForm(activeConfig.type)}><Icon name="plus" size={18}/>{activeConfig.add}</button></div><div className="module-toolbar glass-card"><div className="module-count"><strong>{filteredRows.length}</strong><span>{filteredRows.length===1?'registro encontrado':'registros encontrados'}</span></div><label className="search-box"><Icon name="search" size={18}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder={`Buscar em ${activeConfig.title.toLowerCase()}...`} aria-label={`Buscar em ${activeConfig.title}`}/>{search&&<button type="button" aria-label="Limpar busca" onClick={()=>setSearch('')}><Icon name="close" size={15}/></button>}</label></div><div className="data-panel surface-card"><DataTable columns={activeConfig.columns} rows={filteredRows} onEdit={(row)=>openForm(activeConfig.type,row)} onDelete={(row)=>removeRecord(activeConfig.list,row)} empty={{icon:activeConfig.icon,title:search?'Nenhum resultado encontrado':activeConfig.emptyTitle,text:search?'Tente buscar usando outro nome ou termo.':activeConfig.emptyText,action:search?'Limpar busca':activeConfig.add,onAction:()=>search?setSearch(''):openForm(activeConfig.type)}}/></div>{activeView==='employees'&&<section className="surface-card staff-payments-panel"><div className="section-heading"><div><span className="section-kicker">FINANCEIRO DA EQUIPE</span><h3>Pagamentos do período</h3><p>Total registrado: {formatMoney(payrollTotal)}</p></div><button type="button" className="button button-primary" onClick={()=>openForm('employeePayment')}><Icon name="plus" size={17}/>Registrar pagamento</button></div><DataTable columns={[[ 'funcionario','Funcionário'],['descricao','Descrição'],['data','Data'],['valor','Valor'],['metodo','Forma de pagamento']]} rows={periodEmployeePayments} onEdit={(row)=>openForm('employeePayment',row)} onDelete={(row)=>removeRecord('employeePayments',row)} empty={{icon:'team',title:'Nenhum pagamento registrado',text:'Registre comissões e pagamentos da equipe para acompanhar os custos do período.',action:'Registrar pagamento',onAction:()=>openForm('employeePayment')}}/></section>}</section>}

        {activeView==='analysis' && <section className="module-page"><div className="module-heading"><div className="module-heading-icon"><Icon name="chart" size={24}/></div><div><span className="eyebrow">DESEMPENHO</span><h2>Análises</h2><p>Entenda os resultados financeiros e a evolução da operação.</p></div><button type="button" className="button button-secondary module-action" onClick={exportCsv}><Icon name="download" size={17}/>Exportar CSV</button></div><div className="analysis-metrics"><article className="glass-card"><span>Faturamento do período</span><strong>{formatMoney(revenue)}</strong><small>{periodServices.length} serviços registrados</small></article><article className="glass-card"><span>Despesas do período</span><strong>{formatMoney(expenseTotal)}</strong><small>{periodExpenses.length} lançamentos</small></article><article className="glass-card"><span>Resultado operacional</span><strong className={result<0?'negative-value':'positive-value'}>{formatMoney(result)}</strong><small>Faturamento menos despesas e equipe</small></article></div><div className="surface-card analysis-chart-panel"><div className="section-heading"><div><span className="section-kicker">TENDÊNCIA</span><h3>Desempenho mensal</h3><p>Visão dos seis últimos meses.</p></div></div><div className="analysis-chart">{revenueTrend.some(item=>item.value>0)?<div className="analysis-bars">{revenueTrend.map(item=><div className="analysis-bar-item" key={item.key}><strong>{formatMoney(item.value)}</strong><div className="analysis-bar-track"><span style={{height:`${item.value>0?Math.max(3,item.value/trendMax*100):0}%`}}/></div><small>{item.label}</small></div>)}</div>:<EmptyState icon="chart" title="Ainda não há histórico suficiente" description="Os valores mensais aparecerão aqui conforme os serviços forem registrados."/>}</div></div><div className="surface-card analysis-breakdown"><div className="section-heading"><div><span className="section-kicker">MOVIMENTAÇÃO</span><h3>Resumo dos lançamentos</h3></div></div><div className="summary-lines"><div><span><i className="summary-dot green-dot"/> Serviços registrados</span><strong>{records.services.length}</strong></div><div><span><i className="summary-dot red-dot"/> Despesas registradas</span><strong>{records.expenses.length}</strong></div><div><span><i className="summary-dot violet-dot"/> Pagamentos da equipe</span><strong>{records.employeePayments.length}</strong></div><div><span><i className="summary-dot violet-dot"/> Clientes cadastrados</span><strong>{records.clients.length}</strong></div><div><span><i className="summary-dot blue-dot"/> Orçamentos criados</span><strong>{records.quotes.length}</strong></div></div></div></section>}

        {activeView==='retention' && <section className="module-page"><div className="module-heading"><div className="module-heading-icon"><Icon name="return" size={24}/></div><div><span className="eyebrow">PÓS-VENDA</span><h2>Retorno de clientes</h2><p>Encontre clientes que já estão na hora de um novo atendimento.</p></div><button type="button" className="button button-primary module-action" onClick={()=>openForm('service')}><Icon name="plus" size={18}/>Registrar serviço</button></div><div className="retention-hero glass-card"><div className="retention-hero-art"><Icon name="return" size={34}/></div><div><span className="section-kicker">RELACIONAMENTO CONTÍNUO</span><h3>Cuide do relacionamento depois de cada atendimento.</h3><p>A lista usa o histórico de serviços para destacar clientes sem atendimento recente. Você pode ajustar o intervalo e preparar uma mensagem de WhatsApp.</p></div></div><div className="retention-filters glass-card"><label>Sem atendimento há pelo menos<select value={retentionDays} onChange={(e)=>setRetentionDays(e.target.value)}><option value="30">30 dias</option><option value="45">45 dias</option><option value="60">60 dias</option><option value="90">90 dias</option><option value="120">120 dias</option></select></label><label className="search-box retention-search"><Icon name="search" size={18}/><input value={retentionSearch} onChange={(e)=>setRetentionSearch(e.target.value)} placeholder="Buscar cliente por nome ou telefone" aria-label="Buscar cliente para retorno"/>{retentionSearch&&<button type="button" aria-label="Limpar busca" onClick={()=>setRetentionSearch('')}><Icon name="close" size={15}/></button>}</label></div><div className="surface-card retention-list"><div className="section-heading"><div><span className="section-kicker">ACOMPANHAMENTO</span><h3>Clientes para contatar</h3><p>{retentionList.length} {retentionList.length===1?'cliente atende':'clientes atendem'} ao filtro de retorno.</p></div></div>{retentionList.length?<div className="retention-contacts">{retentionList.map(item=><div key={item.client.id} className="retention-contact"><span className="person-initial">{(item.client.nome||'?').charAt(0).toUpperCase()}</span><span className="compact-record-copy"><strong>{item.client.nome}</strong><small>{item.client.telefone||'Telefone não informado'}</small><small>{item.last?`Último atendimento: ${formatDate(item.last)} · há ${item.age} dias · ${item.count} ${item.count===1?'serviço':'serviços'}`:'Nenhum atendimento registrado'}</small></span><StatusPill value={item.last?`Sem atendimento há ${item.age} dias`:'Sem histórico'}/><div className="retention-actions"><button type="button" className="button button-glass" onClick={()=>openClientFromRetention(item.client.nome)}>Ver cliente</button><button type="button" className="button button-secondary" onClick={()=>openRetentionWhatsApp(item)}><Icon name="arrow" size={15}/>Preparar WhatsApp</button></div></div>)}</div>:<EmptyState icon="return" title={retentionSearch?'Nenhum cliente encontrado':records.clients.filter(client=>client.status!=='Inativo').length?'Nenhum cliente precisa de retorno agora':'Sua lista de retorno está vazia'} description={retentionSearch?'Tente outro nome ou telefone.':records.clients.filter(client=>client.status!=='Inativo').length?'Os clientes aparecerão quando atingirem o intervalo selecionado desde o último serviço.':'Cadastre clientes e registre os atendimentos vinculados para organizar o relacionamento no pós-venda.'} action={retentionSearch?'Limpar busca':records.clients.filter(client=>client.status!=='Inativo').length?'Ver clientes':'Cadastrar cliente'} onAction={()=>retentionSearch?setRetentionSearch(''):records.clients.filter(client=>client.status!=='Inativo').length?goTo('clients'):openForm('client')}/>}</div></section>}

        {activeView==='manage' && <section className="module-page"><div className="module-heading"><div className="module-heading-icon"><Icon name="grid" size={24}/></div><div><span className="eyebrow">ORGANIZAÇÃO</span><h2>Gerenciar cadastros</h2><p>Acesse os cadastros básicos que sustentam a operação.</p></div></div><div className="manage-grid">{[{id:'clients',title:'Clientes',desc:'Contatos e histórico de relacionamento.',count:records.clients.length,icon:'users',tone:'blue',type:'client'},{id:'employees',title:'Funcionários',desc:'Equipe e regras de comissão.',count:records.employees.length,icon:'team',tone:'violet',type:'employee'},{id:'vehicles',title:'Veículos',desc:'Modelos, placas e clientes responsáveis.',count:records.vehicles.length,icon:'car',tone:'green',type:'vehicle'}].map(item=><article className="manage-card glass-card" key={item.id}><span className={`manage-icon ${item.tone}`}><Icon name={item.icon} size={23}/></span><span className="manage-count">{item.count} {item.count===1?'registro':'registros'}</span><h3>{item.title}</h3><p>{item.desc}</p><div className="manage-card-actions"><button className="button button-secondary" type="button" onClick={()=>{if(item.id==='vehicles'){setManageTab('vehicles');}else goTo(item.id);}}>{item.id==='vehicles'?'Ver veículos':`Ver ${item.title.toLowerCase()}`}</button><button type="button" className="icon-button" aria-label={`Adicionar ${item.title.toLowerCase()}`} onClick={()=>openForm(item.type)}><Icon name="plus" size={18}/></button></div></article>)}</div>{manageTab==='vehicles'&&<div className="surface-card vehicle-panel"><div className="section-heading"><div><span className="section-kicker">CADASTRO DE VEÍCULOS</span><h3>Veículos</h3></div><button type="button" className="button button-primary" onClick={()=>openForm('vehicle')}><Icon name="plus" size={17}/>Novo veículo</button></div><DataTable columns={[[ 'cliente','Cliente'],['modelo','Marca e modelo'],['placa','Placa'],['cor','Cor']]} rows={records.vehicles} empty={{icon:'car',title:'Nenhum veículo cadastrado',text:'Cadastre os veículos dos clientes para facilitar a identificação dos atendimentos.',action:'Novo veículo',onAction:()=>openForm('vehicle')}} onEdit={(row)=>openForm('vehicle',row)} onDelete={(row)=>removeRecord('vehicles',row)}/></div>}</section>}

        {activeView==='settings' && <section className="module-page settings-page"><div className="module-heading"><div className="module-heading-icon"><Icon name="settings" size={24}/></div><div><span className="eyebrow">PREFERÊNCIAS</span><h2>Configurações</h2><p>Organize os dados básicos da empresa e as preferências do sistema.</p></div></div><div className="settings-grid"><section className="surface-card settings-card"><div className="settings-section-head"><span className="settings-section-icon"><Icon name="grid" size={20}/></span><div><h3>Perfil da empresa</h3><p>Informações de identificação e contato.</p></div></div><form className="settings-form" onSubmit={submitCompany}><label>Nome da empresa<input value={company.name} onChange={(e)=>setCompany({...company,name:e.target.value})} placeholder="Nome da empresa" required/></label><label>Telefone<input value={company.phone} onChange={(e)=>setCompany({...company,phone:e.target.value})} placeholder="(00) 00000-0000" type="tel"/></label><label>E-mail<input value={company.email} onChange={(e)=>setCompany({...company,email:e.target.value})} placeholder="contato@empresa.com" type="email"/></label><label>Cidade ou região<input value={company.city} onChange={(e)=>setCompany({...company,city:e.target.value})} placeholder="Cidade, estado"/></label><button type="submit" className="button button-primary" disabled={databaseStatus !== 'connected'}><Icon name="check" size={17}/>Salvar perfil</button></form><p className="settings-footnote">{databaseStatus === 'connected' ? 'As alterações são salvas na conta da empresa.' : 'O perfil só pode ser alterado quando a conexão com o banco estiver disponível.'}</p></section><section className="surface-card settings-card"><div className="settings-section-head"><span className="settings-section-icon"><Icon name="shield" size={20}/></span><div><h3>Privacidade e dados</h3><p>Informações sobre esta conta.</p></div></div><div className="settings-info"><div><span className="settings-info-icon"><Icon name="lock" size={18}/></span><span><strong>Conta autenticada</strong><small>{databaseStatus === 'connected' ? 'Cadastros, perfil da empresa e metas mensais são sincronizados no banco.' : 'A sincronização está indisponível. Os dados não serão alterados até a conexão ser restabelecida.'}</small></span></div><div><span className="settings-info-icon"><Icon name="download" size={18}/></span><span><strong>Exportar registros</strong><small>Baixe uma cópia dos registros disponíveis nesta conta.</small></span><div className="settings-export-actions"><button type="button" className="button button-secondary" onClick={exportCsv}>Exportar CSV</button><button type="button" className="button button-glass" onClick={exportJson}>Exportar JSON</button></div></div><div><span className="settings-info-icon"><Icon name="shield" size={18}/></span><span><strong>Conexão e autenticação</strong><small>{databaseStatus === 'connected' ? 'A sessão está ativa e as tabelas operacionais responderam às políticas de acesso.' : databaseStatus === 'checking' ? 'A sessão está ativa; verificando o acesso às tabelas operacionais.' : 'A sessão está ativa, mas o acesso às tabelas operacionais não foi confirmado. Verifique a conexão, as migrações e as permissões.'}</small></span><StatusPill value={databaseStatus === 'connected' ? 'Banco conectado' : databaseStatus === 'checking' ? 'Verificando' : 'Banco indisponível'}/></div></div></section></div></section>}

        <footer className="app-footer"><span>© {new Date().getFullYear()} NEXO Gestão</span><span><i className="footer-dot"/> {databaseStatus === 'connected' ? 'Sessão segura · dados sincronizados' : 'Sessão segura · conexão em validação'}</span></footer>
      </div>
    </main>

    {modalType && FORMS[modalType]&&<div className="modal-scrim" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget){closeRecordForm();}}}><section className="record-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="record-modal-title"><header className="record-modal-head"><div><span className="section-kicker">NEXO GESTÃO</span><h2 id="record-modal-title">{editingRecordId ? `Editar ${FORMS[modalType].title.replace(/^(Novo|Adicionar|Registrar) /,'').toLowerCase()}` : FORMS[modalType].title}</h2><p>Preencha os dados do cadastro.</p></div><button type="button" className="icon-button modal-close" aria-label="Fechar" onClick={closeRecordForm}><Icon name="close"/></button></header><form onSubmit={submitRecord}><div className="record-form-grid">{FORMS[modalType].fields.map(field=>{const options=field.optionsFrom==='clients'?records.clients:field.optionsFrom==='employees'?records.employees:field.optionsFrom==='vehicles'?records.vehicles.filter((vehicle)=>!formData.client_id||vehicle.client_id===formData.client_id):field.options||[];return <label key={field.name} className={field.wide?'field-wide':''}>{field.label}{field.type==='select'?<select required={field.required} value={formData[field.name]??(field.options?.[0]||'')} onChange={(e)=>setFormData({...formData,[field.name]:e.target.value,...(field.name==='client_id'?{vehicle_id:''}:{})})}><option value="">Selecione...</option>{options.map(option=><option key={option.id||option} value={option.id||option}>{option.nome||(option.modelo?`${option.modelo}${option.placa?` · ${option.placa}`:''}`:option)}</option>)}</select>:<input type={field.type||'text'} required={field.required} min={field.min} max={field.max} step={field.step} placeholder={field.placeholder||''} value={formData[field.name]??''} onChange={(e)=>setFormData({...formData,[field.name]:e.target.value})}/>}</label>})}</div><div className="form-honesty-note"><Icon name="shield" size={16}/><span>Este cadastro será salvo na conta autenticada.</span></div><div className="record-modal-actions"><button type="button" className="button button-glass" onClick={closeRecordForm}>Cancelar</button><button type="submit" className="button button-primary" disabled={saving || databaseStatus !== 'connected'}><Icon name="check" size={17}/>{saving?'Salvando…':editingRecordId?'Salvar alterações':'Adicionar registro'}</button></div></form></section></div>}
    {toast&&<div className="toast-message" role="status"><span><Icon name="check" size={17}/></span>{toast}</div>}
  </div>;
}

function getRevenueTrend(referenceDate, services) {
  return Array.from({length:6},(_,index)=>{
    const date=new Date(referenceDate.getFullYear(),referenceDate.getMonth()-5+index,1);
    const key=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
    const label=new Intl.DateTimeFormat('pt-BR',{month:'short'}).format(date).replace('.','');
    const value=services.filter((service)=>monthKey(service.data)===key&&service.status!=='Cancelado').reduce((sum,service)=>sum+parseMoney(service.valor),0);
    return {key,label,value};
  });
}
