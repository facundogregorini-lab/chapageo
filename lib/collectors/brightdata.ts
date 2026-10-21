// Conector de Bright Data (scrapers de asistentes de IA). Bright Data abre la interfaz web del
// asistente con su propia infraestructura, hace la pregunta y devuelve la respuesta visible con sus
// fuentes. Nosotros solo llamamos a su API: no hace falta navegador ni worker.
//
// Endpoints usados (Web Scraper API, docs.brightdata.com → Scrapers → Synchronous / Asynchronous):
//   POST /datasets/v3/scrape?dataset_id=…&notify=false&include_errors=true&format=json   body: { input: [...] }
//        → 200 con los registros, o 202 + { snapshot_id } si tarda más de ~1 minuto (sigue en segundo plano)
//   POST /datasets/v3/trigger?dataset_id=…&include_errors=true                            body: { input: [...] } → { snapshot_id }
//   GET  /datasets/v3/progress/{snapshot_id}   → { status: starting | running | ready | failed }
//   GET  /datasets/v3/snapshot/{snapshot_id}?format=json → [registro, …] (202 mientras no está listo)
//
// Una consulta suelta (prueba de conexión, worker) usa el modo sincrónico y, si Bright Data contesta
// 202, sigue por el snapshot sin volver a pedir (y sin volver a pagar). Los análisis completos van
// en lote por /trigger (lib/brightdata-batch.ts).
//
// Los ids de dataset son los del panel de Bright Data y se pueden cambiar por variables de entorno.
// Los campos de salida varían entre proveedores: el registro se lee de forma defensiva.

import { cleanDomain, dedupeSources, domainOf } from "../analyze";
import type { EngineId } from "../config";
import type { Citation, CollectError, CollectInput, CollectResult, Collector } from "./types";

export type BrightDataCollectorId = "brightdata_chatgpt" | "brightdata_gemini" | "brightdata_perplexity";
export type BrightDataProvider = "chatgpt" | "gemini" | "perplexity";

const API = "https://api.brightdata.com";

/** Ids de los scrapers en el panel de Bright Data («ChatGPT / Gemini / Perplexity search by prompt»). */
export const CHATGPT_DATASET_ID = "gd_m7aof0k82r803d5bjm";
export const GEMINI_DATASET_ID = "gd_mbz66arm2mf9cu856y";
export const PERPLEXITY_DATASET_ID = "gd_m7dhdot1vw9a7gc1n";

const SPECS: Record<BrightDataCollectorId, { engine: BrightDataProvider; datasetEnv: string; defaultDataset: string; urlEnv: string; defaultUrl: string; ownHosts: RegExp }> = {
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
    defaultDataset: GEMINI_DATASET_ID,
    urlEnv: "BRIGHTDATA_URL_GEMINI",
    defaultUrl: "https://gemini.google.com/",
    ownHosts: /(^|\.)gemini\.google\.com$/i,
  },
  brightdata_perplexity: {
    engine: "perplexity",
    datasetEnv: "BRIGHTDATA_DATASET_PERPLEXITY",
    defaultDataset: PERPLEXITY_DATASET_ID,
    urlEnv: "BRIGHTDATA_URL_PERPLEXITY",
    defaultUrl: "https://www.perplexity.ai",
    ownHosts: /(^|\.)perplexity\.ai$/i,
  },
};

export const BRIGHTDATA_IDS = Object.keys(SPECS) as BrightDataCollectorId[];

export function isBrightDataId(id: string): id is BrightDataCollectorId {
  return id in SPECS;
}

export function collectorIdFor(provider: BrightDataProvider): BrightDataCollectorId {
  return `brightdata_${provider}`;
}

export type BrightDataConfig = {
  id: BrightDataCollectorId;
  token: string;
  datasetId: string;
  targetUrl: string;
  engine: EngineId;
  /** Solo ChatGPT: pide forzar la búsqueda web (por defecto la decide ChatGPT, como para cualquier usuario). */
  webSearch: boolean;
  costPerRecord: number;
};

