// Prueba de conexión de Bright Data: UNA consulta neutral (≈ USD 0,0015), sin datos de agencias.
// Si vuelve una respuesta con texto, el motor queda disponible para elegir en los análisis.

import { brightDataCollector, type BrightDataCollectorId, type FetchLike } from "./collectors/brightdata";
import { one, parseJson } from "./db";
import { setCollectorStatus } from "./queue";

export const PROBE_PROMPT = "¿Cuáles son los mejores bancos digitales para abrir una cuenta en Argentina?";
const MIN_INTERVAL_MS = 5 * 60_000;

export type ProbeOutcome = {
  ok: boolean;
  message: string;
  model?: string | null;
  country?: string | null;
  citations?: number;
  excerpt?: string;
  searchMode?: string;
  seconds?: number;
};

export async function probeBrightData(id: BrightDataCollectorId, opts: { fetch?: FetchLike; env?: NodeJS.ProcessEnv; pollMs?: number; maxWaitMs?: number } = {}): Promise<ProbeOutcome> {
  // Una prueba cada 5 minutos por motor: evita gastar consultas con clics repetidos.
  const prev = await one<{ details: string }>("SELECT details FROM collector_status WHERE collector = ?", [id]);
  const last = Date.parse(String(parseJson<{ probedAt?: string }>(prev?.details, {}).probedAt ?? ""));
  if (Number.isFinite(last) && Date.now() - last < MIN_INTERVAL_MS) {
    return { ok: false, message: "Ya se probó hace menos de 5 minutos. Esperá un poco antes de volver a probar." };
  }
  const probedAt = new Date().toISOString();
  const collector = brightDataCollector(id, { fetch: opts.fetch, env: opts.env, pollMs: opts.pollMs ?? 4000, maxWaitMs: opts.maxWaitMs ?? 100_000 });
  const r = await collector.collect(
    { prompt: PROBE_PROMPT, engine: collector.engine, requestedCountry: "AR", language: "es", runId: "probe", jobId: `probe-${probedAt}` },
    { saveEvidence: async () => "", signal: new AbortController().signal, log: () => undefined },
  );
  const details = { probedAt, model: r.modelIfVisible, country: r.observedCountry, citations: r.citations.length, searchMode: r.searchMode, error: r.error };
  if (r.status === "completed" && r.answerText) {
    await setCollectorStatus(id, "available", null, "brightdata", { verified: true, details });
    return {
      ok: true,
      message: "Funciona: Bright Data devolvió una respuesta real. El motor ya se puede elegir en los análisis.",
      model: r.modelIfVisible,
      country: r.observedCountry,
      citations: r.citations.length,
      excerpt: r.answerText.slice(0, 400),
      searchMode: r.searchMode,
      seconds: Math.round(r.duration / 1000),
    };
  }
  const msg = r.error?.message ?? "Bright Data no devolvió texto.";
  await setCollectorStatus(id, r.error?.code === "sin_credenciales" ? "unavailable" : "unverified", `Última prueba falló: ${msg}`.slice(0, 400), "brightdata", { details });
  return { ok: false, message: msg, seconds: Math.round(r.duration / 1000) };
}
