// Métricas auditables. Reglas:
// - Solo cuentan las ejecuciones VÁLIDAS (estado "completed" con texto). Errores, parciales,
//   pendientes y bloqueos nunca cuentan como ausencia de la marca: quedan fuera del denominador
//   y se informan como cobertura.
// - Nunca se mezclan grupos de preguntas (descubrimiento / comparación / marca) en un mismo número.
// - Se puede agregar entre motores dentro de un mismo grupo: cada ejecución válida pesa igual.
//
// Definiciones:
//   Presencia(marca)        = respuestas válidas que mencionan la marca / respuestas válidas.
//   Cuota de menciones(m)   = respuestas que mencionan m / Σ respuestas que mencionan cada marca seguida
//                             (cada marca cuenta como máximo una vez por respuesta).
//   Citación                = respuestas válidas que enlazan al dominio del cliente / respuestas válidas.
//   Cobertura               = ejecuciones válidas / ejecuciones solicitadas.

import { citesDomain, classifySource, type SourceClass } from "./analyze";
import { collectorShort } from "./collectors/registry";
import { all, one, parseJson } from "./db";
import { toResponse, toRun, type Brand, type JobStatus, type PromptCategory, type ResponseRow, type Run } from "./types";

export type Ratio = { num: number; den: number; rate: number };

export const ratio = (num: number, den: number): Ratio => ({ num, den, rate: den ? num / den : 0 });

export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;

export function isValid(r: Pick<ResponseRow, "status" | "answer">): boolean {
  return r.status === "completed" && Boolean(r.answer && r.answer.trim());
}

export type BrandSliceMetrics = {
  name: string;
  own: boolean;
  domain: string | null;
  presence: Ratio;
  share: Ratio;
  citation: Ratio;
  /** Promedio del orden de mención (1 = primera marca seguida nombrada). No es ranking. */
  avgOrder: number | null;
  /** Respuestas con lista numerada en las que la marca aparece en un ítem. */
  ranked: number;
  avgRank: number | null;
};

export type SliceMetrics = {
  category: PromptCategory;
  /** id del conector o "todos" (agregado: cada ejecución válida pesa igual). */
  collector: string;
  requested: number;
  valid: number;
  coverage: Ratio;
  brands: BrandSliceMetrics[];
  /** Atajo a la fila de la marca del cliente. */
  own: BrandSliceMetrics;
};

export type SourceStat = { domain: string; cls: SourceClass; responses: number; urls: { url: string; count: number }[] };

export type PromptRow = {
  promptId: string;
  text: string;
  category: PromptCategory;
  cells: Record<string, { mentioned: number; valid: number; requested: number; statuses: Partial<Record<JobStatus, number>> }>;
  leaders: string[];
};

export type AnalysisMetrics = {
  run: Run | null;
  jobs: ResponseRow[];
  requested: number;
  valid: number;
  byStatus: Record<JobStatus, number>;
  coverage: Ratio;
  collectors: string[];
  categories: PromptCategory[];
  slices: SliceMetrics[];
  sources: SourceStat[];
  prompts: PromptRow[];
  otherBrands: { name: string; count: number }[];
  methods: string[];
  costUsd: number;
};

function avg(values: number[]): number | null {
  return values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
}

const CATEGORY_ORDER: PromptCategory[] = ["descubrimiento", "comparacion", "marca"];

export function computeSlice(brand: Brand, jobs: ResponseRow[], category: PromptCategory, collector: string): SliceMetrics {
  const scoped = jobs.filter((j) => j.prompt_category === category && (collector === "todos" || j.collector === collector));
  const valid = scoped.filter(isValid);
  const tracked = [
    { name: brand.name, own: true, domain: brand.domain },
    ...brand.competitors.map((c) => ({ name: c.name, own: false, domain: c.domain ?? null })),
  ];
  const mentioning = (name: string) => valid.filter((r) => r.mentions.some((m) => m.name === name));
  // Denominador de la cuota: suma de respuestas que mencionan cada marca (máximo una vez por respuesta y marca).
  const shareDen = tracked.reduce((a, t) => a + mentioning(t.name).length, 0);
  const brands = tracked.map((t) => {
    const rows = mentioning(t.name);
    const ms = rows.map((r) => r.mentions.find((m) => m.name === t.name)!);
    const ranks = ms.map((m) => m.explicitRank).filter((x): x is number => typeof x === "number");
    return {
      name: t.name,
      own: t.own,
      domain: t.domain,
      presence: ratio(rows.length, valid.length),
      share: ratio(rows.length, shareDen),
      citation: ratio(valid.filter((r) => citesDomain(r.sources, t.domain)).length, valid.length),
      avgOrder: avg(ms.map((m) => m.position)),
      ranked: ranks.length,
      avgRank: avg(ranks),
    };
  });
  return {
    category,
    collector,
    requested: scoped.length,
    valid: valid.length,
    coverage: ratio(valid.length, scoped.length),
    brands,
    own: brands[0],
  };
}

