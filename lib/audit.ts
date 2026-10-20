// Auditoría técnica de un sitio: qué bots de IA deja entrar el robots.txt y si la home
// tiene la información básica que los motores necesitan para entender la marca.

import { cleanDomain } from "./analyze";
import { safeFetch } from "./safe-fetch";

export const AI_BOTS: { agent: string; owner: string; purpose: string }[] = [
  { agent: "OAI-SearchBot", owner: "OpenAI", purpose: "Búsqueda en ChatGPT" },
  { agent: "ChatGPT-User", owner: "OpenAI", purpose: "Visitas pedidas por usuarios de ChatGPT" },
  { agent: "GPTBot", owner: "OpenAI", purpose: "Entrenamiento de modelos" },
  { agent: "Googlebot", owner: "Google", purpose: "Búsqueda y AI Overviews" },
  { agent: "Google-Extended", owner: "Google", purpose: "Gemini (entrenamiento y grounding)" },
  { agent: "PerplexityBot", owner: "Perplexity", purpose: "Índice de Perplexity" },
  { agent: "Perplexity-User", owner: "Perplexity", purpose: "Visitas pedidas por usuarios" },
  { agent: "Claude-SearchBot", owner: "Anthropic", purpose: "Búsqueda en Claude" },
  { agent: "Claude-User", owner: "Anthropic", purpose: "Visitas pedidas por usuarios de Claude" },
  { agent: "ClaudeBot", owner: "Anthropic", purpose: "Entrenamiento de modelos" },
  { agent: "Bingbot", owner: "Microsoft", purpose: "Bing y Copilot" },
  { agent: "Applebot-Extended", owner: "Apple", purpose: "Apple Intelligence" },
  { agent: "meta-externalagent", owner: "Meta", purpose: "Meta AI" },
  { agent: "CCBot", owner: "Common Crawl", purpose: "Corpus abierto usado por muchos modelos" },
];

// Los bots de búsqueda son los que más impactan en aparecer citado hoy.
const CRITICAL = new Set(["OAI-SearchBot", "ChatGPT-User", "Googlebot", "PerplexityBot", "Claude-SearchBot", "Bingbot"]);

type Group = { agents: string[]; rules: { allow: boolean; path: string }[] };

