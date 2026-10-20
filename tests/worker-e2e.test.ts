// Prueba de punta a punta del worker REAL (proceso separado), sin navegador ni HTTP:
// el análisis avanza solo con la cola en la base, sobrevive a un corte abrupto del worker
// y termina sin duplicar resultados.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { after, before, test } from "node:test";
import { setupAgency, useTempDb } from "./helpers";

const DB = useTempDb();
let q: typeof import("../lib/queue");
let dbm: typeof import("../lib/db");

before(async () => {
  dbm = await import("../lib/db");
  q = await import("../lib/queue");
  await dbm.db();
});

const children: ChildProcess[] = [];
const output: string[] = [];

// Si la prueba falla a mitad de camino, ningún worker queda vivo reteniendo el proceso.
after(() => {
  for (const c of children) if (c.exitCode === null) c.kill("SIGKILL");
});

function startWorker(id: string, extra: Record<string, string> = {}): ChildProcess {
  const child = spawn(process.execPath, ["--import", "tsx", "worker/index.ts"], {
    env: {
      ...process.env,
      DATABASE_URL: DB,
      DEMO_SEED: "0",
      WORKER_ID: id,
      WORKER_DISABLE_API: "1",
      WORKER_WEB_COLLECTORS: "",
      WORKER_POLL_MS: "100",
      WORKER_HEARTBEAT_MS: "300",
      WORKER_CONCURRENCY: "2",
      ...extra,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Se lee siempre la salida: un pipe sin leer se llena y frena al worker.
  const keep = (d: Buffer) => {
    output.push(`[${id}] ${d.toString()}`);
    if (output.length > 200) output.shift();
  };
  child.stdout!.on("data", keep);
  child.stderr!.on("data", keep);
  children.push(child);
  return child;
}

async function waitFor<T>(fn: () => Promise<T | null | false>, ms: number): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > until) throw new Error("timeout esperando condición. Salida de los workers:\n" + output.slice(-30).join(""));
    await new Promise((r) => setTimeout(r, 150));
  }
}

const n = async (sql: string, args: string[]) => Number((await dbm.one<{ n: number }>(sql, args))?.n ?? 0);

test("el análisis avanza sin pestaña abierta y se recupera de un corte del worker sin duplicar", { timeout: 90_000 }, async () => {
  const a = await setupAgency("Demo", { demo: true });
  // Lo que hace la web: solo encola y responde.
  const run = await q.createAnalysis({ workspaceId: a.ws, brandId: a.brand, collectors: ["demo_chatgpt", "demo_gemini"], repetitions: 2, idempotencyKey: "e2e" });
  assert.equal(run.total, 20);
  assert.equal(run.status, "pending");

  // Worker 1 arranca y se corta de golpe (SIGKILL) a mitad del análisis.
  const w1 = startWorker("e2e-1", { DEMO_COLLECTOR_DELAY_MS: "400" });
  await waitFor(() => n("SELECT COUNT(*) AS n FROM responses WHERE run_id = ? AND status = 'completed'", [run.id]).then((c) => c >= 4), 30_000);
  w1.kill("SIGKILL");
  await new Promise((r) => w1.once("exit", r));
  const stuck = await n("SELECT COUNT(*) AS n FROM responses WHERE run_id = ? AND status = 'running'", [run.id]);
  const done1 = await n("SELECT COUNT(*) AS n FROM responses WHERE run_id = ? AND status = 'completed'", [run.id]);
  assert.ok(done1 < 20, "el corte tiene que ocurrir a mitad del análisis");

  // Worker 2 recupera lo interrumpido y termina.
  const w2 = startWorker("e2e-2", { STALE_JOB_SECONDS: "1" });
  const finished = await waitFor(async () => {
    const r = await dbm.one<{ status: string }>("SELECT status FROM runs WHERE id = ?", [run.id]);
    return r && ["completed", "partial", "failed"].includes(r.status) ? r.status : null;
  }, 60_000);
  w2.kill("SIGTERM");
  await new Promise((r) => w2.once("exit", r));

  assert.equal(finished, "completed");
  assert.equal(await n("SELECT COUNT(*) AS n FROM responses WHERE run_id = ?", [run.id]), 20);
  assert.equal(await n("SELECT COUNT(*) AS n FROM responses WHERE run_id = ? AND status = 'completed' AND collection_method = 'demo'", [run.id]), 20);
  assert.equal(await n("SELECT COUNT(DISTINCT prompt_id || collector || repetition) AS n FROM responses WHERE run_id = ?", [run.id]), 20);
  assert.equal(await n("SELECT COUNT(*) AS n FROM responses WHERE run_id = ? AND attempts > max_attempts", [run.id]), 0);
  console.log(`  corte con ${done1} completas y ${stuck} en curso; recuperado y terminado sin duplicados`);
});
