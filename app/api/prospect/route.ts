import { NextResponse } from "next/server";
import { prospectsThisMonth } from "@/lib/access";
import { DEMO_READONLY, getCtx, isDemoCtx } from "@/lib/auth";
import { CHECKER_ENGINES, runChecker, saveAudit, type CheckerEngine } from "@/lib/checker";

export const maxDuration = 60;

export async function POST(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  // La demo la comparten todos los visitantes: una auditoría real consume consultas pagas.
  if (isDemoCtx(ctx)) return NextResponse.json({ error: DEMO_READONLY }, { status: 403 });
  const used = await prospectsThisMonth(ctx.workspace.id);
  if (used >= ctx.plan.prospectsPerMonth) {
    return NextResponse.json({ error: `Tu plan incluye ${ctx.plan.prospectsPerMonth} auditorías de prospección por mes y ya usaste ${used}.` }, { status: 402 });
  }
  const b = await req.json();
  if (!b.domain || !b.category) return NextResponse.json({ error: "Completá dominio y rubro." }, { status: 400 });
  const engines = Array.isArray(b.engines) ? (b.engines.filter((e: unknown) => CHECKER_ENGINES.includes(e as CheckerEngine)) as CheckerEngine[]) : undefined;
  try {
    const result = await runChecker({ domain: String(b.domain), category: String(b.category), country: String(b.country ?? "AR"), city: b.city || null, brandName: b.brandName || null, engines });
    const saved = await saveAudit("prospect", result, { workspaceId: ctx.workspace.id, domain: result.domain });
    return NextResponse.json({ token: saved.shareToken });
  } catch (e) {
    console.error("prospect", e);
    return NextResponse.json({ error: "No pudimos completar la auditoría." }, { status: 500 });
  }
}
