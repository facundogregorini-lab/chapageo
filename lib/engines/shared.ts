import { countryName } from "../config";

/** Instrucción de sistema común: pedimos lo que un usuario real vería, sin sesgo hacia ninguna marca. */
export function systemFor(country: string, city: string | null | undefined, language: string): string {
  const where = city ? `${city}, ${countryName(country)}` : countryName(country);
  const lang = language === "pt" ? "portugués" : language === "en" ? "inglés" : "español";
  return `Respondé como lo harías para una persona que vive en ${where}. Respondé en ${lang}. Si recomendás empresas, productos o servicios, nombralos concretamente.`;
}

export async function fetchJson(url: string, init: RequestInit, timeoutMs = 55_000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(t);
  }
}
