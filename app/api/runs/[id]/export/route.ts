import { getBrandInWorkspace, getRunInWorkspace } from "@/lib/access";
import { getCtx } from "@/lib/auth";
import { csvForRun } from "@/lib/csv";
import { one } from "@/lib/db";
import { runJobs } from "@/lib/metrics";
import { toBrand, toRun, type Brand, type Run } from "@/lib/types";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shareToken = new URL(req.url).searchParams.get("t");
  let brand: Brand | null = null;
  let run: Run | null = null;
  if (shareToken) {
    // Link público del informe: el token identifica al cliente y el análisis debe ser suyo.
    const b = await one("SELECT * FROM brands WHERE share_token = ?", [shareToken]);
    const r = b ? await one("SELECT * FROM runs WHERE id = ? AND brand_id = ? AND workspace_id = ?", [id, String(b.id), String(b.workspace_id)]) : null;
    if (b && r) {
      brand = toBrand(b as Record<string, unknown>);
      run = toRun(r as Record<string, unknown>);
    }
  } else {
    const ctx = await getCtx();
    if (ctx) {
      run = await getRunInWorkspace(ctx.workspace.id, id);
      brand = run ? await getBrandInWorkspace(ctx.workspace.id, run.brand_id) : null;
    }
  }
  if (!brand || !run) return new Response("No autorizado", { status: 401 });
  const jobs = await runJobs(brand.workspace_id, run.id);
  const slug = brand.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return new Response(csvForRun(brand, run, jobs), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="chapageo-${slug}-${run.created_at.slice(0, 10)}.csv"` },
  });
}
