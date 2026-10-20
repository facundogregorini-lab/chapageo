"use server";

import { revalidatePath } from "next/cache";
import { requireCtx } from "@/lib/auth";
import { run } from "@/lib/db";

const STAGES = ["nuevo", "contactado", "propuesta", "pago", "perdido"];

export async function updateLeadAction(leadId: string, form: FormData) {
  const ctx = await requireCtx();
  if (!ctx.isAdmin) return;
  const stage = String(form.get("stage") ?? "");
  const amount = Number(form.get("amount_usd") ?? "");
  await run("UPDATE leads SET stage = ?, amount_usd = ? WHERE id = ?", [STAGES.includes(stage) ? stage : "nuevo", Number.isFinite(amount) && amount > 0 ? amount : null, leadId]);
  revalidatePath("/app/validacion");
}
