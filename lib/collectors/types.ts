// Contrato común de la capa de recolección. Todos los conectores (captura web propia,
// API oficial, demo y, más adelante, proveedores como Bright Data o DataForSEO)
// devuelven exactamente este formato, así las métricas no dependen de cómo se obtuvo la respuesta.

import type { EngineId } from "../config";

/**
 * - web_capture: se abrió la interfaz web del asistente y se leyó la respuesta que vería una persona.
 * - official_api: respuesta de la API oficial del modelo. Es otra medición: no reemplaza a la captura.
 * - third_party_capture: reservado para proveedores externos de captura (no implementado).
 * - demo: datos simulados, solo para el espacio de demostración.
 */
export type CollectionMethod = "web_capture" | "official_api" | "third_party_capture" | "demo";

export type CollectStatus = "completed" | "partial" | "failed" | "requires_intervention";

/** Cómo sabemos desde dónde se ejecutó la consulta. Nunca se infiere del idioma ni del prompt. */
export type LocationVerification = "verificada" | "declarada_por_operador" | "no_verificada" | "no_aplica";

export type SessionType = "autenticada" | "publica" | "api" | "simulada";

export type Citation = { url: string; title?: string; domain: string };

export type CollectError = {
  /** Código estable para métricas y UI. */
  code:
    | "captcha"
    | "login_requerido"
    | "limite_de_uso"
    | "bloqueado"
    | "timeout"
    | "respuesta_vacia"
    | "selector_no_encontrado"
    | "red"
    | "api_error"
    | "sin_credenciales"
    | "interrumpido"
    | "cancelado"
    | "desconocido";
  message: string;
  /** Si es transitorio, el worker puede reintentar (con un tope). */
  transient: boolean;
};

export type CollectInput = {
  prompt: string;
  engine: EngineId;
  requestedCountry: string;
  language: string;
  runId: string;
  jobId: string;
  /** Solo para el conector demo: datos para simular una respuesta verosímil. */
  demoContext?: {
    repetition: number;
    brand: { name: string; domain: string; category?: string | null };
    competitors: { name: string; domain?: string }[];
    branded: boolean;
  };
};

export type CollectResult = {
  status: CollectStatus;
  answerText: string | null;
  citations: Citation[];
  /** Id de la evidencia guardada (captura de pantalla), si la hubo. */
  screenshotReference: string | null;
  collectedAt: string;
  engine: EngineId;
  modelIfVisible: string | null;
  collectionMethod: CollectionMethod;
  /** País desde el que salió la consulta, si se conoce. null = desconocido. */
  observedCountry: string | null;
  locationVerification: LocationVerification;
  /** Ej.: "busqueda_web_observada", "sin_busqueda_observada", "api_web_search", "no_observable". */
  searchMode: string;
  sessionType: SessionType;
  /** Duración en milisegundos. */
  duration: number;
  error: CollectError | null;
  /** Costo estimado en USD (solo APIs); 0 si no aplica. */
  costUsd?: number;
};

/** Servicios que el worker le presta a un conector. */
export type CollectContext = {
  saveEvidence: (data: Buffer, mime: string) => Promise<string>;
  /** Señal para cancelar (timeout global o apagado del worker). */
  signal: AbortSignal;
  log: (msg: string) => void;
};

export interface Collector {
  id: string;
  engine: EngineId;
  method: CollectionMethod;
  collect(input: CollectInput, ctx: CollectContext): Promise<CollectResult>;
  /** Libera navegadores, sesiones, etc. */
  close?(): Promise<void>;
}

export class CollectFailure extends Error {
  constructor(public info: CollectError) {
    super(info.message);
  }
}
