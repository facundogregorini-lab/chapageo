// Extracción estructurada de cada respuesta: menciones, posición, citas y sentimiento.
// Todo es determinístico para que el mismo texto dé siempre el mismo resultado
// y cada número del panel se pueda auditar contra la respuesta original.

import type { Competitor, Mention, Source } from "./types";

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function cleanDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, "");
  d = d.split(/[/?#]/)[0];
  d = d.replace(/^www\./, "");
  d = d.replace(/:\d+$/, "");
  return d;
}

export function domainOf(url: string): string {
  try {
    return cleanDomain(new URL(url).hostname);
  } catch {
    return cleanDomain(url);
  }
}

/** true si `host` es `domain` o un subdominio suyo. */
export function sameSite(host: string, domain: string): boolean {
  const h = cleanDomain(host);
  const d = cleanDomain(domain);
  if (!h || !d) return false;
  return h === d || h.endsWith("." + d);
}

/** "pampacrm.com.ar" -> "pampacrm" */
export function domainStem(domain: string): string {
  const d = cleanDomain(domain);
  const parts = d.split(".");
  const tlds = new Set(["com", "net", "org", "ar", "mx", "cl", "uy", "co", "pe", "es", "io", "ai", "app", "lat", "gob", "gov", "edu"]);
  while (parts.length > 1 && tlds.has(parts[parts.length - 1])) parts.pop();
  return parts[parts.length - 1] ?? d;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type Tracked = { name: string; own: boolean; terms: string[] };

export function trackedSet(
  brand: { name: string; domain: string; aliases: string[] },
  competitors: Competitor[],
): Tracked[] {
  const termsFor = (name: string, domain: string | undefined, aliases: string[] = []) => {
    const t = new Set<string>();
    for (const v of [name, ...aliases]) if (v && v.trim().length >= 2) t.add(normalize(v.trim()));
    if (domain) {
      t.add(normalize(cleanDomain(domain)));
      const stem = domainStem(domain);
      // El stem del dominio solo cuenta si es distintivo (evita "app", "shop", etc.)
      if (stem.length >= 5) t.add(normalize(stem));
    }
    return [...t];
  };
  return [
    { name: brand.name, own: true, terms: termsFor(brand.name, brand.domain, brand.aliases) },
    ...competitors.map((c) => ({ name: c.name, own: false, terms: termsFor(c.name, c.domain, c.aliases) })),
  ];
}

function findAll(haystack: string, term: string): number[] {
  // Límites de palabra que funcionan con acentos ya normalizados y con puntos de dominio.
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(term)}(?=$|[^a-z0-9])`, "g");
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(haystack))) {
    out.push(m.index + m[1].length);
    if (re.lastIndex === m.index) re.lastIndex++;
  }
  return out;
}

function snippetAround(original: string, index: number, radius = 110): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(original.length, index + radius);
  return (start > 0 ? "…" : "") + original.slice(start, end).replace(/\s+/g, " ").trim() + (end < original.length ? "…" : "");
}

/** Número de ítem de lista numerada por línea ("1. X", "2) X", "### 3. X"). null si la línea no es un ítem. */
function numberedLines(norm: string): { start: number; end: number; n: number | null }[] {
  const out: { start: number; end: number; n: number | null }[] = [];
  let pos = 0;
  for (const line of norm.split("\n")) {
    const m = line.match(/^\s*(?:#{1,4}\s*)?(?:\*\*)?(\d{1,2})[.)]\s+/);
    out.push({ start: pos, end: pos + line.length, n: m ? Number(m[1]) : null });
    pos += line.length + 1;
  }
  return out;
}

export function detectMentions(answer: string, tracked: Tracked[]): Mention[] {
  const norm = normalize(answer);
  const lines = numberedLines(norm);
  // Solo hablamos de "ranking explícito" si la respuesta tiene una lista numerada (2+ ítems).
  const hasRanking = lines.filter((l) => l.n != null).length >= 2;
  const found: { t: Tracked; first: number; count: number; rank: number | null }[] = [];
  for (const t of tracked) {
    const positions = new Set<number>();
    for (const term of t.terms) for (const p of findAll(norm, term)) positions.add(p);
    if (!positions.size) continue;
    const sorted = [...positions].sort((a, b) => a - b);
    let rank: number | null = null;
    if (hasRanking) {
      for (const p of sorted) {
        const line = lines.find((l) => p >= l.start && p <= l.end);
        if (line?.n != null) {
          rank = line.n;
          break;
        }
      }
    }
    found.push({ t, first: sorted[0], count: positions.size, rank });
  }
  found.sort((a, b) => a.first - b.first);
  return found.map((f, i) => ({
    name: f.t.name,
    own: f.t.own,
    position: i + 1,
    explicitRank: f.rank,
    count: f.count,
    snippet: snippetAround(answer, approxOriginalIndex(answer, f.first)),
  }));
}

function approxOriginalIndex(original: string, normIndex: number): number {
  let n = 0;
  for (let i = 0; i < original.length; i++) {
    if (n >= normIndex) return i;
    n += original[i].normalize("NFD").replace(/[̀-ͯ]/g, "").length;
  }
  return original.length;
}

const STOP_NAMES = new Set(
  [
    "importante", "ventajas", "desventajas", "precio", "precios", "conclusion", "conclusión", "recomendacion",
    "recomendación", "nota", "resumen", "opciones", "caracteristicas", "características", "pros", "contras",
    "ideal para", "por que", "por qué", "consejo", "consejos", "otras opciones", "alternativas", "fuentes",
    "en resumen", "beneficios", "puntos clave", "considera", "consideraciones", "facilidad de uso", "soporte",
    "integraciones", "costo", "costos", "mejor para", "ubicacion", "ubicación", "horario", "contacto",
  ].map(normalize),
);

// Palabras con las que suelen empezar los títulos descriptivos en negrita ("Muy fuerte en stock",
// "Ideal para pymes"): no son marcas.
const DESCRIPTIVE_START = new Set(
  [
    "muy", "mas", "mejor", "mejores", "ideal", "buena", "bueno", "buen", "excelente", "gran", "grande", "alta", "alto", "baja", "bajo",
    "amplia", "amplio", "precio", "precios", "opcion", "opciones", "atencion", "servicio", "servicios", "calidad", "ubicacion", "envio",
    "envios", "stock", "variedad", "facil", "rapido", "rapida", "ventaja", "ventajas", "desventaja", "recomendado", "recomendada", "popular",
    "lider", "fuerte", "solido", "solida", "economico", "economica", "barato", "barata", "caro", "cara", "para", "por", "con", "sin", "si",
    "no", "como", "que", "cuando", "donde", "tambien", "otra", "otras", "otro", "otros", "algunas", "algunos", "todas", "todos", "cada",
    "paso",
    "tip", "tips", "ejemplo", "ejemplos", "experiencia", "reputacion", "garantia", "financiacion", "cuotas", "descuentos", "promociones",
    "cobertura", "horarios", "seguridad", "confianza", "comunidad", "reseñas", "resenas", "opiniones", "comparacion", "comparativa",
  ].map(normalize),
);
const CONNECTORS = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "&", "and", "of", "the", "en", "da", "do"]);

/** Heurística conservadora: ¿parece un nombre propio de marca y no un título descriptivo? */
export function looksLikeBrand(candidate: string): boolean {
  const words = candidate.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 5) return false;
  if (!/^[A-Z0-9ÁÉÍÓÚÑ]/.test(words[0])) return false;
  if (DESCRIPTIVE_START.has(normalize(words[0]))) return false;
  // Todas las palabras (salvo conectores) deben empezar en mayúscula o número, o ser un dominio.
  for (const w of words.slice(1)) {
    if (CONNECTORS.has(w.toLowerCase())) continue;
    if (/^[a-z0-9-]+\.[a-z.]{2,}$/i.test(w)) continue;
    if (!/^[A-Z0-9ÁÉÍÓÚÑ]/.test(w)) return false;
  }
  if (words.length > 1 && CONNECTORS.has(words[words.length - 1].toLowerCase())) return false;
  return true;
}

/**
 * Marcas que la IA nombra en listas y que no estamos siguiendo: sirven para sugerir competidores.
 * Toma ítems de lista ("1. **Nombre**", "- Nombre:") y textos en negrita.
 */
export function extractListedBrands(answer: string, tracked: Tracked[]): string[] {
  const candidates: string[] = [];
  const lines = answer.split(/\n+/);
  for (const line of lines) {
    const item = line.match(/^\s*(?:\d+[.)]|[-*•])\s+(.*)$/);
    const body = item ? item[1] : null;
    const bold = [...line.matchAll(/\*\*([^*]{2,60})\*\*/g)].map((m) => m[1]);
    if (bold.length) candidates.push(...bold);
    else if (body) {
      const head = body.split(/[:–—]| - |\(/)[0];
      if (head.length <= 40) candidates.push(head);
    }
  }
  const trackedTerms = tracked.flatMap((t) => t.terms);
  const out = new Map<string, string>();
  for (let c of candidates) {
    c = c.replace(/[*_`#]/g, "").replace(/[:.,;]+$/, "").trim();
    const n = normalize(c);
    if (c.length < 2 || c.length > 40) continue;
    if (c.split(/\s+/).length > 5) continue;
    if (STOP_NAMES.has(n)) continue;
    if (!looksLikeBrand(c)) continue;
    if (trackedTerms.some((t) => n === t || n.includes(t) || t.includes(n))) continue;
    if (!out.has(n)) out.set(n, c);
  }
  return [...out.values()].slice(0, 12);
}

