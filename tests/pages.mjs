import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "playwright/test";
import {
  createSupabaseFixture,
  fixturePassword,
} from "./fixtures/supabase.mjs";

// Exercise the actual production artifact at the agreed GitHub Pages subpath.
// Supabase requests are intercepted; this never signs in to the real project.
const root = fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(root, "dist");
const base = "/nexo-gestao-v2/";
const backend = "https://sgytnlhqmbaljrrzufcc.supabase.co";
const fixture = createSupabaseFixture();
const errors = [];
const unexpected = [];
const missing = [];
const passed = [];
const artifacts = path.join(root, "test-results/pages");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
let browser;
let page;
const server = createServer(async (req, res) => {
  // No SPA fallback: like Pages, only real files and directory indexes exist.
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    assert.ok(pathname.startsWith(base));
    const relative = pathname.slice(base.length) || "index.html";
    const file = path.resolve(dist, relative);
    assert.ok(file.startsWith(dist + path.sep));
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
    });
    res.end(body);
  } catch {
    missing.push(req.url);
    res.writeHead(404);
    res.end("Not found");
  }
});
const deadline = setTimeout(() => {
  console.error("FAIL Pages suite exceeded 60 seconds");
  server.closeAllConnections();
  process.exit(1);
}, 60_000);

function pass(name) {
  passed.push(name);
  console.log(`PASS ${name}`);
}

try {
  await mkdir(artifacts, { recursive: true });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const url = origin + base;
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
      (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.route("**/*", async (route) => {
    const requested = new URL(route.request().url());
    if (requested.origin === backend) return fixture.route(route);
    if (
      requested.origin === origin ||
      ["data:", "blob:"].includes(requested.protocol)
    )
      return route.continue();
    unexpected.push(requested.origin + requested.pathname);
    return route.abort("blockedbyclient");
  });
  page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "Bom ter você aqui." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Entrar na minha conta", exact: true }),
  ).toBeEnabled();
  await expect
    .poll(() =>
      page
        .locator("img")
        .evaluateAll((images) =>
          images.every((img) => img.complete && img.naturalWidth > 0),
        ),
    )
    .toBe(true);
  pass("Production login, branding and assets load in the Pages subdirectory");

  const manifestUrl = await page
    .locator('link[rel="manifest"]')
    .evaluate((link) => link.href);
  assert.ok(manifestUrl.startsWith(url));
  const manifest = await (await fetch(manifestUrl)).json();
  for (const field of ["start_url", "scope", "id"])
    assert.equal(new URL(manifest[field], manifestUrl).href, url);
  for (const icon of manifest.icons) {
    const iconUrl = new URL(icon.src, manifestUrl).href;
    assert.ok(iconUrl.startsWith(url));
    assert.equal((await fetch(iconUrl)).status, 200);
  }
  await page.waitForFunction(
    async () =>
      (await navigator.serviceWorker.getRegistration())?.active?.state ===
      "activated",
  );
  assert.equal(
    await page.evaluate(
      async () => (await navigator.serviceWorker.ready).scope,
    ),
    url,
  );
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  pass(
    "PWA manifest, icons and active service worker stay inside the Pages scope",
  );

  await page
    .getByLabel("E-mail da empresa", { exact: true })
    .fill(fixture.users[0].email);
  await page.getByLabel("Senha", { exact: true }).fill(fixturePassword);
  await page
    .getByRole("button", { name: "Entrar na minha conta", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Uma visão clara de tudo." }),
  ).toBeVisible();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Catálogo", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Novo item", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".app-shell")).toBeVisible();
  pass(
    "Compiled app authenticates with the fixture, loads a deferred module and survives reload",
  );
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Sair da conta", exact: true })
    .click();

  await page
    .getByRole("button", { name: "Esqueceu a senha?", exact: true })
    .click();
  await page
    .getByLabel("E-mail da empresa", { exact: true })
    .fill(fixture.users[0].email);
  await page
    .getByRole("button", { name: "Enviar link de recuperação", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Se este e-mail estiver cadastrado",
  );
  const recovery = fixture.calls.findLast(
    (call) => call.path === "/auth/v1/recover",
  );
  assert.equal(
    new URLSearchParams(recovery.search).get("redirect_to"),
    `${url}?flow=recovery#/recuperar`,
  );
  await page.goto(`${url}?code=fixture-recovery-code&flow=recovery#/recuperar`);
  await expect(
    page.getByRole("heading", { name: "Escolha uma nova senha." }),
  ).toBeVisible();
  await page
    .getByLabel("Crie sua senha", { exact: true })
    .fill("Pages-recuperacao-2026!");
  await page
    .getByLabel("Confirme sua senha", { exact: true })
    .fill("Pages-recuperacao-2026!");
  await page
    .getByRole("button", { name: "Salvar nova senha", exact: true })
    .click();
  await expect(page.locator(".app-shell")).toBeVisible();
  assert.equal(new URL(page.url()).pathname, base);
  assert.equal(new URL(page.url()).search, "");
  pass(
    "PKCE recovery preserves the subpath and clears callback markers after changing password",
  );
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Sair da conta", exact: true })
    .click();

  const cached = await page.evaluate(async () =>
    (
      await Promise.all(
        (await caches.keys()).map(async (key) =>
          (await (await caches.open(key)).keys()).map((req) => req.url),
        ),
      )
    ).flat(),
  );
  assert.ok(cached.length > 0);
  assert.ok(
    cached.every((item) => item.startsWith(url)),
    "Only this site's static resources may be cached",
  );
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Bom ter você aqui." }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Conecte-se à internet");
  pass(
    "Offline reload serves the static app shell without caching Supabase responses",
  );
  await page.screenshot({
    path: path.join(artifacts, "pages-offline.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  assert.deepEqual(missing, []);
  pass(
    "No JavaScript errors, unexpected external requests or missing static files",
  );
} catch (error) {
  await page
    ?.screenshot({ path: path.join(artifacts, "failure.png"), fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  clearTimeout(deadline);
  await writeFile(
    path.join(artifacts, "results.json"),
    JSON.stringify({ passed, errors, unexpected, missing }, null, 2),
  );
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
console.log(
  `${passed.length} Pages checks passed locally; no remote deployment or real Auth/SMTP was tested.`,
);
