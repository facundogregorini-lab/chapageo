// Métricas del panel, con numerador y denominador siempre visibles (protocolo de Astra):
// - Tasa de mención = respuestas válidas que mencionan la marca / respuestas válidas.
// - Tasa de cita propia = respuestas válidas con URL del dominio / respuestas válidas.
// - Share of voice = menciones de la marca / menciones del conjunto fijo de marcas.
// Los fallos técnicos se excluyen del denominador y se reportan aparte.

import { classifySource, type SourceClass } from "./analyze";
import type { EngineId } from "./config";
import { all, one } from "./db";
import { toResponse, toRun, type Brand, type ResponseRow, type Run } from "./types";

export type Ratio = { num: number; den: number; rate: number };

const ratio = (num: number, den: number): Ratio => ({ num, den, rate: den ? num / den : 0 });

export type BrandMetrics = {
  run: Run | null;
  responses: ResponseRow[];
  valid: number;
  failed: number;
  simulated: number;
  mention: Ratio;
  citation: Ratio;
  sov: Ratio;
  avgPosition: number | null;
  sentiment: { positivo: number; neutral: number; negativo: number };
  byEngine: { engine: EngineId; mention: Ratio; citation: Ratio; avgPosition: number | null; simulated: boolean }[];
  competitors: { name: string; own: boolean; mention: Ratio; avgPosition: number | null; sov: number }[];
  prompts: {
    promptId: string;
    text: string;
    kind: string;
    mention: Ratio;
    byEngine: Partial<Record<EngineId, Ratio>>;
    leaders: string[];
  }[];
  sources: { domain: string; cls: SourceClass; count: number; withoutBrand: number; urls: string[] }[];
  otherBrands: { name: string; count: number }[];
  costUsd: number;
};

export async function latestRun(brandId: string): Promise<Run | null> {
  const r = await one("SELECT * FROM runs WHERE brand_id = ? AND status = 'done' ORDER BY created_at DESC LIMIT 1", [brandId]);
  return r ? toRun(r) : null;
}

export async function runResponses(runId: string): Promise<ResponseRow[]> {
  const rows = await all("SELECT * FROM responses WHERE run_id = ? ORDER BY prompt_text, engine, repetition", [runId]);
  return rows.map((r) => toResponse(r as Record<string, unknown>));
}

function avg(values: number[]): number | null {
  return values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
}

