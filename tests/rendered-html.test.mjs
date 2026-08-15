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

test("server-renders the Floré authentication shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Floré — Quản lý tiệm hoa<\/title>/i);
  assert.match(html, /Floré/);
  assert.match(html, /Đang kiểm tra phiên đăng nhập/);
  assert.doesNotMatch(html, /Tổng quan|Tạo đơn/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships the Firebase-backed application configuration", async () => {
  const [page, layout, packageJson, hosting, firebaseClient, firebaseStore, rules, firebaseConfig] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../app/firebase/client.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/firebase/store.ts", import.meta.url), "utf8"),
    readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
    readFile(new URL("../firebase.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<AuthGate \/>/);
  assert.match(layout, /Quản lý tiệm hoa/);
  assert.match(layout, /openGraph/);
  assert.match(packageJson, /"recharts"/);
  assert.match(packageJson, /"jspdf"/);
  assert.match(packageJson, /"firebase"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  const hostingConfig = JSON.parse(hosting);
  assert.equal(hostingConfig.d1, null);
  assert.equal(hostingConfig.r2, null);
  assert.match(firebaseClient, /nananerospace/);
  assert.match(firebaseClient, /kyEi7WdhTdZ7HfpI9PxxxVLbqNR2/);
  assert.match(firebaseStore, /flore_stores/);
  assert.match(firebaseStore, /loadFirebaseStore/);
  assert.match(rules, /request\.auth\.uid/);
  assert.match(rules, /flore_stores\/default/);
  assert.match(firebaseConfig, /firestore\.rules/);
  await access(new URL("../public/og.png", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview", templateRoot)));
  await assert.rejects(access(new URL("../app/api/store/route.ts", templateRoot)));
});
