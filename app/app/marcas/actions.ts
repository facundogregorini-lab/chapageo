"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { brandForCtx, deleteBrandCascade, workspaceBrands } from "@/lib/access";
import { cleanDomain } from "@/lib/analyze";
import { auditSite } from "@/lib/audit";
import { requireCtx } from "@/lib/auth";
import { canCreateBrand, canStartAnalysis } from "@/lib/billing";
import { saveAudit } from "@/lib/checker";
import { db, id, now, one, run, token } from "@/lib/db";
import { logEvent } from "@/lib/events";
import { LIMITS } from "@/lib/limits";
import { approvedPrompts, closeAnalysis, createAnalysis, UserError } from "@/lib/queue";
import { readSite } from "@/lib/site-reader";
import { classifyPrompt, suggestPrompts } from "@/lib/suggest";
import { PROMPT_CATEGORIES, type PromptCategory } from "@/lib/types";

const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

const CompetitorZ = z.object({ name: z.string().trim().min(1).max(80), domain: z.string().trim().max(120).optional().default("") });
const PromptZ = z.object({
  text: z.string().trim().min(8).max(300),
  category: z.enum(["descubrimiento", "comparacion", "marca"]),
  intent: z.enum(["informativa", "comercial", "transaccional"]).default("comercial"),
  topic: z.string().max(60).optional().default("General"),
  approved: z.boolean().default(true),
  source: z.enum(["ia", "plantilla", "manual"]).default("manual"),
});

const NewBrandZ = z.object({
  name: z.string().trim().min(1).max(80),
  domain: z.string().trim().min(3).max(120),
  description: z.string().max(800).optional().default(""),
  category: z.string().trim().min(2).max(120),
  country: z.string().length(2).default("AR"),
  language: z.enum(["es", "pt", "en"]).default("es"),
  aliases: z.array(z.string().trim().max(60)).max(10).default([]),
  competitors: z.array(CompetitorZ).max(LIMITS.maxCompetitors),
  prompts: z.array(PromptZ).max(40),
});

function parseCompetitors(raw: { name: string; domain?: string }[]) {
  return raw
    .filter((c) => c.name.trim())
    .slice(0, LIMITS.maxCompetitors)
    .map((c) => ({ name: c.name.trim(), domain: c.domain ? cleanDomain(c.domain) || undefined : undefined }));
}

export async function createBrandAction(payload: unknown): Promise<{ error?: string }> {
  const ctx = await requireCtx();
  const parsed = NewBrandZ.safeParse(payload);
  if (!parsed.success) return { error: "Revisá los datos: " + parsed.error.issues.map((i) => i.path.join(".") || i.message).join(", ") };
  const p = parsed.data;
  const domain = cleanDomain(p.domain);
  if (!DOMAIN_RE.test(domain)) return { error: "El dominio no parece válido." };
  const brands = await workspaceBrands(ctx.workspace.id);
  if (brands.length >= LIMITS.maxClientsPerAgency) return { error: `El límite actual es de ${LIMITS.maxClientsPerAgency} clientes por agencia.` };
  const planBlock = canCreateBrand(ctx, brands.length);
  if (planBlock) return { error: planBlock };
  const competitors = parseCompetitors(p.competitors);
  const aliases = p.aliases.filter(Boolean);
  const approved = p.prompts.filter((q) => q.approved).length;
  if (approved > LIMITS.maxPrompts) return { error: `Podés aprobar hasta ${LIMITS.maxPrompts} preguntas (marcaste ${approved}).` };

  const brandId = id("brd_");
  const ts = now();
  const ref = { name: p.name, domain, aliases, competitors };
  await (await db()).batch(
    [
      {
        sql: `INSERT INTO brands (id, workspace_id, name, domain, description, category, country, city, language, aliases, competitors, engines, repetitions, schedule, share_token, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, '[]', 1, 'manual', ?, ?)`,
        args: [brandId, ctx.workspace.id, p.name, domain, p.description || null, p.category, p.country, p.language, JSON.stringify(aliases), JSON.stringify(competitors), token(), ts],
      },
      ...p.prompts.map((q) => {
        const category = classifyPrompt(q.text, ref, q.category);
        return {
          sql: "INSERT INTO prompts (id, brand_id, text, kind, intent, topic, active, category, approved, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)",
          args: [id("prm_"), brandId, q.text, category === "marca" ? "con_marca" : "sin_marca", q.intent, q.topic, category, q.approved ? 1 : 0, q.source, ts, ts],
        };
      }),
    ],
    "write",
  );
  await logEvent("brand_created", { brandId, workspace: ctx.workspace.id, prompts: p.prompts.length });
  // La auditoría técnica no bloquea si el sitio no responde.
  try {
    const audit = await auditSite(domain);
    await saveAudit("crawl", audit, { workspaceId: ctx.workspace.id, brandId, domain });
  } catch (e) {
    console.error("audit onboarding", (e as Error).message);
  }
  redirect(`/app/marcas/${brandId}/analisis`);
}