export function parseRobots(txt: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === "allow" || key === "disallow") {
      if (!current) continue;
      if (value || key === "allow") current.rules.push({ allow: key === "allow", path: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

export type BotStatus = "permitido" | "bloqueado" | "parcial";

export function botStatus(groups: Group[], agent: string): BotStatus {
  const a = agent.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((x) => x !== "*" && a.includes(x)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  const rules = chosen.flatMap((g) => g.rules);
  const rootBlocked = rules.some((r) => !r.allow && (r.path === "/" || r.path === "/*"));
  const rootAllowed = rules.some((r) => r.allow && (r.path === "/" || r.path === ""));
  if (rootBlocked && !rootAllowed) return "bloqueado";
  if (rules.some((r) => !r.allow && r.path)) return "parcial";
  return "permitido";
}

async function get(url: string, timeoutMs = 8000): Promise<{ status: number; text: string; finalUrl: string } | null> {
  try {
    // Descarga protegida contra SSRF (valida DNS e IPs en cada redirect, con límites de tamaño y tiempo).
    const res = await safeFetch(url, { timeoutMs, maxBytes: 800_000 });
    return { status: res.status, text: res.body, finalUrl: res.url };
  } catch {
    return null;
  }
}

export type HomeInfo = {
  reachable: boolean;
  title: string | null;
  description: string | null;
  h1: string | null;
  lang: string | null;
  schemaTypes: string[];
  words: number;
  siteName: string | null;
};

function decode(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

export function parseHome(html: string): Omit<HomeInfo, "reachable"> {
  const meta = (name: string) => {
    const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i");
    const tag = html.match(re)?.[0];
    const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
    return content ? decode(content) : null;
  };
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, " ");
  const lang = html.match(/<html[^>]*\blang=["']([^"']+)["']/i)?.[1] ?? null;
  const schemaTypes = new Set<string>();
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const t of m[1].matchAll(/"@type"\s*:\s*(?:"([^"]+)"|\[([^\]]+)\])/g)) {
      const list = t[1] ? [t[1]] : (t[2] ?? "").split(",").map((x) => x.replace(/["\s]/g, ""));
      list.filter(Boolean).forEach((x) => schemaTypes.add(x));
    }
  }
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const words = body.split(/\s+/).filter((w) => /[a-záéíóúñ]{2,}/i.test(w)).length;
  return {
    title: title ? decode(title.replace(/\s+/g, " ")) : null,
    description: meta("description") ?? meta("og:description"),
    h1: h1 ? decode(h1.replace(/\s+/g, " ")) : null,
    lang,
    schemaTypes: [...schemaTypes],
    words,
    siteName: meta("og:site_name"),
  };
}

export async function fetchHome(domain: string): Promise<HomeInfo> {
  const d = cleanDomain(domain);
  const res = (await get(`https://${d}/`)) ?? (await get(`https://www.${d}/`));
  if (!res || res.status >= 400) {
    return { reachable: false, title: null, description: null, h1: null, lang: null, schemaTypes: [], words: 0, siteName: null };
  }
  return { reachable: true, ...parseHome(res.text) };
}

export type Check = { id: string; label: string; ok: boolean; detail: string; weight: number };

export type SiteAudit = {
  domain: string;
  checkedAt: string;
  robotsFound: boolean;
  bots: { agent: string; owner: string; purpose: string; status: BotStatus; critical: boolean }[];
  home: HomeInfo;
  llmsTxt: boolean;
  sitemap: boolean;
  checks: Check[];
  score: number;
};

export async function auditSite(domain: string): Promise<SiteAudit> {
  const d = cleanDomain(domain);
  const [robots, home, llms] = await Promise.all([get(`https://${d}/robots.txt`), fetchHome(d), get(`https://${d}/llms.txt`)]);
  const robotsFound = Boolean(robots && robots.status < 400 && !/<html/i.test(robots.text.slice(0, 200)));
  const groups = robotsFound ? parseRobots(robots!.text) : [];
  const bots = AI_BOTS.map((b) => ({ ...b, status: botStatus(groups, b.agent), critical: CRITICAL.has(b.agent) }));
  const sitemap = robotsFound && /sitemap:/i.test(robots!.text);
  const llmsTxt = Boolean(llms && llms.status < 400 && !/<html/i.test(llms.text.slice(0, 200)) && llms.text.length > 20);
  const blockedCritical = bots.filter((b) => b.critical && b.status === "bloqueado");
  const hasOrg = home.schemaTypes.some((t) => /Organization|LocalBusiness|Corporation|Store|Restaurant/i.test(t));
  const hasFaq = home.schemaTypes.some((t) => /FAQPage/i.test(t));

  const checks: Check[] = [
    {
      id: "sitio",
      label: "El sitio responde",
      ok: home.reachable,
      detail: home.reachable ? "La home carga correctamente." : "No pudimos cargar la home: si nosotros no podemos, los bots tampoco.",
      weight: 3,
    },
    {
      id: "bots",
      label: "Bots de búsqueda con IA permitidos",
      ok: home.reachable && blockedCritical.length === 0,
      detail: !home.reachable
        ? "No pudimos verificarlo porque el sitio no respondió."
        : blockedCritical.length
        ? `robots.txt bloquea a ${blockedCritical.map((b) => b.agent).join(", ")}. Sin acceso, esos motores no pueden citarte.`
        : "Los bots que alimentan ChatGPT, Google, Perplexity, Claude y Copilot pueden entrar.",
      weight: 3,
    },
    {
      id: "titulo",
      label: "Título y descripción claros",
      ok: Boolean(home.title && home.description && home.description.length >= 50),
      detail: home.description
        ? `Descripción: «${home.description.slice(0, 160)}»`
        : "Falta la meta descripción: los motores tienen menos contexto para describir tu marca.",
      weight: 2,
    },
    {
      id: "schema",
      label: "Datos estructurados de la organización",
      ok: hasOrg,
      detail: hasOrg
        ? `Encontramos: ${home.schemaTypes.slice(0, 6).join(", ")}.`
        : "No hay schema Organization / LocalBusiness. Ayuda a que la IA identifique nombre, rubro y ubicación.",
      weight: 2,
    },
    {
      id: "contenido",
      label: "Contenido suficiente en la home",
      ok: home.words >= 250,
      detail: `Aproximadamente ${home.words} palabras visibles. Con poco texto (o todo en JavaScript) hay poco para citar.`,
      weight: 1,
    },
    {
      id: "faq",
      label: "Preguntas frecuentes marcadas",
      ok: hasFaq,
      detail: hasFaq ? "Hay FAQPage en la home." : "No hay FAQ estructurada. Responder preguntas concretas del rubro suele mejorar la citabilidad.",
      weight: 1,
    },
    {
      id: "sitemap",
      label: "Sitemap declarado",
      ok: sitemap,
      detail: sitemap ? "robots.txt declara el sitemap." : "Declarar el sitemap en robots.txt facilita el descubrimiento de páginas nuevas.",
      weight: 1,
    },
  ];
  const total = checks.reduce((a, c) => a + c.weight, 0);
  const score = Math.round((checks.reduce((a, c) => a + (c.ok ? c.weight : 0), 0) / total) * 100);
  return { domain: d, checkedAt: new Date().toISOString(), robotsFound, bots, home, llmsTxt, sitemap, checks, score };
}
