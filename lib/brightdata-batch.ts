// Bright Data sin worker. La web manda en un solo pedido todas las ejecuciones pendientes de un
// análisis (un snapshot por motor) y después pasa a buscar los resultados. Bright Data trabaja
// por su cuenta: aunque se cierre la pestaña, las respuestas quedan listas en su snapshot y se
// guardan la próxima vez que alguien abre el análisis o la lista de clientes.
//
// Las ejecuciones enviadas quedan "running" con lease "bd:<snapshot_id>". La recuperación de
// ejecuciones colgadas del worker no las toca: tienen su propio vencimiento acá.

import { randomBytes } from "node:crypto";
import {
  BRIGHTDATA_IDS,
  brightDataConfig,
  buildInput,
  downloadSnapshot,
  errorFrom,
  failureResult,
  normalizePrompt,
  recordPrompt,
  recordToResult,
  snapshotStatus,
  triggerSnapshot,
  type BrightDataCollectorId,
  type BrightDataRecord,
  type FetchLike,
} from "./collectors/brightdata";
import type { CollectError } from "./collectors/types";
import { all, db, now, one, run } from "./db";
import { finishJob, refreshRunStatus, setCollectorStatus, type ClaimedJob } from "./queue";
import { toResponse } from "./types";

const PENDING_PREFIX = "bd:pending:";
const BATCH_MAX = 100;

function maxWaitMs() {
  const m = Number(process.env.BRIGHTDATA_MAX_WAIT_MIN || 30);
  return (Number.isFinite(m) && m > 0 ? m : 30) * 60_000;
}

/** Tope global de registros por día (protege el presupuesto aunque haya un error en otro lado). */
function dailyCap() {
  const n = Number(process.env.BRIGHTDATA_MAX_RECORDS_PER_DAY || 300);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 300;
}

/** Registros de Bright Data usados hoy: ejecuciones de análisis + preguntas del checker gratis. */
async function usedToday(): Promise<number> {
  const since = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z").toISOString();
  const r = await one<{ n: number }>("SELECT COUNT(*) AS n FROM responses WHERE collector LIKE 'brightdata_%' AND claimed_at >= ?", [since]);
  const c = await one<{ n: number }>("SELECT COALESCE(SUM(json_extract(props, '$.n')), 0) AS n FROM events WHERE name = 'checker_brightdata' AND created_at >= ?", [since]);
  return Number(r?.n ?? 0) + Number(c?.n ?? 0);
}

/** Cuántos registros quedan hoy dentro de BRIGHTDATA_MAX_RECORDS_PER_DAY. */
export async function brightDataRecordsLeft(): Promise<number> {
  return Math.max(0, dailyCap() - (await usedToday()));
}

type Opts = { fetch?: FetchLike; env?: NodeJS.ProcessEnv };

async function failAll(jobs: ClaimedJob[], id: BrightDataCollectorId, err: CollectError, started: number) {
  for (const j of jobs) await finishJob(j, failureResult(id, err, started));
}

/** Envía a Bright Data las ejecuciones pendientes de ese análisis. Devuelve cuántas envió. */
export async function dispatchRun(runId: string, opts: Opts = {}): Promise<number> {
  const f = opts.fetch ?? (fetch as unknown as FetchLike);
  let sent = 0;
  for (const id of BRIGHTDATA_IDS) {
    const has = await one("SELECT id FROM responses WHERE run_id = ? AND collector = ? AND status = 'pending' LIMIT 1", [runId, id]);
    if (!has) continue;
    const cfg = brightDataConfig(id, opts.env);
    const room = dailyCap() - (await usedToday());
    if (room <= 0) {
      await run("UPDATE runs SET status_detail = ? WHERE id = ?", [
        `Se alcanzó el tope diario de ${dailyCap()} consultas de captura. El resto sigue en cola para mañana.`,
        runId,
      ]);
      return sent;
    }
    const ts = now();
    const lease = PENDING_PREFIX + randomBytes(9).toString("base64url");
    const claimed = await (await db()).execute({
      sql: `UPDATE responses SET status = 'running', lease_id = ?, worker_id = 'brightdata', heartbeat_at = ?, claimed_at = ?, started_at = ?, attempts = attempts + 1
            WHERE id IN (
              SELECT id FROM responses WHERE run_id = ? AND collector = ? AND status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
              ORDER BY prompt_id, repetition, id LIMIT ?
            ) AND status = 'pending'
            RETURNING *`,
      args: [lease, ts, ts, ts, runId, id, ts, Math.min(BATCH_MAX, room)],
    });
    const jobs: ClaimedJob[] = claimed.rows.map((r) => ({ ...toResponse(r as Record<string, unknown>), lease_id: lease }));
    if (!jobs.length) continue;
    await run("UPDATE runs SET status = 'running', started_at = COALESCE(started_at, ?) WHERE id = ? AND status = 'pending'", [ts, runId]);
    const started = Date.now();
    if ("missing" in cfg) {
      await failAll(jobs, id, { code: "sin_credenciales", message: cfg.missing, transient: false }, started);
      continue;
    }
    try {
      const snap = await triggerSnapshot(
        f,
        cfg,
        jobs.map((j, i) => buildInput(cfg, j.prompt_text, j.country ?? "AR", i + 1)),
      );
      await run("UPDATE responses SET lease_id = ? WHERE lease_id = ? AND status = 'running'", [`bd:${snap}`, lease]);
      sent += jobs.length;
    } catch (e) {
      const err = errorFrom(e);
      await failAll(jobs, id, err, started);
      if (err.code === "sin_credenciales") await setCollectorStatus(id, "unavailable", err.message, null);
    }
  }
  return sent;
}

