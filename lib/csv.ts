import { brandMetrics } from "./metrics";
import type { Brand } from "./types";

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function csvForBrand(brand: Brand) {
  const m = await brandMetrics(brand);
  const header = ["fecha_utc", "motor", "modelo", "simulado", "pregunta", "tipo", "repeticion", "estado", "menciona_marca", "posicion", "cita_dominio", "sentimiento", "marcas_mencionadas", "fuentes", "costo_usd", "respuesta"];
  const lines = [header.join(",")];
  for (const r of m.responses) {
    lines.push(
      [
        r.executed_at ?? r.created_at, r.engine, r.model, r.simulated ? "si" : "no", r.prompt_text, r.prompt_kind, r.repetition, r.status,
        r.brand_mentioned ? "si" : "no", r.brand_position ?? "", r.own_cited ? "si" : "no", r.sentiment ?? "",
        r.mentions.map((x) => `${x.position}. ${x.name}`).join(" | "), r.sources.map((s) => s.url).join(" | "), r.cost_usd.toFixed(4), r.answer ?? r.error ?? "",
      ].map(csvCell).join(","),
    );
  }
  return "﻿" + lines.join("\n");
}

