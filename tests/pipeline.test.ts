// Captura (página local) → cola → base → métricas → CSV/HTML: lo que se muestra corresponde
// exactamente a la respuesta original guardada y a sus citas.
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { setupAgency, useTempDb } from "./helpers";

useTempDb();
const html = readFileSync(path.join(__dirname, "fixtures/fake-chat.html"), "utf8");
let server: http.Server;

before(async () => {
  server = http.createServer((_q, res) => res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.CHATGPT_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/?mode=ok`;
  process.env.WORKER_SESSION_DIR = mkdtempSync(path.join(tmpdir(), "cg-sess-"));
  process.env.WORKER_STABLE_MS = "800";
});
after(async () => {
  const { closeContexts } = await import("../worker/collectors/browser");
  await closeContexts();
  server.close();
});

test("respuesta, citas, evidencia y métricas coinciden con lo capturado", { timeout: 60_000 }, async () => {
  const dbm = await import("../lib/db");
  const q = await import("../lib/queue");
  const access = await import("../lib/access");
  const { buildCollector } = await import("../worker/collectors");
  const { computeAnalysisMetrics, slice } = await import("../lib/metrics");
  const { csvForRun } = await import("../lib/csv");
  const { markdownToHtml } = await import("../components/Markdown");
  await dbm.db();

  const a = await setupAgency("Pampa", { prompts: 5 });
  await dbm.run("UPDATE brands SET name = 'Pampa CRM', domain = 'pampacrm.com.ar', competitors = ? WHERE id = ?", [
    JSON.stringify([{ name: "Andes CRM", domain: "andescrm.com" }, { name: "Ceibo Soft" }]),
    a.brand,
  ]);
  await q.registerWorker("w", "t", ["chatgpt_web"], {});
  await q.setCollectorStatus("chatgpt_web", "available", null, "w", { verified: true });
  const run = await q.createAnalysis({ workspaceId: a.ws, brandId: a.brand, collectors: ["chatgpt_web"], repetitions: 1, idempotencyKey: "p1" });

  const collector = buildCollector("chatgpt_web");
  const job = (await q.claimJob("w", ["chatgpt_web"]))!;
  const result = await collector.collect(
    { prompt: job.prompt_text, engine: job.engine, requestedCountry: "AR", language: "es", runId: run.id, jobId: job.id },
    { saveEvidence: (d, m) => q.saveEvidence(job, d, m), signal: new AbortController().signal, log: () => undefined },
  );
  assert.equal(result.status, "completed", result.error?.message ?? "");
  assert.equal(await q.finishJob(job, result), "completed");

  const stored = (await access.getJobInWorkspace(a.ws, job.id))!;
  assert.equal(stored.answer, result.answerText);
  assert.deepEqual(stored.sources, result.citations);
  assert.ok(stored.answer!.includes(job.prompt_text), "la respuesta corresponde a la pregunta enviada");
  assert.deepEqual(stored.mentions.map((m) => [m.name, m.position, m.explicitRank]), [["Andes CRM", 1, 1], ["Pampa CRM", 2, 2], ["Ceibo Soft", 3, 3]]);
  assert.equal(stored.brand_mentioned, 1);
  assert.equal(stored.own_cited, 1);
  assert.equal(stored.collection_method, "web_capture");
  assert.equal(stored.location_verification, "no_verificada");
  const ev = await access.getEvidenceInWorkspace(a.ws, stored.screenshot_id!);
  assert.ok(ev && ev.mime === "image/jpeg" && ev.data.length > 1000);

  const jobs = await (await import("../lib/metrics")).runJobs(a.ws, run.id);
  const m = computeAnalysisMetrics((await access.getBrandInWorkspace(a.ws, a.brand))!, run, jobs);
  const s = slice(m, job.prompt_category, "chatgpt_web")!;
  assert.deepEqual([s.own.presence.num, s.own.presence.den], [1, 1]);
  assert.deepEqual([m.coverage.num, m.coverage.den], [1, 5]);

  const csv = csvForRun((await access.getBrandInWorkspace(a.ws, a.brand))!, run, jobs);
  assert.ok(csv.includes("https://pampacrm.com.ar/precios?ref=1"));
  const shown = markdownToHtml(stored.answer!);
  assert.ok(shown.includes("<strong>Pampa CRM</strong>"));
  assert.ok(shown.includes('href="https://www.g2.com/andes?utm_source=chatgpt.com"'));
});
