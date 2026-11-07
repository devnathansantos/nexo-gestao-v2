type KnownError = { message?: string; code?: string; status?: number };

export function friendlyError(error: unknown, fallback: string): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "Você está sem conexão. Reconecte-se e tente novamente.";
  }
  const value = error && typeof error === "object" ? (error as KnownError) : {};
  if (
    value.code === "invalid_credentials" ||
    value.code === "invalid_login_credentials"
  ) {
    return "E-mail ou senha incorretos.";
  }
  if (value.code === "email_not_confirmed")
    return "Confirme seu e-mail antes de entrar.";
  if (value.code === "user_already_exists" || value.code === "email_exists") {
    return "Este e-mail já tem uma conta. Entre ou recupere sua senha.";
  }
  if (value.code === "signup_disabled")
    return "O cadastro de novas empresas está desabilitado no momento.";
  if (value.code === "weak_password")
    return "Escolha uma senha mais forte, com pelo menos 10 caracteres.";
  if (value.code === "same_password")
    return "Escolha uma senha diferente da senha atual.";
  if (
    value.code === "over_email_send_rate_limit" ||
    value.code === "over_request_rate_limit" ||
    value.status === 429
  ) {
    return "Muitas tentativas em pouco tempo. Aguarde alguns minutos antes de tentar novamente.";
  }
  if (
    value.code === "otp_expired" ||
    value.code === "flow_state_expired" ||
    value.code === "flow_state_not_found"
  ) {
    return "O link expirou ou já foi usado. Solicite um novo link no mesmo navegador.";
  }
  if (
    value.code === "42P01" ||
    value.code === "PGRST205" ||
    value.code === "PGRST202" ||
    value.code === "42883"
  ) {
    return "O banco ainda precisa ser preparado com a migração do NEXO.";
  }
  if (value.code === "42501")
    return "Sua conta não tem permissão para realizar esta operação.";
  if (value.code === "23505") return "Já existe um registro com esses dados.";
  if (value.code === "23514" || value.code === "22001")
    return "Confira os campos: algum valor não atende às regras de cadastro.";
  if (value.code === "PGRST116")
    return "O registro não foi encontrado ou não está disponível para esta empresa.";
  if (
    value.message &&
    /fetch|network|load failed|connection/i.test(value.message)
  ) {
    return "Não foi possível conectar ao serviço. Confira sua conexão e tente novamente.";
  }
  return fallback;
}

export function requireOnline(): void {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error(
      "Conecte-se à internet para salvar ou consultar os dados da empresa.",
    );
  }
}
