// Conector de Bright Data (scrapers de asistentes de IA). Bright Data abre la interfaz web del
// asistente con su propia infraestructura, hace la pregunta y devuelve la respuesta visible con sus
// fuentes. Nosotros solo llamamos a su API: no hace falta navegador ni worker.
//
// Endpoints usados (Web Scraper API de Bright Data, los mismos de su ejemplo oficial
// github.com/brightdata/bright-data-scrape-chatgpt-search-nodejs-project):
//   POST /datasets/v3/trigger?dataset_id=…&include_errors=true   body: [{ url, prompt, country }]  → { snapshot_id }
//   GET  /datasets/v3/progress/{snapshot_id}                                                       → { status }
//   GET  /datasets/v3/snapshot/{snapshot_id}?format=json                                           → [registro, …]
//
// El id del dataset de ChatGPT viene de ese ejemplo oficial. Los de Gemini y Perplexity se copian del
// panel de Bright Data a las variables de entorno (no los inventamos). El formato exacto de cada
// registro se lee de forma defensiva y se valida con una consulta real (Ajustes → Probar).

import { cleanDomain, dedupeSources, domainOf } from "../analyze";
import type { EngineId } from "../config";
import type { Citation, CollectError, CollectInput, CollectResult, Collector } from "./types";

export type BrightDataCollectorId = "brightdata_chatgpt" | "brightdata_gemini" | "brightdata_perplexity";

const API = "https://api.brightdata.com";

/** Id oficial del scraper «ChatGPT AI Search» (ejemplo oficial de Bright Data). */
export const CHATGPT_DATASET_ID = "gd_m7aof0k82r803d5bjm";

const SPECS: Record<BrightDataCollectorId, { engine: EngineId; datasetEnv: string; defaultDataset?: string; urlEnv: string; defaultUrl: string; ownHosts: RegExp }> = {
  brightdata_chatgpt: {
    engine: "chatgpt",
    datasetEnv: "BRIGHTDATA_DATASET_CHATGPT",
    defaultDataset: CHATGPT_DATASET_ID,
    urlEnv: "BRIGHTDATA_URL_CHATGPT",
    defaultUrl: "https://chatgpt.com/",
    ownHosts: /(^|\.)(chatgpt\.com|openai\.com)$/i,
  },
  brightdata_gemini: {
    engine: "gemini",
    datasetEnv: "BRIGHTDATA_DATASET_GEMINI",
    urlEnv: "BRIGHTDATA_URL_GEMINI",
    defaultUrl: "https://gemini.google.com/",
    ownHosts: /(^|\.)gemini\.google\.com$/i,
  },
  brightdata_perplexity: {
    engine: "perplexity",
    datasetEnv: "BRIGHTDATA_DATASET_PERPLEXITY",
    urlEnv: "BRIGHTDATA_URL_PERPLEXITY",
    defaultUrl: "https://www.perplexity.ai/",
    ownHosts: /(^|\.)perplexity\.ai$/i,
  },
};

export const BRIGHTDATA_IDS = Object.keys(SPECS) as BrightDataCollectorId[];

export function isBrightDataId(id: string): id is BrightDataCollectorId {
  return id in SPECS;
}

export type BrightDataConfig = { token: string; datasetId: string; targetUrl: string; engine: EngineId; costPerRecord: number };

/** Configuración del conector, o el motivo por el que no está configurado. */
export function brightDataConfig(id: BrightDataCollectorId, env: NodeJS.ProcessEnv = process.env): BrightDataConfig | { missing: string } {
  const spec = SPECS[id];
  const token = env.BRIGHTDATA_API_TOKEN?.trim();
  if (!token) return { missing: "Falta BRIGHTDATA_API_TOKEN en las variables de entorno." };
  const datasetId = env[spec.datasetEnv]?.trim() || spec.defaultDataset;
  if (!datasetId) return { missing: `Falta ${spec.datasetEnv}: copiá el id del scraper (gd_…) desde el panel de Bright Data.` };
  const cost = Number(env.BRIGHTDATA_COST_PER_RECORD);
  return {
    token,
    datasetId,
    targetUrl: env[spec.urlEnv]?.trim() || spec.defaultUrl,
    engine: spec.engine,
    costPerRecord: Number.isFinite(cost) && cost >= 0 ? cost : 0.0015,
  };
}

// ---------------------------------------------------------------------------
// Cliente HTTP mínimo
// ---------------------------------------------------------------------------

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export class BrightDataError extends Error {
  constructor(
    message: string,
    public status: number,
    public transient: boolean,
  ) {
    super(message);
  }
}

