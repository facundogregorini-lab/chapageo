"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { brandForCtx, promptPoolUsed, workspaceBrands } from "@/lib/access";
import { generateActions } from "@/lib/actions";
import { cleanDomain } from "@/lib/analyze";
import { auditSite } from "@/lib/audit";
import { requireCtx } from "@/lib/auth";
import { saveAudit } from "@/lib/checker";
import { ENGINE_IDS } from "@/lib/config";
import { db, id, now, one, run, token } from "@/lib/db";
import { logEvent } from "@/lib/events";

const CompetitorZ = z.object({ name: z.string().min(1).max(80), domain: z.string().max(120).optional().default("") });
const PromptZ = z.object({
  text: z.string().min(5).max(300),
  kind: z.enum(["sin_marca", "con_marca"]),
  intent: z.enum(["informativa", "comercial", "transaccional"]),
  topic: z.string().max(60).optional().default("General"),
});

const NewBrandZ = z.object({
  name: z.string().min(1).max(80),
  domain: z.string().min(3).max(120),
  description: z.string().max(500).optional().default(""),
  category: z.string().min(2).max(120),
  country: z.string().length(2),
  city: z.string().max(80).optional().default(""),
  aliases: z.array(z.string().max(60)).max(10).default([]),
  competitors: z.array(CompetitorZ).max(8),
  prompts: z.array(PromptZ).min(1).max(60),
  engines: z.array(z.enum(ENGINE_IDS as [string, ...string[]])).min(1),
  repetitions: z.number().int().min(1).max(5),
  schedule: z.enum(["weekly", "manual"]),
});

