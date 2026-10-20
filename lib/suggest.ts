import { countryName } from "./config";
import { completeJson, helperAvailable } from "./llm";
import type { Competitor, PromptIntent, PromptKind } from "./types";

export type SuggestedPrompt = { text: string; kind: PromptKind; intent: PromptIntent; topic: string };

type BrandInput = {
  name: string;
  domain: string;
  category: string;
  description?: string | null;
  country: string;
  city?: string | null;
  competitors?: Competitor[];
};

function where(b: BrandInput) {
  return b.city ? `${b.city}` : countryName(b.country);
}

/** Preguntas de plantilla: funcionan sin ningún modelo configurado. */
export function templatePrompts(b: BrandInput, count = 20): SuggestedPrompt[] {
  const cat = b.category.trim().replace(/\.$/, "");
  const w = where(b);
  const comp = b.competitors?.[0]?.name;
  const list: SuggestedPrompt[] = [
    { text: `¿Cuáles son las mejores opciones de ${cat} en ${w}?`, kind: "sin_marca", intent: "comercial", topic: "Recomendación" },
    { text: `Recomendame ${cat} confiable en ${w}`, kind: "sin_marca", intent: "comercial", topic: "Recomendación" },
    { text: `¿Qué ${cat} me recomiendan en ${w}?`, kind: "sin_marca", intent: "comercial", topic: "Recomendación" },
    { text: `Top 5 de ${cat} en ${countryName(b.country)} en 2026`, kind: "sin_marca", intent: "comercial", topic: "Ranking" },
    { text: `¿Qué ${cat} tiene mejor relación precio-calidad en ${w}?`, kind: "sin_marca", intent: "comercial", topic: "Precio" },
    { text: `¿Cuánto cuesta contratar ${cat} en ${countryName(b.country)}?`, kind: "sin_marca", intent: "informativa", topic: "Precio" },
    { text: `¿Qué tengo que tener en cuenta para elegir ${cat}?`, kind: "sin_marca", intent: "informativa", topic: "Criterios" },
    { text: `${cat} con buena atención al cliente en ${w}`, kind: "sin_marca", intent: "comercial", topic: "Soporte" },
    { text: `Alternativas locales de ${cat} en ${countryName(b.country)}`, kind: "sin_marca", intent: "comercial", topic: "Alternativas" },
    { text: `¿Dónde encuentro ${cat} que acepte Mercado Pago en ${w}?`, kind: "sin_marca", intent: "transaccional", topic: "Compra" },
    { text: `¿Qué opiniones hay de ${b.name}?`, kind: "con_marca", intent: "informativa", topic: "Reputación" },
    { text: `¿${b.name} es confiable?`, kind: "con_marca", intent: "informativa", topic: "Reputación" },
    { text: `¿Qué es ${b.name} y para quién sirve?`, kind: "con_marca", intent: "informativa", topic: "Entidad" },
    { text: `¿Cuánto cuesta ${b.name}?`, kind: "con_marca", intent: "transaccional", topic: "Precio" },
    ...(comp
      ? [
          { text: `${b.name} vs ${comp}: ¿cuál conviene?`, kind: "con_marca" as const, intent: "comercial" as const, topic: "Comparativa" },
          { text: `Alternativas a ${comp} en ${countryName(b.country)}`, kind: "sin_marca" as const, intent: "comercial" as const, topic: "Alternativas" },
        ]
      : []),
    { text: `¿Cuál es el ${cat} más recomendado para empezar?`, kind: "sin_marca", intent: "comercial", topic: "Recomendación" },
    { text: `Comparativa de ${cat} en ${countryName(b.country)}`, kind: "sin_marca", intent: "comercial", topic: "Comparativa" },
    { text: `¿Qué empresa de ${cat} tiene mejores reseñas en ${w}?`, kind: "sin_marca", intent: "comercial", topic: "Reputación" },
    { text: `Busco ${cat} en ${w}, ¿cuál me recomendás?`, kind: "sin_marca", intent: "transaccional", topic: "Compra" },
  ];
  return list.slice(0, count);
}

export async function suggestPrompts(b: BrandInput, count = 20): Promise<{ prompts: SuggestedPrompt[]; source: "ia" | "plantilla" }> {
  if (!helperAvailable()) return { prompts: templatePrompts(b, count), source: "plantilla" };
  try {
    const out = await completeJson<{ prompts: SuggestedPrompt[] }>(
      `Sos especialista en GEO (Generative Engine Optimization) para Latinoamérica. Proponés las preguntas que un comprador real le haría a ChatGPT o Gemini antes de elegir un proveedor. Escribí en español rioplatense natural, como las tipearía una persona (tuteo/voseo, sin formalidades).`,
      `Marca: ${b.name} (${b.domain})
Rubro: ${b.category}
Descripción: ${b.description ?? "-"}
Mercado: ${b.city ? b.city + ", " : ""}${countryName(b.country)}
Competidores: ${(b.competitors ?? []).map((c) => c.name).join(", ") || "-"}

Devolvé {"prompts":[{"text":"...","kind":"sin_marca"|"con_marca","intent":"informativa"|"comercial"|"transaccional","topic":"..."}]} con ${count} preguntas.
Reglas: al menos 70% "sin_marca" (no nombran a ${b.name}); priorizá intención comercial; incluí 2-3 comparativas contra competidores; nada de preguntas que solo respondería la propia marca.`,
    );
    const prompts = (out.prompts ?? [])
      .filter((p) => p && typeof p.text === "string" && p.text.length > 8)
      .map((p) => ({
        text: p.text.trim(),
        kind: p.kind === "con_marca" ? "con_marca" : "sin_marca",
        intent: ["informativa", "comercial", "transaccional"].includes(p.intent) ? p.intent : "comercial",
        topic: p.topic || "General",
      })) as SuggestedPrompt[];
    if (prompts.length >= 5) return { prompts: prompts.slice(0, count), source: "ia" };
  } catch (e) {
    console.error("suggestPrompts", e);
  }
  return { prompts: templatePrompts(b, count), source: "plantilla" };
}

export async function suggestCompetitors(b: BrandInput): Promise<Competitor[]> {
  if (!helperAvailable()) return [];
  try {
    const out = await completeJson<{ competitors: Competitor[] }>(
      "Sos analista de mercado en Latinoamérica. Solo nombrás empresas reales que conocés con seguridad; si no estás seguro, devolvés menos.",
      `Marca: ${b.name} (${b.domain}). Rubro: ${b.category}. Mercado: ${countryName(b.country)}${b.city ? ", " + b.city : ""}.
Descripción: ${b.description ?? "-"}
Devolvé {"competitors":[{"name":"...","domain":"..."}]} con hasta 5 competidores directos que compiten por los mismos clientes en ese mercado.`,
    );
    return (out.competitors ?? []).filter((c) => c?.name).slice(0, 5);
  } catch (e) {
    console.error("suggestCompetitors", e);
    return [];
  }
}

/** Nombre de marca probable a partir del título de la home: "Pampa CRM | Software..." -> "Pampa CRM". */
export function guessBrandName(title: string | null, siteName: string | null, domain: string): string {
  if (siteName && siteName.length <= 40) return siteName.trim();
  if (title) {
    const parts = title.split(/\s[|\-–—·:]\s/).map((p) => p.trim()).filter(Boolean);
    const short = parts.sort((a, b) => a.length - b.length)[0];
    if (short && short.length <= 40) return short;
  }
  const stem = domain.replace(/^www\./, "").split(".")[0];
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}