async function call(f: FetchLike, cfg: Pick<BrightDataConfig, "token">, method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
  let res;
  try {
    res = await f(API + path, {
      method,
      headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/json", accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    throw new BrightDataError(`No se pudo conectar con Bright Data: ${(e as Error).message}`, 0, true);
  }
  const text = await res.text();
  if (!res.ok) {
    // 401/403: token inválido o sin permisos → no sirve reintentar. 429/5xx: transitorio.
    const transient = res.status === 429 || res.status >= 500;
    throw new BrightDataError(`Bright Data respondió ${res.status}: ${text.slice(0, 300)}`, res.status, transient);
  }
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    // El snapshot puede venir como NDJSON.
    return text
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));
  }
}

export type BrightDataInput = { url: string; prompt: string; country: string };

export function buildInput(cfg: Pick<BrightDataConfig, "targetUrl">, prompt: string, country: string): BrightDataInput {
  return { url: cfg.targetUrl, prompt, country: (country || "").toUpperCase() };
}

export async function triggerSnapshot(f: FetchLike, cfg: BrightDataConfig, inputs: BrightDataInput[], signal?: AbortSignal): Promise<string> {
  const q = new URLSearchParams({ dataset_id: cfg.datasetId, include_errors: "true" });
  const r = (await call(f, cfg, "POST", `/datasets/v3/trigger?${q}`, inputs, signal)) as { snapshot_id?: string } | null;
  if (!r?.snapshot_id) throw new BrightDataError("Bright Data no devolvió snapshot_id.", 200, true);
  return r.snapshot_id;
}

/** "ready" | "running" | "failed" | otro estado que informe Bright Data. */
export async function snapshotStatus(f: FetchLike, cfg: Pick<BrightDataConfig, "token">, snapshotId: string, signal?: AbortSignal): Promise<string> {
  const r = (await call(f, cfg, "GET", `/datasets/v3/progress/${encodeURIComponent(snapshotId)}`, undefined, signal)) as { status?: string } | null;
  return String(r?.status ?? "unknown");
}

export async function downloadSnapshot(f: FetchLike, cfg: Pick<BrightDataConfig, "token">, snapshotId: string, signal?: AbortSignal): Promise<BrightDataRecord[]> {
  const r = await call(f, cfg, "GET", `/datasets/v3/snapshot/${encodeURIComponent(snapshotId)}?format=json`, undefined, signal);
  return Array.isArray(r) ? (r as BrightDataRecord[]) : [];
}

// ---------------------------------------------------------------------------
// Lectura de un registro
// ---------------------------------------------------------------------------

export type BrightDataRecord = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** La pregunta a la que corresponde el registro (para emparejarlo con la ejecución). */
export function recordPrompt(r: BrightDataRecord): string | null {
  const input = r.input as Record<string, unknown> | undefined;
  return str(r.prompt) ?? str(input?.prompt) ?? null;
}

export const normalizePrompt = (p: string) => p.replace(/\s+/g, " ").trim().toLowerCase();

function linkList(v: unknown): { url: string; title?: string }[] {
  if (!Array.isArray(v)) return [];
  const out: { url: string; title?: string }[] = [];
  for (const item of v) {
    if (typeof item === "string") {
      out.push({ url: item });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const url = str(o.url) ?? str(o.link) ?? str(o.href);
    if (url) out.push({ url, title: str(o.title) ?? str(o.text) ?? str(o.name) ?? undefined });
  }
  return out;
}

function cleanUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    for (const k of [...u.searchParams.keys()]) if (/^utm_/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return null;
  }
}

export function recordCitations(r: BrightDataRecord, ownHosts: RegExp): Citation[] {
  const links = [...linkList(r.citations), ...linkList(r.sources), ...linkList(r.search_sources), ...linkList(r.links_attached)];
  const out: Citation[] = [];
  for (const l of links) {
    const url = cleanUrl(l.url);
    if (!url) continue;
    const host = new URL(url).hostname;
    if (ownHosts.test(host)) continue;
    out.push({ url, title: l.title, domain: domainOf(url) || cleanDomain(host) });
  }
  return dedupeSources(out);
}

function recordError(r: BrightDataRecord): CollectError | null {
  const msg = str(r.error) ?? str(r.error_code) ?? str((r.warning as string) ?? null);
  if (!msg && !r.error_code) return null;
  const code = String(r.error_code ?? r.error ?? "");
  const text = msg ?? code;
  if (/captcha/i.test(text)) return { code: "captcha", message: `Bright Data: ${text}`, transient: true };
  if (/login|sign.?in/i.test(text)) return { code: "login_requerido", message: `Bright Data: ${text}`, transient: true };
  if (/rate|limit|quota|429/i.test(text)) return { code: "limite_de_uso", message: `Bright Data: ${text}`, transient: true };
  if (/timeout|timed out/i.test(text)) return { code: "timeout", message: `Bright Data: ${text}`, transient: true };
  return { code: "api_error", message: `Bright Data: ${text}`.slice(0, 400), transient: true };
}

