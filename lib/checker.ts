// Checker rápido: lo usa la landing (gratis, sin registro) y la prospección de agencias.
// 5 preguntas sin marca × 1 motor con búsqueda web + auditoría técnica del sitio.

import { analyzeAnswer, cleanDomain } from "./analyze";
import { auditSite, type SiteAudit } from "./audit";
import { ENGINES, engineConfigured, type EngineId } from "./config";
import { id, now, run, token } from "./db";
import { askEngine } from "./engines";
import { guessBrandName, suggestPrompts } from "./suggest";
import type { Source } from "./types";

export type CheckerInput = { domain: string; category: string; country: string; city?: string | null; brandName?: string | null };

export type CheckerResult = {
  domain: string;
  brandName: string;
  category: string;
  country: string;
  city: string | null;
  engine: EngineId;
  engineLabel: string;
  simulated: boolean;
  questions: {
    text: string;
    mentioned: boolean;
    position: number | null;
    cited: boolean;
    others: string[];
    snippet: string | null;
    answer: string;
    sources: Source[];
    error?: string;
  }[];
  mentioned: number;
  total: number;
  cited: number;
  topOthers: { name: string; count: number }[];
  topSources: { domain: string; count: number }[];
  audit: SiteAudit;
  score: number;
  createdAt: string;
};

export function pickCheckerEngine(): EngineId {
  const order: EngineId[] = ["gemini", "chatgpt", "perplexity", "claude"];
  return order.find(engineConfigured) ?? "gemini";
}

export async function runChecker(input: CheckerInput): Promise<CheckerResult> {
  const domain = cleanDomain(input.domain);
  const audit = await auditSite(domain);
  const brandName = input.brandName?.trim() || guessBrandName(audit.home.title, audit.home.siteName, domain);
  const engine = pickCheckerEngine();
  const { prompts } = await suggestPrompts(
    { name: brandName, domain, category: input.category, description: audit.home.description, country: input.country, city: input.city },
    8,
  );
  const unbranded = prompts.filter((p) => p.kind === "sin_marca").slice(0, 5);
  const brand = { name: brandName, domain, aliases: [] as string[] };

  const questions = await Promise.all(
    unbranded.map(async (p, i) => {
      try {
        const res = await askEngine(
          engine,
          { prompt: p.text, country: input.country, city: input.city, language: "es" },
          { repetition: i + 1, brand: { name: brandName, domain, category: input.category }, competitors: [], branded: false },
        );
        const a = analyzeAnswer(res.answer, res.sources, brand, []);
        return {
          text: p.text,
          mentioned: a.brandMentioned,
          position: a.brandPosition,
          cited: a.ownCited,
          others: a.otherBrands.slice(0, 6),
          snippet: a.mentions.find((m) => m.own)?.snippet ?? null,
          answer: res.answer,
          sources: res.sources.slice(0, 8),
          simulated: res.simulated,
        };
      } catch (e) {
        return { text: p.text, mentioned: false, position: null, cited: false, others: [], snippet: null, answer: "", sources: [], error: (e as Error).message, simulated: false };
      }
    }),
  );

  const valid = questions.filter((q) => !q.error);
  const others = new Map<string, number>();
  const srcs = new Map<string, number>();
  for (const q of valid) {
    for (const o of q.others) others.set(o, (others.get(o) ?? 0) + 1);
    for (const d of new Set(q.sources.map((s) => s.domain))) srcs.set(d, (srcs.get(d) ?? 0) + 1);
  }
  const mentioned = valid.filter((q) => q.mentioned).length;
  const cited = valid.filter((q) => q.cited).length;
  // Puntaje simple y explicable: 70% visibilidad en respuestas, 30% salud técnica.
  const visibility = valid.length ? mentioned / valid.length : 0;
  const score = Math.round(visibility * 70 + (audit.score / 100) * 30);

  return {
    domain,
    brandName,
    category: input.category,
    country: input.country,
    city: input.city ?? null,
    engine,
    engineLabel: ENGINES[engine].label,
    simulated: questions.some((q) => (q as { simulated?: boolean }).simulated),
    questions,
    mentioned,
    total: valid.length,
    cited,
    topOthers: [...others.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    topSources: [...srcs.entries()].map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    audit,
    score,
    createdAt: now(),
  };
}

export async function saveAudit(kind: "checker" | "prospect" | "crawl", result: unknown, opts: { workspaceId?: string | null; brandId?: string | null; domain: string }) {
  const auditId = id("aud_");
  const share = token();
  await run("INSERT INTO audits (id, workspace_id, brand_id, kind, domain, share_token, result, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
    auditId,
    opts.workspaceId ?? null,
    opts.brandId ?? null,
    kind,
    opts.domain,
    share,
    JSON.stringify(result),
    now(),
  ]);
  return { id: auditId, shareToken: share };
}
