export type SupabaseConfig =
  | { url: string; key: string; error: null }
  | { url: null; key: null; error: string };

/** Only public browser credentials are accepted. Never expose rejected values. */
export function readSupabaseConfig(
  urlValue: string | undefined,
  keyValue: string | undefined,
): SupabaseConfig {
  const url = urlValue?.trim() || "";
  const key = keyValue?.trim() || "";
  if (!url || !key) {
    return {
      url: null,
      key: null,
      error:
        "Configure a URL e a chave pública do Supabase para ativar o cadastro e o login.",
    };
  }
  try {
    const parsed = new URL(url);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if (
      (!local && parsed.protocol !== "https:") ||
      (local && !["http:", "https:"].includes(parsed.protocol)) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      (parsed.pathname !== "/" && parsed.pathname !== "")
    ) {
      throw new Error("Invalid URL");
    }
  } catch {
    return {
      url: null,
      key: null,
      error:
        "A URL do Supabase é inválida. Use a URL do projeto, sem caminhos adicionais.",
    };
  }
  if (key.startsWith("sb_secret_")) {
    return {
      url: null,
      key: null,
      error:
        "Use somente a chave pública publishable ou anon. Chaves secretas não podem ser usadas no navegador.",
    };
  }
  const jwt = key.split(".");
  if (jwt.length === 3) {
    try {
      const payload = JSON.parse(
        atob(jwt[1].replace(/-/g, "+").replace(/_/g, "/")),
      ) as { role?: string };
      if (payload.role !== "anon") throw new Error("Non-public role");
    } catch {
      return {
        url: null,
        key: null,
        error: "A chave fornecida não é uma chave pública anon válida.",
      };
    }
  } else if (!/^sb_publishable_[A-Za-z0-9_-]+$/u.test(key)) {
    return {
      url: null,
      key: null,
      error:
        "Use uma chave pública publishable ou anon válida do projeto Supabase.",
    };
  }
  return { url: url.replace(/\/$/u, ""), key, error: null };
}