export function computeMetrics(brand: Brand, run: Run | null, responses: ResponseRow[]): BrandMetrics {
  const ok = responses.filter((r) => r.status === "ok");
  const failed = responses.filter((r) => r.status === "error").length;
  const tracked = [brand.name, ...brand.competitors.map((c) => c.name)];

  const mentionCount = (name: string, rows: ResponseRow[]) => rows.filter((r) => r.mentions.some((m) => m.name === name)).length;
  const positions = (name: string, rows: ResponseRow[]) =>
    rows.flatMap((r) => r.mentions.filter((m) => m.name === name).map((m) => m.position));

  const totalMentions = tracked.reduce((a, n) => a + mentionCount(n, ok), 0);
  const ownMentions = mentionCount(brand.name, ok);

  const engines = [...new Set(responses.map((r) => r.engine))] as EngineId[];
  const byEngine = engines.map((engine) => {
    const rows = ok.filter((r) => r.engine === engine);
    return {
      engine,
      mention: ratio(rows.filter((r) => r.brand_mentioned).length, rows.length),
      citation: ratio(rows.filter((r) => r.own_cited).length, rows.length),
      avgPosition: avg(positions(brand.name, rows)),
      simulated: rows.some((r) => r.simulated),
    };
  });

  const competitors = tracked
    .map((name, i) => {
      const n = mentionCount(name, ok);
      return {
        name,
        own: i === 0,
        mention: ratio(n, ok.length),
        avgPosition: avg(positions(name, ok)),
        sov: totalMentions ? n / totalMentions : 0,
      };
    })
    .sort((a, b) => b.mention.num - a.mention.num);

  const promptIds = [...new Set(responses.map((r) => r.prompt_id))];
  const prompts = promptIds.map((pid) => {
    const all = ok.filter((r) => r.prompt_id === pid);
    const first = responses.find((r) => r.prompt_id === pid)!;
    const byEngineP: Partial<Record<EngineId, Ratio>> = {};
    for (const e of engines) {
      const rows = all.filter((r) => r.engine === e);
      if (rows.length) byEngineP[e] = ratio(rows.filter((r) => r.brand_mentioned).length, rows.length);
    }
    const leaderCounts = new Map<string, number>();
    for (const r of all) for (const m of r.mentions) if (!m.own) leaderCounts.set(m.name, (leaderCounts.get(m.name) ?? 0) + 1);
    return {
      promptId: pid,
      text: first.prompt_text,
      kind: first.prompt_kind,
      mention: ratio(all.filter((r) => r.brand_mentioned).length, all.length),
      byEngine: byEngineP,
      leaders: [...leaderCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n),
    };
  });

  const srcMap = new Map<string, { count: number; withoutBrand: number; urls: Set<string> }>();
  for (const r of ok) {
    const seen = new Set<string>();
    for (const s of r.sources) {
      if (seen.has(s.domain)) continue;
      seen.add(s.domain);
      const cur = srcMap.get(s.domain) ?? { count: 0, withoutBrand: 0, urls: new Set<string>() };
      cur.count++;
      if (!r.brand_mentioned && r.mentions.length) cur.withoutBrand++;
      if (cur.urls.size < 8) cur.urls.add(s.url);
      srcMap.set(s.domain, cur);
    }
  }
  const sources = [...srcMap.entries()]
    .map(([domain, v]) => ({ domain, cls: classifySource(domain, brand.domain, brand.competitors), count: v.count, withoutBrand: v.withoutBrand, urls: [...v.urls] }))
    .sort((a, b) => b.count - a.count);

  const others = new Map<string, number>();
  for (const r of ok) for (const n of r.other_brands) others.set(n, (others.get(n) ?? 0) + 1);

  return {
    run,
    responses,
    valid: ok.length,
    failed,
    simulated: ok.filter((r) => r.simulated).length,
    mention: ratio(ownMentions, ok.length),
    citation: ratio(ok.filter((r) => r.own_cited).length, ok.length),
    sov: ratio(ownMentions, totalMentions),
    avgPosition: avg(positions(brand.name, ok)),
    sentiment: {
      positivo: ok.filter((r) => r.sentiment === "positivo").length,
      neutral: ok.filter((r) => r.sentiment === "neutral").length,
      negativo: ok.filter((r) => r.sentiment === "negativo").length,
    },
    byEngine,
    competitors,
    prompts: prompts.sort((a, b) => a.mention.rate - b.mention.rate),
    sources,
    otherBrands: [...others.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    costUsd: responses.reduce((a, r) => a + (r.cost_usd || 0), 0),
  };
}

export async function brandMetrics(brand: Brand, runId?: string): Promise<BrandMetrics> {
  const run = runId ? toRun((await one("SELECT * FROM runs WHERE id = ?", [runId]))!) : await latestRun(brand.id);
  const responses = run ? await runResponses(run.id) : [];
  return computeMetrics(brand, run, responses);
}

export type TrendPoint = { runId: string; date: string; mention: number; sov: number; citation: number; simulated: boolean };

export async function brandTrend(brand: Brand, limit = 12): Promise<TrendPoint[]> {
  const runs = await all("SELECT * FROM runs WHERE brand_id = ? AND status = 'done' ORDER BY created_at DESC LIMIT ?", [brand.id, limit]);
  const points: TrendPoint[] = [];
  for (const raw of runs.reverse()) {
    const r = toRun(raw as Record<string, unknown>);
    const agg = await one<{ v: number; m: number; c: number }>(
      "SELECT SUM(status='ok') AS v, SUM(status='ok' AND brand_mentioned=1) AS m, SUM(status='ok' AND own_cited=1) AS c FROM responses WHERE run_id = ?",
      [r.id],
    );
    const rows = (await all("SELECT mentions FROM responses WHERE run_id = ? AND status='ok'", [r.id])) as unknown as { mentions: string }[];
    let own = 0;
    let total = 0;
    for (const row of rows) {
      const ms = JSON.parse(row.mentions) as { own: boolean }[];
      total += ms.length;
      own += ms.some((m) => m.own) ? 1 : 0;
    }
    const v = Number(agg?.v ?? 0);
    points.push({
      runId: r.id,
      date: r.created_at,
      mention: v ? Number(agg?.m ?? 0) / v : 0,
      citation: v ? Number(agg?.c ?? 0) / v : 0,
      sov: total ? own / total : 0,
      simulated: Boolean(r.simulated),
    });
  }
  return points;
}

export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;
