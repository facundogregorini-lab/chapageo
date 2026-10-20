// Tres oportunidades de mejora derivadas SOLO de la evidencia del análisis.
// Cada una enlaza las ejecuciones que la sustentan. No prometemos resultados ni inferimos
// causalidad: describimos lo observado y una acción razonable para probar.

import { sameSite } from "./analyze";
import { isValid, type AnalysisMetrics } from "./metrics";
import type { Brand, ResponseRow } from "./types";

export type Opportunity = {
  id: string;
  title: string;
  observed: string;
  suggestion: string;
  jobIds: string[];
  urls?: string[];
  weight: number;
};

export type OpportunityReport = { items: Opportunity[]; note: string | null };

const MIN_VALID = 5;
const MIN_EVIDENCE = 2;

function competitorOnly(r: ResponseRow) {
  return !r.brand_mentioned && r.mentions.some((m) => !m.own);
}

export function buildOpportunities(brand: Brand, m: AnalysisMetrics): OpportunityReport {
  const valid = m.jobs.filter(isValid);
  const unbranded = valid.filter((r) => r.prompt_category !== "marca");
  if (unbranded.length < MIN_VALID) {
    return {
      items: [],
      note: `Evidencia insuficiente: hay ${unbranded.length} respuestas válidas en preguntas sin la marca (mínimo ${MIN_VALID}). Completá o repetí el análisis antes de recomendar cambios.`,
    };
  }
  const out: Opportunity[] = [];

  // 1) Preguntas donde aparecen competidores y la marca no.
  const byPrompt = new Map<string, ResponseRow[]>();
  for (const r of unbranded.filter(competitorOnly)) byPrompt.set(r.prompt_id, [...(byPrompt.get(r.prompt_id) ?? []), r]);
  const gaps = [...byPrompt.values()].sort((a, b) => b.length - a.length);
  for (const rows of gaps.slice(0, 2)) {
    if (rows.length < MIN_EVIDENCE) break;
    const total = unbranded.filter((r) => r.prompt_id === rows[0].prompt_id).length;
    const comps = [...new Set(rows.flatMap((r) => r.mentions.filter((x) => !x.own).map((x) => x.name)))].slice(0, 3);
    out.push({
      id: `gap-${rows[0].prompt_id}`,
      title: `Responder mejor «${rows[0].prompt_text}»`,
      observed: `En ${rows.length} de ${total} respuestas válidas a esta pregunta aparecen ${comps.join(", ")} y ${brand.name} no.`,
      suggestion: `Revisar si el sitio responde esta pregunta de forma directa y verificable (página o sección específica, datos concretos, precios o casos). Volver a medir con la misma pregunta para ver si cambia.`,
      jobIds: rows.map((r) => r.id),
      weight: rows.length,
    });
  }

  // 2) Fuentes de terceros citadas cuando ganan competidores.
  const domainHits = new Map<string, { jobs: Set<string>; urls: Set<string> }>();
  for (const r of unbranded.filter(competitorOnly)) {
    for (const s of r.sources) {
      if (sameSite(s.domain, brand.domain) || brand.competitors.some((c) => c.domain && sameSite(s.domain, c.domain))) continue;
      const cur = domainHits.get(s.domain) ?? { jobs: new Set<string>(), urls: new Set<string>() };
      cur.jobs.add(r.id);
      cur.urls.add(s.url);
      domainHits.set(s.domain, cur);
    }
  }
  const topDomain = [...domainHits.entries()].sort((a, b) => b[1].jobs.size - a[1].jobs.size)[0];
  if (topDomain && topDomain[1].jobs.size >= MIN_EVIDENCE) {
    out.push({
      id: `src-${topDomain[0]}`,
      title: `Evaluar presencia en ${topDomain[0]}`,
      observed: `${topDomain[0]} aparece como fuente en ${topDomain[1].jobs.size} respuestas donde se nombra a competidores y no a ${brand.name}.`,
      suggestion: `Ver qué publica ese sitio sobre la categoría y si ${brand.name} puede figurar con información correcta (perfil, reseña, nota o listado). Es una fuente que los motores consultaron; no implica que sea la causa de la ausencia.`,
      jobIds: [...topDomain[1].jobs],
      urls: [...topDomain[1].urls].slice(0, 5),
      weight: topDomain[1].jobs.size,
    });
  }

  // 3) Menciones sin enlace al sitio propio.
  const mentionedNoLink = valid.filter((r) => r.brand_mentioned && !r.own_cited);
  if (mentionedNoLink.length >= MIN_EVIDENCE) {
    const mentioned = valid.filter((r) => r.brand_mentioned).length;
    out.push({
      id: "citability",
      title: `Hacer más citable el sitio de ${brand.name}`,
      observed: `En ${mentionedNoLink.length} de ${mentioned} respuestas que nombran a ${brand.name}, ninguna fuente enlaza a ${brand.domain}.`,
      suggestion: `Revisar que las páginas clave sean accesibles para los bots de búsqueda con IA (robots.txt) y tengan información concreta que se pueda citar (precios, cobertura, preguntas frecuentes).`,
      jobIds: mentionedNoLink.map((r) => r.id),
      weight: mentionedNoLink.length,
    });
  }

  // 4) Preguntas sobre la marca que no la reconocen (alternativa si faltan oportunidades).
  const brandedMiss = valid.filter((r) => r.prompt_category === "marca" && !r.brand_mentioned);
  if (brandedMiss.length >= MIN_EVIDENCE) {
    out.push({
      id: "entity",
      title: `Aclarar quién es ${brand.name}`,
      observed: `En ${brandedMiss.length} respuestas a preguntas que nombran a ${brand.name}, la respuesta no la menciona por su nombre (posible confusión o desconocimiento de la marca).`,
      suggestion: `Revisar que el nombre, el rubro y la ubicación estén explícitos y consistentes en el sitio, perfiles públicos y datos estructurados.`,
      jobIds: brandedMiss.map((r) => r.id),
      weight: brandedMiss.length,
    });
  }

  const items = out.sort((a, b) => b.weight - a.weight).slice(0, 3);
  return {
    items,
    note:
      items.length === 0
        ? `No encontramos oportunidades con evidencia suficiente (al menos ${MIN_EVIDENCE} respuestas cada una).`
        : items.length < 3
          ? `Solo ${items.length === 1 ? "hay 1 oportunidad" : `hay ${items.length} oportunidades`} con evidencia suficiente (al menos ${MIN_EVIDENCE} respuestas cada una).`
          : null,
  };
}
