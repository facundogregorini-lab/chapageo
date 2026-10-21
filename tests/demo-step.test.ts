// La demo avanza desde la web sin worker, pero solo para análisis demo del propio espacio demo.
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { setupAgency, useTempDb } from "./helpers";

useTempDb();
let q: typeof import("../lib/queue");
let step: typeof import("../lib/demo-step");
let dbm: typeof import("../lib/db");

before(async () => {
  dbm = await import("../lib/db");
  q = await import("../lib/queue");
  step = await import("../lib/demo-step");
  await dbm.db();
});

const status = async (runId: string) => String((await dbm.one<{ status: string }>("SELECT status FROM runs WHERE id = ?", [runId]))?.status);

test("un análisis demo termina sin worker, por pasos cortos y sin duplicados", async () => {
  const a = await setupAgency("Demo", { demo: true });
  const run = await q.createAnalysis({ workspaceId: a.ws, brandId: a.brand, collectors: ["demo_chatgpt", "demo_gemini"], repetitions: 2, idempotencyKey: "d1" });
  assert.equal(run.total, 20);
  assert.equal(await step.advanceDemoRun(a.ws, run.id, 6), 6);
  assert.equal(await status(run.id), "running");
  let guard = 0;
  while ((await step.advanceDemoRun(a.ws, run.id, 6)) > 0 && guard++ < 10);
  assert.equal(await status(run.id), "completed");
  const rows = await dbm.all<{ n: number; d: number }>(
    "SELECT COUNT(*) AS n, COUNT(DISTINCT prompt_id || collector || repetition) AS d FROM responses WHERE run_id = ? AND status = 'completed' AND collection_method = 'demo'",
    [run.id],
  );
  assert.equal(Number(rows[0].n), 20);
  assert.equal(Number(rows[0].d), 20);
  assert.equal(await step.advanceDemoRun(a.ws, run.id), 0);
});

test("no procesa análisis de otro espacio ni de espacios reales", async () => {
  const demo = await setupAgency("Demo2", { demo: true });
  const other = await setupAgency("Otra", { demo: true });
  const run = await q.createAnalysis({ workspaceId: demo.ws, brandId: demo.brand, collectors: ["demo_chatgpt"], repetitions: 1, idempotencyKey: "d2" });
  assert.equal(await step.advanceDemoRun(other.ws, run.id), 0);
  assert.equal(await status(run.id), "pending");

  // Un espacio real con un análisis marcado demo a mano tampoco se procesa desde la web.
  const real = await setupAgency("Real");
  await dbm.run("UPDATE runs SET workspace_id = ? WHERE id = ?", [real.ws, run.id]);
  assert.equal(await step.advanceDemoRun(real.ws, run.id), 0);
});

test("demo compartida: un análisis abandonado no traba el próximo", async () => {
  const a = await setupAgency("Demo3", { demo: true });
  const first = await q.createAnalysis({ workspaceId: a.ws, brandId: a.brand, collectors: ["demo_chatgpt"], repetitions: 1, idempotencyKey: "d3a" });
  // Otro visitante inicia uno nuevo en el mismo cliente sin esperar al anterior.
  const second = await q.createAnalysis({ workspaceId: a.ws, brandId: a.brand, collectors: ["demo_chatgpt"], repetitions: 1, idempotencyKey: "d3b" });
  assert.notEqual(second.id, first.id);
  const old = await dbm.one<{ status: string }>("SELECT status FROM runs WHERE id = ?", [first.id]);
  assert.notEqual(old?.status, "pending");
  assert.notEqual(old?.status, "running");
});