export async function createBrandAction(payload: unknown): Promise<{ error?: string }> {
  const ctx = await requireCtx();
  const parsed = NewBrandZ.safeParse(payload);
  if (!parsed.success) return { error: "Revisá los datos: " + parsed.error.issues.map((i) => i.path.join(".")).join(", ") };
  const p = parsed.data;
  const brands = await workspaceBrands(ctx.workspace.id);
  if (brands.length >= ctx.plan.maxBrands) return { error: `Tu plan ${ctx.plan.name} permite ${ctx.plan.maxBrands} marca(s).` };
  const used = await promptPoolUsed(ctx.workspace.id);
  if (used + p.prompts.length > ctx.plan.promptPool)
    return { error: `Te quedan ${ctx.plan.promptPool - used} preguntas en el pool de tu plan; seleccionaste ${p.prompts.length}.` };
  if (p.engines.length > ctx.plan.maxEngines) return { error: `Tu plan permite ${ctx.plan.maxEngines} motores.` };

  const brandId = id("brd_");
  const ts = now();
  const domain = cleanDomain(p.domain);
  await (await db()).batch(
    [
      {
        sql: `INSERT INTO brands (id, workspace_id, name, domain, description, category, country, city, language, aliases, competitors, engines, repetitions, schedule, share_token, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'es', ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          brandId, ctx.workspace.id, p.name.trim(), domain, p.description || null, p.category.trim(), p.country, p.city || null,
          JSON.stringify(p.aliases.filter(Boolean)),
          JSON.stringify(p.competitors.map((c) => ({ name: c.name.trim(), domain: c.domain ? cleanDomain(c.domain) : undefined }))),
          JSON.stringify(p.engines), Math.min(p.repetitions, ctx.plan.repetitions), p.schedule, token(), ts,
        ],
      },
      ...p.prompts.map((q) => ({
        sql: "INSERT INTO prompts (id, brand_id, text, kind, intent, topic, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
        args: [id("prm_"), brandId, q.text.trim(), q.kind, q.intent, q.topic, ts],
      })),
    ],
    "write",
  );
  await logEvent("brand_created", { brandId, workspace: ctx.workspace.id, prompts: p.prompts.length });
  // La auditoría técnica no bloquea si el sitio no responde
  try {
    const audit = await auditSite(domain);
    await saveAudit("crawl", audit, { workspaceId: ctx.workspace.id, brandId, domain });
  } catch (e) {
    console.error("audit onboarding", e);
  }
  redirect(`/app/marcas/${brandId}?correr=1`);
}

export async function updateBrandAction(brandId: string, form: FormData) {
  const { ctx, brand } = await brandForCtx(brandId);
  const competitors = String(form.get("competitors") ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [name, domain] = l.split(/[,|]/).map((x) => x.trim());
      return { name, domain: domain ? cleanDomain(domain) : undefined };
    })
    .slice(0, 8);
  const aliases = String(form.get("aliases") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10);
  const engines = ENGINE_IDS.filter((e) => form.get(`engine_${e}`)).slice(0, ctx.plan.maxEngines);
  await run(
    `UPDATE brands SET name=?, description=?, category=?, city=?, aliases=?, competitors=?, engines=?, repetitions=?, schedule=? WHERE id=?`,
    [
      String(form.get("name") || brand.name),
      String(form.get("description") ?? "") || null,
      String(form.get("category") ?? "") || null,
      String(form.get("city") ?? "") || null,
      JSON.stringify(aliases),
      JSON.stringify(competitors),
      JSON.stringify(engines.length ? engines : brand.engines),
      Math.max(1, Math.min(Number(form.get("repetitions") ?? brand.repetitions), ctx.plan.repetitions)),
      form.get("schedule") === "manual" ? "manual" : "weekly",
      brandId,
    ],
  );
  revalidatePath(`/app/marcas/${brandId}`, "layout");
}

export async function deleteBrandAction(brandId: string) {
  await brandForCtx(brandId);
  await run("DELETE FROM brands WHERE id = ?", [brandId]);
  redirect("/app");
}

export async function addPromptAction(brandId: string, form: FormData) {
  const { ctx } = await brandForCtx(brandId);
  const text = String(form.get("text") ?? "").trim();
  if (text.length < 5) return;
  if ((await promptPoolUsed(ctx.workspace.id)) >= ctx.plan.promptPool) return;
  await run("INSERT INTO prompts (id, brand_id, text, kind, intent, topic, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)", [
    id("prm_"),
    brandId,
    text,
    form.get("kind") === "con_marca" ? "con_marca" : "sin_marca",
    ["informativa", "comercial", "transaccional"].includes(String(form.get("intent"))) ? String(form.get("intent")) : "comercial",
    String(form.get("topic") ?? "") || "General",
    now(),
  ]);
  revalidatePath(`/app/marcas/${brandId}/preguntas`);
}

export async function togglePromptAction(brandId: string, promptId: string) {
  const { ctx } = await brandForCtx(brandId);
  const p = await one<{ active: number }>("SELECT active FROM prompts WHERE id = ? AND brand_id = ?", [promptId, brandId]);
  if (!p) return;
  if (!Number(p.active) && (await promptPoolUsed(ctx.workspace.id)) >= ctx.plan.promptPool) return;
  await run("UPDATE prompts SET active = ? WHERE id = ?", [Number(p.active) ? 0 : 1, promptId]);
  revalidatePath(`/app/marcas/${brandId}/preguntas`);
}

export async function deletePromptAction(brandId: string, promptId: string) {
  await brandForCtx(brandId);
  await run("DELETE FROM prompts WHERE id = ? AND brand_id = ?", [promptId, brandId]);
  revalidatePath(`/app/marcas/${brandId}/preguntas`);
}

export async function updateActionStatus(brandId: string, actionId: string, form: FormData) {
  await brandForCtx(brandId);
  const status = String(form.get("status") ?? "");
  const owner = String(form.get("owner") ?? "").trim();
  await run("UPDATE actions SET status = COALESCE(?, status), owner = ?, updated_at = ? WHERE id = ? AND brand_id = ?", [
    ["pendiente", "en_curso", "hecha", "descartada"].includes(status) ? status : null,
    owner || null,
    now(),
    actionId,
    brandId,
  ]);
  revalidatePath(`/app/marcas/${brandId}/acciones`);
}

export async function rotateShareToken(brandId: string) {
  await brandForCtx(brandId);
  await run("UPDATE brands SET share_token = ? WHERE id = ?", [token(), brandId]);
  revalidatePath(`/app/marcas/${brandId}/reporte`);
}

export async function refreshActionsAction(brandId: string) {
  await brandForCtx(brandId);
  await generateActions(brandId);
  revalidatePath(`/app/marcas/${brandId}/acciones`);
}
