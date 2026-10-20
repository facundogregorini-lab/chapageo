// Conectores de API oficial. Reutilizan los adaptadores de lib/engines y devuelven el
// formato común. Se rotulan como "official_api": no son capturas de la interfaz web.

import { dedupeSources } from "../analyze";
import type { EngineId } from "../config";
import { claudeEngine } from "../engines/claude";
import { geminiEngine } from "../engines/gemini";
import { openaiEngine } from "../engines/openai";
import { perplexityEngine } from "../engines/perplexity";
import type { EngineAdapter } from "../engines/types";
import type { CollectError, CollectInput, CollectResult, Collector } from "./types";

const ADAPTERS: Record<EngineId, EngineAdapter> = {
  chatgpt: openaiEngine,
  gemini: geminiEngine,
  perplexity: perplexityEngine,
  claude: claudeEngine,
};

export function classifyApiError(e: unknown): CollectError {
  const msg = String((e as Error)?.message ?? e).slice(0, 400);
  if ((e as Error)?.name === "AbortError" || /abort|timeout/i.test(msg)) return { code: "timeout", message: msg, transient: true };
  const status = Number(msg.match(/HTTP (\d{3})/)?.[1] ?? (e as { status?: number })?.status ?? 0);
  if (status === 401 || status === 403) return { code: "sin_credenciales", message: msg, transient: false };
  if (status === 429 || status >= 500) return { code: "api_error", message: msg, transient: true };
  if (/fetch failed|ECONNRESET|ENOTFOUND|ETIMEDOUT|socket/i.test(msg)) return { code: "red", message: msg, transient: true };
  return { code: "api_error", message: msg, transient: false };
}

export function apiCollector(id: string, engine: EngineId): Collector {
  return {
    id,
    engine,
    method: "official_api",
    async collect(input: CollectInput): Promise<CollectResult> {
      const started = Date.now();
      const base = {
        engine,
        collectionMethod: "official_api" as const,
        screenshotReference: null,
        // La API recibe una ubicación aproximada como parámetro, pero eso no es una ubicación de ejecución verificable.
        observedCountry: null,
        locationVerification: "no_aplica" as const,
        sessionType: "api" as const,
        searchMode: "api_web_search",
      };
      try {
        const res = await ADAPTERS[engine]({ prompt: input.prompt, country: input.requestedCountry, language: input.language });
        const text = res.answer?.trim() ?? "";
        return {
          ...base,
          status: text ? "completed" : "failed",
          answerText: text || null,
          citations: dedupeSources(res.sources),
          collectedAt: new Date().toISOString(),
          modelIfVisible: res.model,
          duration: Date.now() - started,
          error: text ? null : { code: "respuesta_vacia", message: "La API devolvió una respuesta vacía", transient: true },
          costUsd: res.costUsd,
        };
      } catch (e) {
        return {
          ...base,
          status: "failed",
          answerText: null,
          citations: [],
          collectedAt: new Date().toISOString(),
          modelIfVisible: null,
          duration: Date.now() - started,
          error: classifyApiError(e),
        };
      }
    },
  };
}
