// Backlog de acciones GEO. Cada acción sale de un patrón concreto en las respuestas y
// guarda la evidencia (ids de respuesta, dominios, preguntas) para que se pueda revisar
// antes de entregarla o publicarla. Nada de promesas de "primer puesto en ChatGPT".

import { countryName } from "./config";
import { all, id, now, one, run } from "./db";
import { complete, helperAvailable } from "./llm";
import { brandMetrics } from "./metrics";
import { toAction, toBrand, type ActionKind, type ActionRow, type Brand } from "./types";

type Draft = {
  fingerprint: string;
  kind: ActionKind;
  title: string;
  detail: string;
  priority: number; // 1 = alta, 2 = media, 3 = baja
  evidence: ActionRow["evidence"];
};

const CLASS_TIPS: Record<string, string> = {
  reseñas: "Creá o completá el perfil, sumá capturas y pedí reseñas a clientes actuales.",
  medio: "Proponé una nota, columna o dato propio (encuesta, informe) a ese medio.",
  comunidad: "Participá con respuestas útiles y transparentes en los hilos donde se recomienda tu rubro.",
  marketplace: "Mejorá la ficha: título descriptivo, preguntas respondidas y reputación.",
  referencia: "Revisá que la información sobre tu marca en esa fuente sea correcta y esté actualizada.",
  otro: "Revisá qué páginas cita la IA y buscá cómo aparecer en ellas (listados, comparativas, alianzas).",
};

export async function computeActionDrafts(brand: Brand): Promise<Draft[]> {
  const m = await brandMetrics(brand);
  if (!m.run) return [];
  const drafts: Draft[] = [];
  const ok = m.responses.filter((r) => r.status === "ok");

  // 1) Preguntas donde gana la competencia y la marca no aparece
  for (const p of m.prompts) {
    const rows = ok.filter((r) => r.prompt_id === p.promptId);
    const withCompetitors = rows.filter((r) => r.mentions.some((x) => !x.own)).length;
    if (!rows.length || p.mention.rate >= 0.34 || withCompetitors / rows.length < 0.5) continue;
    const comparativa = /vs|alternativa|compar|mejor|top|recom/i.test(p.text);
    drafts.push({
      fingerprint: `contenido:${p.promptId}`,
      kind: "contenido",
      title: `Creá contenido que responda «${p.text}»`,
      detail: `${brand.name} apareció en ${p.mention.num} de ${p.mention.den} respuestas; ${p.leaders.join(", ") || "otras marcas"} sí ${p.leaders.length === 1 ? "aparece" : "aparecen"}. ${
        comparativa
          ? "Publicá una página comparativa honesta (criterios, precios, para quién conviene cada opción) en tu sitio."
          : "Publicá una guía que responda la pregunta en las primeras líneas, con datos concretos y verificables."
      }`,
      priority: p.kind === "sin_marca" ? 1 : 2,
      evidence: { responseIds: rows.slice(0, 6).map((r) => r.id), prompts: [p.text], competitors: p.leaders },
    });
  }

  // 2) Fuentes externas que la IA cita cuando recomienda a otros
  for (const s of m.sources.slice(0, 25)) {
    if (s.cls === "propio" || s.cls === "competidor" || s.withoutBrand < 2) continue;
    drafts.push({
      fingerprint: `fuente:${s.domain}`,
      kind: "fuente_externa",
      title: `Conseguí presencia en ${s.domain}`,
      detail: `La IA citó ${s.domain} en ${s.count} respuestas; en ${s.withoutBrand} de ellas recomendó a otras marcas y no a ${brand.name}. ${CLASS_TIPS[s.cls] ?? CLASS_TIPS.otro}`,
      priority: s.withoutBrand >= 4 ? 1 : 2,
      evidence: {
        domains: [s.domain],
        responseIds: ok.filter((r) => r.sources.some((x) => x.domain === s.domain)).slice(0, 6).map((r) => r.id),
      },
    });
  }

  // 3) Te mencionan pero no te citan
  if (m.mention.num >= 3 && m.citation.rate < 0.15) {
    drafts.push({
      fingerprint: "citabilidad:sitio",
      kind: "citabilidad",
      title: "Hacé que la IA cite tu sitio, no solo tu nombre",
      detail: `${brand.name} aparece en ${m.mention.num} respuestas pero tu dominio se cita en ${m.citation.num}. Sumá páginas con respuestas directas (FAQ, precios orientativos, casos con números) y datos estructurados Organization/FAQPage.`,
      priority: 2,
      evidence: { responseIds: ok.filter((r) => r.brand_mentioned && !r.own_cited).slice(0, 6).map((r) => r.id) },
    });
  }

  // 4) Respuestas con tono negativo sobre la marca
  const negatives = ok.filter((r) => r.sentiment === "negativo");
  if (negatives.length) {
    drafts.push({
      fingerprint: "reputacion:negativo",
      kind: "reputacion",
      title: `Revisá ${negatives.length} respuesta${negatives.length > 1 ? "s" : ""} con tono negativo sobre ${brand.name}`,
      detail: "Leé qué afirma cada motor y de qué fuentes lo saca. Si es incorrecto, corregilo en tu sitio y en las fuentes citadas; si es cierto, respondelo con información actualizada.",
      priority: 1,
      evidence: { responseIds: negatives.slice(0, 8).map((r) => r.id) },
    });
  }

  // 5) Preguntas con la marca en las que la IA no la reconoce
  const brandedMiss = ok.filter((r) => r.prompt_kind === "con_marca" && !r.brand_mentioned);
  if (brandedMiss.length >= 2) {
    drafts.push({
      fingerprint: "entidad:reconocimiento",
      kind: "entidad",
      title: `La IA no reconoce bien a ${brand.name} cuando la nombran`,
      detail: `En ${brandedMiss.length} respuestas a preguntas que nombran a la marca, la IA no la describió. Asegurá una página "Sobre nosotros" clara, perfiles consistentes (Google Business Profile, LinkedIn) y menciones en fuentes de ${countryName(brand.country)}.`,
      priority: 1,
      evidence: { responseIds: brandedMiss.slice(0, 6).map((r) => r.id) },
    });
  }

  // 6) Auditoría técnica: bots críticos bloqueados
  const audit = await one<{ result: string }>(
    "SELECT result FROM audits WHERE brand_id = ? AND kind = 'crawl' ORDER BY created_at DESC LIMIT 1",
    [brand.id],
  );
  if (audit) {
    const res = JSON.parse(audit.result) as { bots: { agent: string; status: string; critical: boolean }[] };
    const blocked = res.bots.filter((b) => b.critical && b.status === "bloqueado");
    if (blocked.length) {
      drafts.push({
        fingerprint: "tecnica:robots",
        kind: "tecnica",
        title: `Permití ${blocked.map((b) => b.agent).join(", ")} en robots.txt`,
        detail: "Estos bots alimentan las respuestas con búsqueda en vivo. Si están bloqueados, ese motor no puede leer ni citar tu sitio.",
        priority: 1,
        evidence: {},
      });
    }
  }
  return drafts;
}

