import { NextResponse } from "next/server";
import { prospectsThisMonth } from "@/lib/access";
import { getCtx } from "@/lib/auth";
import { runChecker, saveAudit } from "@/lib/checker";

// Bright Data puede tardar hasta ~1 minuto; si tarda más, el resultado se completa al abrirlo.
export const maxDuration = 120;

export async function POST(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const used = await prospectsThisMonth(ctx.workspace.id);
  if (used >= ctx.plan.prospectsPerMonth) {
    return NextResponse.json({ error: `Tu plan incluye ${ctx.plan.prospectsPerMonth} auditorías de prospección por mes y ya usaste ${used}.` }, { status: 402 });
  }
  const b = await req.json();
  if (!b.domain || !b.category) return NextResponse.json({ error: "Completá dominio y rubro." }, { status: 400 });
  try {
    const result = await runChecker({ domain: String(b.domain), category: String(b.category), country: String(b.country ?? "AR"), city: b.city || null, brandName: b.brandName || null });
    const saved = await saveAudit("prospect", result, { workspaceId: ctx.workspace.id, domain: result.domain });
    return NextResponse.json({ token: saved.shareToken });
  } catch (e) {
    console.error("prospect", e);
    return NextResponse.json({ error: "No pudimos completar la auditoría." }, { status: 500 });
  }
}