/** La key se lee de BRIGHTDATA_API_KEY (o BRIGHTDATA_API_TOKEN, el nombre anterior). */
export function brightDataToken(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.BRIGHTDATA_API_KEY?.trim() || env.BRIGHTDATA_API_TOKEN?.trim() || null;
}

/** Configuración del conector, o el motivo por el que no está configurado. */
export function brightDataConfig(id: BrightDataCollectorId, env: NodeJS.ProcessEnv = process.env): BrightDataConfig | { missing: string } {
  const spec = SPECS[id];
  const token = brightDataToken(env);
  if (!token) return { missing: "Falta la key del servicio de captura (BRIGHTDATA_API_KEY) en las variables de entorno." };
  const datasetId = env[spec.datasetEnv]?.trim() || spec.defaultDataset;
  const cost = Number(env.BRIGHTDATA_COST_PER_RECORD);
  return {
    id,
    token,
    datasetId,
    targetUrl: env[spec.urlEnv]?.trim() || spec.defaultUrl,
    engine: spec.engine,
    webSearch: /^(1|true|si|sí)$/i.test(env.BRIGHTDATA_CHATGPT_WEB_SEARCH?.trim() ?? ""),
    costPerRecord: Number.isFinite(cost) && cost >= 0 ? cost : 0.0015,
  };
}

// ---------------------------------------------------------------------------
// Cliente HTTP: timeout por pedido y reintentos acotados
// ---------------------------------------------------------------------------

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export class BrightDataError extends Error {
  constructor(
    message: string,
    public status: number,
    public transient: boolean,
    public code?: CollectError["code"],
  ) {
    super(message);
  }
}

export type RequestOpts = {
  signal?: AbortSignal;
  /** Tiempo máximo de cada pedido HTTP. */
  timeoutMs?: number;
  /** Base de la espera entre reintentos (1 s → 1 s, 2 s). Se puede bajar en tests. */
  retryBaseMs?: number;
};

type Resp = { status: number; data: unknown; retryAfterMs: number | null };

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });

function parseBody(text: string): unknown {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    // Los registros pueden venir como NDJSON.
    try {
      return text
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l));
    } catch {
      return text;
    }
  }
}

function retryAfter(h: string | null | undefined): number | null {
  const n = Number(h);
  return Number.isFinite(n) && n >= 0 ? n * 1000 : null;
}

/**
 * Un pedido a la API. Reintenta como máximo 2 veces los GET (red, 429, 5xx) y 1 vez los POST, y en
 * los POST solo cuando Bright Data dice que no lo procesó (429, 502, 503): así un reintento nunca
 * duplica una consulta cobrada.
 */
async function request(f: FetchLike, token: string, method: "GET" | "POST", path: string, body: unknown, o: RequestOpts = {}): Promise<Resp> {
  const isPost = method === "POST";
  const maxRetries = isPost ? 1 : 2;
  const retryable = (status: number) => (isPost ? status === 429 || status === 502 || status === 503 : status === 0 || status === 429 || status >= 500);
  const timeoutMs = o.timeoutMs ?? 30_000;
  const base = o.retryBaseMs ?? 1000;
  for (let attempt = 0; ; attempt++) {
    const timer = new AbortController();
    const t = setTimeout(() => timer.abort(new DOMException("timeout", "TimeoutError")), timeoutMs);
    const signals = [timer.signal, ...(o.signal ? [o.signal] : [])];
    let err: BrightDataError;
    try {
      const res = await f(API + path, {
        method,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.any(signals),
      });
      const text = await res.text();
      const ra = retryAfter(res.headers?.get("retry-after"));
      if (res.ok) return { status: res.status, data: parseBody(text), retryAfterMs: ra };
      // 401/403: key inválida o sin permisos; 400/404: pedido mal armado. Reintentar no sirve.
      err = new BrightDataError(`El servicio de captura respondió ${res.status}: ${text.slice(0, 300)}`, res.status, res.status === 429 || res.status >= 500);
      if (attempt < maxRetries && retryable(res.status)) {
        await sleep(Math.min(ra ?? base * 2 ** attempt, 10_000), o.signal);
        continue;
      }
    } catch (e) {
      if (o.signal?.aborted) throw new BrightDataError("Se canceló el pedido al servicio de captura.", 0, true, "interrumpido");
      const timedOut = timer.signal.aborted;
      err = timedOut
        ? new BrightDataError(`El servicio de captura no respondió en ${Math.round(timeoutMs / 1000)} s.`, 0, true, "timeout")
        : new BrightDataError(`No se pudo conectar con el servicio de captura: ${(e as Error).message}`, 0, true);
      // Un POST cortado por red pudo haber llegado: no se repite (lo reintenta la cola, con su tope).
      if (!isPost && attempt < maxRetries) {
        await sleep(base * 2 ** attempt, o.signal);
        continue;
      }
    } finally {
      clearTimeout(t);
    }
    throw err;
  }
}

