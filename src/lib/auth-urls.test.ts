import { describe, expect, it } from "vitest";
import {
  createAuthRedirectUrl,
  hasPasswordRecoveryMarker,
  withoutPasswordRecoveryMarker,
} from "./auth-urls";

describe("GitHub Pages authentication redirects", () => {
  it("retains the repository subpath for confirmation and password recovery", () => {
    expect(
      createAuthRedirectUrl(
        "/nexo-gestao-v2/",
        "https://example.github.io",
        false,
      ),
    ).toBe("https://example.github.io/nexo-gestao-v2/");
    expect(
      createAuthRedirectUrl(
        "/nexo-gestao-v2/",
        "https://example.github.io",
        true,
      ),
    ).toBe(
      "https://example.github.io/nexo-gestao-v2/?flow=recovery#/recuperar",
    );
    expect(createAuthRedirectUrl("/", "http://localhost:5173", true)).toBe(
      "http://localhost:5173/?flow=recovery#/recuperar",
    );
  });

  it("recognizes the recovery screen after PKCE replaces the callback code", () => {
    expect(
      hasPasswordRecoveryMarker(
        "https://example.github.io/nexo/?flow=recovery",
      ),
    ).toBe(true);
    expect(
      hasPasswordRecoveryMarker("https://example.github.io/nexo/#/recuperar"),
    ).toBe(true);
    expect(
      hasPasswordRecoveryMarker("https://example.github.io/nexo/?flow=signup"),
    ).toBe(false);
    expect(hasPasswordRecoveryMarker("invalid-url")).toBe(false);
  });

  it("clears only recovery screen markers and preserves unrelated URL state", () => {
    expect(
      withoutPasswordRecoveryMarker(
        "https://example.github.io/nexo/?flow=recovery&theme=dark#/recuperar",
      ),
    ).toBe("https://example.github.io/nexo/?theme=dark");
    expect(
      withoutPasswordRecoveryMarker(
        "https://example.github.io/nexo/?flow=signup#/clientes",
      ),
    ).toBe("https://example.github.io/nexo/?flow=signup#/clientes");
  });
});
