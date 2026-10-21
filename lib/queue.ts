// Cola persistente de ejecuciones sobre la misma base (libSQL/Turso).
//
// - La web solo CREA análisis: inserta una fila por (pregunta × conector × repetición) y vuelve.
// - El worker (worker/index.ts) reclama filas de a una con un lease, manda heartbeats y
//   escribe el resultado en la MISMA fila. Por eso reintentar nunca duplica resultados.
// - Una fila "running" sin heartbeat reciente vuelve a la cola (o falla si agotó intentos).
// - Cada análisis deriva su estado de sus filas: pending, running, completed, partial,
//   failed o requires_intervention.

import { createHash, randomBytes } from "node:crypto";
import { analyzeAnswer } from "./analyze";
import { brightDataConfig, isBrightDataId } from "./collectors/brightdata";
import { COLLECTORS, isCollectorId, type CollectorId } from "./collectors/registry";
import type { CollectResult } from "./collectors/types";
import { all, db, id, now, one, parseJson, run } from "./db";
import { workerEnabled } from "./config";
import { LIMITS } from "./limits";
import { toBrand, toPrompt, toResponse, toRun, type Brand, type JobStatus, type Prompt, type ResponseRow, type Run } from "./types";

export class UserError extends Error {}

const OPEN: JobStatus[] = ["pending", "running"];

export function jobId(runId: string, promptId: string, collector: string, repetition: number): string {
  return "job_" + createHash("sha256").update(`${runId}|${promptId}|${collector}|${repetition}`).digest("base64url").slice(0, 22);
}

