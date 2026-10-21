"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isDemoCtx, requireCtx } from "@/lib/auth";
import { run } from "@/lib/db";

export async function updateWorkspaceAction(form: FormData) {
  const ctx = await requireCtx();
  if (isDemoCtx(ctx)) return;
  const color = String(form.get("brand_color") ?? "");
  const logo = String(form.get("logo_url") ?? "").trim();
  await run("UPDATE workspaces SET name = ?, brand_color = ?, logo_url = ?, report_footer = ? WHERE id = ?", [
    String(form.get("name") ?? "").trim() || ctx.workspace.name,
    /^#[0-9a-fA-F]{6}$/.test(color) ? color : ctx.workspace.brand_color,
    /^https:\/\//.test(logo) ? logo : null,
    String(form.get("report_footer") ?? "").trim() || null,
    ctx.workspace.id,
  ]);
  revalidatePath("/app", "layout");
  redirect("/app/ajustes?guardado=1");
}