export function recordToResult(r: BrightDataRecord, id: BrightDataCollectorId, cfg: Pick<BrightDataConfig, "costPerRecord">, startedAt: number, requestedCountry: string): CollectResult {
  const spec = SPECS[id];
  const answer = str(r.answer_text_markdown) ?? str(r.answer_text) ?? str(r.answer) ?? str(r.response) ?? null;
  const err = recordError(r);
  const country = str(r.country)?.toUpperCase() ?? (requestedCountry ? requestedCountry.toUpperCase() : null);
  const ws = r.web_search_triggered;
  const base = {
    citations: [] as Citation[],
    screenshotReference: null,
    collectedAt: str(r.timestamp) ?? new Date().toISOString(),
    engine: spec.engine,
    modelIfVisible: str(r.model),
    collectionMethod: "third_party_capture" as const,
    observedCountry: country,
    locationVerification: country ? ("declarada_por_proveedor" as const) : ("no_verificada" as const),
    searchMode: ws === true ? "busqueda_web_observada" : ws === false ? "sin_busqueda_observada" : "no_observable",
    sessionType: "proveedor" as const,
    duration: Date.now() - startedAt,
    costUsd: cfg.costPerRecord,
  };
  if (!answer) {
    return {
      ...base,
      status: "failed",
      answerText: null,
      error: err ?? { code: "respuesta_vacia", message: "Bright Data devolvió el registro sin texto de respuesta.", transient: true },
      // Los registros con error no se cobran como exitosos.
      costUsd: 0,
    };
  }
  return { ...base, status: "completed", answerText: answer, citations: recordCitations(r, spec.ownHosts), error: null };
}

export function failureResult(id: BrightDataCollectorId, error: CollectError, startedAt: number): CollectResult {
  return {
    status: "failed",
    answerText: null,
    citations: [],
    screenshotReference: null,
    collectedAt: new Date().toISOString(),
    engine: SPECS[id].engine,
    modelIfVisible: null,
    collectionMethod: "third_party_capture",
    observedCountry: null,
    locationVerification: "no_verificada",
    searchMode: "no_observable",
    sessionType: "proveedor",
    duration: Date.now() - startedAt,
    error,
    costUsd: 0,
  };
}

export function errorFrom(e: unknown): CollectError {
  if (e instanceof BrightDataError) {
    if (e.status === 401 || e.status === 403) return { code: "sin_credenciales", message: e.message, transient: false };
    if (e.status === 429) return { code: "limite_de_uso", message: e.message, transient: true };
    return { code: e.status === 0 ? "red" : "api_error", message: e.message, transient: e.transient };
  }
  return { code: "desconocido", message: String((e as Error)?.message ?? e).slice(0, 300), transient: true };
}

// ---------------------------------------------------------------------------
// Conector para una sola ejecución (prueba de conexión y worker opcional)
// ---------------------------------------------------------------------------

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });

export function brightDataCollector(id: BrightDataCollectorId, opts: { fetch?: FetchLike; pollMs?: number; maxWaitMs?: number; env?: NodeJS.ProcessEnv } = {}): Collector {
  const f: FetchLike = opts.fetch ?? (fetch as unknown as FetchLike);
  const pollMs = opts.pollMs ?? 5000;
  const maxWaitMs = opts.maxWaitMs ?? Number(process.env.BRIGHTDATA_MAX_WAIT_MS || 240_000);
  return {
    id,
    engine: SPECS[id].engine,
    method: "third_party_capture",
    async collect(input: CollectInput, ctx): Promise<CollectResult> {
      const started = Date.now();
      const cfg = brightDataConfig(id, opts.env);
      if ("missing" in cfg) return failureResult(id, { code: "sin_credenciales", message: cfg.missing, transient: false }, started);
      try {
        const snap = await triggerSnapshot(f, cfg, [buildInput(cfg, input.prompt, input.requestedCountry)], ctx.signal);
        ctx.log(`Bright Data snapshot ${snap}`);
        for (;;) {
          if (ctx.signal.aborted) return failureResult(id, { code: "interrumpido", message: "Se canceló la espera de Bright Data.", transient: true }, started);
          const status = await snapshotStatus(f, cfg, snap, ctx.signal);
          if (status === "ready") break;
          if (status === "failed") return failureResult(id, { code: "api_error", message: `Bright Data marcó el snapshot ${snap} como fallido.`, transient: true }, started);
          if (Date.now() - started > maxWaitMs)
            return failureResult(id, { code: "timeout", message: `Bright Data no terminó en ${Math.round(maxWaitMs / 1000)} s (snapshot ${snap}).`, transient: true }, started);
          await sleep(pollMs, ctx.signal);
        }
        const records = await downloadSnapshot(f, cfg, snap, ctx.signal);
        if (!records.length) return failureResult(id, { code: "respuesta_vacia", message: `El snapshot ${snap} vino vacío.`, transient: true }, started);
        return recordToResult(records[0], id, cfg, started, input.requestedCountry);
      } catch (e) {
        return failureResult(id, errorFrom(e), started);
      }
    },
  };
}
