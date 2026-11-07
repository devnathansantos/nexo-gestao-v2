import { useState } from "react";
import type { FormEvent } from "react";
import { Check, LoaderCircle } from "lucide-react";
import Modal from "../Modal";
import type { Customer, CustomerInput } from "../../types";
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Não foi possível concluir. Tente novamente.";
export default function CustomerDialog({
  customer,
  onClose,
  onSave,
  online,
}: {
  customer: Customer | null;
  onClose: () => void;
  onSave: (input: CustomerInput) => Promise<void>;
  online: boolean;
}) {
  const [fields, setFields] = useState({
    name: customer?.name || "",
    email: customer?.email || "",
    phone: customer?.phone || "",
    document: customer?.document || "",
    notes: customer?.notes || "",
    active: customer?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const field = (name: keyof typeof fields, value: string | boolean) =>
    setFields((previous) => ({ ...previous, [name]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !online) return;
    setBusy(true);
    setError("");
    try {
      await onSave(fields);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={customer ? "Editar cliente" : "Adicionar cliente"}
      description="Reúna os dados para manter o contato e construir boas relações."
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="full">
            Nome do cliente <span>*</span>
            <input
              name="name"
              autoComplete="name"
              required
              maxLength={160}
              value={fields.name}
              onChange={(e) => field("name", e.target.value)}
              placeholder="Nome completo ou razão social"
              disabled={busy}
            />
          </label>
          <label>
            E-mail
            <input
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              value={fields.email}
              onChange={(e) => field("email", e.target.value)}
              placeholder="cliente@exemplo.com"
              disabled={busy}
            />
          </label>
          <label>
            Telefone / WhatsApp
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              maxLength={32}
              value={fields.phone}
              onChange={(e) => field("phone", e.target.value)}
              placeholder="(00) 00000-0000"
              disabled={busy}
            />
          </label>
          <label>
            CPF / CNPJ <small>Opcional</small>
            <input
              name="document"
              maxLength={32}
              value={fields.document}
              onChange={(e) => field("document", e.target.value)}
              placeholder="Documento do cliente"
              disabled={busy}
            />
          </label>
          <label>
            Situação
            <select
              value={fields.active ? "active" : "inactive"}
              onChange={(e) => field("active", e.target.value === "active")}
              disabled={busy}
            >
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </label>
          <label className="full">
            Observações
            <textarea
              name="notes"
              rows={3}
              maxLength={3000}
              value={fields.notes}
              onChange={(e) => field("notes", e.target.value)}
              placeholder="Informações úteis para o próximo contato."
              disabled={busy}
            />
          </label>
        </div>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {!online && (
          <p className="notice" role="status">
            Conecte-se à internet para salvar este cliente.
          </p>
        )}
        <div className="modal-footer">
          <span>* Campo obrigatório</span>
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button className="button primary" disabled={busy || !online}>
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Check size={16} />
            )}
            {busy ? "Salvando…" : "Salvar cliente"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
