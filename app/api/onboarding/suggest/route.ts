import { NextResponse } from "next/server";
import { cleanDomain } from "@/lib/analyze";
import { getCtx } from "@/lib/auth";
import { LIMITS } from "@/lib/limits";
import { readSite } from "@/lib/site-reader";
import { suggestCompetitors, suggestPrompts } from "@/lib/suggest";

export const maxDuration = 60;

export async function POST(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const domain = cleanDomain(String(body.domain ?? ""));
  const input = {
    name: String(body.name ?? "").slice(0, 80),
    domain,
    category: String(body.category ?? "").slice(0, 120),
    description: body.description ? String(body.description).slice(0, 800) : null,
    country: String(body.country ?? "AR").slice(0, 2),
    aliases: Array.isArray(body.aliases) ? body.aliases.map(String).slice(0, 10) : [],
    competitors: Array.isArray(body.competitors)
      ? body.competitors.slice(0, LIMITS.maxCompetitors).map((c: { name?: string; domain?: string }) => ({ name: String(c?.name ?? ""), domain: c?.domain ? String(c.domain) : undefined }))
      : [],
  };
  if (body.what === "competitors") return NextResponse.json({ competitors: (await suggestCompetitors(input)).slice(0, LIMITS.maxCompetitors) });
  // Lectura acotada y protegida (SSRF) de páginas públicas del sitio.
  const site = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) ? await readSite(domain).catch(() => null) : null;
  const { prompts, source, note } = await suggestPrompts(input, Math.min(Math.max(Number(body.count ?? 15), 5), 20), site);
  return NextResponse.json({ prompts, source, note, pagesRead: site?.pages.map((p) => p.url) ?? [] });
}