export function computeAnalysisMetrics(brand: Brand, run: Run | null, jobs: ResponseRow[]): AnalysisMetrics {
  const valid = jobs.filter(isValid);
  const byStatus: Record<JobStatus, number> = { pending: 0, running: 0, completed: 0, partial: 0, failed: 0, requires_intervention: 0 };
  for (const j of jobs) byStatus[j.status] = (byStatus[j.status] ?? 0) + 1;
  const collectors = [...new Set(jobs.map((j) => j.collector))].sort();
  const categories = CATEGORY_ORDER.filter((c) => jobs.some((j) => j.prompt_category === c));

  const slices: SliceMetrics[] = [];
  for (const cat of categories) {
    if (collectors.length > 1) slices.push(computeSlice(brand, jobs, cat, "todos"));
    for (const col of collectors) slices.push(computeSlice(brand, jobs, cat, col));
  }

  // Fuentes: dominios y URLs citados en respuestas válidas (cada dominio cuenta una vez por respuesta).
  const srcMap = new Map<string, { responses: number; urls: Map<string, number> }>();
  for (const r of valid) {
    const seen = new Set<string>();
    for (const s of r.sources) {
      const cur = srcMap.get(s.domain) ?? { responses: 0, urls: new Map<string, number>() };
      if (!seen.has(s.domain)) {
        cur.responses++;
        seen.add(s.domain);
      }
      cur.urls.set(s.url, (cur.urls.get(s.url) ?? 0) + 1);
      srcMap.set(s.domain, cur);
    }
  }
  const sources = [...srcMap.entries()]
    .map(([domain, v]) => ({
      domain,
      cls: classifySource(domain, brand.domain, brand.competitors),
      responses: v.responses,
      urls: [...v.urls.entries()].map(([url, count]) => ({ url, count })).sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.responses - a.responses || a.domain.localeCompare(b.domain));

  const promptIds = [...new Set(jobs.map((j) => j.prompt_id))];
  const prompts: PromptRow[] = promptIds.map((pid) => {
    const rows = jobs.filter((j) => j.prompt_id === pid);
    const cells: PromptRow["cells"] = {};
    for (const col of collectors) {
      const c = rows.filter((r) => r.collector === col);
      if (!c.length) continue;
      const statuses: Partial<Record<JobStatus, number>> = {};
      for (const r of c) statuses[r.status] = (statuses[r.status] ?? 0) + 1;
      const v = c.filter(isValid);
      cells[col] = { mentioned: v.filter((r) => r.brand_mentioned).length, valid: v.length, requested: c.length, statuses };
    }
    const leaderCounts = new Map<string, number>();
    for (const r of rows.filter(isValid)) for (const m of r.mentions) if (!m.own) leaderCounts.set(m.name, (leaderCounts.get(m.name) ?? 0) + 1);
    return {
      promptId: pid,
      text: rows[0].prompt_text,
      category: rows[0].prompt_category,
      cells,
      leaders: [...leaderCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n),
    };
  });
  prompts.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.text.localeCompare(b.text));

  const others = new Map<string, number>();
  for (const r of valid) for (const n of r.other_brands) others.set(n, (others.get(n) ?? 0) + 1);

  return {
    run,
    jobs,
    requested: jobs.length,
    valid: valid.length,
    byStatus,
    coverage: ratio(valid.length, jobs.length),
    collectors,
    categories,
    slices,
    sources,
    prompts,
    otherBrands: [...others.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    methods: [...new Set(jobs.map((j) => j.collection_method))],
    costUsd: jobs.reduce((a, r) => a + (r.cost_usd || 0), 0),
  };
}

export function slice(m: AnalysisMetrics, category: PromptCategory, collector: string): SliceMetrics | undefined {
  return m.slices.find((s) => s.category === category && s.collector === collector);
}

/** El "todos" si hay más de un conector, si no el único. */
export function headlineSlice(m: AnalysisMetrics, category: PromptCategory): SliceMetrics | undefined {
  return slice(m, category, m.collectors.length > 1 ? "todos" : m.collectors[0]);
}

export function sliceLabel(collector: string) {
  return collector === "todos" ? "Todos los motores" : collectorShort(collector);
}

// ---------------------------------------------------------------------------
// Carga desde la base (siempre con workspace_id)
// ---------------------------------------------------------------------------

export async function runJobs(workspaceId: string, runId: string): Promise<ResponseRow[]> {
  const rows = await all("SELECT * FROM responses WHERE run_id = ? AND workspace_id = ? ORDER BY prompt_category, prompt_text, collector, repetition", [
    runId,
    workspaceId,
  ]);
  return rows.map((r) => toResponse(r as Record<string, unknown>));
}

export async function latestRun(workspaceId: string, brandId: string, opts: { terminalOnly?: boolean } = {}): Promise<Run | null> {
  const r = await one(
    `SELECT * FROM runs WHERE brand_id = ? AND workspace_id = ? ${opts.terminalOnly ? "AND status IN ('completed','partial')" : ""} ORDER BY created_at DESC LIMIT 1`,
    [brandId, workspaceId],
  );
  return r ? toRun(r as Record<string, unknown>) : null;
}

/** La marca con el conjunto de competidores/alias que se usó en ese análisis. */
export function brandForRun(brand: Brand, run: Run | null): Brand {
  const snap = parseJson<Partial<Brand>>((run as unknown as { brand_snapshot?: string } | null)?.brand_snapshot, {});
  return { ...brand, ...snap };
}

export async function analysisMetrics(brand: Brand, run: Run | null): Promise<AnalysisMetrics> {
  const jobs = run ? await runJobs(brand.workspace_id, run.id) : [];
  return computeAnalysisMetrics(brandForRun(brand, run), run, jobs);
}

/**
 * Análisis anteriores comparables: mismas preguntas (texto y grupo) y mismos conectores.
 * Solo con estos tiene sentido mostrar una comparación temporal.
 */
export async function comparableRuns(brand: Brand, run: Run): Promise<Run[]> {
  if (!run.prompt_set_hash) return [];
  const rows = await all(
    `SELECT * FROM runs WHERE brand_id = ? AND workspace_id = ? AND prompt_set_hash = ? AND id != ? AND created_at < ?
       AND status IN ('completed','partial') AND is_demo = ? ORDER BY created_at DESC LIMIT 6`,
    [brand.id, brand.workspace_id, run.prompt_set_hash, run.id, run.created_at, run.is_demo],
  );
  return rows.map((r) => toRun(r as Record<string, unknown>));
}
