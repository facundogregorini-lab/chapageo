// Checker rápido: lo usa la landing (gratis, sin registro) y la prospección de agencias.
// 5 preguntas de descubrimiento × los motores elegidos (ChatGPT, Gemini, Perplexity) + auditoría técnica. Nunca se simula.
// 1) Bright Data: la interfaz web real de cada motor, un lote asíncrono por motor, dentro del tope diario.
//    El chequeo se guarda pendiente y la página del resultado lo completa a medida que llegan las respuestas.
// 2) Si no hay Bright Data o se agotó el cupo: API oficial (un motor), rotulada como tal.
// 3) Sin ninguno de los dos: solo la auditoría y las preguntas.

import { analyzeAnswer, cleanDomain } from "./analyze";
import { auditSite, type SiteAudit } from "./audit";
import { apiCollector } from "./collectors/api";
import { ENGINES, engineConfigured, type EngineId } from "./config";
import { brightDataRecordsLeft } from "./brightdata-batch";
import {
  BrightDataError,
  brightDataConfig,
  collectorIdFor,
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

/** Motores que se pueden elegir en el checker (los que captura Bright Data). */
export type CheckerEngine = "chatgpt" | "gemini" | "perplexity";
export const CHECKER_ENGINES: CheckerEngine[] = ["chatgpt", "gemini", "perplexity"];

export type CheckerInput = {
  domain: string;
  category: string;
  country: string;
  city?: string | null;
  brandName?: string | null;
  /** Por defecto solo ChatGPT. Cada motor suma 5 consultas al tope diario. */
  engines?: CheckerEngine[];
};

type PendingSnapshot = { engine: CheckerEngine; snapshotId: string };

export type CheckerResult = {
  domain: string;
  brandName: string;
  category: string;
  country: string;
  city: string | null;
  /** El primer motor consultado (los chequeos viejos usaban uno solo). */
  engine: EngineId | null;
  /** Todos los motores consultados por Bright Data, en orden. */
  engines?: CheckerEngine[];
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
    /** Motor que respondió esta pregunta (los chequeos viejos no lo tienen). */
    engine?: CheckerEngine;
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
  /** Los chequeos de un solo motor guardaban { snapshotId, since }. */
  pending?: { snapshots?: PendingSnapshot[]; snapshotId?: string; since: string } | null;
  /** Menciones por motor, cuando se consultó más de uno. */
  byEngine?: { engine: CheckerEngine; label: string; mentioned: number; total: number }[];
};

export function pickCheckerEngine(): EngineId | null {
  const order: EngineId[] = ["gemini", "chatgpt", "perplexity", "claude"];
  return order.find(engineConfigured) ?? null;
}

/** El checker consulta la interfaz web de ChatGPT vía Bright Data (si el servidor tiene la key). */
export function checkerUsesBrightData(): boolean {
  return !("missing" in brightDataConfig("brightdata_chatgpt"));
}

/** Motores que el visitante puede elegir en el checker. */
export function checkerEngineOptions(): { id: CheckerEngine; label: string }[] {
  return CHECKER_ENGINES.filter((e) => !("missing" in brightDataConfig(collectorIdFor(e)))).map((e) => ({ id: e, label: ENGINES[e].label }));
}

/** "ChatGPT", "ChatGPT y Gemini", "ChatGPT, Gemini y Perplexity". */
export function engineList(engines: EngineId[]): string {
  const labels = engines.map((e) => ENGINES[e].label);
  return labels.length <= 1 ? (labels[0] ?? "") : `${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1]}`;
}

/** Los snapshots que siguen esperando, también en el formato viejo de un solo motor. */
export function pendingSnapshots(r: CheckerResult): PendingSnapshot[] {
  if (!r.pending) return [];
  if (r.pending.snapshots) return r.pending.snapshots;
  return r.pending.snapshotId ? [{ engine: (r.engine as CheckerEngine) ?? "chatgpt", snapshotId: r.pending.snapshotId }] : [];
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
    byEngine:
      r.engines && r.engines.length > 1
        ? r.engines.map((e) => {
            const qs = valid.filter((q) => q.engine === e);
            return { engine: e, label: ENGINES[e].label, mentioned: qs.filter((q) => q.mentioned).length, total: qs.length };
          })
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// Bright Data: la interfaz web real de cada motor, sin claves de API
// ---------------------------------------------------------------------------

/** Consultas gratis por día a un motor con Bright Data (cada una son 5 registros; 3 motores = 3 consultas). */
function checkerBdDailyMax() {
  const n = Number(process.env.CHECKER_BRIGHTDATA_MAX_PER_DAY ?? 40);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 40;
}

/** Cuántos motores (de `perEngine` registros cada uno) entran todavía en los topes del día. */
async function brightDataRoom(perEngine: number, wanted: number): Promise<number> {
  const since = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z").toISOString();
  const row = await one<{ n: number }>("SELECT COUNT(*) AS n FROM events WHERE name = 'checker_brightdata' AND created_at >= ?", [since]);
  const byChecks = checkerBdDailyMax() - Number(row?.n ?? 0);
  const byRecords = Math.floor((await brightDataRecordsLeft()) / Math.max(1, perEngine));
  return Math.max(0, Math.min(wanted, byChecks, byRecords));
}

function bdAnswers(engine: CheckerEngine, records: BrightDataRecord[], prompts: string[], brand: Brand, startedAt: number, country: string): Question[] {
  const free = [...records];
  const label = ENGINES[engine].label;
  return prompts.map((text) => {
    const i = free.findIndex((r) => normalizePrompt(recordPrompt(r) ?? "") === normalizePrompt(text));
    if (i < 0) return { ...noAnswer(text, `${label} no devolvió respuesta para esta pregunta.`), engine };
    const rec = free.splice(i, 1)[0];
    const res = recordToResult(rec, collectorIdFor(engine), { costPerRecord: 0 }, startedAt, country);
    if (res.status !== "completed" || !res.answerText) return { ...noAnswer(text, res.error?.message ?? "Sin respuesta"), engine };
    return { ...scoreQuestion(text, res.answerText, res.citations, brand), engine };
  });
}

const waiting = (engine: CheckerEngine) => `Esperando la respuesta de ${ENGINES[engine].label}…`;

/**
 * Manda las preguntas a Bright Data en modo asíncrono, un lote por motor, y devuelve el chequeo pendiente.
 * El pedido HTTP vuelve enseguida: la página del resultado lo completa (resumeChecker).
 * Si un motor falla al enviarse, sus preguntas quedan con el error y los demás siguen. Si fallan todos, tira el error.
 */
async function viaBrightData(base: CheckerResult, engines: CheckerEngine[], prompts: string[], f?: FetchLike): Promise<CheckerResult> {
  const fetchImpl = f ?? (fetch as unknown as FetchLike);
  const snapshots: PendingSnapshot[] = [];
  const questions: Question[] = [];
  let lastError: unknown = null;
  for (const engine of engines) {
    try {
      const cfg = brightDataConfig(collectorIdFor(engine));
      if ("missing" in cfg) throw new Error(cfg.missing);
      // Se cuenta antes de enviar: un envío que falla a mitad de camino igual puede haberse cobrado.
      await logEvent("checker_brightdata", { n: prompts.length, engine });
      const inputs = prompts.map((p, i) => buildInput(cfg, p, base.country, i + 1));
      const snapshotId = await triggerSnapshot(fetchImpl, cfg, inputs, { timeoutMs: 20_000 });
      snapshots.push({ engine, snapshotId });
      questions.push(...prompts.map((t) => ({ ...noAnswer(t, waiting(engine)), engine })));
    } catch (e) {
      console.error("checker brightdata", engine, e);
      lastError = e;
      const msg = `No pudimos consultar a ${ENGINES[engine].label} en este momento: ${errorFrom(e).message}`;
      questions.push(...prompts.map((t) => ({ ...noAnswer(t, msg), engine })));
    }
  }
  if (!snapshots.length) throw lastError ?? new Error("Sin motores");
  return { ...base, questions, pending: { snapshots, since: now() } };
}

/** Si el chequeo quedó esperando a Bright Data, intenta completarlo. Devuelve el resultado actualizado o null si sigue igual. */
export async function resumeChecker(r: CheckerResult, f?: FetchLike): Promise<CheckerResult | null> {
  const waitingFor = pendingSnapshots(r);
  if (!r.pending || !waitingFor.length) return r.pending ? summarize({ ...r, pending: null }, r.questions) : null;
  const since = r.pending.since;
  const legacy = (r.engine as CheckerEngine) ?? "chatgpt";
  const brand = { name: r.brandName, domain: r.domain, aliases: [] as string[] };
  const fetchImpl = f ?? (fetch as unknown as FetchLike);
  const tooLate = Date.now() - Date.parse(since) > 30 * 60_000;
  let questions = r.questions;
  const still: PendingSnapshot[] = [];
  let changed = false;

  for (const snap of waitingFor) {
    const mine = (q: Question) => (q.engine ?? legacy) === snap.engine;
    const prompts = questions.filter(mine).map((q) => q.text);
    const label = ENGINES[snap.engine].label;
    const replace = (answers: Question[]) => {
      let k = 0;
      questions = questions.map((q) => (mine(q) ? answers[k++] : q));
      changed = true;
    };
    const giveUp = (msg: string) => replace(prompts.map((t) => ({ ...noAnswer(t, msg), engine: snap.engine })));
    const cfg = brightDataConfig(collectorIdFor(snap.engine));
    if ("missing" in cfg) {
      giveUp(cfg.missing);
      continue;
    }
    let done = false;
    try {
      const status = await snapshotStatus(fetchImpl, cfg, snap.snapshotId, { timeoutMs: 10_000 });
      if (status === "ready") {
        const records = await downloadSnapshot(fetchImpl, cfg, snap.snapshotId, { timeoutMs: 20_000 });
        if (records) {
          replace(bdAnswers(snap.engine, records, prompts, brand, Date.parse(since), r.country));
          done = true;
        }
      } else if (status === "failed" || status === "canceled") {
        giveUp(`No se pudo completar la consulta a ${label}.`);
        done = true;
      }
    } catch (e) {
      if (e instanceof BrightDataError && !e.transient) {
        giveUp(errorFrom(e).message);
        done = true;
      }
    }
    if (done) continue;
    if (tooLate) giveUp(`${label} tardó demasiado en responder.`);
    else still.push(snap);
  }
  if (!changed) return null;
  return summarize({ ...r, pending: still.length ? { snapshots: still, since } : null }, questions);
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
  // 1) Bright Data (interfaz web de cada motor elegido), si está configurado y queda cupo del día.
  const wanted = [...new Set(input.engines?.length ? input.engines : (["chatgpt"] as CheckerEngine[]))].filter(
    (e) => CHECKER_ENGINES.includes(e) && !("missing" in brightDataConfig(collectorIdFor(e))),
  );
  const fits = wanted.length ? await brightDataRoom(unbranded.length, wanted.length) : 0;
  if (fits > 0) {
    // Si el cupo del día no alcanza para todos, se consultan los primeros que entran.
    const engines = wanted.slice(0, fits);
    const bdBase = { ...base, engine: engines[0], engines, engineLabel: engineList(engines), method: "brightdata" as const };
    try {
      return await viaBrightData(bdBase, engines, unbranded.map((p) => p.text), opts.fetch);
    } catch (e) {
      bdError = errorFrom(e).message;
      // Si falla, sigue con la API oficial (si hay) o solo con la auditoría.
    }
  }
  const bdLabel = engineList(wanted.length ? wanted : ["chatgpt"]);

  // 2) API oficial, si el servidor tiene una clave.
  const engine = pickCheckerEngine();
  const collector = engine ? apiCollector(`${engine}_api`, engine) : null;
  const questions = await Promise.all(
    unbranded.map(async (p) => {
      if (!collector) return noAnswer(p.text, bdError ? `No pudimos consultar a ${bdLabel} en este momento: ${bdError}` : "Sin motor configurado en este servidor");
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
