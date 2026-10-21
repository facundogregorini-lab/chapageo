// Instancia los conectores habilitados en ESTE worker según su entorno.
// - Captura web: WORKER_WEB_COLLECTORS=chatgpt_web,gemini_web
// - API oficial: si existe la clave correspondiente (OPENAI_API_KEY, GEMINI_API_KEY, …)
//   y no fue excluida con WORKER_DISABLE_API=1.
// - Demo: siempre (solo procesa análisis de espacios demo).
//
// - Bright Data: lo procesa la web en lotes; el worker lo toma solo con WORKER_BRIGHTDATA=1.

import { apiCollector } from "../../lib/collectors/api";
import { BRIGHTDATA_IDS, brightDataCollector, brightDataConfig, isBrightDataId } from "../../lib/collectors/brightdata";
import { demoCollector } from "../../lib/collectors/demo";
import { COLLECTORS, type CollectorId } from "../../lib/collectors/registry";
import type { Collector } from "../../lib/collectors/types";
import { browserOptionsFromEnv, webCollector } from "./browser";
import { chatgptSpec } from "./chatgpt-web";
import { geminiSpec } from "./gemini-web";

export function webCollectorIds(): CollectorId[] {
  return (process.env.WORKER_WEB_COLLECTORS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is CollectorId => s === "chatgpt_web" || s === "gemini_web");
}

export function buildCollector(id: CollectorId): Collector {
  const def = COLLECTORS[id];
  if (id === "chatgpt_web") return webCollector(chatgptSpec(), browserOptionsFromEnv());
  if (id === "gemini_web") return webCollector(geminiSpec(), browserOptionsFromEnv());
  if (def.method === "demo") return demoCollector(id, def.engine);
  if (isBrightDataId(id)) return brightDataCollector(id);
  return apiCollector(id, def.engine);
}

export function enabledCollectors(): Collector[] {
  const ids: CollectorId[] = [...webCollectorIds()];
  if (process.env.WORKER_DISABLE_API !== "1") {
    for (const def of Object.values(COLLECTORS)) if (def.method === "official_api" && def.envKey && process.env[def.envKey]) ids.push(def.id);
  }
  // Bright Data lo procesa la web (lib/brightdata-batch.ts). El worker solo lo toma si se pide.
  if (process.env.WORKER_BRIGHTDATA === "1") for (const id of BRIGHTDATA_IDS) if (!("missing" in brightDataConfig(id))) ids.push(id);
  ids.push("demo_chatgpt", "demo_gemini");
  return ids.map(buildCollector);
}
