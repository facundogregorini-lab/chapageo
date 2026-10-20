// Avance de análisis DEMO desde la web. Las respuestas demo son simuladas y se generan en
// milisegundos sin red, así que no necesitan el worker: la página del análisis pide un paso
// corto cada pocos segundos mientras está abierta. Si la pestaña se cierra, el análisis queda
// en cola y sigue cuando alguien vuelve (o cuando hay un worker, que también las procesa).
// Nunca toca análisis reales ni conectores que no sean demo.

import { demoCollector } from "./collectors/demo";
import { COLLECTORS, type CollectorId } from "./collectors/registry";
import { one } from "./db";
import { claimJob, finishJob, recoverStaleJobs } from "./queue";
import { toBrand } from "./types";

const DEMO_IDS = (Object.keys(COLLECTORS) as CollectorId[]).filter((id) => COLLECTORS[id].method === "demo");

/** Procesa hasta `max` ejecuciones demo pendientes de ese análisis. Devuelve cuántas procesó. */
export async function advanceDemoRun(workspaceId: string, runId: string, max = 6): Promise<number> {
  const ok = await one(
    `SELECT r.id FROM runs r JOIN workspaces w ON w.id = r.workspace_id
     WHERE r.id = ? AND r.workspace_id = ? AND r.is_demo = 1 AND w.is_demo = 1 AND r.status IN ('pending','running')`,
    [runId, workspaceId],
  );
  if (!ok) return 0;
  // Si un paso anterior se cortó a mitad (la función serverless terminó), lo devolvemos a la cola.
  await recoverStaleJobs();
  let done = 0;
  for (; done < max; done++) {
    const job = await claimJob("web-demo", DEMO_IDS, { runId });
    if (!job) break;
    const def = COLLECTORS[job.collector as CollectorId];
    const brand = toBrand((await one("SELECT * FROM brands WHERE id = ? AND workspace_id = ?", [job.brand_id, workspaceId])) as Record<string, unknown>);
    const result = await demoCollector(job.collector, def.engine).collect(
      {
        prompt: job.prompt_text,
        engine: job.engine,
        requestedCountry: job.country ?? "AR",
        language: job.language ?? "es",
        runId: job.run_id,
        jobId: job.id,
        demoContext: { repetition: job.repetition, brand, competitors: brand.competitors, branded: job.prompt_category === "marca" },
      },
      { saveEvidence: async () => "", signal: new AbortController().signal, log: () => undefined },
    );
    await finishJob(job, result);
  }
  return done;
}
