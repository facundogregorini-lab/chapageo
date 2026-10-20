import { collectorShort } from "./collectors/registry";
import { isValid } from "./metrics";
import type { Brand, ResponseRow, Run } from "./types";

/** Escapa para CSV y neutraliza fórmulas (=, +, -, @): las respuestas son contenido externo. */
export function csvCell(v: unknown) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n;\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvForRun(brand: Brand, run: Run, jobs: ResponseRow[]) {
  const header = [
    "analisis_id", "ejecucion_id", "fecha_captura_utc", "motor", "metodo", "tipo_pregunta", "pregunta", "repeticion", "estado", "valida",
    "intentos", "error", "pais_solicitado", "pais_ejecucion", "verificacion_ubicacion", "idioma", "sesion", "modo_busqueda", "modelo_visible",
    "menciona_marca", "orden_mencion_marca", "puesto_lista_marca", "enlaza_dominio_cliente", "marcas_detectadas", "fuentes", "respuesta",
  ];
  const lines = [header.join(",")];
  for (const r of jobs) {
    const own = r.mentions.find((m) => m.own);
    lines.push(
      [
        run.id, r.id, r.executed_at ?? "", collectorShort(r.collector), r.collection_method, r.prompt_category, r.prompt_text, r.repetition, r.status,
        isValid(r) ? "si" : "no", r.attempts, r.error ? `${r.error_code ?? ""} ${r.error}`.trim() : "", r.country ?? brand.country, r.observed_country ?? "",
        r.location_verification ?? "", r.language ?? "", r.session_type ?? "", r.search_mode ?? "", r.model ?? "",
        isValid(r) ? (r.brand_mentioned ? "si" : "no") : "", own?.position ?? "", own?.explicitRank ?? "", isValid(r) ? (r.own_cited ? "si" : "no") : "",
        r.mentions.map((x) => `${x.position}. ${x.name}`).join(" | "), r.sources.map((s) => s.url).join(" | "), r.answer ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return "﻿" + lines.join("\n");
}
