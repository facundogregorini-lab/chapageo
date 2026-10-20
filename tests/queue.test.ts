import assert from "node:assert/strict";
import { before, test } from "node:test";
import { okResult, setupAgency, useTempDb } from "./helpers";

useTempDb();
type Q = typeof import("../lib/queue");
type A = typeof import("../lib/access");
type D = typeof import("../lib/db");
let q: Q, access: A, dbm: D;

before(async () => {
  dbm = await import("../lib/db");
  q = await import("../lib/queue");
  access = await import("../lib/access");
  await dbm.db();
  // Un worker vivo con el conector de API verificado.
  await q.registerWorker("w-test", "test", ["claude_api"], {});
  await q.setCollectorStatus("claude_api", "available", null, "w-test", { verified: true });
});

async function count(sql: string, args: (string | number)[] = []) {
  return Number((await dbm.one<{ n: number }>(sql, args))?.n ?? 0);
}

test("aislamiento entre agencias en clientes, análisis, ejecuciones y evidencia", async () => {
  const a = await setupAgency("A");
  const b = await setupAgency("B");
  const run = await q.createAnalysis({ workspaceId: a.ws, brandId: a.brand, collectors: ["claude_api"], repetitions: 1, idempotencyKey: "iso-1" });
  const job = await q.claimJob("w-test", ["claude_api"]);
  assert.ok(job);
  const ev = await q.saveEvidence(job!, Buffer.from("img"), "image/jpeg");

  assert.ok(await access.getBrandInWorkspace(a.ws, a.brand));
  assert.equal(await access.getBrandInWorkspace(b.ws, a.brand), null);
  assert.ok(await access.getRunInWorkspace(a.ws, run.id));
  assert.equal(await access.getRunInWorkspace(b.ws, run.id), null);
  assert.ok(await access.getJobInWorkspace(a.ws, job!.id));
  assert.equal(await access.getJobInWorkspace(b.ws, job!.id), null);
  assert.ok(await access.getEvidenceInWorkspace(a.ws, ev));
  assert.equal(await access.getEvidenceInWorkspace(b.ws, ev), null);
  assert.equal((await access.listRuns(b.ws, a.brand)).length, 0);

  // B no puede crear un análisis sobre el cliente de A ni cerrar el análisis de A.
  await assert.rejects(q.createAnalysis({ workspaceId: b.ws, brandId: a.brand, collectors: ["claude_api"], repetitions: 1, idempotencyKey: "iso-2" }), /inexistente/);
  await q.closeAnalysis(b.ws, run.id);
  assert.equal(await count("SELECT COUNT(*) AS n FROM responses WHERE run_id = ? AND error_code = 'cancelado'", [run.id]), 0);
  await q.finishJob(job!, okResult());
  await q.closeAnalysis(a.ws, run.id);
});

test("crea una ejecución por pregunta × motor × repetición, con idempotencia", async () => {
  const a = await setupAgency("C");
  await q.registerWorker("w-test", "test", ["claude_api", "gemini_api"], {});
  await q.setCollectorStatus("gemini_api", "available", null, "w-test", { verified: true });
  const r1 = await q.createAnalysis({ workspaceId: a.ws, brandId: a.brand, collectors: ["claude_api", "gemini_api"], repetitions: 3, idempotencyKey: "k-1" });
  assert.equal(r1.total, 5 * 2 * 3);
  const again = await q.createAnalysis({ workspaceId: a.ws, brandId: a.brand, collectors: ["claude_api", "gemini_api"], repetitions: 3, idempotencyKey: "k-1" });
  assert.equal(again.id, r1.id);
  assert.equal(await count("SELECT COUNT(*) AS n FROM responses WHERE run_id = ?", [r1.id]), 30);
  // No se puede abrir otro análisis del mismo cliente mientras hay uno abierto.
  await assert.rejects(q.createAnalysis({ workspaceId: a.ws, brandId: a.brand, collectors: ["claude_api"], repetitions: 1, idempotencyKey: "k-2" }), /abierto/);
  await q.closeAnalysis(a.ws, r1.id);
  assert.equal((await access.getRunInWorkspace(a.ws, r1.id))!.status, "failed");
});

test("valida motores no verificados, repeticiones y límite de ejecuciones", async () => {
  const a = await setupAgency("D", { prompts: 20 });
  await q.setCollectorStatus("perplexity_api", "unverified", "falta prueba", null);
  await assert.rejects(q.createAnalysis({ workspaceId: a.ws, brandId: a.brand, collectors: ["perplexity_api"], repetitions: 1, idempotencyKey: "v1" }), /no está disponible/);
  await assert.rejects(q.createAnalysis({ workspaceId: a.ws, brandId: a.brand, collectors: ["claude_api"], repetitions: 4, idempotencyKey: "v2" }), /repeticiones/);
  await assert.rejects(q.createAnalysis({ workspaceId: a.ws, brandId: a.brand, collectors: ["demo_chatgpt"], repetitions: 1, idempotencyKey: "v3" }), /no está disponible/);
  process.env.MAX_EXECUTIONS_PER_ANALYSIS = "30";
  await assert.rejects(q.createAnalysis({ workspaceId: a.ws, brandId: a.brand, collectors: ["claude_api", "gemini_api"], repetitions: 1, idempotencyKey: "v4" }), /máximo por análisis es 30/);
  delete process.env.MAX_EXECUTIONS_PER_ANALYSIS;
});