export async function updateBrandAction(brandId: string, form: FormData) {
  const { ctx, brand } = await brandForCtx(brandId);
  const competitors = parseCompetitors(
    [0, 1, 2].map((i) => ({ name: String(form.get(`comp_name_${i}`) ?? ""), domain: String(form.get(`comp_domain_${i}`) ?? "") })),
  );
  const aliases = String(form.get("aliases") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10);
  const country = String(form.get("country") ?? brand.country).toUpperCase().slice(0, 2) || "AR";
  const language = ["es", "pt", "en"].includes(String(form.get("language"))) ? String(form.get("language")) : brand.language;
  await run(`UPDATE brands SET name=?, description=?, category=?, country=?, language=?, aliases=?, competitors=? WHERE id=? AND workspace_id=?`, [
    String(form.get("name") || brand.name).slice(0, 80),
    String(form.get("description") ?? "").slice(0, 800) || null,
    String(form.get("category") ?? "").slice(0, 120) || null,
    country,
    language,
    JSON.stringify(aliases),
    JSON.stringify(competitors),
    brandId,
    ctx.workspace.id,
  ]);
  revalidatePath(`/app/marcas/${brandId}`, "layout");
}

export async function deleteBrandAction(brandId: string) {
  const { ctx } = await brandForCtx(brandId);
  await deleteBrandCascade(ctx.workspace.id, brandId);
  redirect("/app");
}

// ---------------------------------------------------------------------------
// Preguntas
// ---------------------------------------------------------------------------

function categoryFrom(v: FormDataEntryValue | null): PromptCategory {
  return PROMPT_CATEGORIES.includes(String(v) as PromptCategory) ? (String(v) as PromptCategory) : "descubrimiento";
}

async function approvedCount(brandId: string) {
  return Number((await one<{ n: number }>("SELECT COUNT(*) AS n FROM prompts WHERE brand_id = ? AND approved = 1 AND active = 1", [brandId]))?.n ?? 0);
}

export async function addPromptAction(brandId: string, form: FormData) {
  const { brand } = await brandForCtx(brandId);
  const text = String(form.get("text") ?? "").trim().slice(0, 300);
  if (text.length < 8) return;
  const category = classifyPrompt(text, brand, categoryFrom(form.get("category")));
  const ts = now();
  await run(
    "INSERT INTO prompts (id, brand_id, text, kind, intent, topic, active, category, approved, source, created_at, updated_at) VALUES (?, ?, ?, ?, 'comercial', 'Propia', 1, ?, 0, 'manual', ?, ?)",
    [id("prm_"), brandId, text, category === "marca" ? "con_marca" : "sin_marca", category, ts, ts],
  );
  revalidatePath(`/app/marcas/${brandId}/preguntas`);
}

export async function updatePromptAction(brandId: string, promptId: string, form: FormData) {
  const { brand } = await brandForCtx(brandId);
  const text = String(form.get("text") ?? "").trim().slice(0, 300);
  if (text.length < 8) return;
  const category = classifyPrompt(text, brand, categoryFrom(form.get("category")));
  // Editar una pregunta la vuelve a dejar pendiente de aprobación.
  await run("UPDATE prompts SET text = ?, category = ?, kind = ?, approved = 0, updated_at = ? WHERE id = ? AND brand_id = ?", [
    text,
    category,
    category === "marca" ? "con_marca" : "sin_marca",
    now(),
    promptId,
    brandId,
  ]);
  revalidatePath(`/app/marcas/${brandId}/preguntas`);
}

