// Motor SIMULADO: se usa cuando falta la clave de un motor. Genera respuestas verosímiles
// y determinísticas para poder demostrar el flujo completo. Todo lo simulado queda
// marcado en la base y en la interfaz; nunca se mezcla con mediciones reales sin aviso.

import type { EngineId } from "../config";
import { countryName } from "../config";
import type { Competitor, Source } from "../types";
import type { EngineRequest, EngineResult } from "./types";

export type SimContext = {
  engine: EngineId;
  repetition: number;
  brand: { name: string; domain: string; category?: string | null };
  competitors: Competitor[];
  branded: boolean;
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EXTRA_SOFTWARE = ["Quebracho Digital", "Alerce Labs", "Tilo Systems", "Ñandú Soft", "Lapacho Group"];
const LOCAL_NAMES = ["Lapacho", "Alerce", "Ñandú", "Tilo", "Quebracho"];
const LOCAL_SOURCES = [
  "https://www.tripadvisor.com.ar/",
  "https://www.google.com/maps/",
  "https://www.instagram.com/",
  "https://www.infobae.com/",
  "https://www.lanacion.com.ar/",
  "https://www.reddit.com/r/BuenosAires/",
];
const SOFTWARE_SOURCES = [
  "https://www.g2.com/",
  "https://www.capterra.com/",
  "https://www.reddit.com/r/argentina/",
  "https://www.infobae.com/",
  "https://www.lanacion.com.ar/",
  "https://es.wikipedia.org/",
  "https://www.youtube.com/",
];
const PRAISE = [
  "muy recomendada por su facilidad de uso",
  "una opción sólida y confiable",
  "reconocida en el mercado local",
  "destaca por su soporte en español",
  "muy elegida por sus clientes",
];
const NEUTRAL = ["una alternativa a considerar", "ofrece planes para distintos tamaños", "tiene presencia regional"];
const CRITIC = ["algunos usuarios mencionan que es cara", "tiene quejas por demoras en el soporte", "es más limitada en integraciones"];

const ENGINE_BIAS: Record<EngineId, number> = { chatgpt: 0.2, gemini: 0.42, perplexity: 0.32, claude: 0.27 };

function isSoftware(category?: string | null) {
  return /software|crm|erp|saas|app|plataforma|sistema|digital|online|herramienta/i.test(category ?? "");
}

export function simulatedAnswer(req: EngineRequest, ctx: SimContext): EngineResult {
  const r = rng(hash(`${req.prompt}|${ctx.engine}|${ctx.repetition}|${ctx.brand.name}`));
  const where = req.city ? `${req.city} (${countryName(req.country)})` : countryName(req.country);
  const software = isSoftware(ctx.brand.category);
  // Nombres ficticios del rubro: "Cafetería Lapacho", "Estudio Alerce"...
  const head = (ctx.brand.category ?? "Grupo").trim().split(/\s+/)[0];
  const prefix = head.charAt(0).toUpperCase() + head.slice(1).toLowerCase();
  const extras = software ? EXTRA_SOFTWARE : LOCAL_NAMES.map((n) => `${prefix} ${n}`);
  const pool = [...ctx.competitors.map((c) => c.name), ...extras.slice(0, 2 + Math.floor(r() * 3))];
  const brandBias = (hash(ctx.brand.name + ctx.engine) % 30) / 100;
  const includeBrand = r() < (ctx.branded ? 0.9 : ENGINE_BIAS[ctx.engine] + brandBias - 0.1);
  // Mezcla determinística
  const names = pool.sort(() => r() - 0.5).slice(0, 3 + Math.floor(r() * 2));
  if (includeBrand) names.splice(Math.floor(r() * Math.min(names.length, 3)), 0, ctx.brand.name);

  const lines: string[] = [];
  lines.push(
    ctx.branded
      ? `Sobre tu consulta en ${where}, esto es lo que se sabe:`
      : `Estas son algunas de las opciones más mencionadas en ${where}${ctx.brand.category ? ` para ${ctx.brand.category}` : ""}:`,
  );
  lines.push("");
  names.forEach((n, i) => {
    const roll = r();
    const desc = roll < 0.55 ? PRAISE[Math.floor(r() * PRAISE.length)] : roll < 0.85 ? NEUTRAL[Math.floor(r() * NEUTRAL.length)] : CRITIC[Math.floor(r() * CRITIC.length)];
    lines.push(`${i + 1}. **${n}**: ${desc}.`);
  });
  lines.push("");
  lines.push(
    software
      ? "Te conviene comparar precios, soporte e integraciones según el tamaño de tu equipo."
      : "Te conviene revisar reseñas recientes y horarios antes de ir.",
  );

  const sources: Source[] = [];
  const domains = [
    ...(includeBrand && r() < 0.4 ? [ctx.brand.domain] : []),
    ...ctx.competitors.filter((c) => c.domain && names.includes(c.name) && r() < 0.5).map((c) => c.domain!),
  ];
  for (const d of domains) sources.push({ url: `https://${d}/`, domain: d, title: d });
  const generic = [...(software ? SOFTWARE_SOURCES : LOCAL_SOURCES)].sort(() => r() - 0.5).slice(0, 1 + Math.floor(r() * 3));
  for (const u of generic) {
    const d = new URL(u).hostname.replace(/^www\./, "");
    sources.push({ url: u, domain: d, title: d });
  }
  return { answer: lines.join("\n"), sources, model: "simulado", costUsd: 0, simulated: true };
}