test("reintentos acotados sin duplicar resultados y lease perdido descartado", async () => {
  const a = await setupAgency("E");
  const run = await q.createAnalysis({ workspaceId: a.ws, brandId: a.brand, collectors: ["claude_api"], repetitions: 1, idempotencyKey: "r1" });
  const rows = await count("SELECT COUNT(*) AS n FROM responses WHERE run_id = ?", [run.id]);

  // Dos workers reclaman a la vez: nunca la misma fila.
  const [j1, j2] = await Promise.all([q.claimJob("w1", ["claude_api"]), q.claimJob("w2", ["claude_api"])]);
  assert.ok(j1 && j2 && j1.id !== j2.id);

  // Error transitorio: vuelve a la cola con backoff, en la MISMA fila.
  const transient = okResult("", { status: "failed", answerText: null, error: { code: "api_error", message: "HTTP 503", transient: true } });
  assert.equal(await q.finishJob(j1!, transient), "pending");
  const after = (await access.getJobInWorkspace(a.ws, j1!.id))!;
  assert.equal(after.status, "pending");
  assert.ok(after.next_attempt_at && after.next_attempt_at > new Date().toISOString());
  // Mientras no venza el backoff no se vuelve a tomar.
  await dbm.run("UPDATE responses SET next_attempt_at = ? WHERE id = ?", [new Date(Date.now() - 1000).toISOString(), j1!.id]);
  let retry = await q.claimJob("w1", ["claude_api"]);
  while (retry && retry.id !== j1!.id) {
    await q.finishJob(retry, okResult());
    retry = await q.claimJob("w1", ["claude_api"]);
  }
  assert.equal(retry!.attempts, 2);

  // Worker 1 queda colgado: su lease vence y la fila se recupera.
  await dbm.run("UPDATE responses SET heartbeat_at = ? WHERE id = ?", [new Date(Date.now() - 10 * 60_000).toISOString(), retry!.id]);
  await q.recoverStaleJobs(60_000);
  const reclaimed = await q.claimJob("w2", ["claude_api"]);
  assert.equal(reclaimed!.id, retry!.id);
  assert.equal(await q.finishJob(reclaimed!, okResult("respuesta del worker 2")), "completed");
  // El worker 1 "despierta" y quiere escribir: se descarta.
  assert.equal(await q.finishJob(retry!, okResult("respuesta tardía del worker 1")), null);
  assert.equal((await access.getJobInWorkspace(a.ws, retry!.id))!.answer, "respuesta del worker 2");

  // Agota intentos ⇒ fallida (no reintenta infinito).
  await q.finishJob(j2!, okResult());
  for (let j = await q.claimJob("w1", ["claude_api"]); j; j = await q.claimJob("w1", ["claude_api"])) {
    await q.finishJob(j, okResult("", { status: "failed", answerText: null, error: { code: "timeout", message: "x", transient: true } }));
    await dbm.run("UPDATE responses SET next_attempt_at = NULL WHERE id = ?", [j.id]);
  }
  const final = await access.getRunInWorkspace(a.ws, run.id);
  assert.equal(await count("SELECT COUNT(*) AS n FROM responses WHERE run_id = ?", [run.id]), rows);
  assert.equal(await count("SELECT COUNT(*) AS n FROM responses WHERE run_id = ? AND attempts > max_attempts", [run.id]), 0);
  assert.equal(final!.status, "partial");
});

test("CAPTCHA/login: frena la ejecución, pausa el conector y el análisis queda en «requiere intervención»", async () => {
  const a = await setupAgency("F");
  await q.registerWorker("w-test", "test", ["claude_api", "gemini_api", "chatgpt_web"], {});
  await q.setCollectorStatus("chatgpt_web", "available", null, "w-test", { verified: true });
  const run = await q.createAnalysis({ workspaceId: a.ws, brandId: a.brand, collectors: ["chatgpt_web"], repetitions: 1, idempotencyKey: "cap" });
  const j = await q.claimJob("w1", ["chatgpt_web"]);
  const res = okResult("", {
    status: "requires_intervention",
    answerText: null,
    collectionMethod: "web_capture",
    error: { code: "captcha", message: "La página pidió un CAPTCHA", transient: false },
  });
  assert.equal(await q.finishJob(j!, res), "requires_intervention");
  await q.setCollectorStatus("chatgpt_web", "requires_intervention", "CAPTCHA", "w1");
  const blocked = await q.blockedCollectors();
  assert.ok(blocked.has("chatgpt_web"));
  const r = await q.refreshRunStatus(run.id);
  assert.equal(r!.status, "requires_intervention");
  // Ya no se puede elegir para análisis nuevos.
  const avail = await q.collectorAvailability(false);
  assert.equal(avail.find((x) => x.id === "chatgpt_web")!.selectable, false);
  // El operador resuelve y devuelve a la cola lo frenado (sin sumar intentos).
  await q.setCollectorStatus("chatgpt_web", "available", null, null, { verified: true });
  assert.equal(await q.requeueIntervention("chatgpt_web"), 1);
  const again = await q.claimJob("w1", ["chatgpt_web"]);
  assert.equal(again!.attempts, 1);
});