export type BrightDataInput = Record<string, string | number | boolean>;

/** Entrada en el formato que muestra el panel de cada scraper. */
export function buildInput(cfg: Pick<BrightDataConfig, "engine" | "targetUrl" | "webSearch">, prompt: string, country: string, index = 1): BrightDataInput {
  if (cfg.engine === "chatgpt") return { url: cfg.targetUrl, prompt, country: (country || "").toUpperCase(), web_search: cfg.webSearch, additional_prompt: "" };
  if (cfg.engine === "gemini") return { url: cfg.targetUrl, prompt, index };
  return { url: cfg.targetUrl, prompt };
}

function asRecords(data: unknown): BrightDataRecord[] {
  if (Array.isArray(data)) return data.filter((r) => r && typeof r === "object") as BrightDataRecord[];
  if (data && typeof data === "object") return [data as BrightDataRecord];
  return [];
}

/** Modo sincrónico: los registros, o el snapshot si Bright Data pasó la consulta a segundo plano (202). */
export async function scrapeSync(f: FetchLike, cfg: BrightDataConfig, inputs: BrightDataInput[], o: RequestOpts = {}): Promise<{ records: BrightDataRecord[] } | { snapshotId: string; retryAfterMs: number | null }> {
  const q = new URLSearchParams({ dataset_id: cfg.datasetId, notify: "false", include_errors: "true", format: "json" });
  // Bright Data corta a ~60 s y contesta 202; dejamos margen antes de abortar nosotros.
  const r = await request(f, cfg.token, "POST", `/datasets/v3/scrape?${q}`, { input: inputs }, { ...o, timeoutMs: o.timeoutMs ?? 90_000 });
  const snap = !Array.isArray(r.data) && r.data && typeof r.data === "object" ? (r.data as { snapshot_id?: unknown }).snapshot_id : undefined;
  if (r.status === 202 || typeof snap === "string") {
    if (typeof snap !== "string" || !snap) throw new BrightDataError("El servicio de captura pasó la consulta a segundo plano sin snapshot_id.", r.status, true);
    return { snapshotId: snap, retryAfterMs: r.retryAfterMs };
  }
  return { records: asRecords(r.data) };
}

export async function triggerSnapshot(f: FetchLike, cfg: BrightDataConfig, inputs: BrightDataInput[], o: RequestOpts = {}): Promise<string> {
  const q = new URLSearchParams({ dataset_id: cfg.datasetId, include_errors: "true" });
  const r = await request(f, cfg.token, "POST", `/datasets/v3/trigger?${q}`, { input: inputs }, o);
  const snap = (r.data as { snapshot_id?: unknown } | null)?.snapshot_id;
  if (typeof snap !== "string" || !snap) throw new BrightDataError("El servicio de captura no devolvió snapshot_id.", r.status, true);
  return snap;
}

/** "starting" | "running" | "ready" | "failed" | otro estado que informe Bright Data. */
export async function snapshotStatus(f: FetchLike, cfg: Pick<BrightDataConfig, "token">, snapshotId: string, o: RequestOpts = {}): Promise<string> {
  const r = await request(f, cfg.token, "GET", `/datasets/v3/progress/${encodeURIComponent(snapshotId)}`, undefined, o);
  return String((r.data as { status?: unknown } | null)?.status ?? "unknown");
}

