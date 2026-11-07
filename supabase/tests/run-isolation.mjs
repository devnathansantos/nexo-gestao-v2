import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Embedded PostgreSQL, not an authorization mock. No remote connections or
// persistent test data. The bootstrap auth schema is for this empty DB only.
const database = new PGlite();
const sql = async (relativePath) =>
  readFile(new URL(relativePath, import.meta.url), "utf8");

try {
  await database.exec(await sql("./bootstrap.sql"));
  const migration = await sql(
    "../migrations/202611030001_company_customers.sql",
  );
  await database.exec(migration);
  // Reapplication must remove stale column-level privileges too; REVOKE on a
  // table alone does not revoke grants previously made on individual columns.
  await database.exec(
    "grant update (owner_id) on public.companies to authenticated; grant update (company_id) on public.customers to authenticated;",
  );
  await database.exec(migration);
  const commerceMigration = await sql(
    "../migrations/202611040001_catalog_quotes.sql",
  );
  await database.exec(commerceMigration);
  await database.exec(
    "grant update (company_id) on public.catalog_items to authenticated; grant update (total_cents) on public.quotes to authenticated; grant update (quote_id) on public.quote_items to authenticated;",
  );
  await database.exec(commerceMigration);
  const financeMigration = await sql("../migrations/202611050001_finance.sql");
  await database.exec(financeMigration);
  await database.exec(
    "grant update (amount_cents) on public.operations to authenticated;",
  );
  await database.exec(financeMigration);
  const passed = [];
  for (const suite of ["./isolation.sql", "./commerce.sql", "./finance.sql"]) {
    const results = await database.exec(await sql(suite));
    const result = results
      .flatMap((entry) => entry.rows)
      .find((row) => typeof row.result === "string");
    if (!result?.result.startsWith("PASS:"))
      throw new Error(`The ${suite} SQL assertion suite did not complete.`);
    passed.push(result.result);
  }
  const remaining = await database.query(
    "select count(*)::int as count from public.companies",
  );
  if (remaining.rows[0].count !== 0)
    throw new Error("Test transaction did not roll back.");
  await database.exec(
    "create policy unrelated_public_read on public.customers for select using (true);",
  );
  let conflictingPolicyBlocked = false;
  try {
    await database.exec(migration);
  } catch (error) {
    conflictingPolicyBlocked = String(error).includes(
      "policies require review",
    );
    await database.exec("rollback;");
  }
  if (!conflictingPolicyBlocked)
    throw new Error("An unrelated permissive policy was silently retained.");
  await database.exec("drop policy unrelated_public_read on public.customers;");
  await database.exec(
    "create policy unrelated_catalog_read on public.catalog_items for select using (true);",
  );
  let conflictingCommercePolicyBlocked = false;
  try {
    await database.exec(commerceMigration);
  } catch (error) {
    conflictingCommercePolicyBlocked = String(error).includes(
      "policies require review",
    );
    await database.exec("rollback;");
  }
  if (!conflictingCommercePolicyBlocked)
    throw new Error("An unrelated commerce policy was silently retained.");
  await database.exec(
    "drop policy unrelated_catalog_read on public.catalog_items;",
  );
  for (const result of passed) console.log(result);
  console.log("PASS: repeatable migration and test transaction rollback");
  console.log(
    "PASS: stale column grants revoked and unrelated policies blocked",
  );
} catch (error) {
  console.error("FAIL:", error.message, error.code ?? "", error.where ?? "");
  process.exitCode = 1;
} finally {
  await database.close();
}