const POSITIVE = [
  "recomend", "lider", "excelente", "confiable", "mejor", "destaca", "popular", "facil", "buena", "bueno",
  "solido", "ideal", "robust", "complet", "reconocid", "innovador", "eficiente", "intuitiv", "segur",
  "rapido", "valorad", "prestigio", "calidad", "favorit", "referente", "versatil", "accesible",
];
const NEGATIVE = [
  "caro", "costoso", "queja", "problema", "lento", "limitad", "malo", "mala ", "deficien", "critica",
  "desventaja", "complicad", "falla", "estafa", "reclamo", "dificil", "inestable", "poco claro", "denuncia",
  "negativ", "peor", "carece", "no recomend", "insegur", "demora",
];

export function sentimentFor(answer: string, mentions: Mention[]): { label: "positivo" | "neutral" | "negativo"; score: number } | null {
  const own = mentions.find((m) => m.own);
  if (!own) return null;
  // Oraciones que contienen la mención propia
  const sentences = answer.split(/(?<=[.!?\n])\s+/);
  const ownTerms = [normalize(own.name)];
  const relevant = sentences.filter((s) => ownTerms.some((t) => normalize(s).includes(t)));
  const text = normalize((relevant.length ? relevant : [own.snippet]).join(" "));
  let pos = 0;
  let neg = 0;
  for (const w of POSITIVE) if (text.includes(w)) pos++;
  for (const w of NEGATIVE) if (text.includes(w)) neg++;
  const score = pos + neg === 0 ? 0 : (pos - neg) / (pos + neg);
  const label = score > 0.25 ? "positivo" : score < -0.25 ? "negativo" : "neutral";
  return { label, score: Math.round(score * 100) / 100 };
}