/** Los registros del snapshot, o null si todavía no está listo para bajar. */
export async function downloadSnapshot(f: FetchLike, cfg: Pick<BrightDataConfig, "token">, snapshotId: string, o: RequestOpts = {}): Promise<BrightDataRecord[] | null> {
  const r = await request(f, cfg.token, "GET", `/datasets/v3/snapshot/${encodeURIComponent(snapshotId)}?format=json`, undefined, { ...o, timeoutMs: o.timeoutMs ?? 60_000 });
  if (r.status === 202) return null;
  if (r.data && typeof r.data === "object" && !Array.isArray(r.data) && "status" in r.data && !("prompt" in r.data)) return null;
  return asRecords(r.data);
}

/** Espera un snapshot hasta `deadline` (epoch ms) y devuelve sus registros. */
export async function waitForSnapshot(
  f: FetchLike,
  cfg: Pick<BrightDataConfig, "token">,
  snapshotId: string,
  o: RequestOpts & { pollMs: number; deadline: number; firstWaitMs?: number },
): Promise<BrightDataRecord[]> {
  await sleep(Math.min(o.firstWaitMs ?? 0, Math.max(0, o.deadline - Date.now())), o.signal);
  for (;;) {
    if (o.signal?.aborted) throw new BrightDataError("Se canceló la espera del servicio de captura.", 0, true, "interrumpido");
    const status = await snapshotStatus(f, cfg, snapshotId, o);
    if (status === "ready") {
      const records = await downloadSnapshot(f, cfg, snapshotId, o);
      if (records) return records;
    } else if (status === "failed" || status === "canceled") {
      throw new BrightDataError(`El servicio de captura marcó el snapshot ${snapshotId} como ${status === "failed" ? "fallido" : "cancelado"}.`, 200, true, "api_error");
    }
    if (Date.now() >= o.deadline) throw new BrightDataError(`El servicio de captura no terminó a tiempo (snapshot ${snapshotId}, sigue disponible 30 días).`, 0, true, "timeout");
    await sleep(Math.min(o.pollMs, Math.max(0, o.deadline - Date.now())), o.signal);
  }
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

/** Texto de la respuesta. Los nombres cambian entre scrapers; preferimos texto plano sobre markdown. */
export function recordText(r: BrightDataRecord): string | null {
  return str(r.answer_text) ?? str(r.answer_text_markdown) ?? str(r.answer_markdown) ?? str(r.answer) ?? str(r.response_text) ?? str(r.response) ?? null;
}

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
    const url = str(o.url) ?? str(o.link) ?? str(o.href) ?? str(o.source_url);
    if (url) out.push({ url, title: str(o.title) ?? str(o.text) ?? str(o.name) ?? undefined });
  }
  return out;
}

