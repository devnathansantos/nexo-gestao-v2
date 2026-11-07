import { useState } from "react";
import type { FormEvent } from "react";
import { Building2, Check, LoaderCircle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { Company } from "../../types";
const date = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(
    new Date(value),
  );
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Não foi possível concluir. Tente novamente.";
export default function CompanySettings({
  company,
  onSaved,
  online,
}: {
  company: Company;
  onSaved: () => Promise<void>;
  online: boolean;
}) {
  const [name, setName] = useState(company.name);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !online || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (name.trim().length < 2)
        throw new Error("Informe pelo menos dois caracteres para o nome.");
      const { data, error: failure } = await supabase
        .from("companies")
        .update({ name: name.trim() })
        .eq("id", company.id)
        .select()
        .single();
      if (failure || !data)
        throw new Error(
          "Não foi possível salvar o nome. Confira sua conexão e tente novamente.",
        );
      await onSaved();
      setMessage("Dados da empresa atualizados.");
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card settings-card">
      <div className="section-icon">
        <Building2 size={23} />
      </div>
      <h2>O seu espaço de trabalho</h2>
      <p className="muted">Este nome identifica sua empresa dentro do NEXO.</p>
      <form onSubmit={submit} className="settings-form">
        <label>
          Nome da empresa
          <input
            required
            minLength={2}
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="organization"
            disabled={busy}
          />
        </label>
        <div className="setting-info">
          <span>Cadastro realizado em</span>
          <strong>{date(company.created_at)}</strong>
        </div>
        {message && (
          <p className="notice success" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy || !online}>
          {busy ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Check size={16} />
          )}
          Salvar alterações
        </button>
      </form>
    </section>
  );
}