export async function generateActions(brandId: string) {
  const brand = toBrand((await one("SELECT * FROM brands WHERE id = ?", [brandId]))!);
  const drafts = await computeActionDrafts(brand);
  const ts = now();
  for (const d of drafts) {
    // Las acciones existentes conservan estado, responsable y borrador; se refresca la evidencia.
    await run(
      `INSERT INTO actions (id, brand_id, fingerprint, kind, title, detail, priority, evidence, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?)
       ON CONFLICT (brand_id, fingerprint) DO UPDATE SET title=excluded.title, detail=excluded.detail,
         priority=excluded.priority, evidence=excluded.evidence, updated_at=excluded.updated_at`,
      [id("act_"), brandId, d.fingerprint, d.kind, d.title, d.detail, d.priority, JSON.stringify(d.evidence), ts, ts],
    );
  }
  return drafts.length;
}

export async function listActions(brandId: string): Promise<ActionRow[]> {
  const rows = await all(
    `SELECT * FROM actions WHERE brand_id = ?
     ORDER BY CASE status WHEN 'en_curso' THEN 0 WHEN 'pendiente' THEN 1 WHEN 'hecha' THEN 2 ELSE 3 END, priority, updated_at DESC`,
    [brandId],
  );
  return rows.map((r) => toAction(r as Record<string, unknown>));
}