/** Asigna cada registro a una ejecución con la misma pregunta (las repeticiones son intercambiables). */
export function matchRecords<J extends { id: string; prompt_text: string }>(jobs: J[], records: BrightDataRecord[]): { pairs: [J, BrightDataRecord][]; unmatched: J[] } {
  const free = [...jobs];
  const pairs: [J, BrightDataRecord][] = [];
  const leftovers: BrightDataRecord[] = [];
  for (const r of records) {
    const p = recordPrompt(r);
    const i = p ? free.findIndex((j) => normalizePrompt(j.prompt_text) === normalizePrompt(p)) : -1;
    if (i >= 0) pairs.push([free.splice(i, 1)[0], r]);
    else leftovers.push(r);
  }
  // Registros sin pregunta reconocible: solo se asignan si no hay ambigüedad.
  if (leftovers.length && leftovers.length === free.length && new Set(free.map((j) => normalizePrompt(j.prompt_text))).size === 1) {
    for (const r of leftovers) pairs.push([free.shift()!, r]);
  }
  return { pairs, unmatched: free };
}

/** Busca resultados de los snapshots enviados para ese análisis. Devuelve cuántas ejecuciones cerró. */
export async function collectRun(runId: string, opts: Opts = {}): Promise<number> {
  const f = opts.fetch ?? (fetch as unknown as FetchLike);
  const rows = await all("SELECT * FROM responses WHERE run_id = ? AND status = 'running' AND lease_id LIKE 'bd:%'", [runId]);
  const groups = new Map<string, ClaimedJob[]>();
  for (const r of rows) {
    const j = { ...toResponse(r as Record<string, unknown>), lease_id: String((r as Record<string, unknown>).lease_id) };
    groups.set(j.lease_id, [...(groups.get(j.lease_id) ?? []), j]);
  }
  let finished = 0;
  for (const [lease, jobs] of groups) {
    const id = jobs[0].collector as BrightDataCollectorId;
    const claimedAt = Date.parse(jobs[0].claimed_at ?? jobs[0].started_at ?? now());
    const age = Date.now() - claimedAt;
    const startedMs = claimedAt;
    if (lease.startsWith(PENDING_PREFIX)) {
      // El envío se cortó antes de guardar el snapshot: se reintenta.
      if (age > 3 * 60_000) {
        await failAll(jobs, id, { code: "interrumpido", message: "El envío al servicio de captura se interrumpió; se reintenta.", transient: true }, startedMs);
        finished += jobs.length;
      }
      continue;
    }
    const cfg = brightDataConfig(id, opts.env);
    if ("missing" in cfg) {
      await failAll(jobs, id, { code: "sin_credenciales", message: cfg.missing, transient: false }, startedMs);
      finished += jobs.length;
      continue;
    }
    const snap = lease.slice(3);
    try {
      const status = await snapshotStatus(f, cfg, snap);
      if (status === "ready") {
        const records = await downloadSnapshot(f, cfg, snap);
        if (!records) {
          await run("UPDATE responses SET heartbeat_at = ? WHERE lease_id = ? AND status = 'running'", [now(), lease]);
          continue;
        }
        const { pairs, unmatched } = matchRecords(jobs, records);
        for (const [job, rec] of pairs) {
          const res = recordToResult(rec, id, cfg, startedMs, job.country ?? "AR");
          const st = await finishJob(job, res);
          if (st === "completed") await setCollectorStatus(id, "available", null, "brightdata", { verified: true, details: { snapshot: snap } });
        }
        await failAll(unmatched, id, { code: "respuesta_vacia", message: `El servicio de captura no devolvió resultado para esta pregunta (snapshot ${snap}).`, transient: true }, startedMs);
        finished += jobs.length;
      } else if (status === "failed") {
        await failAll(jobs, id, { code: "api_error", message: `El servicio de captura marcó el snapshot ${snap} como fallido.`, transient: true }, startedMs);
        finished += jobs.length;
      } else if (age > maxWaitMs()) {
        await failAll(jobs, id, { code: "timeout", message: `El servicio de captura no terminó en ${Math.round(maxWaitMs() / 60000)} min (snapshot ${snap}).`, transient: true }, startedMs);
        finished += jobs.length;
      } else {
        await run("UPDATE responses SET heartbeat_at = ? WHERE lease_id = ? AND status = 'running'", [now(), lease]);
      }
    } catch (e) {
      const err = errorFrom(e);
      // Si no pudimos consultar, esperamos al próximo paso salvo que esté vencido o el token sea inválido.
      if (!err.transient || age > maxWaitMs()) {
        await failAll(jobs, id, err, startedMs);
        finished += jobs.length;
      }
    }
  }
  if (finished) await refreshRunStatus(runId);
  return finished;
}
