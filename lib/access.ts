// Aislamiento entre agencias: TODA lectura de clientes, análisis, ejecuciones y evidencia
// pasa por estas funciones, que filtran por workspace_id. Las rutas nunca buscan por id solo.

import { notFound } from "next/navigation";
import { getCtx, requireCtx, type Ctx } from "./auth";
import { all, one } from "./db";
import { toBrand, toResponse, toRun, type Brand, type ResponseRow, type Run } from "./types";

export async function getBrandInWorkspace(workspaceId: string, brandId: string): Promise<Brand | null> {
  const row = await one("SELECT * FROM brands WHERE id = ? AND workspace_id = ?", [brandId, workspaceId]);
  return row ? toBrand(row as Record<string, unknown>) : null;
}

export async function getRunInWorkspace(workspaceId: string, runId: string): Promise<Run | null> {
  const row = await one("SELECT * FROM runs WHERE id = ? AND workspace_id = ?", [runId, workspaceId]);
  return row ? toRun(row as Record<string, unknown>) : null;
}

export async function getJobInWorkspace(workspaceId: string, jobId: string): Promise<ResponseRow | null> {
  const row = await one("SELECT * FROM responses WHERE id = ? AND workspace_id = ?", [jobId, workspaceId]);
  return row ? toResponse(row as Record<string, unknown>) : null;
}

export async function getEvidenceInWorkspace(workspaceId: string, evidenceId: string): Promise<{ mime: string; data: Uint8Array } | null> {
  const row = await one<{ mime: string; data: ArrayBuffer | Uint8Array }>("SELECT mime, data FROM evidence WHERE id = ? AND workspace_id = ?", [
    evidenceId,
    workspaceId,
  ]);
  if (!row) return null;
  return { mime: row.mime, data: row.data instanceof Uint8Array ? row.data : new Uint8Array(row.data) };
}

export async function listRuns(workspaceId: string, brandId: string, limit = 20): Promise<Run[]> {
  const rows = await all("SELECT * FROM runs WHERE workspace_id = ? AND brand_id = ? ORDER BY created_at DESC LIMIT ?", [workspaceId, brandId, limit]);
  return rows.map((r) => toRun(r as Record<string, unknown>));
}

export async function brandForCtx(brandId: string): Promise<{ ctx: Ctx; brand: Brand }> {
  const ctx = await requireCtx();
  const brand = await getBrandInWorkspace(ctx.workspace.id, brandId);
  if (!brand) notFound();
  return { ctx, brand };
}

/** Para rutas API: devuelve null en vez de redirigir. */
export async function brandForApi(brandId: string): Promise<{ ctx: Ctx; brand: Brand } | null> {
  const ctx = await getCtx();
  if (!ctx) return null;
  const brand = await getBrandInWorkspace(ctx.workspace.id, brandId);
  return brand ? { ctx, brand } : null;
}

export async function workspaceBrands(workspaceId: string): Promise<Brand[]> {
  const rows = await all("SELECT * FROM brands WHERE workspace_id = ? ORDER BY name", [workspaceId]);
  return rows.map((r) => toBrand(r as Record<string, unknown>));
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

/** Borra un cliente y todo lo asociado (la base no garantiza cascadas). */
export async function deleteBrandCascade(workspaceId: string, brandId: string) {
  const { db } = await import("./db");
  await (await db()).batch(
    [
      { sql: "DELETE FROM evidence WHERE workspace_id = ? AND response_id IN (SELECT id FROM responses WHERE brand_id = ?)", args: [workspaceId, brandId] },
      { sql: "DELETE FROM responses WHERE workspace_id = ? AND brand_id = ?", args: [workspaceId, brandId] },
      { sql: "DELETE FROM runs WHERE workspace_id = ? AND brand_id = ?", args: [workspaceId, brandId] },
      { sql: "DELETE FROM prompts WHERE brand_id IN (SELECT id FROM brands WHERE id = ? AND workspace_id = ?)", args: [brandId, workspaceId] },
      { sql: "DELETE FROM actions WHERE brand_id IN (SELECT id FROM brands WHERE id = ? AND workspace_id = ?)", args: [brandId, workspaceId] },
      { sql: "DELETE FROM brands WHERE id = ? AND workspace_id = ?", args: [brandId, workspaceId] },
    ],
    "write",
  );
}
