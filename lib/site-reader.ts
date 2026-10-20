// Lectura acotada del sitio del cliente para sugerir preguntas: la home y hasta 3 páginas
// públicas relevantes del mismo dominio (nosotros, servicios, productos…), con límites de
// tamaño y de tiempo y protección SSRF en cada descarga y redirect.

import { cleanDomain, sameSite } from "./analyze";
import { parseHome } from "./audit";
import { safeFetch } from "./safe-fetch";

export type SitePage = { url: string; title: string | null; description: string | null; h1: string | null; text: string };
export type SiteReading = { domain: string; reachable: boolean; pages: SitePage[]; error: string | null };

const RELEVANT = /(nosotros|quienes|qui[eé]nes-somos|about|empresa|servicios?|productos?|soluciones|que-hacemos|planes|precios|catalogo|tienda|faq|preguntas)/i;
const MAX_PAGES = 4;
const PAGE_BYTES = 800_000;
const TOTAL_MS = 15_000;

export function visibleText(html: string, max = 2500): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function relevantLinks(html: string, base: string, domain: string, limit = MAX_PAGES - 1): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    let u: URL;
    try {
      u = new URL(m[1], base);
    } catch {
      continue;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") continue;
    if (!sameSite(u.hostname, domain)) continue;
    if (!RELEVANT.test(u.pathname)) continue;
    if (/\.(pdf|jpe?g|png|gif|zip|webp|mp4)$/i.test(u.pathname)) continue;
    u.search = "";
    const s = u.toString();
    if (!out.includes(s)) out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

export async function readSite(domainInput: string): Promise<SiteReading> {
  const domain = cleanDomain(domainInput);
  const deadline = Date.now() + TOTAL_MS;
  const left = () => Math.max(500, deadline - Date.now());
  let home: { url: string; body: string } | null = null;
  let lastError: string | null = null;
  for (const u of [`https://${domain}/`, `https://www.${domain}/`]) {
    try {
      const r = await safeFetch(u, { maxBytes: PAGE_BYTES, timeoutMs: Math.min(8000, left()) });
      if (r.status < 400 && /html|text/i.test(r.contentType || "text/html")) {
        home = { url: r.url, body: r.body };
        break;
      }
      lastError = `HTTP ${r.status}`;
    } catch (e) {
      lastError = (e as Error).message;
    }
  }
  if (!home) return { domain, reachable: false, pages: [], error: lastError };
  const pages: SitePage[] = [];
  const toPage = (url: string, body: string): SitePage => {
    const info = parseHome(body);
    return { url, title: info.title, description: info.description, h1: info.h1, text: visibleText(body) };
  };
  pages.push(toPage(home.url, home.body));
  for (const link of relevantLinks(home.body, home.url, domain)) {
    if (Date.now() > deadline - 500) break;
    try {
      const r = await safeFetch(link, { maxBytes: PAGE_BYTES, timeoutMs: Math.min(6000, left()) });
      if (r.status < 400 && sameSite(new URL(r.url).hostname, domain)) pages.push(toPage(r.url, r.body));
    } catch {
      // una página secundaria que falla no frena la lectura
    }
  }
  return { domain, reachable: true, pages, error: null };
}