export function promptSetHash(prompts: Pick<Prompt, "id" | "text" | "category">[], collectors: string[]): string {
  const key = JSON.stringify({
    p: prompts.map((p) => `${p.id}|${p.text}|${p.category}`).sort(),
    c: [...collectors].sort(),
  });
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// Estado de los conectores y del worker
// ---------------------------------------------------------------------------

export type CollectorAvailability = {
  id: CollectorId;
  label: string;
  method: string;
  status: "available" | "unverified" | "requires_intervention" | "unavailable" | "not_configured";
  reason: string | null;
  verifiedAt: string | null;
  workerOnline: boolean;
  selectable: boolean;
};

export type WorkerInfo = { id: string; hostname: string | null; collectors: string[]; heartbeat_at: string; started_at: string; online: boolean };

export async function workers(): Promise<WorkerInfo[]> {
  const rows = await all<{ id: string; hostname: string | null; collectors: string; heartbeat_at: string; started_at: string }>(
    "SELECT id, hostname, collectors, heartbeat_at, started_at FROM workers WHERE stopped_at IS NULL ORDER BY heartbeat_at DESC LIMIT 10",
  );
  const limit = Date.now() - LIMITS.workerOfflineMs;
  return rows.map((w) => ({ ...w, collectors: parseJson(w.collectors, []), online: new Date(w.heartbeat_at).getTime() >= limit }));
}

/**
 * Qué conectores puede elegir una agencia. Un conector de captura o API solo es elegible
 * cuando el worker lo verificó (prueba real o ejecución exitosa). Los de demo, solo en la demo.
 */
export async function collectorAvailability(isDemo: boolean): Promise<CollectorAvailability[]> {
  const statuses = await all<{ collector: string; status: string; reason: string | null; verified_at: string | null }>(
    "SELECT collector, status, reason, verified_at FROM collector_status",
  );
  const ws = await workers();
  const online = new Set(ws.filter((w) => w.online).flatMap((w) => w.collectors));
  const known = new Set(ws.flatMap((w) => w.collectors));
  return Object.values(COLLECTORS)
    .filter((c) => (isDemo ? c.method === "demo" : c.method !== "demo" && (workerEnabled() || isBrightDataId(c.id))))
    .map((c) => {
      if (c.method === "demo") {
        return { id: c.id, label: c.label, method: c.method, status: "available" as const, reason: null, verifiedAt: null, workerOnline: true, selectable: true };
      }
      const s = statuses.find((x) => x.collector === c.id);
      if (c.method === "third_party_capture" && isBrightDataId(c.id)) {
        // Bright Data corre desde la web: depende de la configuración de este servidor, no de un worker.
        const cfg = brightDataConfig(c.id);
        // Con la key cargada se puede elegir sin la prueba manual. Solo se bloquea si Bright Data
        // rechazó la key (401/403) o el operador lo pausó; la prueba de Ajustes lo vuelve a habilitar.
        const blocked = s?.status === "unavailable" || s?.status === "requires_intervention";
        const status = ("missing" in cfg ? "not_configured" : blocked ? s!.status : "available") as CollectorAvailability["status"];
        return {
          id: c.id,
          label: c.label,
          method: c.method,
          status,
          reason: "missing" in cfg ? cfg.missing : blocked ? (s?.reason ?? null) : null,
          verifiedAt: s?.verified_at ?? null,
          workerOnline: true,
          selectable: status === "available",
        };
      }
      const status = (s?.status ?? (known.has(c.id) ? "unverified" : "not_configured")) as CollectorAvailability["status"];
      return {
        id: c.id,
        label: c.label,
        method: c.method,
        status,
        reason: s?.reason ?? (status === "not_configured" ? "Ningún worker lo tiene habilitado." : null),
        verifiedAt: s?.verified_at ?? null,
        workerOnline: online.has(c.id),
        selectable: status === "available",
      };
    });
}

export async function setCollectorStatus(
  collector: string,
  status: "available" | "unverified" | "requires_intervention" | "unavailable",
  reason: string | null,
  workerId: string | null,
  opts: { verified?: boolean; details?: Record<string, unknown> } = {},
) {
  const ts = now();
  await run(
    `INSERT INTO collector_status (collector, status, reason, details, verified_at, updated_at, worker_id) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(collector) DO UPDATE SET status = excluded.status, reason = excluded.reason, details = excluded.details,
       verified_at = COALESCE(excluded.verified_at, collector_status.verified_at), updated_at = excluded.updated_at, worker_id = excluded.worker_id`,
    [collector, status, reason, JSON.stringify(opts.details ?? {}), opts.verified ? ts : null, ts, workerId],
  );
}

export async function blockedCollectors(): Promise<Set<string>> {
  const rows = await all<{ collector: string }>("SELECT collector FROM collector_status WHERE status IN ('requires_intervention','unavailable')");
  return new Set(rows.map((r) => r.collector));
}

// ---------------------------------------------------------------------------
// Creación de análisis (lado web)
// ---------------------------------------------------------------------------

export type CreateAnalysisInput = {
  workspaceId: string;
  brandId: string;
  collectors: string[];
  repetitions: number;
  idempotencyKey: string;
  trigger?: string;
};

export async function approvedPrompts(brandId: string): Promise<Prompt[]> {
  const rows = await all("SELECT * FROM prompts WHERE brand_id = ? AND approved = 1 AND active = 1 ORDER BY category, created_at", [brandId]);
  return rows.map((r) => toPrompt(r as Record<string, unknown>));
}

/** Marca y competidores tal como estaban al crear el análisis: las métricas usan siempre este conjunto. */
export function brandSnapshot(b: Brand) {
  return { name: b.name, domain: b.domain, aliases: b.aliases, competitors: b.competitors };
}

export function plannedExecutions(prompts: number, collectors: number, repetitions: number) {
  return prompts * collectors * repetitions;
}

export async function createAnalysis(input: CreateAnalysisInput): Promise<Run> {
  const { workspaceId, brandId } = input;
  // Idempotencia: el mismo envío del formulario devuelve el mismo análisis.
  const existing = await one("SELECT * FROM runs WHERE workspace_id = ? AND idempotency_key = ?", [workspaceId, input.idempotencyKey]);
  if (existing) return toRun(existing as Record<string, unknown>);

  const brandRow = await one("SELECT * FROM brands WHERE id = ? AND workspace_id = ?", [brandId, workspaceId]);
  if (!brandRow) throw new UserError("Cliente inexistente.");
  const brand = toBrand(brandRow as Record<string, unknown>);
  const ws = await one<{ is_demo: number }>("SELECT is_demo FROM workspaces WHERE id = ?", [workspaceId]);
  const isDemo = Number(ws?.is_demo ?? 0) === 1;

  const reps = Math.floor(input.repetitions);
  if (!(reps >= 1 && reps <= LIMITS.maxRepetitions)) throw new UserError(`Elegí entre 1 y ${LIMITS.maxRepetitions} repeticiones.`);
  const collectors = [...new Set(input.collectors)].filter(isCollectorId);
  if (!collectors.length) throw new UserError("Elegí al menos un motor disponible.");
  const availability = await collectorAvailability(isDemo);
  for (const c of collectors) {
    const a = availability.find((x) => x.id === c);
    if (!a?.selectable) throw new UserError(`${COLLECTORS[c].label} no está disponible ahora${a?.reason ? `: ${a.reason}` : "."}`);
  }

  const prompts = await approvedPrompts(brandId);
  if (prompts.length < LIMITS.minPrompts) throw new UserError(`Aprobá al menos ${LIMITS.minPrompts} preguntas (hay ${prompts.length}).`);
  if (prompts.length > LIMITS.maxPrompts) throw new UserError(`El máximo es ${LIMITS.maxPrompts} preguntas aprobadas (hay ${prompts.length}).`);

  const total = plannedExecutions(prompts.length, collectors.length, reps);
  if (total > LIMITS.maxExecutionsPerAnalysis)
    throw new UserError(`Este análisis tendría ${total} ejecuciones y el máximo por análisis es ${LIMITS.maxExecutionsPerAnalysis}.`);

  const active = await one<{ n: number }>("SELECT COUNT(*) AS n FROM runs WHERE workspace_id = ? AND status IN ('pending','running')", [workspaceId]);
  if (Number(active?.n ?? 0) >= LIMITS.maxActiveAnalysesPerAgency)
    throw new UserError(`Ya tenés ${active?.n} análisis en curso. Esperá a que terminen para iniciar otro.`);
  const sameBrand = await one("SELECT id FROM runs WHERE brand_id = ? AND status IN ('pending','running','requires_intervention')", [brandId]);
  if (sameBrand) throw new UserError("Este cliente ya tiene un análisis abierto. Terminalo o cerralo antes de iniciar otro.");

  if (!isDemo) {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const today = await one<{ n: number }>("SELECT COUNT(*) AS n FROM responses WHERE workspace_id = ? AND created_at >= ?", [workspaceId, dayStart.toISOString()]);
    const used = Number(today?.n ?? 0);
    if (used + total > LIMITS.maxDailyExecutionsPerAgency)
      throw new UserError(`Superarías el límite diario de ${LIMITS.maxDailyExecutionsPerAgency} ejecuciones (hoy van ${used}).`);
  }

  const runId = id("run_");
  const ts = now();
  const maxAttempts = LIMITS.jobMaxAttempts;
  const stmts: { sql: string; args: (string | number | null)[] }[] = [
    {
      sql: `INSERT INTO runs (id, brand_id, workspace_id, status, trigger, total, simulated, is_demo, collectors, repetitions, requested_country, language,
              idempotency_key, prompt_set_hash, brand_snapshot, created_at)
            VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        runId, brandId, workspaceId, input.trigger ?? "manual", total, isDemo ? 1 : 0, isDemo ? 1 : 0, JSON.stringify(collectors), reps,
        brand.country, brand.language, input.idempotencyKey, promptSetHash(prompts, collectors), JSON.stringify(brandSnapshot(brand)), ts,
      ],
    },
  ];
  for (const p of prompts)
    for (const c of collectors)
      for (let rep = 1; rep <= reps; rep++) {
        const def = COLLECTORS[c];
        stmts.push({
          sql: `INSERT INTO responses (id, run_id, brand_id, workspace_id, prompt_id, prompt_text, prompt_kind, prompt_category, engine, collector, collection_method,
                  repetition, status, attempts, max_attempts, country, language, simulated, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?, ?)`,
          args: [
            jobId(runId, p.id, c, rep), runId, brandId, workspaceId, p.id, p.text, p.category === "marca" ? "con_marca" : "sin_marca", p.category,
            def.engine, c, def.method, rep, maxAttempts, brand.country, brand.language, def.method === "demo" ? 1 : 0, ts,
          ],
        });
      }
  try {
    await (await db()).batch(stmts, "write");
  } catch (e) {
    // Carrera con un doble envío: la restricción única de idempotencia ganó del otro lado.
    const again = await one("SELECT * FROM runs WHERE workspace_id = ? AND idempotency_key = ?", [workspaceId, input.idempotencyKey]);
    if (again) return toRun(again as Record<string, unknown>);
    throw e;
  }
  return toRun((await one("SELECT * FROM runs WHERE id = ?", [runId]))!);
}

/** El usuario cierra el análisis con lo obtenido: lo pendiente pasa a fallido (cancelado). */
export async function closeAnalysis(workspaceId: string, runId: string) {
  if (!(await one("SELECT id FROM runs WHERE id = ? AND workspace_id = ?", [runId, workspaceId]))) return;
  await run(
    `UPDATE responses SET status = 'failed', error_code = 'cancelado', error = 'Cancelado por el usuario antes de ejecutarse', lease_id = NULL
     WHERE run_id = ? AND workspace_id = ? AND status IN ('pending','requires_intervention')`,
    [runId, workspaceId],
  );
  await refreshRunStatus(runId);
}

// ---------------------------------------------------------------------------
// Lado worker
// ---------------------------------------------------------------------------

export async function registerWorker(workerId: string, hostname: string, collectors: string[], info: Record<string, unknown>) {
  const ts = now();
  await run(
    `INSERT INTO workers (id, hostname, collectors, info, started_at, heartbeat_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET collectors = excluded.collectors, info = excluded.info, heartbeat_at = excluded.heartbeat_at, stopped_at = NULL`,
    [workerId, hostname, JSON.stringify(collectors), JSON.stringify(info), ts, ts],
  );
}

export async function heartbeatWorker(workerId: string) {
  await run("UPDATE workers SET heartbeat_at = ? WHERE id = ?", [now(), workerId]);
}

export async function stopWorker(workerId: string) {
  await run("UPDATE workers SET stopped_at = ? WHERE id = ?", [now(), workerId]);
}

/**
 * Devuelve a la cola las ejecuciones "running" sin heartbeat reciente (worker caído o reiniciado).
 * Si ya agotaron intentos, quedan como fallidas. Devuelve los ids de análisis afectados.
 */
export async function recoverStaleJobs(staleMs = LIMITS.staleJobMs): Promise<string[]> {
  const before = new Date(Date.now() - staleMs).toISOString();
  const c = await db();
  const requeued = await c.execute({
    sql: `UPDATE responses SET status = 'pending', lease_id = NULL, worker_id = NULL, error_code = 'interrumpido',
            error = 'La ejecución se interrumpió (worker sin señal); se reintenta.', next_attempt_at = ?
          WHERE status = 'running' AND COALESCE(heartbeat_at, claimed_at) < ? AND (lease_id IS NULL OR lease_id NOT LIKE 'bd:%') AND attempts < max_attempts
          RETURNING run_id`,
    args: [now(), before],
  });
  const failed = await c.execute({
    sql: `UPDATE responses SET status = 'failed', lease_id = NULL, error_code = 'interrumpido',
            error = 'La ejecución se interrumpió y agotó sus intentos.', executed_at = ?
          WHERE status = 'running' AND COALESCE(heartbeat_at, claimed_at) < ? AND (lease_id IS NULL OR lease_id NOT LIKE 'bd:%') AND attempts >= max_attempts
          RETURNING run_id`,
    args: [now(), before],
  });
  const runs = [...new Set([...requeued.rows, ...failed.rows].map((r) => String(r.run_id)))];
  for (const r of runs) await refreshRunStatus(r);
  return runs;
}

export type ClaimedJob = ResponseRow & { lease_id: string };

/** Reclama atómicamente la próxima ejecución pendiente de alguno de los conectores dados. */
export async function claimJob(workerId: string, collectors: string[], opts: { runId?: string } = {}): Promise<ClaimedJob | null> {
  if (!collectors.length) return null;
  const lease = randomBytes(12).toString("base64url");
  const ts = now();
  const marks = collectors.map(() => "?").join(",");
  const r = await (await db()).execute({
    sql: `UPDATE responses SET status = 'running', lease_id = ?, worker_id = ?, heartbeat_at = ?, claimed_at = ?, started_at = ?, attempts = attempts + 1
          WHERE id = (
            SELECT id FROM responses
            WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?) AND collector IN (${marks})${opts.runId ? " AND run_id = ?" : ""}
            ORDER BY created_at, run_id, repetition, id LIMIT 1
          ) AND status = 'pending'
          RETURNING *`,
    args: [lease, workerId, ts, ts, ts, ts, ...collectors, ...(opts.runId ? [opts.runId] : [])],
  });
  const row = r.rows[0] as unknown as Record<string, unknown> | undefined;
  if (!row) return null;
  await run("UPDATE runs SET status = 'running', started_at = COALESCE(started_at, ?) WHERE id = ? AND status = 'pending'", [ts, String(row.run_id)]);
  return { ...toResponse(row), lease_id: lease };
}

export async function heartbeatJob(jobId: string, lease: string): Promise<boolean> {
  const r = await run("UPDATE responses SET heartbeat_at = ? WHERE id = ? AND lease_id = ? AND status = 'running'", [now(), jobId, lease]);
  return r.rowsAffected > 0;
}

export async function saveEvidence(job: Pick<ResponseRow, "id" | "workspace_id">, data: Buffer, mime: string): Promise<string> {
  const evId = id("ev_");
  await run("INSERT INTO evidence (id, workspace_id, response_id, kind, mime, data, bytes, created_at) VALUES (?, ?, ?, 'screenshot', ?, ?, ?, ?)", [
    evId,
    job.workspace_id,
    job.id,
    mime,
    data,
    data.length,
    now(),
  ]);
  return evId;
}

function backoffMs(attempt: number) {
  return Math.min(10 * 60_000, 30_000 * 2 ** Math.max(0, attempt - 1));
}

/**
 * Guarda el resultado de una ejecución. Solo escribe si el lease sigue siendo de este worker:
 * si la fila fue recuperada por otro, el resultado se descarta (no hay duplicados).
 * Devuelve el estado final de la fila o null si se perdió el lease.
 */
/** El registro crudo se guarda si es razonable (≤ 400 KB); si no, se omite antes que cortarlo. */
function rawJson(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  try {
    const s = JSON.stringify(raw);
    return s.length <= 400_000 ? s : null;
  } catch {
    return null;
  }
}

export async function finishJob(job: ClaimedJob, result: CollectResult): Promise<JobStatus | null> {
  const ts = now();
  const conditions = JSON.stringify({
    requestedCountry: job.country,
    language: job.language,
    observedCountry: result.observedCountry,
    locationVerification: result.locationVerification,
    sessionType: result.sessionType,
    searchMode: result.searchMode,
    model: result.modelIfVisible,
    collectionMethod: result.collectionMethod,
    attempts: job.attempts,
  });
  const common = [result.observedCountry, result.locationVerification, result.searchMode, result.sessionType, conditions];

  if (result.status === "completed" || result.status === "partial") {
    const brandRow = await one("SELECT * FROM brands WHERE id = ?", [job.brand_id]);
    const runRow = await one<{ brand_snapshot: string | null }>("SELECT brand_snapshot FROM runs WHERE id = ?", [job.run_id]);
    const brand = { ...toBrand(brandRow as Record<string, unknown>), ...parseJson(runRow?.brand_snapshot, {}) };
    const text = result.answerText ?? "";
    const a = analyzeAnswer(text, result.citations, brand, brand.competitors);
    const r = await run(
      `UPDATE responses SET status = ?, answer = ?, sources = ?, mentions = ?, other_brands = ?, brand_mentioned = ?, brand_position = ?, own_cited = ?,
         sentiment = ?, sentiment_score = ?, model = ?, cost_usd = ?, latency_ms = ?, executed_at = ?, screenshot_id = ?, error = ?, error_code = ?,
         observed_country = ?, location_verification = ?, search_mode = ?, session_type = ?, conditions = ?, raw_json = ?, lease_id = NULL, next_attempt_at = NULL
       WHERE id = ? AND lease_id = ? AND status = 'running'`,
      [
        result.status, text, JSON.stringify(result.citations), JSON.stringify(a.mentions), JSON.stringify(a.otherBrands), a.brandMentioned ? 1 : 0,
        a.brandPosition, a.ownCited ? 1 : 0, a.sentiment?.label ?? null, a.sentiment?.score ?? null, result.modelIfVisible, result.costUsd ?? 0,
        result.duration, result.collectedAt, result.screenshotReference, result.error?.message ?? null, result.error?.code ?? null, ...common, rawJson(result.raw), job.id, job.lease_id,
      ],
    );
    if (!r.rowsAffected) return null;
    if (result.screenshotReference) await run("DELETE FROM evidence WHERE response_id = ? AND id != ?", [job.id, result.screenshotReference]);
    await refreshRunStatus(job.run_id);
    return result.status;
  }

  const err = result.error ?? { code: "desconocido" as const, message: "Error sin detalle", transient: false };
  let status: JobStatus;
  let nextAttempt: string | null = null;
  if (result.status === "requires_intervention") status = "requires_intervention";
  else if (err.transient && job.attempts < job.max_attempts) {
    status = "pending";
    nextAttempt = new Date(Date.now() + backoffMs(job.attempts)).toISOString();
  } else status = "failed";

  const r = await run(
    `UPDATE responses SET status = ?, error = ?, error_code = ?, latency_ms = ?, executed_at = ?, next_attempt_at = ?, screenshot_id = ?,
       observed_country = ?, location_verification = ?, search_mode = ?, session_type = ?, conditions = ?, lease_id = NULL
     WHERE id = ? AND lease_id = ? AND status = 'running'`,
    [status, err.message.slice(0, 500), err.code, result.duration, status === "pending" ? null : result.collectedAt, nextAttempt, result.screenshotReference, ...common, job.id, job.lease_id],
  );
  if (!r.rowsAffected) return null;
  await refreshRunStatus(job.run_id);
  return status;
}

/** Recalcula el estado del análisis a partir de sus ejecuciones. */
export async function refreshRunStatus(runId: string): Promise<Run | null> {
  const runRow = await one("SELECT * FROM runs WHERE id = ?", [runId]);
  if (!runRow) return null;
  const counts = await all<{ status: string; collector: string; n: number }>(
    "SELECT status, collector, COUNT(*) AS n FROM responses WHERE run_id = ? GROUP BY status, collector",
    [runId],
  );
  const by = (s: JobStatus) => counts.filter((c) => c.status === s).reduce((a, c) => a + Number(c.n), 0);
  const total = counts.reduce((a, c) => a + Number(c.n), 0);
  const pending = by("pending");
  const running = by("running");
  const completed = by("completed");
  const intervention = by("requires_intervention");
  const failed = by("failed") + by("partial");
  const blocked = await blockedCollectors();
  const openCollectors = [...new Set(counts.filter((c) => OPEN.includes(c.status as JobStatus)).map((c) => c.collector))];

  let status: JobStatus;
  let detail: string | null = null;
  if (pending + running > 0) {
    if (running > 0) status = "running";
    else if (openCollectors.every((c) => blocked.has(c))) {
      status = "requires_intervention";
      detail = `Esperando intervención en: ${openCollectors.map((c) => (isCollectorId(c) ? COLLECTORS[c].label : c)).join(", ")}`;
    } else status = completed + failed + intervention > 0 ? "running" : "pending";
  } else if (intervention > 0) {
    status = "requires_intervention";
    detail = `${intervention} ejecución(es) frenadas por CAPTCHA, login o límite de uso.`;
  } else if (completed === total) status = "completed";
  else if (completed > 0) status = "partial";
  else status = "failed";

  const terminal = status === "completed" || status === "partial" || status === "failed";
  const cost = await one<{ c: number }>("SELECT COALESCE(SUM(cost_usd), 0) AS c FROM responses WHERE run_id = ?", [runId]);
  await run(
    `UPDATE runs SET status = ?, status_detail = ?, done_count = ?, failed_count = ?, cost_usd = ?, finished_at = ? WHERE id = ?`,
    [status, detail, completed, failed + intervention, Number(cost?.c ?? 0), terminal ? (runRow.finished_at ? String(runRow.finished_at) : now()) : null, runId],
  );
  if (terminal) await run("UPDATE brands SET last_run_at = ? WHERE id = ?", [now(), String(runRow.brand_id)]);
  return toRun((await one("SELECT * FROM runs WHERE id = ?", [runId]))!);
}

/** Tras resolver un bloqueo, el operador devuelve a la cola lo que quedó frenado en ese conector. */
export async function requeueIntervention(collector: string): Promise<number> {
  const r = await (await db()).execute({
    sql: `UPDATE responses SET status = 'pending', next_attempt_at = NULL, attempts = MAX(attempts - 1, 0)
          WHERE collector = ? AND status = 'requires_intervention' RETURNING run_id`,
    args: [collector],
  });
  for (const runId of new Set(r.rows.map((x) => String(x.run_id)))) await refreshRunStatus(runId);
  return r.rows.length;
}

export type RunProgress = Record<JobStatus, number> & { total: number };

export async function runProgress(runId: string): Promise<RunProgress> {
  const rows = await all<{ status: JobStatus; n: number }>("SELECT status, COUNT(*) AS n FROM responses WHERE run_id = ? GROUP BY status", [runId]);
  const p: RunProgress = { pending: 0, running: 0, completed: 0, partial: 0, failed: 0, requires_intervention: 0, total: 0 };
  for (const r of rows) {
    p[r.status] = Number(r.n);
    p.total += Number(r.n);
  }
  return p;
}

export type { Brand };