export type SourceClass = "propio" | "competidor" | "reseñas" | "medio" | "comunidad" | "referencia" | "marketplace" | "otro";

const CLASS_RULES: [SourceClass, string[]][] = [
  ["comunidad", ["reddit.com", "quora.com", "youtube.com", "facebook.com", "instagram.com", "tiktok.com", "x.com", "twitter.com", "linkedin.com", "medium.com", "taringa.net", "foros", "forum"]],
  ["reseñas", ["g2.com", "capterra", "trustpilot.com", "getapp", "softwareadvice", "tripadvisor", "google.com/maps", "yelp.com", "glassdoor", "clutch.co", "sortlist", "reclamos", "opiniones"]],
  ["marketplace", ["mercadolibre", "amazon.", "tiendanube", "pedidosya", "rappi"]],
  ["referencia", ["wikipedia.org", ".gob.ar", ".gov", ".edu", "argentina.gob.ar", "afip", "arca.gob.ar", "bcra.gob.ar"]],
  ["medio", ["clarin.com", "lanacion.com", "infobae.com", "pagina12", "perfil.com", "ambito.com", "cronista.com", "iprofesional.com", "tn.com.ar", "lavoz.com.ar", "losandes.com.ar", "forbes", "bloomberg", "eleconomista", "infotechnology", "xataka", "genbeta", "elpais", "news", "noticias", "diario", "revista", "blog"]],
];

export function classifySource(domain: string, brandDomain: string, competitors: Competitor[]): SourceClass {
  if (sameSite(domain, brandDomain)) return "propio";
  if (competitors.some((c) => c.domain && sameSite(domain, c.domain))) return "competidor";
  const d = domain.toLowerCase();
  for (const [cls, needles] of CLASS_RULES) if (needles.some((n) => d.includes(n))) return cls;
  return "otro";
}

export function dedupeSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const s of sources) {
    if (!s.url) continue;
    const key = s.url.replace(/[#?].*$/, "").replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...s, domain: s.domain || domainOf(s.url) });
  }
  return out;
}

export function citesDomain(sources: Source[], domain: string | undefined | null): boolean {
  if (!domain) return false;
  return sources.some((s) => sameSite(s.domain || domainOf(s.url), domain));
}

export type Analysis = {
  mentions: Mention[];
  otherBrands: string[];
  brandMentioned: boolean;
  brandPosition: number | null;
  ownCited: boolean;
  sentiment: { label: "positivo" | "neutral" | "negativo"; score: number } | null;
};

export function analyzeAnswer(
  answer: string,
  sources: Source[],
  brand: { name: string; domain: string; aliases: string[] },
  competitors: Competitor[],
): Analysis {
  const tracked = trackedSet(brand, competitors);
  const mentions = detectMentions(answer, tracked);
  const own = mentions.find((m) => m.own);
  // "Cita" = la respuesta enlaza al dominio (un link o una fuente). Nombrar el dominio en el texto no cuenta.
  const ownCited = citesDomain(sources, brand.domain);
  return {
    mentions,
    otherBrands: extractListedBrands(answer, tracked),
    brandMentioned: Boolean(own),
    brandPosition: own ? own.position : null,
    ownCited,
    sentiment: sentimentFor(answer, mentions),
  };
}
