import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Cloud,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import "./AuthScreen.css";

export interface AuthScreenProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (
    companyName: string,
    email: string,
    password: string,
  ) => Promise<{ needsEmailConfirmation: boolean }>;
  onRequestPasswordReset: (email: string) => Promise<void>;
  onUpdatePassword: (password: string) => Promise<void>;
  recoveringPassword: boolean;
  configured: boolean;
  configurationError?: string | null;
}

type Mode = "login" | "signup" | "forgot" | "update";

const copy: Record<
  Mode,
  { kicker: string; title: string; description: string; action: string }
> = {
  login: {
    kicker: "SEU ESPAÇO DE TRABALHO",
    title: "Bom ter você aqui.",
    description: "Entre para cuidar dos clientes da sua empresa.",
    action: "Entrar na minha conta",
  },
  signup: {
    kicker: "UM NOVO COMEÇO",
    title: "Sua empresa no NEXO.",
    description: "Crie a conta da empresa e comece a organizar seus clientes.",
    action: "Criar conta da empresa",
  },
  forgot: {
    kicker: "RECUPERAÇÃO DE ACESSO",
    title: "Vamos recuperar seu acesso.",
    description:
      "Informe o e-mail da empresa para solicitar um link de recuperação.",
    action: "Enviar link de recuperação",
  },
  update: {
    kicker: "PROTEJA SUA CONTA",
    title: "Escolha uma nova senha.",
    description:
      "Use uma senha exclusiva para manter a conta da empresa protegida.",
    action: "Salvar nova senha",
  },
};

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message.trim()) return fallback;
  const message = error.message.trim();
  if (/invalid login credentials/i.test(message))
    return "E-mail ou senha incorretos. Confira e tente novamente.";
  if (/email not confirmed/i.test(message))
    return "Confirme seu e-mail antes de entrar. Procure a mensagem de confirmação na sua caixa de entrada.";
  if (/rate limit|too many requests/i.test(message))
    return "Muitas tentativas em pouco tempo. Aguarde um momento antes de tentar novamente.";
  if (/failed to fetch|network|fetch failed/i.test(message))
    return "Não foi possível conectar. Confira sua internet e tente novamente.";
  if (
    message.length > 260 ||
    /postgres|schema|relation|sqlstate|jwt|api.?key|stack|https?:\/\//i.test(
      message,
    )
  )
    return fallback;
  // The data layer supplies user-safe messages in Portuguese; never display raw server objects.
  return /[ãáâéêíóôõúç]|^(Não|Sua|Seu|Você|O |A |As |Os |E-mail|Senha|Informe|Use|Tente|Aguarde|Preencha|Confira|Cadastro|Falha|Verifique|Limite)/i.test(
    message,
  )
    ? message
    : fallback;
}

