// Cola de trabajos sobre la base: cada corrida crea una fila por (pregunta × motor × repetición)
// y se procesa en tandas cortas. Así funciona igual en un servidor propio y en funciones
// serverless con límite de tiempo (la UI y el cron van "tickeando" la corrida).

import { analyzeAnswer } from "./analyze";
import { engineConfigured } from "./config";
import { all, db, id, now, one, run } from "./db";
import { askEngine } from "./engines";
import { generateActions } from "./actions";
import { logEvent } from "./events";
import { toBrand, toRun, type Brand, type Prompt, type Run } from "./types";

const BATCH = 8;
const STALE_MS = 3 * 60_000;

export async function createRun(brandId: string, trigger: "manual" | "cron" | "onboarding"): Promise<Run> {
  const brandRow = await one("SELECT * FROM brands WHERE id = ?", [brandId]);
  if (!brandRow) throw new Error("Marca inexistente");
  const brand = toBrand(brandRow);
  const active = await one<{ id: string }>("SELECT id FROM runs WHERE brand_id = ? AND status IN ('queued','running')", [brandId]);
  if (active) return toRun((await one("SELECT * FROM runs WHERE id = ?", [active.id]))!);

  const prompts = await all<Prompt>("SELECT * FROM prompts WHERE brand_id = ? AND active = 1 ORDER BY created_at", [brandId]);
  if (!prompts.length) throw new Error("La marca no tiene preguntas activas");
  const runId = id("run_");
  const ts = now();
  const simulated = brand.engines.some((e) => !engineConfigured(e)) ? 1 : 0;
  const stmts = [
    {
      sql: "INSERT INTO runs (id, brand_id, status, trigger, total, simulated, created_at) VALUES (?, ?, 'running', ?, ?, ?, ?)",
      args: [runId, brandId, trigger, prompts.length * brand.engines.length * brand.repetitions, simulated, ts],
    },
  ];
  for (const p of prompts)
    for (const engine of brand.engines)
      for (let rep = 1; rep <= brand.repetitions; rep++)
        stmts.push({
          sql: `INSERT INTO responses (id, run_id, brand_id, prompt_id, prompt_text, prompt_kind, engine, repetition, status, country, language, simulated, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
          args: [id("res_"), runId, brandId, p.id, p.text, p.kind, engine, rep, brand.country, brand.language, engineConfigured(engine) ? 0 : 1, ts],
        });
  await (await db()).batch(stmts, "write");
  return toRun((await one("SELECT * FROM runs WHERE id = ?", [runId]))!);
}

async function processOne(row: Record<string, unknown>, brand: Brand) {
  const started = Date.now();
  try {
    const res = await askEngine(
      row.engine as Brand["engines"][number],
      { prompt: String(row.prompt_text), country: brand.country, city: brand.city, language: brand.language },
      {
        repetition: Number(row.repetition),
        brand: { name: brand.name, domain: brand.domain, category: brand.category },
        competitors: brand.competitors,
        branded: row.prompt_kind === "con_marca",
      },
    );
    const a = analyzeAnswer(res.answer, res.sources, brand, brand.competitors);
    await run(
      `UPDATE responses SET status='ok', model=?, answer=?, sources=?, mentions=?, other_brands=?, brand_mentioned=?, brand_position=?,
        own_cited=?, sentiment=?, sentiment_score=?, cost_usd=?, latency_ms=?, simulated=?, executed_at=?, error=NULL WHERE id=?`,
      [
        res.model,
        res.answer,
        JSON.stringify(res.sources),
        JSON.stringify(a.mentions),
        JSON.stringify(a.otherBrands),
        a.brandMentioned ? 1 : 0,
        a.brandPosition,
        a.ownCited ? 1 : 0,
        a.sentiment?.label ?? null,
        a.sentiment?.score ?? null,
        res.costUsd,
        Date.now() - started,
        res.simulated ? 1 : 0,
        now(),
        String(row.id),
      ],
    );
  } catch (e) {
    await run("UPDATE responses SET status='error', error=?, latency_ms=?, executed_at=? WHERE id=?", [
      String((e as Error).message ?? e).slice(0, 500),
      Date.now() - started,
      now(),
      String(row.id),
    ]);
  }
}

/** Procesa una tanda de la corrida y devuelve el estado actualizado. */
export async function tickRun(runId: string): Promise<Run> {
  const r = await one("SELECT * FROM runs WHERE id = ?", [runId]);
  if (!r) throw new Error("Corrida inexistente");
  let current = toRun(r);
  if (current.status === "done" || current.status === "failed") return current;
  const brand = toBrand((await one("SELECT * FROM brands WHERE id = ?", [current.brand_id]))!);

  const staleBefore = new Date(Date.now() - STALE_MS).toISOString();
  const claimed = (
    await (await db()).execute({
      sql: `UPDATE responses SET status='processing', claimed_at=?
            WHERE id IN (SELECT id FROM responses WHERE run_id=? AND (status='pending' OR (status='processing' AND claimed_at < ?)) LIMIT ?)
            RETURNING *`,
      args: [now(), runId, staleBefore, BATCH],
    })
  ).rows as unknown as Record<string, unknown>[];

  await Promise.all(claimed.map((row) => processOne(row, brand)));

  const counts = await one<{ ok: number; err: number; open: number; cost: number }>(
    `SELECT SUM(status='ok') AS ok, SUM(status='error') AS err, SUM(status IN ('pending','processing')) AS open, COALESCE(SUM(cost_usd),0) AS cost
     FROM responses WHERE run_id = ?`,
    [runId],
  );
  const open = Number(counts?.open ?? 0);
  const ok = Number(counts?.ok ?? 0);
  const err = Number(counts?.err ?? 0);
  if (open === 0) {
    const status = ok === 0 ? "failed" : "done";
    await run("UPDATE runs SET status=?, done_count=?, failed_count=?, cost_usd=?, finished_at=? WHERE id=?", [status, ok, err, Number(counts?.cost ?? 0), now(), runId]);
    await run("UPDATE brands SET last_run_at=? WHERE id=?", [now(), brand.id]);
    if (status === "done") {
      await generateActions(brand.id);
      await logEvent("run_done", { brandId: brand.id, runId, ok, err, simulated: current.simulated });
    }
  } else {
    await run("UPDATE runs SET done_count=?, failed_count=?, cost_usd=? WHERE id=?", [ok, err, Number(counts?.cost ?? 0), runId]);
  }
  current = toRun((await one("SELECT * FROM runs WHERE id = ?", [runId]))!);
  return current;
}

/** Corre una corrida completa (para scripts y cron). Respeta un tope de tiempo. */
export async function drainRun(runId: string, deadlineMs: number): Promise<Run> {
  let r = await tickRun(runId);
  while ((r.status === "running" || r.status === "queued") && Date.now() < deadlineMs) r = await tickRun(runId);
  return r;
}
