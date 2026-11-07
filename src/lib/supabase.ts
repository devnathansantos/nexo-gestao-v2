import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types";
import { readSupabaseConfig } from "./supabase-config";
import { createAuthRedirectUrl } from "./auth-urls";

const configuration = readSupabaseConfig(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export const supabaseConfigurationError = configuration.error;
export const supabase =
  configuration.error === null
    ? createClient<Database>(configuration.url, configuration.key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "pkce",
          storageKey: "nexo-auth",
        },
      })
    : null;

export const isSupabaseConfigured = supabase !== null;

export function authRedirectUrl(recovery = false): string {
  return createAuthRedirectUrl(
    import.meta.env.BASE_URL,
    window.location.origin,
    recovery,
  );
}
