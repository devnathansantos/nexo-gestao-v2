/** A URL marker selects a screen only; it never grants a session or permission. */
export function hasPasswordRecoveryMarker(href: string): boolean {
  try {
    const url = new URL(href);
    return (
      url.searchParams.get("flow") === "recovery" || url.hash === "#/recuperar"
    );
  } catch {
    return false;
  }
}

export function withoutPasswordRecoveryMarker(href: string): string {
  const url = new URL(href);
  if (url.searchParams.get("flow") === "recovery")
    url.searchParams.delete("flow");
  if (url.hash === "#/recuperar") url.hash = "";
  return url.toString();
}

export function createAuthRedirectUrl(
  base: string,
  origin: string,
  recovery: boolean,
): string {
  const url = new URL(base || "/", origin);
  if (recovery) {
    url.searchParams.set("flow", "recovery");
    url.hash = "/recuperar";
  }
  return url.toString();
}
