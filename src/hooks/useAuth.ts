import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Company } from "../types";
import {
  authRedirectUrl,
  supabase,
  supabaseConfigurationError,
} from "../lib/supabase";
import { friendlyError, requireOnline } from "../lib/errors";
import {
  normalizeCompanyName,
  normalizeEmail,
  validatePassword,
} from "../lib/validation";
import {
  hasPasswordRecoveryMarker,
  withoutPasswordRecoveryMarker,
} from "../lib/auth-urls";

function clearRecoveryMarker() {
  window.history.replaceState(
    {},
    "",
    withoutPasswordRecoveryMarker(window.location.href),
  );
}

function requireClient() {
  if (!supabase)
    throw new Error(
      supabaseConfigurationError || "O Supabase ainda não está configurado.",
    );
  return supabase;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);
  const [recoveringPassword, setRecoveringPassword] = useState(false);
  const epoch = useRef(0);
  const sessionRef = useRef<Session | null>(null);
  const alive = useRef(false);

  const loadCompany = useCallback(
    async (
      userId: string,
      version: number,
      options: { throwOnError?: boolean; preserveCompany?: boolean } = {},
    ) => {
      if (!supabase) return;
      let failure: string | null = null;
      try {
        const { data, error: queryError } = await supabase
          .from("companies")
          .select("*")
          .eq("owner_id", userId)
          .maybeSingle();
        if (queryError) throw queryError;
        if (
          !alive.current ||
          epoch.current !== version ||
          sessionRef.current?.user.id !== userId
        )
          return;
        setCompany(data);
        failure = data
          ? null
          : "A empresa desta conta não foi encontrada. Confira a preparação do banco antes de continuar.";
        setError(failure);
      } catch (cause) {
        if (!alive.current || epoch.current !== version) return;
        if (!options.preserveCompany) setCompany(null);
        failure = friendlyError(
          cause,
          "Não foi possível carregar os dados da empresa. Tente novamente.",
        );
        setError(failure);
      } finally {
        if (alive.current && epoch.current === version) setLoading(false);
      }
      if (failure && options.throwOnError) throw new Error(failure);
    },
    [],
  );

  useEffect(() => {
    alive.current = true;
    if (!supabase) {
      setLoading(false);
      return () => {
        alive.current = false;
      };
    }
    const initialVersion = epoch.current;
    function applySession(nextSession: Session | null, recovery = false) {
      const previousUserId = sessionRef.current?.user.id;
      sessionRef.current = nextSession;
      const version = ++epoch.current;
      setSession(nextSession);
      setError(null);
      if (previousUserId !== nextSession?.user.id) {
        setCompany(null);
        setRecoveringPassword(false);
      }
      if (!nextSession) {
        setCompany(null);
        setRecoveringPassword(false);
        setLoading(false);
        return;
      }
      // PKCE can finish before React subscribes; a refresh must retain the recovery screen.
      // The marker only has an effect after the SDK supplies a valid session.
      if (recovery || hasPasswordRecoveryMarker(window.location.href))
        setRecoveringPassword(true);
      setLoading(true);
      // Supabase's auth callback runs under its storage lock. Query after it returns.
      window.setTimeout(() => {
        if (alive.current && epoch.current === version)
          void loadCompany(nextSession.user.id, version);
      }, 0);
    }
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!alive.current) return;
        if (
          event === "TOKEN_REFRESHED" &&
          nextSession?.user.id === sessionRef.current?.user.id
        ) {
          sessionRef.current = nextSession;
          setSession(nextSession);
          return;
        }
        applySession(nextSession, event === "PASSWORD_RECOVERY");
      },
    );
    void supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!alive.current || epoch.current !== initialVersion) return;
        if (sessionError) {
          setError(
            friendlyError(
              sessionError,
              "Não foi possível recuperar sua sessão. Entre novamente.",
            ),
          );
          setLoading(false);
          return;
        }
        applySession(data.session);
      })
      .catch((cause: unknown) => {
        if (!alive.current || epoch.current !== initialVersion) return;
        setError(
          friendlyError(
            cause,
            "Não foi possível recuperar sua sessão. Entre novamente.",
          ),
        );
        setLoading(false);
      });
    return () => {
      alive.current = false;
      ++epoch.current;
      subscription.subscription.unsubscribe();
    };
  }, [loadCompany]);

  const refreshCompany = useCallback(async () => {
    const userId = sessionRef.current?.user.id;
    if (!userId) return;
    requireOnline();
    const version = ++epoch.current;
    if (!company) setLoading(true);
    setError(null);
    await loadCompany(userId, version, {
      throwOnError: true,
      preserveCompany: Boolean(company),
    });
  }, [company, loadCompany]);

  const signIn = useCallback(async (email: string, password: string) => {
    const client = requireClient();
    requireOnline();
    const normalizedEmail = normalizeEmail(email);
    if (!password) throw new Error("Informe sua senha.");
    clearRecoveryMarker();
    setRecoveringPassword(false);
    const { error: authError } = await client.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    if (authError)
      throw new Error(
        friendlyError(authError, "Não foi possível entrar. Tente novamente."),
      );
  }, []);

  const signUp = useCallback(
    async (companyName: string, email: string, password: string) => {
      const client = requireClient();
      requireOnline();
      const name = normalizeCompanyName(companyName);
      const normalizedEmail = normalizeEmail(email);
      validatePassword(password);
      clearRecoveryMarker();
      setRecoveringPassword(false);
      const { data, error: authError } = await client.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: { company_name: name },
          emailRedirectTo: authRedirectUrl(),
        },
      });
      if (authError)
        throw new Error(
          friendlyError(
            authError,
            "Não foi possível cadastrar a empresa. Tente novamente.",
          ),
        );
      return { needsEmailConfirmation: !data.session };
    },
    [],
  );

  const signOut = useCallback(async () => {
    const client = requireClient();
    const { error: authError } = await client.auth.signOut({ scope: "local" });
    if (authError)
      throw new Error(
        friendlyError(
          authError,
          "Não foi possível encerrar a sessão. Tente novamente.",
        ),
      );
    ++epoch.current;
    sessionRef.current = null;
    setSession(null);
    setCompany(null);
    setRecoveringPassword(false);
    setError(null);
    setLoading(false);
    clearRecoveryMarker();
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const client = requireClient();
    requireOnline();
    const { error: authError } = await client.auth.resetPasswordForEmail(
      normalizeEmail(email),
      {
        redirectTo: authRedirectUrl(true),
      },
    );
    if (authError)
      throw new Error(
        friendlyError(
          authError,
          "Não foi possível solicitar a recuperação. Tente novamente.",
        ),
      );
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const client = requireClient();
    requireOnline();
    validatePassword(password);
    const { error: authError } = await client.auth.updateUser({ password });
    if (authError)
      throw new Error(
        friendlyError(
          authError,
          "Não foi possível atualizar a senha. Solicite um novo link e tente novamente.",
        ),
      );
    setRecoveringPassword(false);
    // Remove the recovery marker without leaking tokens or forcing a new request.
    clearRecoveryMarker();
  }, []);

  return {
    session,
    company,
    loading,
    error,
    recoveringPassword,
    signIn,
    signUp,
    signOut,
    refreshCompany,
    requestPasswordReset,
    updatePassword,
  };
}
