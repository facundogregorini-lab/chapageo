import type { EngineId, PlanId } from "./config";
import { parseJson } from "./db";

export type Competitor = { name: string; domain?: string; aliases?: string[] };

export type Source = { url: string; title?: string; domain: string };

export type Mention = {
  name: string;
  own: boolean;
  /** Orden de aparición entre las marcas seguidas (1 = la primera nombrada). No es un ranking. */
  position: number;
  /** Número del ítem en una lista numerada de la respuesta, si la marca aparece en una. Sino null. */
  explicitRank?: number | null;
  count: number;
  snippet: string;
};

export type Workspace = {
  id: string;
  name: string;
  plan: PlanId;
  brand_color: string;
  logo_url: string | null;
  report_footer: string | null;
  is_demo?: number;
  plan_expires_at?: string | null;
  created_at: string;
};

export type User = {
  id: string;
  email: string;
  name: string | null;
  workspace_id: string;
};

export type Brand = {
  id: string;
  workspace_id: string;
  name: string;
  domain: string;
  description: string | null;
  category: string | null;
  country: string;
  city: string | null;
  language: string;
  aliases: string[];
  competitors: Competitor[];
  engines: EngineId[];
  repetitions: number;
  schedule: "weekly" | "manual";
  share_token: string;
  last_run_at: string | null;
  created_at: string;
};

export type PromptKind = "sin_marca" | "con_marca";
export type PromptIntent = "informativa" | "comercial" | "transaccional";
/**
 * Grupos de preguntas que nunca se mezclan al calcular visibilidad:
 * - descubrimiento: no nombran a la marca ni a competidores.
 * - comparacion: comparaciones y alternativas; pueden nombrar competidores, no a la marca.
 * - marca: nombran explícitamente a la marca (sesgan la probabilidad de mención).
 */
export type PromptCategory = "descubrimiento" | "comparacion" | "marca";
export const PROMPT_CATEGORIES: PromptCategory[] = ["descubrimiento", "comparacion", "marca"];
export const CATEGORY_LABEL: Record<PromptCategory, string> = {
  descubrimiento: "Descubrimiento",
  comparacion: "Comparación y alternativas",
  marca: "Sobre la marca",
};

export type JobStatus = "pending" | "running" | "completed" | "partial" | "failed" | "requires_intervention";
export type RunStatus = JobStatus;
export const STATUS_LABEL: Record<JobStatus, string> = {
  pending: "Pendiente",
  running: "En ejecución",
  completed: "Completado",
  partial: "Parcial",
  failed: "Fallido",
  requires_intervention: "Requiere intervención",
};

export type Prompt = {
  id: string;
  brand_id: string;
  text: string;
  kind: PromptKind;
  intent: PromptIntent;
  topic: string | null;
  active: number;
  category: PromptCategory;
  approved: number;
  source: string;
  created_at: string;
  updated_at: string | null;
};

export type Run = {
  id: string;
  brand_id: string;
  workspace_id: string;
  status: RunStatus;
  status_detail: string | null;
  collectors: string[];
  repetitions: number;
  requested_country: string;
  language: string;
  prompt_set_hash: string | null;
  is_demo: number;
  started_at: string | null;
  trigger: string;
  total: number;
  done_count: number;
  failed_count: number;
  simulated: number;
  cost_usd: number;
  created_at: string;
  finished_at: string | null;
};

/** Una ejecución: pregunta × conector × repetición, con su propio estado y resultado. */
export type ResponseRow = {
  id: string;
  run_id: string;
  brand_id: string;
  workspace_id: string;
  prompt_id: string;
  prompt_text: string;
  prompt_kind: PromptKind;
  prompt_category: PromptCategory;
  engine: EngineId;
  collector: string;
  collection_method: string;
  model: string | null;
  repetition: number;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string | null;
  error: string | null;
  error_code: string | null;
  observed_country: string | null;
  location_verification: string | null;
  search_mode: string | null;
  session_type: string | null;
  screenshot_id: string | null;
  started_at: string | null;
  claimed_at?: string | null;
  answer: string | null;
  sources: Source[];
  mentions: Mention[];
  other_brands: string[];
  brand_mentioned: number;
  brand_position: number | null;
  own_cited: number;
  sentiment: "positivo" | "neutral" | "negativo" | null;
  sentiment_score: number | null;
  cost_usd: number;
  latency_ms: number | null;
  country: string | null;
  language: string | null;
  simulated: number;
  created_at: string;
  executed_at: string | null;
};

export type ActionRow = {
  id: string;
  brand_id: string;
  fingerprint: string;
  kind: ActionKind;
  title: string;
  detail: string;
  priority: number;
  evidence: { responseIds?: string[]; domains?: string[]; prompts?: string[]; competitors?: string[] };
  status: "pendiente" | "en_curso" | "hecha" | "descartada";
  owner: string | null;
  draft: string | null;
  created_at: string;
  updated_at: string;
};

export type ActionKind =
  | "contenido"
  | "fuente_externa"
  | "citabilidad"
  | "reputacion"
  | "tecnica"
  | "entidad";

type RawRow = Record<string, unknown>;

export function toBrand(r: RawRow): Brand {
  return {
    ...(r as unknown as Brand),
    aliases: parseJson(r.aliases, []),
    competitors: parseJson(r.competitors, []),
    engines: parseJson(r.engines, ["chatgpt", "gemini"]),
    repetitions: Number(r.repetitions),
  };
}

export function toResponse(r: RawRow): ResponseRow {
  return {
    ...(r as unknown as ResponseRow),
    sources: parseJson(r.sources, []),
    mentions: parseJson(r.mentions, []),
    other_brands: parseJson(r.other_brands, []),
    brand_mentioned: Number(r.brand_mentioned),
    own_cited: Number(r.own_cited),
    brand_position: r.brand_position == null ? null : Number(r.brand_position),
    sentiment_score: r.sentiment_score == null ? null : Number(r.sentiment_score),
    cost_usd: Number(r.cost_usd ?? 0),
    simulated: Number(r.simulated),
    repetition: Number(r.repetition),
    attempts: Number(r.attempts ?? 0),
    max_attempts: Number(r.max_attempts ?? 0),
    prompt_category: (r.prompt_category as PromptCategory) ?? (r.prompt_kind === "con_marca" ? "marca" : "descubrimiento"),
  };
}

export function toAction(r: RawRow): ActionRow {
  return {
    ...(r as unknown as ActionRow),
    evidence: parseJson(r.evidence, {}),
    priority: Number(r.priority),
  };
}

export function toRun(r: RawRow): Run {
  return {
    ...(r as unknown as Run),
    total: Number(r.total),
    done_count: Number(r.done_count),
    failed_count: Number(r.failed_count),
    simulated: Number(r.simulated),
    cost_usd: Number(r.cost_usd),
    collectors: parseJson(r.collectors, []),
    repetitions: Number(r.repetitions ?? 1),
    is_demo: Number(r.is_demo ?? 0),
  };
}

export function toPrompt(r: RawRow): Prompt {
  return { ...(r as unknown as Prompt), active: Number(r.active), approved: Number(r.approved ?? 0) };
}