export default function AuthScreen({
  onSignIn,
  onSignUp,
  onRequestPasswordReset,
  onUpdatePassword,
  recoveringPassword,
  configured,
  configurationError,
}: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>(
    recoveringPassword ? "update" : "login",
  );
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmationSent, setConfirmationSent] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (recoveringPassword) {
      setMode("update");
      setPassword("");
      setConfirmPassword("");
      setError("");
      setNotice("");
      setConfirmationSent(false);
    }
  }, [recoveringPassword]);

  const content = copy[mode];
  const isNewPassword = mode === "signup" || mode === "update";
  const showEmail = mode !== "update";
  const showPasswordField = mode !== "forgot";

  function changeMode(next: Mode) {
    if (busy) return;
    setMode(next);
    setError("");
    setNotice("");
    setConfirmationSent(false);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmation(false);
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !configured) return;
    setError("");
    setNotice("");
    if (isNewPassword && password.length < 10) {
      setError("Use uma senha com pelo menos 10 caracteres.");
      return;
    }
    if (isNewPassword && password !== confirmPassword) {
      setError(
        "As senhas não coincidem. Digite a mesma senha nos dois campos.",
      );
      return;
    }
    if (mode === "signup" && companyName.trim().length < 2) {
      setError("Informe o nome da empresa com pelo menos 2 caracteres.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        await onSignIn(email.trim(), password);
      } else if (mode === "signup") {
        const result = await onSignUp(
          companyName.trim(),
          email.trim(),
          password,
        );
        if (result.needsEmailConfirmation) {
          setConfirmationSent(true);
          setPassword("");
          setConfirmPassword("");
        }
      } else if (mode === "forgot") {
        await onRequestPasswordReset(email.trim());
        setNotice(
          "Se este e-mail estiver cadastrado, você receberá um link para redefinir a senha. Confira também a pasta de spam.",
        );
      } else {
        await onUpdatePassword(password);
        setPassword("");
        setConfirmPassword("");
        setNotice("Senha atualizada. Seu acesso à conta foi recuperado.");
      }
    } catch (cause) {
      const fallback =
        mode === "login"
          ? "Não foi possível entrar. Confira seus dados e tente novamente."
          : mode === "signup"
            ? "Não foi possível criar a conta. Confira os dados e tente novamente."
            : mode === "forgot"
              ? "Não foi possível solicitar a recuperação. Aguarde um momento e tente novamente."
              : "Não foi possível atualizar a senha. Solicite um novo link de recuperação e tente novamente.";
      setError(errorMessage(cause, fallback));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <a className="auth-skip-link" href="#auth-form-heading">
        Ir para o acesso à conta
      </a>
      <div className="auth-shell">
        <section className="auth-story" aria-label="NEXO Gestão">
          <div className="auth-brand">
            <img
              className="nexo-original-logo"
              src={`${import.meta.env.BASE_URL}nexo-logo.png`}
              width="112"
              height="112"
              alt="NEXO Gestão"
            />
          </div>
          <div className="auth-story-body">
            <span className="auth-story-kicker">
              <span /> MAIS CLAREZA. MAIS CONTROLE.
            </span>
            <h1>
              Seu negócio.
              <br /> Um novo
              <br />
              <span>ponto de vista.</span>
            </h1>
            <p>
              Um espaço para organizar os clientes da sua empresa e construir o
              próximo passo com tranquilidade.
            </p>
            <div className="auth-benefits">
              <div>
                <span className="auth-benefit-icon">
                  <UsersRound size={20} aria-hidden="true" />
                </span>
                <span>
                  <strong>Relacionamentos organizados</strong>
                  <small>
                    Contatos e informações dos clientes em um só lugar.
                  </small>
                </span>
              </div>
              <div>
                <span className="auth-benefit-icon">
                  <Cloud size={20} aria-hidden="true" />
                </span>
                <span>
                  <strong>Dados conectados à sua empresa</strong>
                  <small>
                    Salvos na nuvem para acessar em outros aparelhos.
                  </small>
                </span>
              </div>
              <div>
                <span className="auth-benefit-icon">
                  <ShieldCheck size={20} aria-hidden="true" />
                </span>
                <span>
                  <strong>Um espaço só da sua empresa</strong>
                  <small>Acesso aos registros protegido pela sua conta.</small>
                </span>
              </div>
            </div>
          </div>
          <footer className="auth-story-footer">
            <span>NEXO Gestão</span>
            <span>Feito para diferentes negócios.</span>
          </footer>
        </section>

        <main className="auth-panel" aria-labelledby="auth-form-heading">
          <div className="auth-panel-top">
            <span className="auth-security-badge">
              <LockKeyhole size={13} aria-hidden="true" /> Acesso da empresa
            </span>
            <span className="auth-version">NEXO</span>
          </div>
          {(mode === "login" || mode === "signup") && !confirmationSent && (
            <div
              className="auth-mode-switch"
              aria-label="Escolha o tipo de acesso"
            >
              <button
                type="button"
                className={mode === "login" ? "is-active" : ""}
                aria-pressed={mode === "login"}
                disabled={busy}
                onClick={() => changeMode("login")}
              >
                Entrar
              </button>
              <button
                type="button"
                className={mode === "signup" ? "is-active" : ""}
                aria-pressed={mode === "signup"}
                disabled={busy}
                onClick={() => changeMode("signup")}
              >
                Criar conta
              </button>
            </div>
          )}

          {confirmationSent ? (
            <section className="auth-confirmation" aria-live="polite">
              <span className="auth-confirmation-icon">
                <Mail size={30} aria-hidden="true" />
              </span>
              <span className="auth-kicker">FALTA SÓ CONFIRMAR</span>
              <h2 id="auth-form-heading" ref={headingRef} tabIndex={-1}>
                Confira seu e-mail.
              </h2>
              <p>
                Enviamos a confirmação da conta para{" "}
                <strong>{email.trim()}</strong>. Abra o link recebido para
                ativar o acesso da sua empresa.
              </p>
              <div className="auth-confirmation-note">
                <CheckCircle2 size={17} aria-hidden="true" />
                <span>
                  Não encontrou? Confira a pasta de spam. O envio pode levar
                  alguns instantes.
                </span>
              </div>
              <button
                type="button"
                className="auth-primary-button"
                onClick={() => changeMode("login")}
              >
                Voltar para entrar <ArrowRight size={17} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="auth-text-button auth-confirmation-edit"
                onClick={() => changeMode("signup")}
              >
                Usar outro e-mail
              </button>
            </section>
          ) : (
            <>
              {(mode === "forgot" || mode === "update") &&
                !recoveringPassword && (
                  <button
                    className="auth-back-button"
                    type="button"
                    onClick={() => changeMode("login")}
                    disabled={busy}
                  >
                    <ArrowLeft size={15} aria-hidden="true" /> Voltar para
                    entrar
                  </button>
                )}
              <div className="auth-heading">
                <span className="auth-kicker">{content.kicker}</span>
                <h2 id="auth-form-heading" ref={headingRef} tabIndex={-1}>
                  {content.title}
                </h2>
                <p>{content.description}</p>
              </div>

              {!configured && (
                <div className="auth-configuration-notice" role="status">
                  <CircleAlert size={19} aria-hidden="true" />
                  <div>
                    <strong>Conexão pendente</strong>
                    <p>
                      {configurationError ||
                        "A configuração pública do Supabase ainda precisa ser adicionada para habilitar o acesso e o cadastro de empresas."}
                    </p>
                    <small>
                      É necessário configurar a URL do projeto e a chave pública
                      do Supabase.
                    </small>
                  </div>
                </div>
              )}

              <form className="auth-form" onSubmit={submit} aria-busy={busy}>
                <fieldset disabled={busy || !configured}>
                  {mode === "signup" && (
                    <label className="auth-field">
                      <span>Nome da empresa</span>
                      <span className="auth-input-wrap">
                        <Building2 size={17} aria-hidden="true" />
                        <input
                          autoComplete="organization"
                          name="companyName"
                          value={companyName}
                          onChange={(event) =>
                            setCompanyName(event.target.value)
                          }
                          minLength={2}
                          maxLength={120}
                          placeholder="Como sua empresa se chama?"
                          required
                        />
                      </span>
                    </label>
                  )}
                  {showEmail && (
                    <label className="auth-field">
                      <span>E-mail da empresa</span>
                      <span className="auth-input-wrap">
                        <Mail size={17} aria-hidden="true" />
                        <input
                          type="email"
                          autoComplete={
                            mode === "forgot" ? "email" : "username"
                          }
                          name="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          maxLength={254}
                          placeholder="voce@empresa.com.br"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          required
                        />
                      </span>
                    </label>
                  )}
                  {showPasswordField && (
                    <label className="auth-field">
                      <span>{isNewPassword ? "Crie sua senha" : "Senha"}</span>
                      <span className="auth-input-wrap">
                        <KeyRound size={17} aria-hidden="true" />
                        <input
                          type={showPassword ? "text" : "password"}
                          autoComplete={
                            isNewPassword ? "new-password" : "current-password"
                          }
                          name="password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          minLength={isNewPassword ? 10 : undefined}
                          maxLength={128}
                          placeholder={
                            isNewPassword
                              ? "Pelo menos 10 caracteres"
                              : "Digite sua senha"
                          }
                          aria-describedby={
                            isNewPassword ? "auth-password-hint" : undefined
                          }
                          required
                        />
                        <button
                          className="auth-password-toggle"
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={
                            showPassword ? "Ocultar senha" : "Mostrar senha"
                          }
                          aria-pressed={showPassword}
                        >
                          {showPassword ? (
                            <EyeOff size={17} aria-hidden="true" />
                          ) : (
                            <Eye size={17} aria-hidden="true" />
                          )}
                        </button>
                      </span>
                    </label>
                  )}
                  {isNewPassword && (
                    <>
                      <p id="auth-password-hint" className="auth-password-hint">
                        <Check size={13} aria-hidden="true" /> Prefira uma
                        combinação longa de palavras, números e símbolos.
                      </p>
                      <label className="auth-field">
                        <span>Confirme sua senha</span>
                        <span className="auth-input-wrap">
                          <KeyRound size={17} aria-hidden="true" />
                          <input
                            type={showConfirmation ? "text" : "password"}
                            autoComplete="new-password"
                            name="confirmPassword"
                            value={confirmPassword}
                            onChange={(event) =>
                              setConfirmPassword(event.target.value)
                            }
                            minLength={10}
                            maxLength={128}
                            placeholder="Repita a senha"
                            required
                          />
                          <button
                            className="auth-password-toggle"
                            type="button"
                            onClick={() =>
                              setShowConfirmation(!showConfirmation)
                            }
                            aria-label={
                              showConfirmation
                                ? "Ocultar confirmação da senha"
                                : "Mostrar confirmação da senha"
                            }
                            aria-pressed={showConfirmation}
                          >
                            {showConfirmation ? (
                              <EyeOff size={17} aria-hidden="true" />
                            ) : (
                              <Eye size={17} aria-hidden="true" />
                            )}
                          </button>
                        </span>
                      </label>
                    </>
                  )}
                  {mode === "login" && (
                    <div className="auth-form-meta">
                      <span>
                        <LockKeyhole size={12} aria-hidden="true" /> Sua conta,
                        seu espaço.
                      </span>
                      <button
                        type="button"
                        className="auth-text-button"
                        onClick={() => changeMode("forgot")}
                      >
                        Esqueceu a senha?
                      </button>
                    </div>
                  )}
                  {error && (
                    <div
                      className="auth-feedback auth-feedback-error"
                      role="alert"
                    >
                      <CircleAlert size={17} aria-hidden="true" />
                      <span>{error}</span>
                    </div>
                  )}
                  {notice && (
                    <div
                      className="auth-feedback auth-feedback-success"
                      role="status"
                    >
                      <CheckCircle2 size={17} aria-hidden="true" />
                      <span>{notice}</span>
                    </div>
                  )}
                  <button type="submit" className="auth-primary-button">
                    {busy ? (
                      <>
                        <LoaderCircle
                          size={18}
                          className="auth-spinner"
                          aria-hidden="true"
                        />{" "}
                        Aguarde um instante…
                      </>
                    ) : (
                      <>
                        {content.action}
                        <ArrowRight size={17} aria-hidden="true" />
                      </>
                    )}
                  </button>
                </fieldset>
              </form>
              {mode === "signup" && (
                <p className="auth-signup-note">
                  Uma conta para a empresa, com acesso aos seus próprios
                  clientes. Você poderá configurar um PIN neste aparelho depois
                  de entrar.
                </p>
              )}
              {mode === "forgot" && (
                <p className="auth-helper-note">
                  Por segurança, a resposta é a mesma para e-mails cadastrados
                  ou não.
                </p>
              )}
            </>
          )}
          <div className="auth-panel-footer">
            <ShieldCheck size={15} aria-hidden="true" />
            <span>
              {configured
                ? "Sua empresa começa com uma base organizada."
                : "Acesso disponível após concluir a conexão."}
            </span>
            <ChevronRight size={13} aria-hidden="true" />
          </div>
        </main>
      </div>
      <div className="auth-mobile-footer">
        NEXO Gestão · Seu negócio, com mais clareza.
      </div>
    </div>
  );
}