const KIND_FORMAT: Record<ActionKind, string> = {
  contenido: "una página para el sitio de la marca (título, bajada, secciones con H2, una tabla comparativa si aplica y 5 preguntas frecuentes)",
  fuente_externa: "un plan breve de 5 pasos para aparecer en esa fuente, más un borrador del mensaje o perfil a publicar",
  citabilidad: "un bloque de preguntas frecuentes (8 preguntas) con respuestas concretas y el JSON-LD FAQPage correspondiente",
  reputacion: "un análisis de lo que dicen las respuestas, qué es correcto y qué no, y un texto de aclaración para el sitio",
  entidad: "una página «Sobre nosotros» con datos verificables (qué hacen, para quién, dónde, desde cuándo) y el JSON-LD Organization",
  tecnica: "el bloque de robots.txt corregido y una explicación corta para el equipo técnico",
};

export async function draftForAction(actionId: string): Promise<string> {
  const a = toAction((await one("SELECT * FROM actions WHERE id = ?", [actionId])) as Record<string, unknown>);
  const brand = toBrand((await one("SELECT * FROM brands WHERE id = ?", [a.brand_id]))!);
  const evidence = a.evidence.responseIds?.length
    ? ((await all(
        `SELECT engine, prompt_text, answer FROM responses WHERE id IN (${a.evidence.responseIds.map(() => "?").join(",")})`,
        a.evidence.responseIds,
      )) as unknown as { engine: string; prompt_text: string; answer: string }[])
    : [];

  if (!helperAvailable()) return templateDraft(a, brand);

  const text = await complete(
    `Sos redactor/a senior de contenidos GEO para marcas de ${countryName(brand.country)}. Escribís en español rioplatense profesional (voseo), claro y verificable. No inventás datos: donde falte un dato concreto de la marca, dejás un marcador [COMPLETAR: ...]. No prometés posiciones en buscadores ni en IA.`,
    `Marca: ${brand.name} (${brand.domain})
Rubro: ${brand.category ?? "-"}
Descripción: ${brand.description ?? "-"}
Competidores: ${brand.competitors.map((c) => c.name).join(", ") || "-"}

Acción: ${a.title}
Contexto: ${a.detail}

Respuestas actuales de la IA (evidencia):
${evidence.map((e, i) => `[${i + 1}] ${e.engine} — «${e.prompt_text}»\n${(e.answer ?? "").slice(0, 1200)}`).join("\n\n") || "(sin respuestas asociadas)"}

Redactá ${KIND_FORMAT[a.kind]}. Formato Markdown.`,
    6000,
  );
  return text.trim();
}

function templateDraft(a: ActionRow, brand: Brand): string {
  const lines = [`# ${a.title}`, "", `> Borrador generado con plantilla (configurá un modelo para redacción asistida). Revisalo antes de publicar.`, ""];
  if (a.kind === "contenido") {
    const q = a.evidence.prompts?.[0] ?? a.title;
    lines.push(
      `## ${q.replace(/^¿|\?$/g, "")}`,
      "",
      `[COMPLETAR: respuesta directa en 2-3 oraciones, nombrando a ${brand.name} y para quién es la mejor opción.]`,
      "",
      "## Cómo elegir",
      "- Criterio 1: [COMPLETAR]",
      "- Criterio 2: [COMPLETAR]",
      "- Criterio 3: [COMPLETAR]",
      "",
      "## Comparativa",
      `| | ${brand.name} | ${(a.evidence.competitors ?? []).join(" | ")} |`,
      `|---|---|${(a.evidence.competitors ?? []).map(() => "---").join("|")}|`,
      `| Precio desde | [COMPLETAR] |${(a.evidence.competitors ?? []).map(() => " [COMPLETAR] ").join("|")}|`,
      "",
      "## Preguntas frecuentes",
      "1. [COMPLETAR]",
      "2. [COMPLETAR]",
      "3. [COMPLETAR]",
    );
  } else if (a.kind === "tecnica") {
    lines.push("```", "User-agent: OAI-SearchBot", "Allow: /", "", "User-agent: PerplexityBot", "Allow: /", "", "User-agent: Claude-SearchBot", "Allow: /", "```");
  } else if (a.kind === "entidad") {
    lines.push(
      `## Sobre ${brand.name}`,
      `${brand.name} es [COMPLETAR: qué hace] para [COMPLETAR: para quién] en ${countryName(brand.country)} desde [COMPLETAR: año].`,
      "",
      "```json",
      JSON.stringify({ "@context": "https://schema.org", "@type": "Organization", name: brand.name, url: `https://${brand.domain}`, areaServed: countryName(brand.country) }, null, 2),
      "```",
    );
  } else {
    lines.push("## Pasos", "1. [COMPLETAR]", "2. [COMPLETAR]", "3. [COMPLETAR]", "", a.detail);
  }
  return lines.join("\n");
}
