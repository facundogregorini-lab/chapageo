import { notFound } from "next/navigation";
import { getCtx, requireCtx, type Ctx } from "./auth";
import { all, one } from "./db";
import { toBrand, type Brand } from "./types";

export async function brandForCtx(brandId: string): Promise<{ ctx: Ctx; brand: Brand }> {
  const ctx = await requireCtx();
  const row = await one("SELECT * FROM brands WHERE id = ? AND workspace_id = ?", [brandId, ctx.workspace.id]);
  if (!row) notFound();
  return { ctx, brand: toBrand(row as Record<string, unknown>) };
}

/** Para rutas API: devuelve null en vez de redirigir. */
export async function brandForApi(brandId: string): Promise<{ ctx: Ctx; brand: Brand } | null> {
  const ctx = await getCtx();
  if (!ctx) return null;
  const row = await one("SELECT * FROM brands WHERE id = ? AND workspace_id = ?", [brandId, ctx.workspace.id]);
  return row ? { ctx, brand: toBrand(row as Record<string, unknown>) } : null;
}

export async function workspaceBrands(workspaceId: string): Promise<Brand[]> {
  const rows = await all("SELECT * FROM brands WHERE workspace_id = ? ORDER BY created_at", [workspaceId]);
  return rows.map((r) => toBrand(r as Record<string, unknown>));
}

export async function promptPoolUsed(workspaceId: string): Promise<number> {
  const r = await one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM prompts p JOIN brands b ON b.id = p.brand_id WHERE b.workspace_id = ? AND p.active = 1",
    [workspaceId],
  );
  return Number(r?.n ?? 0);
}

export async function prospectsThisMonth(workspaceId: string): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const r = await one<{ n: number }>("SELECT COUNT(*) AS n FROM audits WHERE workspace_id = ? AND kind = 'prospect' AND created_at >= ?", [
    workspaceId,
    start.toISOString(),
  ]);
  return Number(r?.n ?? 0);
}
