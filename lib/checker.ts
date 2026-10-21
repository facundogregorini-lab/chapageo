// Checker rápido: lo usa la landing (gratis, sin registro) y la prospección de agencias.
// 5 preguntas de descubrimiento × 1 motor + auditoría técnica del sitio. Nunca se simula.
// 1) Bright Data: la interfaz web real de ChatGPT, en un solo lote asíncrono, dentro del tope diario.
//    El chequeo se guarda pendiente y la página del resultado lo completa cuando llega la respuesta.
// 2) Si no hay Bright Data o se agotó el cupo: API oficial, rotulada como tal.
// 3) Sin ninguno de los dos: solo la auditoría y las preguntas.

import { analyzeAnswer, cleanDomain } from "./analyze";
import { auditSite, type SiteAudit } from "./audit";
import { apiCollector } from "./collectors/api";
import { ENGINES, engineConfigured, type EngineId } from "./config";
import { brightDataRecordsLeft } from "./brightdata-batch";
import {
  BrightDataError,
  brightDataConfig,
  buildInput,
  downloadSnapshot,
  errorFrom,
  normalizePrompt,
  recordPrompt,
  recordToResult,
  snapshotStatus,
  triggerSnapshot,
  type BrightDataRecord,
  type FetchLike,
} from "./collectors/brightdata";
import { id, now, one, parseJson, run, token } from "./db";
import { logEvent } from "./events";
import { guessBrandName, templatePrompts } from "./suggest";
import type { Source } from "./types";

export type CheckerInput = { domain: string; category: string; country: string; city?: string | null; brandName?: string | null };

export type CheckerResult = {
  domain: string;
  brandName: string;
  category: string;
  country: string;
  city: string | null;
  engine: EngineId | null;
  engineLabel: string;
  simulated: boolean;
  questions: {
    text: string;
    mentioned: boolean;
    position: number | null;
    cited: boolean;
    others: string[];
    snippet: string | null;
    answer: string;
    sources: Source[];
    error?: string;
  }[];
  mentioned: number;
  total: number;
  cited: number;
  topOthers: { name: string; count: number }[];
  topSources: { domain: string; count: number }[];
  audit: SiteAudit;
  score: number;
  createdAt: string;
  /** Cómo se obtuvieron las respuestas. Los chequeos viejos no lo tienen (eran por API). */
  method?: "brightdata" | "api";
  /** Bright Data todavía está respondiendo: la página lo completa cuando esté listo. */
  pending?: { snapshotId: string; since: string } | null;
};

export function pickCheckerEngine(): EngineId | null {
  const order: EngineId[] = ["gemini", "chatgpt", "perplexity", "claude"];
  return order.find(engineConfigured) ?? null;
}

/** El checker consulta la interfaz web de ChatGPT vía Bright Data (si el servidor tiene la key). */
export function checkerUsesBrightData(): boolean {
  return !("missing" in brightDataConfig("brightdata_chatgpt"));
}

type Question = CheckerResult["questions"][number];
type Brand = { name: string; domain: string; aliases: string[] };

function noAnswer(text: string, error: string): Question {
  return { text, mentioned: false, position: null, cited: false, others: [], snippet: null, answer: "", sources: [], error };
}

function scoreQuestion(text: string, answer: string, citations: Source[], brand: Brand): Question {
  const a = analyzeAnswer(answer, citations, brand, []);
  return {
    text,
    mentioned: a.brandMentioned,
    position: a.brandPosition,
    cited: a.ownCited,
    others: a.otherBrands.slice(0, 6),
    snippet: a.mentions.find((m) => m.own)?.snippet ?? null,
    answer,
    sources: citations.slice(0, 8),
  };
}

