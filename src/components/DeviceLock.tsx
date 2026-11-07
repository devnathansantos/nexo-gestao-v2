import { useEffect, useRef, useState, type FormEvent } from "react";
import type { DeviceLockState } from "../hooks/useDeviceLock";
import "./DeviceLock.css";

interface DeviceLockProps {
  lock: DeviceLockState;
  onSignOut?: () => void | Promise<void>;
  onRecover?: () => void | Promise<void>;
}

export function DeviceLock({ lock, onSignOut, onRecover }: DeviceLockProps) {
  const [pin, setPin] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  useEffect(() => {
    if (lock.locked) {
      setPin("");
      setActionError(null);
      input.current?.focus();
    }
  }, [lock.locked]);
  if (!lock.locked) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await lock.unlock(pin);
      setPin("");
    } catch {
      setPin("");
      input.current?.focus();
    }
  }

  async function runAction(action: (() => void | Promise<void>) | undefined) {
    try {
      setActionError(null);
      await action?.();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Não foi possível concluir. Tente novamente.",
      );
    }
  }

  return (
    <div
      className="device-lock"
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-lock-title"
    >
      <div className="device-lock-card">
        <div className="device-lock-symbol" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          >
            <rect x="5" y="10" width="14" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
          </svg>
        </div>
        <span className="device-lock-eyebrow">NEXO · BLOQUEIO LOCAL</span>
        <h1 id="device-lock-title">Seu espaço está bloqueado.</h1>
        <p>Digite o PIN de 6 números configurado neste aparelho.</p>
        <form onSubmit={submit}>
          <label htmlFor="device-pin-unlock">PIN do aparelho</label>
          <input
            ref={input}
            id="device-pin-unlock"
            className="device-pin-input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]{6}"
            maxLength={6}
            minLength={6}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
            required
            disabled={lock.loading}
            aria-describedby={
              lock.error || actionError ? "device-pin-error" : undefined
            }
          />
          {(lock.error || actionError) && (
            <p id="device-pin-error" className="device-pin-error" role="alert">
              {lock.error || actionError}
            </p>
          )}
          <button
            className="device-pin-primary"
            type="submit"
            disabled={lock.loading || pin.length !== 6}
          >
            {lock.loading ? "Verificando…" : "Desbloquear"}
          </button>
        </form>
        <p className="device-pin-note">
          O PIN bloqueia a tela neste aparelho. Sua conta continua protegida
          pela senha.
        </p>
        <div className="device-lock-links">
          {onRecover && (
            <button
              type="button"
              onClick={() => void runAction(onRecover)}
              disabled={lock.loading}
            >
              Esqueci o PIN: entrar com senha
            </button>
          )}
          {onSignOut && (
            <button
              type="button"
              onClick={() => void runAction(onSignOut)}
              disabled={lock.loading}
            >
              Sair da conta
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function PinSettings({ lock }: { lock: DeviceLockState }) {
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    setNotice(null);
    if (!lock.enabled && pin !== confirmation) {
      setLocalError("Os dois PINs precisam ser iguais.");
      return;
    }
    try {
      if (lock.enabled) {
        await lock.disable(pin);
        setNotice("PIN removido deste aparelho.");
      } else {
        await lock.enable(pin);
        setNotice(
          "PIN ativado. O app será bloqueado ao reabrir ou após 5 minutos sem atividade.",
        );
      }
      setPin("");
      setConfirmation("");
    } catch {
      /* The hook displays the operation error. */
    }
  }

  return (
    <section
      className="device-pin-settings"
      aria-labelledby="device-pin-settings-title"
    >
      <div className="device-pin-settings-head">
        <div>
          <h3 id="device-pin-settings-title">PIN neste aparelho</h3>
          <p>Um cuidado adicional com a tela do seu negócio.</p>
        </div>
        <span className={`device-pin-badge ${lock.enabled ? "enabled" : ""}`}>
          {lock.enabled ? "Ativado" : "Opcional"}
        </span>
      </div>
      <p className="device-pin-note">
        O PIN bloqueia a tela neste aparelho. Sua conta continua protegida pela
        senha. Ele não é uma verificação em duas etapas e não substitui o
        bloqueio do próprio dispositivo.
      </p>
      <form onSubmit={submit}>
        <div className="device-pin-fields">
          <label htmlFor="device-pin-settings-input">
            {lock.enabled
              ? "PIN atual para remover"
              : "Crie um PIN com 6 números"}
            <input
              id="device-pin-settings-input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              required
              value={pin}
              onChange={(event) =>
                setPin(event.target.value.replace(/\D/g, ""))
              }
              disabled={lock.loading}
            />
          </label>
          {!lock.enabled && (
            <label htmlFor="device-pin-confirm">
              Confirme o PIN
              <input
                id="device-pin-confirm"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                required
                value={confirmation}
                onChange={(event) =>
                  setConfirmation(event.target.value.replace(/\D/g, ""))
                }
                disabled={lock.loading}
              />
            </label>
          )}
        </div>
        {(localError || lock.error) && (
          <p className="device-pin-error" role="alert">
            {localError || lock.error}
          </p>
        )}
        {notice && (
          <p className="device-pin-success" role="status">
            {notice}
          </p>
        )}
        <div className="device-pin-actions">
          <button
            className={
              lock.enabled ? "device-pin-secondary" : "device-pin-primary"
            }
            type="submit"
            disabled={
              lock.loading ||
              pin.length !== 6 ||
              (!lock.enabled && confirmation.length !== 6)
            }
          >
            {lock.loading
              ? "Aguarde…"
              : lock.enabled
                ? "Remover PIN deste aparelho"
                : "Ativar PIN neste aparelho"}
          </button>
          {lock.enabled && (
            <button
              className="device-pin-secondary"
              type="button"
              onClick={lock.lock}
              disabled={lock.loading}
            >
              Bloquear agora
            </button>
          )}
        </div>
      </form>
      <p className="device-pin-note">
        A configuração vale apenas para esta conta e este navegador. Limpar o
        armazenamento do navegador remove o PIN; use também o bloqueio de tela
        do seu aparelho.
      </p>
    </section>
  );
}
