import type { CustomerFields, CustomerInput } from "../types";

export const MIN_PASSWORD_LENGTH = 10;

function requiredText(
  value: string,
  label: string,
  min: number,
  max: number,
): string {
  const normalized = value.trim();
  if (normalized.length < min)
    throw new Error(`${label} deve ter pelo menos ${min} caracteres.`);
  if (normalized.length > max)
    throw new Error(`${label} deve ter no máximo ${max} caracteres.`);
  return normalized;
}

function optionalText(
  value: string | null | undefined,
  label: string,
  max: number,
): string | null {
  const normalized = value?.trim() || null;
  if (normalized && normalized.length > max)
    throw new Error(`${label} deve ter no máximo ${max} caracteres.`);
  return normalized;
}

export function normalizeEmail(value: string): string {
  const email = value.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new Error("Informe um e-mail válido.");
  }
  return email;
}

export function validatePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    );
  }
  if (password.length > 128)
    throw new Error("A senha deve ter no máximo 128 caracteres.");
}

export function normalizeCompanyName(value: string): string {
  return requiredText(value, "O nome da empresa", 2, 120);
}

export function normalizeCustomer(input: CustomerInput): CustomerFields {
  const email = optionalText(input.email, "O e-mail", 254);
  if (email) normalizeEmail(email);
  if (input.active !== undefined && typeof input.active !== "boolean") {
    throw new Error("A situação do cliente é inválida.");
  }
  return {
    name: requiredText(input.name, "O nome do cliente", 2, 160),
    email,
    phone: optionalText(input.phone, "O telefone", 40),
    document: optionalText(input.document, "O documento", 40),
    notes: optionalText(input.notes, "As observações", 4000),
    active: input.active ?? true,
  };
}