/** Recalcula los totales y el puntaje a partir de las preguntas. */
export function summarize(r: CheckerResult, questions: Question[]): CheckerResult {
  const valid = questions.filter((q) => !q.error);
  const others = new Map<string, number>();
  const srcs = new Map<string, number>();
  for (const q of valid) {
    for (const o of q.others) others.set(o, (others.get(o) ?? 0) + 1);
    for (const d of new Set(q.sources.map((s) => s.domain))) srcs.set(d, (srcs.get(d) ?? 0) + 1);
  }
  const mentioned = valid.filter((q) => q.mentioned).length;
  const cited = valid.filter((q) => q.cited).length;
  // Puntaje simple y explicable: 70% visibilidad en respuestas, 30% salud técnica.
  const visibility = valid.length ? mentioned / valid.length : 0;
  return {
    ...r,
    questions,
    mentioned,
    total: valid.length,
    cited,
    topOthers: [...others.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    topSources: [...srcs.entries()].map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    score: Math.round(visibility * 70 + (r.audit.score / 100) * 30),
  };
}

// ---------------------------------------------------------------------------
// Bright Data: la interfaz web real de ChatGPT, sin claves de API
// ---------------------------------------------------------------------------

const CHECKER_COLLECTOR = "brightdata_chatgpt" as const;

/** Chequeos gratis por día que pueden usar Bright Data (cada uno son 5 registros). */
function checkerBdDailyMax() {
  const n = Number(process.env.CHECKER_BRIGHTDATA_MAX_PER_DAY ?? 40);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 40;
}

async function brightDataRoom(records: number): Promise<boolean> {
  const since = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z").toISOString();
  const row = await one<{ n: number }>("SELECT COUNT(*) AS n FROM events WHERE name = 'checker_brightdata' AND created_at >= ?", [since]);
  if (Number(row?.n ?? 0) >= checkerBdDailyMax()) return false;
  return (await brightDataRecordsLeft()) >= records;
}

function bdAnswers(records: BrightDataRecord[], prompts: string[], brand: Brand, startedAt: number, country: string): Question[] {
  const free = [...records];
  return prompts.map((text) => {
    const i = free.findIndex((r) => normalizePrompt(recordPrompt(r) ?? "") === normalizePrompt(text));
    if (i < 0) return noAnswer(text, "ChatGPT no devolvió respuesta para esta pregunta.");
    const rec = free.splice(i, 1)[0];
    const res = recordToResult(rec, CHECKER_COLLECTOR, { costPerRecord: 0 }, startedAt, country);
    if (res.status !== "completed" || !res.answerText) return noAnswer(text, res.error?.message ?? "Sin respuesta");
    return scoreQuestion(text, res.answerText, res.citations, brand);
  });
}

const WAITING = "Esperando la respuesta de ChatGPT…";

/**
 * Manda las preguntas a Bright Data en modo asíncrono y devuelve el chequeo pendiente.
 * El pedido HTTP vuelve enseguida: la página del resultado lo completa (resumeChecker).
 */
async function viaBrightData(base: CheckerResult, prompts: string[], f?: FetchLike): Promise<CheckerResult> {
  const cfg = brightDataConfig(CHECKER_COLLECTOR);
  if ("missing" in cfg) throw new Error(cfg.missing);
  await logEvent("checker_brightdata", { n: prompts.length });
  const fetchImpl = f ?? (fetch as unknown as FetchLike);
  const inputs = prompts.map((p, i) => buildInput(cfg, p, base.country, i + 1));
  const snapshotId = await triggerSnapshot(fetchImpl, cfg, inputs, { timeoutMs: 20_000 });
  return { ...base, questions: prompts.map((t) => noAnswer(t, WAITING)), pending: { snapshotId, since: now() } };
}

/** Si el chequeo quedó esperando a Bright Data, intenta completarlo. Devuelve el resultado actualizado o null si sigue igual. */
export async function resumeChecker(r: CheckerResult, f?: FetchLike): Promise<CheckerResult | null> {
  if (!r.pending) return null;
  const cfg = brightDataConfig(CHECKER_COLLECTOR);
  const prompts = r.questions.map((q) => q.text);
  const brand = { name: r.brandName, domain: r.domain, aliases: [] as string[] };
  const giveUp = (msg: string) => summarize({ ...r, pending: null }, prompts.map((t) => noAnswer(t, msg)));
  if ("missing" in cfg) return giveUp(cfg.missing);
  const fetchImpl = f ?? (fetch as unknown as FetchLike);
  try {
    const status = await snapshotStatus(fetchImpl, cfg, r.pending.snapshotId, { timeoutMs: 10_000 });
    if (status === "ready") {
      const records = await downloadSnapshot(fetchImpl, cfg, r.pending.snapshotId, { timeoutMs: 20_000 });
      if (records) return summarize({ ...r, pending: null }, bdAnswers(records, prompts, brand, Date.parse(r.pending.since), r.country));
    }
    if (status === "failed" || status === "canceled") return giveUp("No se pudo completar la consulta a ChatGPT.");
  } catch (e) {
    if (e instanceof BrightDataError && !e.transient) return giveUp(errorFrom(e).message);
  }
  if (Date.now() - Date.parse(r.pending.since) > 30 * 60_000) return giveUp("ChatGPT tardó demasiado en responder.");
  return null;
}

export type CheckerAudit = { id: string; kind: string; workspaceId: string | null; result: CheckerResult };

/**
 * Lo que muestra /auditoria/[token]: busca el chequeo (también los pendientes) y, si está esperando
 * a Bright Data, intenta completarlo y guarda el resultado en la misma fila.
 */
export async function loadCheckerAudit(shareToken: string, opts: { fetch?: FetchLike; retries?: number } = {}): Promise<CheckerAudit | null> {
  type Row = { id: string; kind: string; result: string; workspace_id: string | null };
  let row: Row | null = null;
  // Si la base tiene réplicas de lectura, la fila puede tardar un instante en aparecer.
  for (let i = 0; i <= (opts.retries ?? 4); i++) {
    row = await one<Row>("SELECT id, kind, result, workspace_id FROM audits WHERE share_token = ? AND kind IN ('checker','prospect')", [shareToken]);
    if (row || i === (opts.retries ?? 4)) break;
    await new Promise((r) => setTimeout(r, 600));
  }
  if (!row) return null;
  let result = parseJson<CheckerResult | null>(row.result, null);
  if (!result) return null;
  if (result.pending) {
    const done = await resumeChecker(result, opts.fetch).catch((e) => {
      console.error("checker resume", e);
      return null;
    });
    if (done) {
      await run("UPDATE audits SET result = ? WHERE id = ?", [JSON.stringify(done), row.id]);
      result = done;
    }
  }
  return { id: row.id, kind: row.kind, workspaceId: row.workspace_id, result };
}

export async function runChecker(input: CheckerInput, opts: { fetch?: FetchLike } = {}): Promise<CheckerResult> {
  const domain = cleanDomain(input.domain);
  const audit = await auditSite(domain);
  const brandName = input.brandName?.trim() || guessBrandName(audit.home.title, audit.home.siteName, domain);
  const prompts = templatePrompts(
    { name: brandName, domain, category: input.category, description: audit.home.description, country: input.country, city: input.city },
    8,
  );
  const unbranded = prompts.filter((p) => p.category === "descubrimiento").slice(0, 5);
  const brand = { name: brandName, domain, aliases: [] as string[] };
  const base: CheckerResult = {
    domain,
    brandName,
    category: input.category,
    country: input.country,
    city: input.city ?? null,
    engine: null,
    engineLabel: "ningún motor",
    simulated: false,
    questions: [],
    mentioned: 0,
    total: 0,
    cited: 0,
    topOthers: [],
    topSources: [],
    audit,
    score: 0,
    createdAt: now(),
  };

  let bdError: string | null = null;
  // 1) Bright Data (interfaz web de ChatGPT), si está configurado y queda cupo del día.
  if (!("missing" in brightDataConfig(CHECKER_COLLECTOR)) && (await brightDataRoom(unbranded.length))) {
    const bdBase = { ...base, engine: "chatgpt" as const, engineLabel: "ChatGPT", method: "brightdata" as const };
    try {
      return await viaBrightData(bdBase, unbranded.map((p) => p.text), opts.fetch);
    } catch (e) {
      console.error("checker brightdata", e);
      bdError = errorFrom(e).message;
      // Si falla, sigue con la API oficial (si hay) o solo con la auditoría.
    }
  }

  // 2) API oficial, si el servidor tiene una clave.
  const engine = pickCheckerEngine();
  const collector = engine ? apiCollector(`${engine}_api`, engine) : null;
  const questions = await Promise.all(
    unbranded.map(async (p) => {
      if (!collector) return noAnswer(p.text, bdError ? `No pudimos consultar a ChatGPT en este momento: ${bdError}` : "Sin motor configurado en este servidor");
      const res = await collector.collect(
        { prompt: p.text, engine: engine!, requestedCountry: input.country, language: "es", runId: "checker", jobId: "checker" },
        { saveEvidence: async () => "", signal: new AbortController().signal, log: () => undefined },
      );
      if (res.status !== "completed" || !res.answerText) return noAnswer(p.text, res.error?.message ?? "Sin respuesta");
      return scoreQuestion(p.text, res.answerText, res.citations, brand);
    }),
  );
  return summarize({ ...base, engine, engineLabel: engine ? `${ENGINES[engine].label} (API oficial)` : "ningún motor", method: engine ? "api" : undefined }, questions);
}

export async function saveAudit(kind: "checker" | "prospect" | "crawl", result: unknown, opts: { workspaceId?: string | null; brandId?: string | null; domain: string }) {
  const auditId = id("aud_");
  const share = token();
  await run("INSERT INTO audits (id, workspace_id, brand_id, kind, domain, share_token, result, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
    auditId,
    opts.workspaceId ?? null,
    opts.brandId ?? null,
    kind,
    opts.domain,
    share,
    JSON.stringify(result),
    now(),
  ]);
  return { id: auditId, shareToken: share };
}
