import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Floré application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Floré — Quản lý tiệm hoa<\/title>/i);
  assert.match(html, /Floré/);
  assert.match(html, /Flower Studio/);
  assert.match(html, /Tổng quan/);
  assert.match(html, /Đơn hàng/);
  assert.match(html, /Khách hàng/);
  assert.match(html, /Tạo đơn/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships the data-backed application configuration", async () => {
  const [page, layout, packageJson, hosting, schema, migration] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_milky_miss_america.sql", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<FlowerCRM \/>/);
  assert.match(layout, /Quản lý tiệm hoa/);
  assert.match(layout, /openGraph/);
  assert.match(packageJson, /"recharts"/);
  assert.match(packageJson, /"jspdf"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.deepEqual(JSON.parse(hosting), { d1: "DB", r2: "UPLOADS" });
  for (const table of ["customers", "orders", "orderItems", "products", "payments", "invoices", "delivery", "productionTasks", "activityLogs", "settings"]) {
    assert.match(schema, new RegExp(`export const ${table}`));
  }
  assert.match(migration, /CREATE TABLE `orders`/);
  assert.match(migration, /FOREIGN KEY \(`customer_id`\)/);
  await access(new URL("../public/og.png", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview", templateRoot)));
});
