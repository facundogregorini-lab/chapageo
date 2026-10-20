import { NextResponse } from "next/server";
import { brandForApi } from "@/lib/access";
import { generateActions } from "@/lib/actions";
import { auditSite } from "@/lib/audit";
import { saveAudit } from "@/lib/checker";

export const maxDuration = 30;

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await brandForApi(id);
  if (!access) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const audit = await auditSite(access.brand.domain);
  await saveAudit("crawl", audit, { workspaceId: access.ctx.workspace.id, brandId: id, domain: access.brand.domain });
  await generateActions(id);
  return NextResponse.json({ audit });
}
