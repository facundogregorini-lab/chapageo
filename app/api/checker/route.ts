import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { cleanDomain } from "@/lib/analyze";
import { runChecker, saveAudit } from "@/lib/checker";
import { one } from "@/lib/db";
import { logEvent } from "@/lib/events";

// Bright Data puede tardar hasta ~1 minuto; si tarda más, el resultado se completa al abrirlo.
export const maxDuration = 120;

const Body = z.object({
  domain: z.string().min(3).max(200),
  category: z.string().min(2).max(120),
  country: z.string().length(2).default("AR"),
  city: z.string().max(80).optional().nullable(),
  visitor: z.string().max(64).optional(),
});

const DAILY_LIMIT = Number(process.env.CHECKER_DAILY_LIMIT ?? 5);

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Revisá el dominio y el rubro." }, { status: 400 });
  const input = parsed.data;
  const domain = cleanDomain(input.domain);
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return NextResponse.json({ error: "Ese dominio no parece válido." }, { status: 400 });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const ipHash = createHash("sha256").update(ip + (process.env.AUTH_SECRET ?? "")).digest("hex").slice(0, 16);
  const since = new Date(Date.now() - 864e5).toISOString();
  const used = await one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM events WHERE name = 'checker_start' AND json_extract(props, '$.ip') = ? AND created_at > ?",
    [ipHash, since],
  );
  if (Number(used?.n ?? 0) >= DAILY_LIMIT) {
    return NextResponse.json({ error: "Llegaste al límite diario de chequeos gratis. Pedí el diagnóstico completo y lo vemos juntos." }, { status: 429 });
  }
  await logEvent("checker_start", { ip: ipHash, domain, category: input.category }, input.visitor);

  try {
    const result = await runChecker({ domain, category: input.category, country: input.country, city: input.city });
    const saved = await saveAudit("checker", result, { domain });
    await logEvent("checker_done", { domain, mentioned: result.mentioned, total: result.total, simulated: result.simulated }, input.visitor);
    return NextResponse.json({ token: saved.shareToken });
  } catch (e) {
    console.error("checker", e);
    return NextResponse.json({ error: "No pudimos completar el análisis. Probá de nuevo en un rato." }, { status: 500 });
  }
}