function cleanUrl(raw: string): string | null {
  try {
    let u = new URL(raw);
    // Links de Google que redirigen (frecuentes en Gemini): nos quedamos con el destino.
    if (/(^|\.)google\.[a-z.]+$/i.test(u.hostname) && u.pathname === "/url") {
      const dest = u.searchParams.get("q") ?? u.searchParams.get("url");
      if (dest) u = new URL(dest);
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    for (const k of [...u.searchParams.keys()]) if (/^utm_/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return null;
  }
}

const CITATION_FIELDS = ["citations", "sources", "search_sources", "links_attached", "references"];

export function recordCitations(r: BrightDataRecord, ownHosts: RegExp): Citation[] {
  const out: Citation[] = [];
  for (const field of CITATION_FIELDS) {
    for (const l of linkList(r[field])) {
      const url = cleanUrl(l.url);
      if (!url) continue;
      const host = new URL(url).hostname;
      if (ownHosts.test(host)) continue;
      out.push({ url, title: l.title, domain: domainOf(url) || cleanDomain(host) });
    }
  }
  return dedupeSources(out);
}

function recordError(r: BrightDataRecord): CollectError | null {
  const msg = str(r.error) ?? str(r.error_code) ?? str((r.warning as string) ?? null);
  if (!msg && !r.error_code) return null;
  const code = String(r.error_code ?? r.error ?? "");
  const text = msg ?? code;
  if (/captcha/i.test(text)) return { code: "captcha", message: `Servicio de captura: ${text}`, transient: true };
  if (/login|sign.?in/i.test(text)) return { code: "login_requerido", message: `Servicio de captura: ${text}`, transient: true };
  if (/rate|limit|quota|429/i.test(text)) return { code: "limite_de_uso", message: `Servicio de captura: ${text}`, transient: true };
  if (/timeout|timed out/i.test(text)) return { code: "timeout", message: `Servicio de captura: ${text}`, transient: true };
  return { code: "api_error", message: `Servicio de captura: ${text}`.slice(0, 400), transient: true };
}

export function recordToResult(r: BrightDataRecord, id: BrightDataCollectorId, cfg: Pick<BrightDataConfig, "costPerRecord">, startedAt: number, requestedCountry: string): CollectResult {
  const spec = SPECS[id];
  const answer = recordText(r);
  const err = recordError(r);
  // País: el que informa el registro; si no, el que le pedimos (solo el scraper de ChatGPT lo recibe).
  const country = str(r.country)?.toUpperCase() ?? (spec.engine === "chatgpt" && requestedCountry ? requestedCountry.toUpperCase() : null);
  const ws = r.web_search_triggered ?? r.web_search;
  const base = {
    citations: [] as Citation[],
    screenshotReference: null,
    collectedAt: str(r.timestamp) ?? str(r.prompt_sent_at) ?? new Date().toISOString(),
    engine: spec.engine,
    modelIfVisible: str(r.model),
    collectionMethod: "third_party_capture" as const,
    observedCountry: country,
    locationVerification: country ? ("declarada_por_proveedor" as const) : ("no_verificada" as const),
    searchMode: ws === true ? "busqueda_web_observada" : ws === false ? "sin_busqueda_observada" : "no_observable",
    sessionType: "proveedor" as const,
    duration: Date.now() - startedAt,
    costUsd: cfg.costPerRecord,
    raw: r,
  };
  if (!answer) {
    return {
      ...base,
      status: "failed",
      answerText: null,
      error: err ?? { code: "respuesta_vacia", message: "El servicio de captura devolvió el registro sin texto de respuesta.", transient: true },
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
    if (e.code) return { code: e.code, message: e.message, transient: e.transient };
    if (e.status === 401 || e.status === 403) return { code: "sin_credenciales", message: e.message, transient: false };
    if (e.status === 429) return { code: "limite_de_uso", message: e.message, transient: true };
    return { code: e.status === 0 ? "red" : "api_error", message: e.message, transient: e.transient };
  }
  return { code: "desconocido", message: String((e as Error)?.message ?? e).slice(0, 300), transient: true };
}

// ---------------------------------------------------------------------------
// Una consulta suelta: sincrónico con paso a asíncrono
// ---------------------------------------------------------------------------

export type QueryOpts = RequestOpts & {
  fetch?: FetchLike;
  env?: NodeJS.ProcessEnv;
  /** País pedido (solo lo usa el scraper de ChatGPT). */
  country?: string;
  /** Cada cuánto se consulta el snapshot si Bright Data pasó la consulta a segundo plano. */
  pollMs?: number;
  /** Espera total máxima, contando el pedido sincrónico. */
  maxWaitMs?: number;
  log?: (msg: string) => void;
};

/** Hace una pregunta y devuelve el registro crudo de Bright Data. Lanza BrightDataError si falla. */
export async function fetchRecord(cfg: BrightDataConfig, prompt: string, o: QueryOpts = {}): Promise<{ record: BrightDataRecord; mode: "sync" | "async"; snapshotId: string | null }> {
  const f = o.fetch ?? (fetch as unknown as FetchLike);
  const started = Date.now();
  const maxWaitMs = o.maxWaitMs ?? 240_000;
  const req = { signal: o.signal, retryBaseMs: o.retryBaseMs, timeoutMs: o.timeoutMs };
  const first = await scrapeSync(f, cfg, [buildInput(cfg, prompt, o.country ?? "AR")], req);
  let records: BrightDataRecord[];
  let snapshotId: string | null = null;
  if ("records" in first) records = first.records;
  else {
    snapshotId = first.snapshotId;
    o.log?.(`El servicio de captura pasó la consulta a segundo plano (snapshot ${snapshotId})`);
    records = await waitForSnapshot(f, cfg, snapshotId, { ...req, pollMs: o.pollMs ?? 5000, deadline: started + maxWaitMs, firstWaitMs: first.retryAfterMs ?? undefined });
  }
  const wanted = normalizePrompt(prompt);
  const record = records.find((r) => normalizePrompt(recordPrompt(r) ?? "") === wanted) ?? records[0];
  if (!record) throw new BrightDataError(`El servicio de captura no devolvió registros${snapshotId ? ` (snapshot ${snapshotId})` : ""}.`, 200, true, "respuesta_vacia");
  return { record, mode: snapshotId ? "async" : "sync", snapshotId };
}

/** Respuesta normalizada, igual para los tres proveedores. */
export type BrightDataAnswer = {
  provider: BrightDataProvider;
  prompt: string;
  text: string;
  citations: Citation[];
  /** Cuándo se hizo la consulta (la informa Bright Data; si no, cuándo llegó). */
  timestamp: string;
  model: string | null;
  mode: "sync" | "async";
  snapshotId: string | null;
  costUsd: number;
  raw: BrightDataRecord;
};

/**
 * Cliente simple: (proveedor, pregunta) → respuesta normalizada. Prueba primero el modo sincrónico
 * y, si Bright Data contesta 202, sigue el snapshot hasta `maxWaitMs`. Lanza BrightDataError
 * (con `code` y `transient`) si no hay respuesta utilizable.
 */
export async function queryBrightData(provider: BrightDataProvider, prompt: string, o: QueryOpts = {}): Promise<BrightDataAnswer> {
  const id = collectorIdFor(provider);
  const cfg = brightDataConfig(id, o.env);
  if ("missing" in cfg) throw new BrightDataError(cfg.missing, 0, false, "sin_credenciales");
  const started = Date.now();
  const { record, mode, snapshotId } = await fetchRecord(cfg, prompt, o);
  const r = recordToResult(record, id, cfg, started, o.country ?? "AR");
  if (r.status !== "completed" || !r.answerText) {
    const err = r.error ?? { code: "respuesta_vacia" as const, message: "El servicio de captura no devolvió texto.", transient: true };
    throw new BrightDataError(err.message, 200, err.transient, err.code);
  }
  return { provider, prompt, text: r.answerText, citations: r.citations, timestamp: r.collectedAt, model: r.modelIfVisible, mode, snapshotId, costUsd: r.costUsd ?? 0, raw: record };
}

// ---------------------------------------------------------------------------
// Conector para una sola ejecución (prueba de conexión y worker opcional)
// ---------------------------------------------------------------------------

export function brightDataCollector(id: BrightDataCollectorId, opts: { fetch?: FetchLike; pollMs?: number; maxWaitMs?: number; retryBaseMs?: number; env?: NodeJS.ProcessEnv } = {}): Collector {
  return {
    id,
    engine: SPECS[id].engine,
    method: "third_party_capture",
    async collect(input: CollectInput, ctx): Promise<CollectResult> {
      const started = Date.now();
      const cfg = brightDataConfig(id, opts.env);
      if ("missing" in cfg) return failureResult(id, { code: "sin_credenciales", message: cfg.missing, transient: false }, started);
      try {
        const { record } = await fetchRecord(cfg, input.prompt, {
          fetch: opts.fetch,
          country: input.requestedCountry,
          signal: ctx.signal,
          pollMs: opts.pollMs,
          maxWaitMs: opts.maxWaitMs ?? Number(process.env.BRIGHTDATA_MAX_WAIT_MS || 240_000),
          retryBaseMs: opts.retryBaseMs,
          log: ctx.log,
        });
        return recordToResult(record, id, cfg, started, input.requestedCountry);
      } catch (e) {
        return failureResult(id, errorFrom(e), started);
      }
    },
  };
}
