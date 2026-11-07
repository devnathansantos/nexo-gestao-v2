import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const root = new URL("../", import.meta.url);
const read = (file) => readFile(new URL(file, root));
const manifest = JSON.parse(await read("dist/.vite/manifest.json"));
const eager = new Set();
function visit(key) {
  if (eager.has(key)) return;
  assert.ok(manifest[key], `Missing build chunk: ${key}`);
  eager.add(key);
  for (const dependency of manifest[key].imports ?? []) visit(dependency);
}
visit("index.html");
const deferred = [
  "src/components/finance/FinancePage.tsx",
  "src/components/finance/ReturnPage.tsx",
  "src/components/commerce/CatalogPage.tsx",
  "src/components/commerce/QuotesPage.tsx",
  "src/components/company/CompanySettings.tsx",
  "src/components/customers/CustomerDialog.tsx",
  "src/lib/exports.ts",
];
const serviceWorker = (await read("dist/sw.js")).toString();
for (const key of deferred) {
  assert.ok(manifest[key]?.isDynamicEntry, `${key} must load on demand`);
  assert.ok(!eager.has(key), `${key} must not enter the initial import graph`);
  assert.ok(
    serviceWorker.includes(manifest[key].file),
    `${key} must remain in the PWA app-shell cache`,
  );
}
const chunks = await Promise.all(
  [...eager].map(async (key) => {
    const file = manifest[key].file;
    const bytes = await read(`dist/${file}`);
    return { file, bytes: bytes.length, gzipBytes: gzipSync(bytes).length };
  }),
);
const cssFiles = [
  ...new Set([...eager].flatMap((key) => manifest[key].css ?? [])),
];
const cssBytes = (
  await Promise.all(cssFiles.map((file) => read(`dist/${file}`)))
).reduce((sum, bytes) => sum + bytes.length, 0);
const initialGzipBytes = chunks.reduce(
  (sum, chunk) => sum + chunk.gzipBytes,
  0,
);
assert.ok(
  initialGzipBytes <= 160 * 1024,
  `Initial JS exceeds 160 KiB gzip: ${initialGzipBytes}`,
);
assert.ok(
  chunks.find((chunk) => chunk.file === manifest["index.html"].file).bytes <=
    100 * 1024,
  "Application entry exceeds 100 KiB",
);
assert.ok(cssBytes <= 50 * 1024, `Initial CSS exceeds 50 KiB: ${cssBytes}`);
const report = {
  scope:
    "Static initial import graph, excluding later navigation and background PWA precaching; gzip estimate, not measured response time",
  initialGzipBytes,
  cssBytes,
  chunks,
  deferred,
};
await mkdir(new URL("test-results/performance/", root), { recursive: true });
await writeFile(
  new URL("test-results/performance/bundle.json", root),
  JSON.stringify(report, null, 2),
);
console.log(
  `PASS initial JS ${(initialGzipBytes / 1024).toFixed(1)} KiB gzip; CSS ${(cssBytes / 1024).toFixed(1)} KiB; deferred modules preserved in PWA cache.`,
);
