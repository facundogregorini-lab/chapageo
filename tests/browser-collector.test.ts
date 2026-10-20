// Prueba la MECÁNICA del conector Playwright contra una página LOCAL que imita un chat.
// No reemplaza la verificación real contra chatgpt.com / gemini.google.com (ver docs/operacion-worker.md).
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { closeContexts, runWebChat, type BrowserOptions } from "../worker/collectors/browser";
import { chatgptSpec } from "../worker/collectors/chatgpt-web";

const html = readFileSync(path.join(__dirname, "fixtures/fake-chat.html"), "utf8");
let server: http.Server;
let base = "";
before(async () => {
  server = http.createServer((_req, res) => res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});
after(async () => {
  await closeContexts();
  server.close();
});

const opts: BrowserOptions = {
  sessionDir: mkdtempSync(path.join(tmpdir(), "cg-sess-")),
  headless: true,
  locale: "es-AR",
  timezoneId: "America/Argentina/Buenos_Aires",
  navTimeoutMs: 8000,
  responseTimeoutMs: 9000,
  stableMs: 1000,
  egressCountry: null,
};

function spec(mode: string) {
  return { ...chatgptSpec(), url: `${base}?mode=${mode}` };
}

const evidence: { id: string; bytes: number }[] = [];
const ctx = () => ({
  saveEvidence: async (data: Buffer) => {
    const id = `ev${evidence.length + 1}`;
    evidence.push({ id, bytes: data.length });
    return id;
  },
  signal: new AbortController().signal,
  log: () => undefined,
});
const input = { prompt: "¿Cuál es el mejor CRM para pymes en Argentina?", engine: "chatgpt" as const, requestedCountry: "AR", language: "es", runId: "r", jobId: "j" };

test("espera el fin real de la respuesta y extrae solo el mensaje final con sus citas", { timeout: 40_000 }, async () => {
  const r = await runWebChat(spec("ok"), input, ctx(), opts);
  assert.equal(r.status, "completed", r.error?.message ?? "");
  assert.equal(r.collectionMethod, "web_capture");
  // Conserva la lista numerada (necesaria para el puesto explícito) y el texto completo.
  assert.match(r.answerText!, /1\. \*\*Andes CRM\*\*/);
  assert.match(r.answerText!, /3\. Ceibo Soft/);
  assert.match(r.answerText!, /Estas son opciones para «¿Cuál es el mejor CRM/);
  // Nada del razonamiento, la navegación, la pregunta del usuario ni mensajes viejos.
  assert.ok(!/Razonamiento interno|Pensando/.test(r.answerText!));
  assert.ok(!/Conversación anterior|Link de navegación|VIEJA/.test(r.answerText!));
  // Citas: links del mensaje, sin utm ni links propios del asistente.
  assert.deepEqual(r.citations.map((c) => c.url), ["https://www.g2.com/andes", "https://pampacrm.com.ar/precios?ref=1"]);
  assert.equal(r.searchMode, "busqueda_web_observada");
  assert.equal(r.modelIfVisible, "GPT-Prueba");
  assert.equal(r.sessionType, "autenticada");
  assert.equal(r.locationVerification, "no_verificada");
  assert.equal(r.observedCountry, null);
  assert.ok(r.screenshotReference && evidence.find((e) => e.id === r.screenshotReference)!.bytes > 1000);
  assert.ok(r.duration > 1000, "no puede terminar antes de que termine el streaming");
});

test("registra sesión pública cuando no hay login", { timeout: 40_000 }, async () => {
  const r = await runWebChat(spec("public"), input, ctx(), opts);
  assert.equal(r.status, "completed");
  assert.equal(r.sessionType, "publica");
});

test("CAPTCHA o verificación humana: se detiene y pide intervención", { timeout: 30_000 }, async () => {
  const r = await runWebChat(spec("captcha"), input, ctx(), opts);
  assert.equal(r.status, "requires_intervention");
  assert.equal(r.error!.code, "captcha");
  assert.equal(r.error!.transient, false);
  assert.equal(r.answerText, null);
});

test("login obligatorio: se detiene y pide intervención", { timeout: 30_000 }, async () => {
  const r = await runWebChat(spec("login"), input, ctx(), opts);
  assert.equal(r.status, "requires_intervention");
  assert.equal(r.error!.code, "login_requerido");
});

test("límite de uso: se detiene y pide intervención", { timeout: 30_000 }, async () => {
  const r = await runWebChat(spec("limit"), input, ctx(), opts);
  assert.equal(r.status, "requires_intervention");
  assert.equal(r.error!.code, "limite_de_uso");
});

test("respuesta que no termina: timeout configurable y resultado parcial (no válido)", { timeout: 40_000 }, async () => {
  const r = await runWebChat(spec("slow"), input, ctx(), { ...opts, responseTimeoutMs: 4000 });
  assert.equal(r.status, "partial");
  assert.equal(r.error!.code, "timeout");
  assert.ok(r.answerText && r.answerText.includes("sigue"));
});
