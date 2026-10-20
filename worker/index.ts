// Worker de recolección. Corre separado de la web (local, en un servidor o en un contenedor):
//   npm run worker
// Toma ejecuciones pendientes de la cola en la base, las procesa con el conector que corresponda,
// guarda resultados y evidencia, y manda heartbeats. Si se corta, las ejecuciones "en curso"
// vuelven a la cola solas (sin duplicar resultados).

import "./env";
import { hostname } from "node:os";
import { COLLECTORS, isCollectorId } from "../lib/collectors/registry";
import type { Collector, CollectResult } from "../lib/collectors/types";
import { one } from "../lib/db";
import {
  blockedCollectors,
  claimJob,
  finishJob,
  heartbeatJob,
  heartbeatWorker,
  recoverStaleJobs,
  registerWorker,
  saveEvidence,
  setCollectorStatus,
  stopWorker,
  type ClaimedJob,
} from "../lib/queue";
import { toBrand } from "../lib/types";
import { enabledCollectors } from "./collectors";

const WORKER_ID = process.env.WORKER_ID || `${hostname()}-${process.pid}`;
const CONCURRENCY = Math.min(4, Math.max(1, Number(process.env.WORKER_CONCURRENCY || 1)));
const POLL_MS = Number(process.env.WORKER_POLL_MS || 3000);
const WEB_DELAY_MS = Number(process.env.WORKER_WEB_DELAY_MS || 8000);
const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS || 240_000);
const HEARTBEAT_MS = Number(process.env.WORKER_HEARTBEAT_MS || 15_000);

const log = (...args: unknown[]) => console.log(new Date().toISOString(), "[worker]", ...args);

const collectors = new Map<string, Collector>(enabledCollectors().map((c) => [c.id, c]));
const busyWeb = new Set<string>();
let stopping = false;

function blankResult(c: Collector, code: "interrumpido" | "desconocido", message: string, started: number): CollectResult {
  return {
    status: "failed",
    answerText: null,
    citations: [],
    screenshotReference: null,
    collectedAt: new Date().toISOString(),
    engine: c.engine,
    modelIfVisible: null,
    collectionMethod: c.method,
    observedCountry: null,
    locationVerification: "no_verificada",
    searchMode: "no_observable",
    sessionType: c.method === "official_api" ? "api" : "publica",
    duration: Date.now() - started,
    error: { code, message, transient: true },
  };
}

async function execute(job: ClaimedJob) {
  const c = collectors.get(job.collector)!;
  const started = Date.now();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), JOB_TIMEOUT_MS);
  const beat = setInterval(() => void heartbeatJob(job.id, job.lease_id).catch(() => undefined), Math.min(10_000, HEARTBEAT_MS));
  let demoContext;
  if (c.method === "demo") {
    const brand = toBrand((await one("SELECT * FROM brands WHERE id = ?", [job.brand_id])) as Record<string, unknown>);
    demoContext = { repetition: job.repetition, brand, competitors: brand.competitors, branded: job.prompt_category === "marca" };
  }
  let result: CollectResult;
  try {
    result = await Promise.race([
      c.collect(
        {
          prompt: job.prompt_text,
          engine: job.engine,
          requestedCountry: job.country ?? "AR",
          language: job.language ?? "es",
          runId: job.run_id,
          jobId: job.id,
          demoContext,
        },
        { saveEvidence: (data, mime) => saveEvidence(job, data, mime), signal: abort.signal, log: (m) => log(job.id, m) },
      ),
      new Promise<CollectResult>((resolve) =>
        abort.signal.addEventListener("abort", () => resolve(blankResult(c, "interrumpido", `Superó el tiempo máximo de ${JOB_TIMEOUT_MS / 1000} s`, started))),
      ),
    ]);
  } catch (e) {
    result = blankResult(c, "desconocido", String((e as Error).message ?? e).slice(0, 300), started);
  } finally {
    clearTimeout(timer);
    clearInterval(beat);
  }

  const final = await finishJob(job, result);
  if (final === null) log(job.id, "lease perdido: otro worker recuperó la ejecución; se descarta este resultado");
  else log(job.id, `${job.collector} → ${final}${result.error ? ` (${result.error.code}: ${result.error.message})` : ""} en ${result.duration} ms`);

  if (c.method !== "demo") {
    if (result.status === "requires_intervention") {
      await setCollectorStatus(c.id, "requires_intervention", result.error?.message ?? "Requiere intervención", WORKER_ID, {
        details: { code: result.error?.code, jobId: job.id, at: new Date().toISOString() },
      });
      log(`${c.id} queda en pausa hasta que un operador lo revise (npm run worker:login / worker:probe).`);
    } else if (result.status === "completed") {
      await setCollectorStatus(c.id, "available", null, WORKER_ID, {
        verified: true,
        details: { sessionType: result.sessionType, observedCountry: result.observedCountry, locationVerification: result.locationVerification },
      });
    }
  }
}

async function slot(n: number) {
  while (!stopping) {
    try {
      const blocked = await blockedCollectors();
      const usable = [...collectors.values()]
        .filter((c) => !blocked.has(c.id) && !(c.method === "web_capture" && busyWeb.has(c.id)))
        .map((c) => c.id);
      const job = await claimJob(WORKER_ID, usable);
      if (!job) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        continue;
      }
      const c = collectors.get(job.collector)!;
      if (c.method === "web_capture") busyWeb.add(c.id);
      try {
        log(`slot ${n}: ${job.id} (${job.collector}, rep ${job.repetition}, intento ${job.attempts}/${job.max_attempts})`);
        await execute(job);
      } finally {
        if (c.method === "web_capture") {
          await new Promise((r) => setTimeout(r, WEB_DELAY_MS));
          busyWeb.delete(c.id);
        }
      }
    } catch (e) {
      log(`slot ${n} error`, (e as Error).message);
      await new Promise((r) => setTimeout(r, POLL_MS * 2));
    }
  }
}

async function main() {
  const ids = [...collectors.keys()];
  await registerWorker(WORKER_ID, hostname(), ids, {
    concurrency: CONCURRENCY,
    headless: process.env.WORKER_HEADLESS !== "0",
    egressCountry: process.env.WORKER_EGRESS_COUNTRY || null,
  });
  for (const id of ids) {
    if (!isCollectorId(id) || COLLECTORS[id].method === "demo") continue;
    const row = await one("SELECT status FROM collector_status WHERE collector = ?", [id]);
    if (!row) await setCollectorStatus(id, "unverified", "Falta una prueba real: npm run worker:probe -- " + id, WORKER_ID);
  }
  log(`iniciado como ${WORKER_ID} · conectores: ${ids.join(", ")} · concurrencia ${CONCURRENCY}`);
  const recovered = await recoverStaleJobs();
  if (recovered.length) log(`recuperadas ejecuciones interrumpidas en ${recovered.length} análisis`);

  const hb = setInterval(async () => {
    try {
      await heartbeatWorker(WORKER_ID);
      const r = await recoverStaleJobs();
      if (r.length) log(`recuperadas ejecuciones interrumpidas en ${r.length} análisis`);
    } catch (e) {
      log("heartbeat error", (e as Error).message);
    }
  }, HEARTBEAT_MS);

  const shutdown = async (sig: string) => {
    if (stopping) return;
    stopping = true;
    log(`${sig}: terminando la ejecución en curso y cerrando…`);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => slot(i + 1)));
  clearInterval(hb);
  await Promise.all([...collectors.values()].map((c) => c.close?.().catch(() => undefined)));
  await stopWorker(WORKER_ID);
  log("detenido");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
