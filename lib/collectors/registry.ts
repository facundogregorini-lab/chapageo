// Catálogo de conectores. Este archivo no importa Playwright: lo usa la web para
// mostrar opciones y el worker para instanciarlos.

import { ENGINES, type EngineId } from "../config";
import type { CollectionMethod } from "./types";

export type CollectorId =
  | "chatgpt_web"
  | "gemini_web"
  | "chatgpt_api"
  | "gemini_api"
  | "claude_api"
  | "perplexity_api"
  | "demo_chatgpt"
  | "demo_gemini";

export type CollectorDef = {
  id: CollectorId;
  engine: EngineId;
  method: CollectionMethod;
  label: string;
  /** Variable de entorno del worker que habilita el conector (API). */
  envKey?: string;
  description: string;
};

export const COLLECTORS: Record<CollectorId, CollectorDef> = {
  chatgpt_web: {
    id: "chatgpt_web",
    engine: "chatgpt",
    method: "web_capture",
    label: "ChatGPT · interfaz web",
    description: "Abre chatgpt.com en un navegador del worker, envía la pregunta y lee la respuesta visible.",
  },
  gemini_web: {
    id: "gemini_web",
    engine: "gemini",
    method: "web_capture",
    label: "Gemini · interfaz web",
    description: "Abre gemini.google.com en un navegador del worker, envía la pregunta y lee la respuesta visible.",
  },
  chatgpt_api: {
    id: "chatgpt_api",
    engine: "chatgpt",
    method: "official_api",
    label: "OpenAI · API oficial",
    envKey: "OPENAI_API_KEY",
    description: "Responses API con búsqueda web. No es lo que ve una persona en chatgpt.com.",
  },
  gemini_api: {
    id: "gemini_api",
    engine: "gemini",
    method: "official_api",
    label: "Gemini · API oficial",
    envKey: "GEMINI_API_KEY",
    description: "generateContent con Google Search. No es lo que ve una persona en gemini.google.com.",
  },
  claude_api: {
    id: "claude_api",
    engine: "claude",
    method: "official_api",
    label: "Claude · API oficial",
    envKey: "ANTHROPIC_API_KEY",
    description: "Messages API con búsqueda web.",
  },
  perplexity_api: {
    id: "perplexity_api",
    engine: "perplexity",
    method: "official_api",
    label: "Perplexity · API oficial",
    envKey: "PERPLEXITY_API_KEY",
    description: "API sonar con búsqueda.",
  },
  demo_chatgpt: {
    id: "demo_chatgpt",
    engine: "chatgpt",
    method: "demo",
    label: "ChatGPT · demo simulada",
    description: "Respuestas simuladas generadas localmente. Solo para el espacio de demostración.",
  },
  demo_gemini: {
    id: "demo_gemini",
    engine: "gemini",
    method: "demo",
    label: "Gemini · demo simulada",
    description: "Respuestas simuladas generadas localmente. Solo para el espacio de demostración.",
  },
};

export const COLLECTOR_IDS = Object.keys(COLLECTORS) as CollectorId[];

export function isCollectorId(x: string): x is CollectorId {
  return x in COLLECTORS;
}

export const METHOD_LABEL: Record<CollectionMethod, string> = {
  web_capture: "Captura de interfaz web",
  official_api: "API oficial del modelo",
  third_party_capture: "Proveedor externo de captura",
  demo: "Datos de demostración (simulados)",
};

export function engineLabel(engine: EngineId) {
  return ENGINES[engine].label;
}

/** Etiqueta corta para tablas: "ChatGPT (web)", "Claude (API)", "Demo". */
export function collectorShort(id: string): string {
  if (!isCollectorId(id)) return id;
  const c = COLLECTORS[id];
  if (c.method === "demo") return `${ENGINES[c.engine].label} (demo)`;
  return `${ENGINES[c.engine].label} (${c.method === "web_capture" ? "web" : "API"})`;
}
