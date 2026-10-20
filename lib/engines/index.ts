import { engineConfigured, type EngineId } from "../config";
import { dedupeSources } from "../analyze";
import { claudeEngine } from "./claude";
import { geminiEngine } from "./gemini";
import { openaiEngine } from "./openai";
import { perplexityEngine } from "./perplexity";
import { simulatedAnswer, type SimContext } from "./simulated";
import type { EngineAdapter, EngineRequest, EngineResult } from "./types";

const ADAPTERS: Record<EngineId, EngineAdapter> = {
  chatgpt: openaiEngine,
  gemini: geminiEngine,
  perplexity: perplexityEngine,
  claude: claudeEngine,
};

export async function askEngine(engine: EngineId, req: EngineRequest, sim: Omit<SimContext, "engine">): Promise<EngineResult> {
  if (!engineConfigured(engine)) return simulatedAnswer(req, { ...sim, engine });
  const res = await ADAPTERS[engine](req);
  return { ...res, sources: dedupeSources(res.sources) };
}

export type { EngineRequest, EngineResult };
