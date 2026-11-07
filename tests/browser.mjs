import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "playwright/test";
import {
  createSupabaseFixture,
  fixtureOrigin,
  fixturePassword,
} from "./fixtures/supabase.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = path.join(root, "test-results", "browser");
const fixture = createSupabaseFixture();
const results = [];
const pageErrors = [];
const blockedExternal = [];
let browser;
let context;
let page;
let server;
let serverOutput = "";
const suiteTimeout = setTimeout(() => {
  console.error("FAIL: browser suite exceeded 120 seconds.");
  server?.kill("SIGKILL");
  process.exit(1);
}, 120_000);

function freePort() {
  return new Promise((resolve, reject) => {
    const listener = createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const port = listener.address().port;
      listener.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForServer(url) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error(`Vite stopped before readiness:\n${serverOutput}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      /* Startup can take a moment. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Vite readiness timed out:\n${serverOutput}`);
}

async function test(name, run) {
  try {
    await run();
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
    await page
      ?.screenshot({
        path: path.join(artifacts, "failure.png"),
        fullPage: true,
      })
      .catch(() => {});
    throw error;
  }
}

async function login(
  email = fixture.users[0].email,
  password = fixturePassword,
) {
  await page.getByLabel("E-mail da empresa", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Entrar na minha conta", exact: true })
    .click();
}

async function nav(label) {
  await page
    .locator(".sidebar")
    .getByRole("button", { name: label, exact: true })
    .click();
}

async function fillDecimal(input, value) {
  const type = await input.getAttribute("type");
  await input.fill(type === "number" ? value.replace(",", ".") : value);
}

function restWriteCount() {
  return fixture.calls.filter(
    (call) =>
      ["POST", "PATCH", "DELETE"].includes(call.method) &&
      call.path.startsWith("/rest/"),
  ).length;
}

async function mobileNav(label) {
  await page
    .locator(".mobile-bottom-nav")
    .getByRole("button", { name: "Mais", exact: true })
    .click();
  await nav(label);
}

const visibleText = (text) =>
  page.getByText(text, { exact: true }).filter({ visible: true });

async function assertNoOverflow() {
  const widths = await page.evaluate(() => ({
    viewport: innerWidth,
    content: document.documentElement.scrollWidth,
  }));
  if (widths.content > widths.viewport)
    console.error(
      await page.evaluate(() =>
        [...document.querySelectorAll("body *")]
          .map((el) => ({
            tag: el.tagName,
            cls: el.className,
            left: el.getBoundingClientRect().left,
            right: el.getBoundingClientRect().right,
            width: el.getBoundingClientRect().width,
          }))
          .filter((el) => el.right > innerWidth + 1 && el.width > 0)
          .slice(0, 25),
      ),
    );
  assert.ok(
    widths.content <= widths.viewport,
    `Horizontal overflow: ${widths.content} > ${widths.viewport}`,
  );
}

try {
  await mkdir(artifacts, { recursive: true });
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    [
      path.join(root, "node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        VITE_BASE_PATH: "/",
        VITE_SUPABASE_URL: fixtureOrigin,
        VITE_SUPABASE_PUBLISHABLE_KEY:
          "sb_publishable_browser_test_not_a_real_key",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (data) => {
    serverOutput = (serverOutput + data).slice(-16_000);
  });
  server.stderr.on("data", (data) => {
    serverOutput = (serverOutput + data).slice(-16_000);
  });
  await waitForServer(origin);
  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox"],
  });
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
    serviceWorkers: "block",
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === fixtureOrigin) return fixture.route(route);
    if (url.origin === origin || ["data:", "blob:"].includes(url.protocol))
      return route.continue();
    blockedExternal.push(
      `${route.request().method()} ${url.origin}${url.pathname}`,
    );
    return route.abort("blockedbyclient");
  });
  page = await context.newPage();
  page.setDefaultTimeout(7000);
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(origin);

  await test("Login rejects invalid credentials and accepts the company password", async () => {
    await expect(
      page.getByRole("heading", { name: "Bom ter você aqui." }),
    ).toBeVisible();
    await assertNoOverflow();
    await login(fixture.users[0].email, "senha-incorreta");
    await expect(page.getByRole("alert")).toContainText(
      "E-mail ou senha incorretos",
    );
    await login();
    await expect(
      page.getByRole("heading", { name: "Uma visão clara de tudo." }),
    ).toBeVisible();
    await expect(
      page
        .locator(".recent-list")
        .getByText("Cliente exclusivo Aurora", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Cliente exclusivo Horizonte", { exact: true }),
    ).toHaveCount(0);
    await assertNoOverflow();
    await page.screenshot({
      path: path.join(artifacts, "desktop.png"),
      fullPage: true,
    });
  });

  await test("Customers can be created, edited, searched and persisted across reload", async () => {
    await nav("Clientes");
    await page
      .getByRole("button", { name: "Novo cliente", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Adicionar cliente" });
    await dialog.getByLabel("Nome do cliente").fill("Cliente de teste browser");
    await dialog
      .getByLabel("E-mail", { exact: true })
      .fill("novo-cliente@example.test");
    await dialog.getByLabel("Telefone / WhatsApp").fill("11988887777");
    await dialog
      .getByLabel("Observações")
      .fill("Cadastro criado pela suíte de interface.");
    await dialog
      .getByRole("button", { name: "Salvar cliente", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByText("Cliente de teste browser", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Editar Cliente de teste browser",
        exact: true,
      })
      .click();
    const editing = page.getByRole("dialog", { name: "Editar cliente" });
    await editing
      .getByLabel("Nome do cliente")
      .fill("Cliente atualizado browser");
    await editing.getByLabel("Situação").selectOption("inactive");
    await editing
      .getByRole("button", { name: "Salvar cliente", exact: true })
      .click();
    await expect(editing).toHaveCount(0);
    await expect(
      page.getByText("Cliente atualizado browser", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Buscar clientes" })
      .fill("atualizado browser");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Uma visão clara de tudo." }),
    ).toBeVisible();
    await nav("Clientes");
    await expect(
      page.getByText("Cliente atualizado browser", { exact: true }),
    ).toBeVisible();
    assert.equal(
      fixture.customers.filter(
        (row) => row.name === "Cliente atualizado browser",
      ).length,
      1,
    );
  });

  await test("Catalog products and services accept decimal prices, editing, inactive filters and confirmed deletion", async () => {
    await nav("Catálogo");
    for (const item of [
      {
        name: "Produto decimal browser",
        kind: "product",
        price: "12,35",
        cents: 1235,
      },
      {
        name: "Serviço decimal browser",
        kind: "service",
        price: "30,50",
        cents: 3050,
      },
    ]) {
      await page
        .getByRole("button", { name: "Novo item", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Novo item do catálogo",
      });
      await dialog.getByLabel(/^Nome do item/).fill(item.name);
      await dialog.getByLabel("Tipo do item").selectOption(item.kind);
      await dialog.getByLabel(/^Unidade/).fill("un");
      await fillDecimal(dialog.getByLabel(/^Preço de referência/), item.price);
      await dialog
        .getByLabel(/^Descrição/)
        .fill("Item criado pela suíte de interface.");
      await dialog
        .getByRole("button", { name: "Salvar item", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      await expect(visibleText(item.name)).toBeVisible();
      assert.ok(
        fixture.catalogItems.some(
          (row) =>
            row.name === item.name &&
            row.kind === item.kind &&
            row.price_cents === item.cents,
        ),
      );
    }
    await page
      .getByRole("button", {
        name: "Editar Produto decimal browser",
        exact: true,
      })
      .click();
    let dialog = page.getByRole("dialog", { name: "Editar item do catálogo" });
    await dialog.getByLabel(/^Nome do item/).fill("Produto atualizado browser");
    await fillDecimal(dialog.getByLabel(/^Preço de referência/), "12,45");
    await dialog
      .getByRole("checkbox", { name: /Item ativo no catálogo/ })
      .uncheck();
    await dialog
      .getByRole("button", { name: "Salvar item", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await page
      .getByLabel("Filtrar situação do item", { exact: true })
      .selectOption("inactive");
    await expect(page.locator(".catalog-table tbody tr")).toHaveCount(1);
    await expect(page.locator(".catalog-table tbody tr")).toContainText(
      "Produto atualizado browser",
    );
    await expect(page.locator(".catalog-table tbody tr")).toContainText(
      "Inativo",
    );
    await page
      .getByRole("button", {
        name: "Editar Produto atualizado browser",
        exact: true,
      })
      .click();
    dialog = page.getByRole("dialog", { name: "Editar item do catálogo" });
    await dialog
      .getByRole("checkbox", { name: /Item ativo no catálogo/ })
      .check();
    await dialog
      .getByRole("button", { name: "Salvar item", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await page
      .getByLabel("Filtrar situação do item", { exact: true })
      .selectOption("all");
    await page
      .getByRole("button", {
        name: "Excluir Serviço decimal browser",
        exact: true,
      })
      .click();
    dialog = page.getByRole("dialog", { name: "Excluir item do catálogo?" });
    assert.ok(
      fixture.catalogItems.some(
        (row) => row.name === "Serviço decimal browser",
      ),
    );
    await dialog
      .getByRole("button", { name: "Excluir item", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByText("Serviço decimal browser", { exact: true }),
    ).toHaveCount(0);
    assert.ok(
      !fixture.catalogItems.some(
        (row) => row.name === "Serviço decimal browser",
      ),
    );
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Uma visão clara de tudo." }),
    ).toBeVisible();
    await nav("Catálogo");
    await expect(visibleText("Produto atualizado browser")).toBeVisible();
    const updated = fixture.catalogItems.find(
      (row) => row.name === "Produto atualizado browser",
    );
    assert.equal(updated.price_cents, 1245);
    assert.equal(updated.active, true);
    await assertNoOverflow();
  });

  await test("Quotes persist catalog and custom lines with decimal quantities, discounts and optimistic update timestamps", async () => {
    await nav("Orçamentos");
    await page
      .getByRole("button", { name: "Novo orçamento", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Novo orçamento",
      exact: true,
    });
    const product = fixture.catalogItems.find(
      (row) => row.name === "Produto atualizado browser",
    );
    await dialog.getByLabel("Cliente").selectOption(fixture.customers[0].id);
    await dialog
      .getByLabel("Título da proposta", { exact: true })
      .fill("Orçamento decimal browser");
    await dialog.getByLabel("Válido até", { exact: true }).fill("2026-12-31");
    await dialog
      .getByLabel("Adicionar item do catálogo", { exact: true })
      .selectOption(product.id);
    await expect(
      dialog.getByLabel("Descrição do item 1", { exact: true }),
    ).toHaveValue(product.name);
    await fillDecimal(
      dialog.getByLabel("Quantidade do item 1", { exact: true }),
      "2,5",
    );
    await page
      .getByRole("button", { name: "Linha personalizada", exact: true })
      .click();
    await dialog
      .getByLabel("Descrição do item 2", { exact: true })
      .fill("Instalação personalizada <b>sem HTML</b>");
    await fillDecimal(
      dialog.getByLabel("Quantidade do item 2", { exact: true }),
      "1,125",
    );
    await fillDecimal(
      dialog.getByLabel("Valor unitário do item 2", { exact: true }),
      "8,90",
    );
    await fillDecimal(
      dialog.getByLabel("Desconto (R$)", { exact: true }),
      "1,14",
    );
    await dialog
      .getByLabel("Condições de pagamento")
      .fill("Pix na aprovação da proposta.");
    await dialog
      .getByLabel("Observações")
      .fill('<img src=x onerror="window.__nexoInjected=true">');
    await expect(dialog.locator(".quote-total-line")).toContainText("40,00");
    await dialog
      .getByRole("button", { name: "Salvar rascunho", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    let savedDetails = page.getByRole("dialog", { name: /^Orçamento #/ });
    await expect(savedDetails).toContainText("Orçamento decimal browser");
    await expect(savedDetails.locator(".quote-detail-totals")).toContainText(
      "40,00",
    );
    await savedDetails
      .getByRole("button", { name: "Fechar janela", exact: true })
      .click();
    let quote = fixture.quotes.find(
      (row) => row.title === "Orçamento decimal browser",
    );
    assert.ok(quote);
    assert.equal(quote.company_id, fixture.users[0].companyId);
    assert.equal(quote.customer_name, "Cliente exclusivo Aurora");
    assert.equal(quote.subtotal_cents, 4114);
    assert.equal(quote.discount_cents, 114);
    assert.equal(quote.total_cents, 4000);
    assert.deepEqual(
      quote.items.map((item) => [
        item.quantity_milli,
        item.unit_price_cents,
        item.line_total_cents,
      ]),
      [
        [2500, 1245, 3113],
        [1125, 890, 1001],
      ],
    );
    assert.equal(quote.items[0].catalog_item_id, product.id);
    assert.equal(quote.items[1].catalog_item_id, null);
    const creation = fixture.calls.findLast(
      (call) => call.path === "/rest/v1/rpc/nexo_save_quote",
    );
    assert.match(
      creation.body.p_payload.request_id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    const previousUpdatedAt = quote.updated_at;
    const row = page
      .locator(".quote-list-table tbody tr")
      .filter({ hasText: "Orçamento decimal browser" });
    await expect(row).toContainText("40,00");
    await row.getByRole("button", { name: /^Editar orçamento #/ }).click();
    const editing = page.getByRole("dialog", { name: /^Editar orçamento #/ });
    await expect(
      editing.getByLabel("Quantidade do item 2", { exact: true }),
    ).toHaveValue("1,125");
    await editing
      .getByLabel("Condições de pagamento")
      .fill("Pix ou transferência após a aprovação.");
    await editing
      .getByRole("button", { name: "Salvar rascunho", exact: true })
      .click();
    await expect(editing).toHaveCount(0);
    savedDetails = page.getByRole("dialog", { name: /^Orçamento #/ });
    await expect(savedDetails).toContainText(
      "Pix ou transferência após a aprovação.",
    );
    await savedDetails
      .getByRole("button", { name: "Fechar janela", exact: true })
      .click();
    const update = fixture.calls.findLast(
      (call) => call.path === "/rest/v1/rpc/nexo_save_quote",
    );
    assert.equal(update.body.p_payload.id, quote.id);
    assert.equal(update.body.p_payload.expected_updated_at, previousUpdatedAt);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Uma visão clara de tudo." }),
    ).toBeVisible();
    await nav("Orçamentos");
    await expect(
      page
        .locator(".quote-list-table tbody tr")
        .filter({ hasText: "Orçamento decimal browser" }),
    ).toContainText("40,00");
    quote = fixture.quotes.find((item) => item.id === quote.id);
    assert.equal(quote.payment_terms, "Pix ou transferência após a aprovação.");
    await assertNoOverflow();
  });

  await test("Quote printing renders escaped snapshots on one page and terminal approval removes editing actions", async () => {
    const row = page
      .locator(".quote-list-table tbody tr")
      .filter({ hasText: "Orçamento decimal browser" });
    await row.getByRole("button", { name: /^Visualizar orçamento #/ }).click();
    let details = page.getByRole("dialog", { name: /^Orçamento #/ });
    const printed = details.locator(".quote-print-document");
    await expect(printed).toHaveCount(1);
    await expect(printed).toBeHidden();
    assert.ok(
      (await printed.textContent()).includes(
        '<img src=x onerror="window.__nexoInjected=true">',
      ),
    );
    assert.ok(
      (await printed.textContent()).includes(
        "Instalação personalizada <b>sem HTML</b>",
      ),
    );
    assert.equal(
      await printed.locator("img").count(),
      1,
      "Only the brand image should be an actual image element.",
    );
    assert.equal(
      await printed.locator("b").count(),
      0,
      "User text must not become markup.",
    );
    await page.evaluate(() => {
      window.__nexoPrintCalls = 0;
      window.print = () => {
        window.__nexoPrintCalls += 1;
      };
    });
    await details
      .getByRole("button", { name: "Imprimir / salvar PDF", exact: true })
      .click();
    assert.equal(await page.evaluate(() => window.__nexoPrintCalls), 1);
    assert.equal(await page.evaluate(() => window.__nexoInjected), undefined);
    await page.emulateMedia({ media: "print" });
    await expect(printed).toBeVisible();
    await expect(page.locator(".sidebar")).toBeHidden();
    await expect(printed).toContainText("Empresa Aurora");
    await expect(printed.locator(".quote-print-grand-total")).toContainText(
      "40,00",
    );
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    await writeFile(path.join(artifacts, "orcamento.pdf"), pdf);
    assert.equal(
      (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length,
      1,
      "A short two-line quote should print without blank extra pages.",
    );
    await page.emulateMedia({ media: "screen" });
    await details
      .getByRole("button", { name: "Marcar como enviado", exact: true })
      .click();
    let confirmation = page.getByRole("dialog", {
      name: "Marcar orçamento como enviado?",
      exact: true,
    });
    await expect(confirmation).toContainText(
      "nenhuma mensagem será enviada automaticamente",
    );
    await confirmation
      .getByRole("button", { name: "Confirmar alteração", exact: true })
      .click();
    await expect(confirmation).toHaveCount(0);
    await expect(row).toContainText("Enviado");
    await row.getByRole("button", { name: /^Visualizar orçamento #/ }).click();
    details = page.getByRole("dialog", { name: /^Orçamento #/ });
    await details
      .getByRole("button", { name: "Marcar aprovado", exact: true })
      .click();
    confirmation = page.getByRole("dialog", {
      name: "Marcar orçamento como aprovado?",
      exact: true,
    });
    await expect(confirmation).toContainText(
      "não registra recebimento nem movimenta estoque",
    );
    await confirmation
      .getByRole("button", { name: "Confirmar alteração", exact: true })
      .click();
    await expect(confirmation).toHaveCount(0);
    await expect(row).toContainText("Aprovado");
    await expect(
      row.getByRole("button", { name: /^Editar orçamento #/ }),
    ).toHaveCount(0);
    await expect(
      row.getByRole("button", { name: /^Excluir orçamento #/ }),
    ).toHaveCount(0);
    await row.getByRole("button", { name: /^Visualizar orçamento #/ }).click();
    details = page.getByRole("dialog", { name: /^Orçamento #/ });
    await expect(
      details.getByRole("button", { name: "Editar rascunho", exact: true }),
    ).toHaveCount(0);
    await expect(
      details.getByRole("button", { name: "Marcar como enviado", exact: true }),
    ).toHaveCount(0);
    await details
      .getByRole("button", { name: "Fechar janela", exact: true })
      .click();
    const transitions = fixture.calls.filter(
      (call) => call.path === "/rest/v1/rpc/nexo_set_quote_status",
    );
    assert.deepEqual(
      transitions.map((call) => call.body.p_status),
      ["sent", "approved"],
    );
    assert.ok(transitions.every((call) => call.body.p_expected_updated_at));
  });

  await test("Draft quote deletion requires confirmation and preserves the customer and catalog", async () => {
    const row = page
      .locator(".quote-list-table tbody tr")
      .filter({ hasText: "Orçamento exclusivo Aurora" });
    const quote = fixture.quotes.find(
      (item) => item.title === "Orçamento exclusivo Aurora",
    );
    const customerCount = fixture.customers.length;
    const catalogCount = fixture.catalogItems.length;
    await row.getByRole("button", { name: /^Excluir orçamento #/ }).click();
    const dialog = page.getByRole("dialog", {
      name: "Excluir este rascunho?",
      exact: true,
    });
    assert.ok(fixture.quotes.some((item) => item.id === quote.id));
    await dialog
      .getByRole("button", { name: "Confirmar exclusão", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(row).toHaveCount(0);
    assert.ok(!fixture.quotes.some((item) => item.id === quote.id));
    assert.equal(fixture.customers.length, customerCount);
    assert.equal(fixture.catalogItems.length, catalogCount);
    const removal = fixture.calls.findLast(
      (call) => call.path === "/rest/v1/rpc/nexo_delete_quote",
    );
    assert.equal(removal.body.p_quote_id, quote.id);
    assert.equal(removal.body.p_expected_updated_at, quote.updated_at);
  });

  await test("Finance converts an approved quote once and separates sales from partial cash receipts", async () => {
    await nav("Financeiro");
    const q = fixture.quotes.find(
      (q) =>
        q.company_id === fixture.users[0].companyId && q.status === "approved",
    );
    assert.ok(q);
    await page
      .getByRole("button", { name: "Nova venda / serviço", exact: true })
      .click();
    let form = page.getByRole("dialog", {
      name: "Registrar venda / serviço",
      exact: true,
    });
    await form.getByLabel("Origem da venda").selectOption(q.id);
    await form.getByLabel("Data da operação").fill("2026-01-20");
    await form.getByLabel("Vencimento").fill("2026-02-20");
    await form
      .getByRole("button", { name: "Registrar operação", exact: true })
      .click();
    let detail = page.getByRole("dialog", { name: q.title, exact: true });
    await expect(
      detail.getByRole("heading", { name: "Histórico de pagamentos" }),
    ).toBeVisible();
    const operation = fixture.finance.operations.find(
      (o) => o.quote_id === q.id,
    );
    assert.equal(operation.amount_cents, q.total_cents);
    await detail
      .getByRole("button", { name: "Registrar recebimento", exact: true })
      .click();
    form = page.getByRole("dialog", {
      name: "Registrar recebimento",
      exact: true,
    });
    const partial = Math.floor(q.total_cents / 2);
    await form.getByLabel("Valor movimentado (R$)").fill(String(partial / 100));
    await form.getByLabel("Data efetiva").fill("2026-02-10");
    await form.getByLabel("Referência / comprovante").fill("Recibo de teste");
    await form.getByRole("button", { name: "Confirmar pagamento" }).click();
    await expect(detail.locator(".finance-payment-list li")).toHaveCount(1);
    assert.equal(fixture.finance.payments[0].amount_cents, partial);
    await detail.getByLabel("Fechar janela").click();
    await page.getByLabel("Período financeiro").fill("2026-01");
    await expect(
      page
        .locator(".finance-metrics article")
        .filter({ hasText: "Recebido" })
        .locator("strong"),
    ).toHaveText(/0,00/);
    await page.getByLabel("Período financeiro").fill("2026-02");
    await expect(
      page
        .locator(".finance-metrics article")
        .filter({ hasText: "Vendas e serviços" })
        .locator("strong"),
    ).toHaveText(/0,00/);
    await expect(
      page
        .locator(".finance-metrics article")
        .filter({ hasText: "Recebido" })
        .locator("strong"),
    ).not.toHaveText(/R\$\s*0,00/);
    const csvPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "CSV anual de caixa" }).click();
    const csv = await csvPromise;
    const text = await readFile(await csv.path(), "utf8");
    assert.ok(text.includes("2026-02-10"));
    assert.ok(text.includes("Recibo de teste"));
    await page
      .getByRole("button", { name: "Nova venda / serviço", exact: true })
      .click();
    form = page.getByRole("dialog", {
      name: "Registrar venda / serviço",
      exact: true,
    });
    await form.getByLabel("Origem da venda").selectOption(q.id);
    await form
      .getByRole("button", { name: "Registrar operação", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: q.title, exact: true }),
    ).toBeVisible();
    assert.equal(
      fixture.finance.operations.filter((o) => o.quote_id === q.id).length,
      1,
    );
    await page
      .getByRole("dialog", { name: q.title, exact: true })
      .getByLabel("Fechar janela")
      .click();
    await page.getByLabel("Período financeiro").fill("2026-01");
    await expect(page.locator(".finance-table tbody tr")).toHaveCount(1);
    await page.screenshot({
      path: path.join(artifacts, "finance-desktop.png"),
      fullPage: true,
    });
  });

  await test("Finance expenses preserve corrections, block offline writes and fit mobile", async () => {
    await page
      .getByRole("button", { name: "Nova despesa", exact: true })
      .click();
    let form = page.getByRole("dialog", {
      name: "Registrar despesa",
      exact: true,
    });
    await form
      .getByLabel("Descrição", { exact: true })
      .fill("Aluguel de teste");
    await form.getByLabel("Fornecedor / favorecido").fill("Locador de teste");
    await form.getByLabel("Valor total (R$)").fill("350,01");
    await form.getByLabel("Categoria", { exact: true }).fill("Aluguel");
    await form.getByLabel("Data da operação").fill("2026-01-05");
    await form.getByLabel("Vencimento").fill("2026-01-10");
    await form
      .getByRole("button", { name: "Registrar operação", exact: true })
      .click();
    let detail = page.getByRole("dialog", {
      name: "Aluguel de teste",
      exact: true,
    });
    await detail
      .getByRole("button", { name: "Registrar pagamento", exact: true })
      .click();
    form = page.getByRole("dialog", {
      name: "Registrar pagamento",
      exact: true,
    });
    await form.getByLabel("Data efetiva").fill("2026-01-10");
    await form.getByRole("button", { name: "Confirmar pagamento" }).click();
    await expect(detail.locator(".finance-payment-list li")).toHaveCount(1);
    await detail
      .getByRole("button", { name: "Corrigir lançamento", exact: true })
      .click();
    const correction = page.getByRole("dialog", {
      name: "Corrigir lançamento incorreto",
      exact: true,
    });
    await correction
      .getByLabel("Motivo da correção")
      .fill("Pagamento duplicado no lançamento");
    await correction
      .getByRole("button", { name: "Confirmar anulação" })
      .click();
    await expect(detail).toContainText("Pagamento duplicado no lançamento");
    assert.ok(
      fixture.finance.payments.find((p) => p.amount_cents === 35001).voided_at,
    );
    await detail
      .getByRole("button", { name: "Anular operação", exact: true })
      .click();
    await correction
      .getByLabel("Motivo da correção")
      .fill("Despesa cadastrada por engano");
    await correction
      .getByRole("button", { name: "Confirmar anulação" })
      .click();
    await expect(detail).toContainText("Despesa cadastrada por engano");
    await detail.getByLabel("Fechar janela").click();
    await context.setOffline(true);
    await expect(
      page.getByRole("button", { name: "Nova despesa", exact: true }),
    ).toBeDisabled();
    await context.setOffline(false);
    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoOverflow();
    await page.screenshot({
      path: path.join(artifacts, "finance-mobile.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Nova despesa", exact: true })
      .click();
    await assertNoOverflow();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await nav("Retorno de clientes");
    await expect(page.locator(".finance-return-list")).toContainText(
      fixture.customers[0].name,
    );
    await expect(page.locator(".finance-return-list")).not.toContainText(
      fixture.users[1].companyName,
    );
    await assertNoOverflow();
  });

  await test("CSV and JSON downloads include current company data only", async () => {
    await nav("Exportações");
    const csvPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Exportar clientes", exact: true })
      .click();
    const csv = await csvPromise;
    const csvPath = path.join(artifacts, "clientes.csv");
    await csv.saveAs(csvPath);
    const csvText = await readFile(csvPath, "utf8");
    assert.match(csv.suggestedFilename(), /^nexo-clientes-.*\.csv$/);
    assert.ok(csvText.includes("Cliente atualizado browser"));
    assert.ok(!csvText.includes("Cliente exclusivo Horizonte"));
    const jsonPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Exportar dados", exact: true })
      .click();
    const json = await jsonPromise;
    const jsonPath = path.join(artifacts, "empresa.json");
    await json.saveAs(jsonPath);
    const backup = JSON.parse(await readFile(jsonPath, "utf8"));
    assert.equal(backup.format, "nexo-company-data");
    assert.equal(backup.version, 3);
    assert.deepEqual(backup.scope, [
      "company",
      "customers",
      "catalog_items",
      "quotes",
      "operations",
      "payments",
    ]);
    assert.equal(backup.company.id, fixture.users[0].companyId);
    assert.equal(backup.counts.customers, 2);
    assert.ok(
      backup.customers.every((row) => row.company_id === backup.company.id),
    );
    assert.equal(
      backup.counts.catalog_items,
      fixture.catalogItems.filter((row) => row.company_id === backup.company.id)
        .length,
    );
    assert.equal(
      backup.counts.quotes,
      fixture.quotes.filter((row) => row.company_id === backup.company.id)
        .length,
    );
    assert.ok(
      backup.catalog_items.every((row) => row.company_id === backup.company.id),
    );
    assert.ok(
      backup.quotes.every(
        (row) =>
          row.company_id === backup.company.id && Array.isArray(row.items),
      ),
    );
    assert.ok(
      backup.catalog_items.some(
        (row) => row.name === "Produto atualizado browser",
      ),
    );
    assert.ok(
      backup.quotes.some(
        (row) =>
          row.title === "Orçamento decimal browser" && row.total_cents === 4000,
      ),
    );
    assert.ok(!JSON.stringify(backup).includes("Horizonte"));
    assert.ok(!JSON.stringify(backup).includes("access_token"));
    assert.ok(!JSON.stringify(backup).includes("owner_id"));
  });

  await test("Offline mode blocks new records, editing and export without sending writes", async () => {
    await nav("Clientes");
    await page
      .getByRole("button", { name: "Novo cliente", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Adicionar cliente" });
    await dialog
      .getByLabel("Nome do cliente")
      .fill("Não deve ser salvo offline");
    const writeCount = fixture.calls.filter(
      (call) =>
        ["POST", "PATCH", "DELETE"].includes(call.method) &&
        call.path.startsWith("/rest/"),
    ).length;
    await context.setOffline(true);
    await expect(
      dialog.getByRole("button", { name: "Salvar cliente", exact: true }),
    ).toBeDisabled();
    await expect(dialog).toContainText(
      "Conecte-se à internet para salvar este cliente.",
    );
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Novo cliente", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", {
        name: "Editar Cliente atualizado browser",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Exportar CSV", exact: true }),
    ).toBeDisabled();
    assert.equal(
      fixture.calls.filter(
        (call) =>
          ["POST", "PATCH", "DELETE"].includes(call.method) &&
          call.path.startsWith("/rest/"),
      ).length,
      writeCount,
    );
    await context.setOffline(false);
    await expect(
      page.getByRole("button", { name: "Novo cliente", exact: true }),
    ).toBeEnabled();
  });

  await test("Offline catalog forms disable saving and send no commerce writes", async () => {
    await nav("Catálogo");
    await page.getByRole("button", { name: "Novo item", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Novo item do catálogo" });
    await dialog
      .getByLabel(/^Nome do item/)
      .fill("Não salvar catálogo offline");
    await fillDecimal(dialog.getByLabel(/^Preço de referência/), "5,90");
    const writes = restWriteCount();
    await context.setOffline(true);
    await expect(
      dialog.getByRole("button", { name: "Salvar item", exact: true }),
    ).toBeDisabled();
    await expect(dialog).toContainText("Conecte-se à internet para salvar");
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Novo item", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", {
        name: "Editar Produto atualizado browser",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Atualizar catálogo", exact: true }),
    ).toBeDisabled();
    assert.equal(restWriteCount(), writes);
    assert.ok(
      !fixture.catalogItems.some(
        (row) => row.name === "Não salvar catálogo offline",
      ),
    );
    await context.setOffline(false);
    await expect(
      page.getByRole("button", { name: "Novo item", exact: true }),
    ).toBeEnabled();
  });

  await test("Offline quote editing disables save and performs no quote RPC", async () => {
    await nav("Orçamentos");
    await page
      .getByRole("button", { name: "Novo orçamento", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Novo orçamento",
      exact: true,
    });
    await dialog.getByLabel("Cliente").selectOption(fixture.customers[0].id);
    await dialog
      .getByLabel("Título da proposta", { exact: true })
      .fill("Não salvar orçamento offline");
    await dialog
      .getByLabel("Descrição do item 1", { exact: true })
      .fill("Linha de teste offline");
    const writes = restWriteCount();
    await context.setOffline(true);
    await expect(
      dialog.getByRole("button", { name: "Salvar rascunho", exact: true }),
    ).toBeDisabled();
    await expect(dialog).toContainText("Você precisa estar online para salvar");
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Novo orçamento", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Atualizar orçamentos", exact: true }),
    ).toBeDisabled();
    assert.equal(restWriteCount(), writes);
    assert.ok(
      !fixture.quotes.some(
        (row) => row.title === "Não salvar orçamento offline",
      ),
    );
    await context.setOffline(false);
    await expect(
      page.getByRole("button", { name: "Novo orçamento", exact: true }),
    ).toBeEnabled();
  });

  await test("PIN activates locally, locks on reload and rejects a wrong PIN", async () => {
    await nav("Segurança");
    await page.getByLabel("Crie um PIN com 6 números").fill("826194");
    await page.getByLabel("Confirme o PIN", { exact: true }).fill("826194");
    await page
      .getByRole("button", { name: "Ativar PIN neste aparelho", exact: true })
      .click();
    await expect(page.getByText("Ativado", { exact: true })).toBeVisible();
    const pinRecord = await page.evaluate(
      (userId) => localStorage.getItem(`nexo:device-pin:v1:${userId}`),
      fixture.users[0].id,
    );
    assert.ok(pinRecord);
    assert.ok(
      !pinRecord.includes("826194"),
      "The PIN must not be stored as plaintext.",
    );
    const stored = JSON.parse(pinRecord);
    assert.ok(stored.iterations >= 210000);
    assert.ok(stored.digest && stored.salt);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Seu espaço está bloqueado." }),
    ).toBeVisible();
    await expect(
      page.getByText("Cliente exclusivo Aurora", { exact: true }),
    ).toHaveCount(0);
    await page.getByLabel("PIN do aparelho", { exact: true }).fill("000000");
    await page
      .getByRole("button", { name: "Desbloquear", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("PIN");
    await page.getByLabel("PIN do aparelho", { exact: true }).fill("826194");
    await page
      .getByRole("button", { name: "Desbloquear", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Uma visão clara de tudo." }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Bloquear tela com PIN", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Seu espaço está bloqueado." }),
    ).toBeVisible();
  });

  await test("Forgotten device PIN is removed only after a fresh valid password login", async () => {
    await page
      .getByRole("button", {
        name: "Esqueci o PIN: entrar com senha",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Bom ter você aqui." }),
    ).toBeVisible();
    const key = `nexo:device-pin:v1:${fixture.users[0].id}`;
    assert.ok(await page.evaluate((key) => localStorage.getItem(key), key));
    await login(fixture.users[0].email, "senha-incorreta");
    await expect(page.getByRole("alert")).toContainText(
      "E-mail ou senha incorretos",
    );
    assert.ok(await page.evaluate((key) => localStorage.getItem(key), key));
    await login();
    await expect(
      page.getByRole("heading", { name: "Uma visão clara de tudo." }),
    ).toBeVisible();
    assert.equal(
      await page.evaluate((key) => localStorage.getItem(key), key),
      null,
    );
    await nav("Segurança");
    await expect(page.getByText("Opcional", { exact: true })).toBeVisible();
  });

  await test("Customer deletion requires confirmation and removes the selected record", async () => {
    await nav("Clientes");
    await page
      .getByRole("button", {
        name: "Excluir Cliente atualizado browser",
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog", { name: "Excluir este cliente?" });
    await expect(dialog).toContainText("Cliente atualizado browser");
    assert.ok(
      fixture.customers.some(
        (row) => row.name === "Cliente atualizado browser",
      ),
    );
    await dialog
      .getByRole("button", { name: "Excluir cliente", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByText("Cliente atualizado browser", { exact: true }),
    ).toHaveCount(0);
    assert.ok(
      !fixture.customers.some(
        (row) => row.name === "Cliente atualizado browser",
      ),
    );
  });

  await test("Signing out clears the previous company before another company signs in", async () => {
    await page
      .locator(".sidebar")
      .getByRole("button", { name: "Sair da conta", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Bom ter você aqui." }),
    ).toBeVisible();
    await expect(
      page.getByText("Cliente exclusivo Aurora", { exact: true }),
    ).toHaveCount(0);
    await login(fixture.users[1].email);
    await expect(
      page.getByRole("heading", { name: "Uma visão clara de tudo." }),
    ).toBeVisible();
    await expect(
      page
        .locator(".recent-list")
        .getByText("Cliente exclusivo Horizonte", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Cliente exclusivo Aurora", { exact: true }),
    ).toHaveCount(0);
    assert.equal(
      await page.evaluate(() =>
        document.body.innerText.includes("cliente-aurora@example.test"),
      ),
      false,
    );
    await nav("Catálogo");
    await expect(visibleText("Serviço exclusivo Horizonte")).toBeVisible();
    await expect(
      page.getByText("Produto atualizado browser", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Serviço exclusivo Aurora", { exact: true }),
    ).toHaveCount(0);
    await nav("Orçamentos");
    await expect(visibleText("Orçamento exclusivo Horizonte")).toBeVisible();
    await expect(
      page.getByText("Orçamento decimal browser", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Orçamento exclusivo Aurora", { exact: true }),
    ).toHaveCount(0);
  });

  await test("Mobile catalog lists, editors and delete confirmations fit the viewport", async () => {
    await nav("Catálogo");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(visibleText("Serviço exclusivo Horizonte")).toBeVisible();
    await assertNoOverflow();
    await page.screenshot({
      path: path.join(artifacts, "catalog-mobile.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Novo item", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Novo item do catálogo" });
    await expect(dialog).toBeVisible();
    await dialog
      .getByLabel(/^Nome do item/)
      .fill("Produto com nome extenso para conferir a disposição no celular");
    await fillDecimal(dialog.getByLabel(/^Preço de referência/), "1234,56");
    await assertNoOverflow();
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await page
      .getByRole("button", {
        name: "Excluir Serviço exclusivo Horizonte",
        exact: true,
      })
      .click();
    const deleting = page.getByRole("dialog", {
      name: "Excluir item do catálogo?",
    });
    await expect(deleting).toBeVisible();
    await assertNoOverflow();
    await deleting
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    await page.setViewportSize({ width: 1440, height: 1000 });
  });

  await test("Mobile quote list, decimal composer and confirmation fit the screen", async () => {
    await nav("Orçamentos");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(visibleText("Orçamento exclusivo Horizonte")).toBeVisible();
    await assertNoOverflow();
    await page.screenshot({
      path: path.join(artifacts, "quotes-mobile.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Novo orçamento", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Novo orçamento",
      exact: true,
    });
    await dialog
      .getByLabel("Cliente")
      .selectOption(
        fixture.customers.find(
          (row) => row.company_id === fixture.users[1].companyId,
        ).id,
      );
    await dialog
      .getByLabel("Título da proposta", { exact: true })
      .fill("Proposta móvel com itens e condições de pagamento");
    await dialog
      .getByLabel("Adicionar item do catálogo", { exact: true })
      .selectOption(
        fixture.catalogItems.find(
          (row) => row.company_id === fixture.users[1].companyId,
        ).id,
      );
    await fillDecimal(
      dialog.getByLabel("Quantidade do item 1", { exact: true }),
      "2,5",
    );
    await dialog
      .getByRole("button", { name: "Linha personalizada", exact: true })
      .click();
    await dialog
      .getByLabel("Descrição do item 2", { exact: true })
      .fill(
        "Descrição longa para verificar a disposição dos campos da proposta no celular",
      );
    await fillDecimal(
      dialog.getByLabel("Valor unitário do item 2", { exact: true }),
      "1234,56",
    );
    await assertNoOverflow();
    await page.screenshot({
      path: path.join(artifacts, "quote-form-mobile.png"),
      fullPage: true,
    });
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await page
      .locator(".quote-list-table tbody tr")
      .filter({ hasText: "Orçamento exclusivo Horizonte" })
      .getByRole("button", { name: /^Excluir orçamento #/ })
      .click();
    const confirmation = page.getByRole("dialog", {
      name: "Excluir este rascunho?",
      exact: true,
    });
    await expect(confirmation).toBeVisible();
    await assertNoOverflow();
    await confirmation
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    await mobileNav("Catálogo");
    await expect(visibleText("Serviço exclusivo Horizonte")).toBeVisible();
    await assertNoOverflow();
    await page.setViewportSize({ width: 1440, height: 1000 });
  });

  await test("Mobile views fit the screen and expose the client form", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoOverflow();
    await page.screenshot({
      path: path.join(artifacts, "mobile.png"),
      fullPage: true,
    });
    await page
      .locator(".mobile-bottom-nav")
      .getByRole("button", { name: "Clientes", exact: true })
      .click();
    await expect(
      page.getByText("Cliente exclusivo Horizonte", { exact: true }),
    ).toBeVisible();
    await assertNoOverflow();
    await page
      .locator(".mobile-bottom-nav")
      .getByRole("button", { name: "Adicionar cliente", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Adicionar cliente" }),
    ).toBeVisible();
    await assertNoOverflow();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .locator(".sidebar")
      .getByRole("button", { name: "Sair da conta", exact: true })
      .click();
  });

  await test("Large company lists paginate, search every record and export the complete dataset", async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await login();
    await expect(
      page.getByRole("heading", { name: "Uma visão clara de tudo." }),
    ).toBeVisible();
    const companyId = fixture.users[0].companyId;
    const collections = [
      fixture.customers,
      fixture.catalogItems,
      fixture.quotes,
    ];
    const addedIds = new Set();
    for (const [collectionIndex, collection] of collections.entries()) {
      const template = collection.find((row) => row.company_id === companyId);
      for (let i = 1; i <= 601; i++) {
        const id = `9000000${collectionIndex}-0000-4000-8000-${String(i).padStart(12, "0")}`;
        const row = { ...structuredClone(template), id };
        if (collectionIndex === 2) {
          row.title = `Carga orçamento ${i}`;
          row.number = 1000 + i;
          row.items = row.items.map((item) => ({
            ...item,
            id: crypto.randomUUID(),
            quote_id: id,
          }));
        } else row.name = `Carga registro ${i}`;
        collection.push(row);
        addedIds.add(id);
      }
    }
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Uma visão clara de tudo." }),
    ).toBeVisible();
    for (const [label, rows, search, term] of [
      [
        "Clientes",
        ".table-scroll tbody tr",
        page.getByRole("textbox", { name: "Buscar clientes" }),
        "Carga registro 601",
      ],
      [
        "Catálogo",
        ".catalog-table tbody tr",
        page.getByRole("searchbox"),
        "Carga registro 601",
      ],
      [
        "Orçamentos",
        ".quote-list-table tbody tr",
        page.getByRole("searchbox"),
        "Carga orçamento 601",
      ],
    ]) {
      await nav(label);
      await expect(page.locator(rows)).toHaveCount(30);
      const paginator = page.getByRole("navigation", {
        name: "Paginação da lista",
      });
      await expect(paginator.getByLabel("Página anterior")).toBeDisabled();
      await paginator.getByLabel("Próxima página").click();
      await expect(paginator).toContainText("Página 2 de");
      await expect(page.locator(rows)).toHaveCount(30);
      await search.fill(term);
      await expect(page.locator(rows)).toHaveCount(1);
      await expect(page.locator(rows)).toContainText(term);
      await search.fill("");
      await expect(paginator).toContainText("Página 1 de");
      await expect(page.locator(rows)).toHaveCount(30);
    }
    await nav("Exportações");
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Exportar dados", exact: true })
      .click();
    const download = await downloadPromise;
    const backup = JSON.parse(await readFile(await download.path(), "utf8"));
    for (const [index, key] of [
      "customers",
      "catalog_items",
      "quotes",
    ].entries()) {
      assert.equal(
        backup[key].length,
        collections[index].filter((row) => row.company_id === companyId).length,
      );
      assert.ok(backup[key].some((row) => addedIds.has(row.id)));
    }
    await nav("Catálogo");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".catalog-mobile-item")).toHaveCount(30);
    await assertNoOverflow();
    await page.screenshot({
      path: path.join(artifacts, "pagination-mobile.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const collection of collections) {
      for (let i = collection.length - 1; i >= 0; i--)
        if (addedIds.has(collection[i].id)) collection.splice(i, 1);
    }
    await page
      .locator(".sidebar")
      .getByRole("button", { name: "Sair da conta", exact: true })
      .click();
  });

  await test("Signup requests confirmation and recovery uses a generic response", async () => {
    await page
      .getByRole("button", { name: "Criar conta", exact: true })
      .click();
    await page
      .getByLabel("Nome da empresa", { exact: true })
      .fill("Empresa confirmação");
    await page
      .getByLabel("E-mail da empresa", { exact: true })
      .fill("confirmacao@example.test");
    await page
      .getByLabel("Crie sua senha", { exact: true })
      .fill(fixturePassword);
    await page
      .getByLabel("Confirme sua senha", { exact: true })
      .fill(fixturePassword);
    await page
      .getByRole("button", { name: "Criar conta da empresa", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Confira seu e-mail." }),
    ).toBeVisible();
    const signup = fixture.calls.findLast(
      (call) => call.path === "/auth/v1/signup",
    );
    assert.equal(signup.body.data.company_name, "Empresa confirmação");
    await page
      .getByRole("button", { name: "Voltar para entrar", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Esqueceu a senha?", exact: true })
      .click();
    await page
      .getByLabel("E-mail da empresa", { exact: true })
      .fill("recuperacao@example.test");
    await page
      .getByRole("button", { name: "Enviar link de recuperação", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Se este e-mail estiver cadastrado",
    );
    const recovery = fixture.calls.findLast(
      (call) => call.path === "/auth/v1/recover",
    );
    assert.ok(recovery);
    assert.match(recovery.search, /redirect_to=/);
    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoOverflow();
  });

  await test("No JavaScript page errors or unexpected external/API requests occurred", async () => {
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(blockedExternal, []);
    assert.deepEqual(fixture.unexpected, []);
  });
  console.log(
    `\n${results.length} browser checks passed. API responses were intercepted; run test:db for real PostgreSQL isolation.`,
  );
} catch (error) {
  process.exitCode = 1;
  console.error(error instanceof Error ? error.stack : error);
} finally {
  clearTimeout(suiteTimeout);
  await writeFile(
    path.join(artifacts, "results.json"),
    JSON.stringify(
      {
        scope:
          "Browser UI with intercepted Supabase API; no production service used",
        passed: results.filter((result) => result.passed).length,
        failed: results.filter((result) => !result.passed).length,
        results,
        pageErrors,
        blockedExternal,
        unexpectedApiRequests: fixture.unexpected,
      },
      null,
      2,
    ),
  ).catch(() => {});
  await browser?.close();
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => server.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
}
