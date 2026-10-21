// Pasos que la web puede dar sin worker sobre un análisis abierto:
// - demo: genera respuestas simuladas (lib/demo-step.ts);
// - Bright Data: envía lo pendiente y guarda lo que ya terminó (lib/brightdata-batch.ts).
// Siempre se filtra por la agencia del usuario.

import { collectRun, dispatchRun } from "./brightdata-batch";
import { isBrightDataId } from "./collectors/brightdata";
import { all, one } from "./db";
import { advanceDemoRun } from "./demo-step";
import { toRun } from "./types";

export async function stepRun(workspaceId: string, runId: string): Promise<number> {
  const row = await one("SELECT * FROM runs WHERE id = ? AND workspace_id = ? AND status IN ('pending','running')", [runId, workspaceId]);
  if (!row) return 0;
  const r = toRun(row as Record<string, unknown>);
  let n = 0;
  if (Number(r.is_demo) === 1) n += await advanceDemoRun(workspaceId, runId);
  if (r.collectors.some(isBrightDataId)) {
    n += await collectRun(runId);
    n += await dispatchRun(runId);
  }
  return n;
}

/** Todos los análisis abiertos de la agencia que la web puede avanzar. */
export async function stepOpenRuns(workspaceId: string): Promise<number> {
  const rows = await all<{ id: string }>("SELECT id FROM runs WHERE workspace_id = ? AND status IN ('pending','running') ORDER BY created_at LIMIT 5", [workspaceId]);
  let n = 0;
  for (const r of rows) n += await stepRun(workspaceId, r.id);
  return n;
}