export async function setApprovalAction(brandId: string, promptId: string, approve: boolean) {
  await brandForCtx(brandId);
  if (approve && (await approvedCount(brandId)) >= LIMITS.maxPrompts) return;
  await run("UPDATE prompts SET approved = ?, updated_at = ? WHERE id = ? AND brand_id = ?", [approve ? 1 : 0, now(), promptId, brandId]);
  revalidatePath(`/app/marcas/${brandId}/preguntas`);
}

export async function deletePromptAction(brandId: string, promptId: string) {
  await brandForCtx(brandId);
  await run("DELETE FROM prompts WHERE id = ? AND brand_id = ?", [promptId, brandId]);
  revalidatePath(`/app/marcas/${brandId}/preguntas`);
}

export async function suggestMorePromptsAction(brandId: string) {
  const { brand } = await brandForCtx(brandId);
  const existing = await one<{ n: number }>("SELECT COUNT(*) AS n FROM prompts WHERE brand_id = ?", [brandId]);
  if (Number(existing?.n ?? 0) >= 40) return;
  const site = await readSite(brand.domain).catch(() => null);
  const { prompts, source } = await suggestPrompts(
    { name: brand.name, domain: brand.domain, category: brand.category ?? "", description: brand.description, country: brand.country, competitors: brand.competitors, aliases: brand.aliases },
    12,
    site,
  );
  const have = new Set(
    ((await (await db()).execute({ sql: "SELECT text FROM prompts WHERE brand_id = ?", args: [brandId] })).rows as unknown as { text: string }[]).map((r) => r.text.toLowerCase()),
  );
  const ts = now();
  const fresh = prompts.filter((p) => !have.has(p.text.toLowerCase()));
  if (fresh.length)
    await (await db()).batch(
      fresh.map((p) => ({
        sql: "INSERT INTO prompts (id, brand_id, text, kind, intent, topic, active, category, approved, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0, ?, ?, ?)",
        args: [id("prm_"), brandId, p.text, p.category === "marca" ? "con_marca" : "sin_marca", p.intent, p.topic, p.category, source, ts, ts],
      })),
      "write",
    );
  revalidatePath(`/app/marcas/${brandId}/preguntas`);
}

// ---------------------------------------------------------------------------
// Análisis
// ---------------------------------------------------------------------------

export type StartState = { error?: string } | undefined;

export async function startAnalysisAction(brandId: string, _: StartState, form: FormData): Promise<StartState> {
  const { ctx } = await brandForCtx(brandId);
  const collectors = [...new Set(form.getAll("collectors").map(String))];
  const repetitions = Number(form.get("repetitions") ?? 1);
  const planBlock = await canStartAnalysis(ctx, { prompts: (await approvedPrompts(brandId)).length, collectors: collectors.length, repetitions });
  if (planBlock) return { error: planBlock };
  let runId: string;
  try {
    const r = await createAnalysis({
      workspaceId: ctx.workspace.id,
      brandId,
      collectors,
      repetitions,
      idempotencyKey: String(form.get("idem") || randomUUID()).slice(0, 80),
    });
    runId = r.id;
    await logEvent("analysis_created", { brandId, runId, total: r.total });
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    console.error("createAnalysis", e);
    return { error: "No pudimos crear el análisis. Probá de nuevo." };
  }
  redirect(`/app/marcas/${brandId}/analisis/${runId}`);
}

export async function closeAnalysisAction(brandId: string, runId: string) {
  const { ctx } = await brandForCtx(brandId);
  await closeAnalysis(ctx.workspace.id, runId);
  revalidatePath(`/app/marcas/${brandId}`, "layout");
}

export async function rotateShareToken(brandId: string) {
  const { ctx } = await brandForCtx(brandId);
  await run("UPDATE brands SET share_token = ? WHERE id = ? AND workspace_id = ?", [token(), brandId, ctx.workspace.id]);
  revalidatePath(`/app/marcas/${brandId}/informe`);
}
