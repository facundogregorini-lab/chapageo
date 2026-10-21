// Suscripciones autogestionables: alta con Mercado Pago, sincronización por webhook y plan vigente.
// La fuente de verdad es siempre la API de Mercado Pago: el webhook solo avisa qué suscripción mirar.

import type { Ctx } from "./auth";
import { formatArs, isSubscriptionPlan, PLANS, planPriceArs, type PlanId } from "./config";
import { all, id, now, one, run } from "./db";
import { logEvent } from "./events";
import { LIMITS } from "./limits";
import {
  createPreapprovalPlan,
  getAuthorizedPayment,
  getPreapproval,
  searchPreapprovalsByPlan,
  mpConfigured,
  updatePreapprovalStatus,
  type Preapproval,
  type PreapprovalPlan,
} from "./mercadopago";

export type SubscriptionStatus = "creating" | "pending" | "authorized" | "paused" | "cancelled" | "failed";

export type Subscription = {
  id: string;
  workspace_id: string;
  user_id: string | null;
  plan: PlanId;
  provider: string;
  provider_id: string | null;
  provider_plan_id?: string | null;
  status: SubscriptionStatus;
  payer_email: string | null;
  amount: number;
  currency: string;
  checkout_url: string | null;
  last_charged_at: string | null;
  next_payment_at: string | null;
  paid_until: string | null;
  created_at: string;
  updated_at: string;
};

export class BillingError extends Error {}

/** Días de gracia después del fin del período pago (reintentos de cobro, demoras del webhook). */
const GRACE_DAYS = 3;
/** Acceso provisorio entre la autorización y el primer cobro. */
const FIRST_CHARGE_DAYS = 3;
const DAY = 86_400_000;

const RANK: Record<PlanId, number> = { prueba: 0, diagnostico: 1, marca: 1, agencia: 2 };

export const PLAN_UPGRADE_HINT = "Podés cambiar de plan en «Plan y pago».";

function addMonths(iso: string, months: number): Date {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/** Hasta cuándo da acceso una suscripción (null = no da acceso). Función pura, para poder probarla. */
export function accessUntil(
  sub: Pick<Subscription, "status" | "last_charged_at" | "created_at">,
  at = new Date(),
): Date | null {
  const paid = sub.last_charged_at ? new Date(addMonths(sub.last_charged_at, 1).getTime() + GRACE_DAYS * DAY) : null;
  let until: Date | null = null;
  if (sub.status === "authorized") until = paid ?? new Date(new Date(sub.created_at).getTime() + FIRST_CHARGE_DAYS * DAY);
  // Pausada o cancelada: conserva lo que ya pagó hasta el fin del período.
  else if (sub.status === "paused" || sub.status === "cancelled") until = paid;
  return until && until > at ? until : null;
}

export function mapStatus(s: string | undefined | null): SubscriptionStatus {
  return s === "authorized" || s === "paused" || s === "cancelled" || s === "pending" ? s : "pending";
}

export async function listSubscriptions(workspaceId: string): Promise<Subscription[]> {
  return all<Subscription>("SELECT * FROM subscriptions WHERE workspace_id = ? ORDER BY created_at DESC", [workspaceId]);
}

/** Recalcula workspaces.plan / plan_expires_at a partir de sus suscripciones. */
export async function recomputeWorkspacePlan(workspaceId: string, at = new Date()): Promise<{ plan: PlanId; expiresAt: string | null } | null> {
  const subs = await listSubscriptions(workspaceId);
  if (!subs.length) return null; // planes asignados a mano (sin suscripción) no se tocan
  let best: { plan: PlanId; until: Date } | null = null;
  for (const s of subs) {
    const until = accessUntil(s, at);
    if (!until || !PLANS[s.plan]) continue;
    if (!best || RANK[s.plan] > RANK[best.plan] || (RANK[s.plan] === RANK[best.plan] && until > best.until)) best = { plan: s.plan, until };
  }
  const plan: PlanId = best?.plan ?? "prueba";
  const expiresAt = best ? best.until.toISOString() : null;
  await run("UPDATE workspaces SET plan = ?, plan_expires_at = ? WHERE id = ? AND COALESCE(is_demo, 0) = 0", [plan, expiresAt, workspaceId]);
  return { plan, expiresAt };
}

export function appBaseUrl(origin?: string): string {
  return (process.env.APP_URL || origin || "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Crea un plan de suscripción en Mercado Pago y devuelve su checkout. El pagador entra con su
 * cuenta de Mercado Pago (no le pedimos el email); la suscripción que crea trae el id del plan.
 */
export async function startCheckout(ctx: Ctx, planId: string, origin?: string): Promise<string> {
  if (!isSubscriptionPlan(planId)) throw new BillingError("Ese plan no se contrata por suscripción.");
  if (Number(ctx.workspace.is_demo ?? 0)) throw new BillingError("El espacio de demostración no se puede suscribir. Creá tu cuenta.");
  if (!mpConfigured()) throw new BillingError("Los pagos todavía no están habilitados. Escribinos y te damos de alta a mano.");
  const plan = PLANS[planId];
  const amount = planPriceArs(plan);
  if (!amount) throw new BillingError("Ese plan no tiene precio en pesos configurado.");
  const subs = await listSubscriptions(ctx.workspace.id);
  if (subs.some((s) => s.status === "authorized" && s.plan === planId)) throw new BillingError(`Ya tenés el plan ${plan.name} activo.`);
  // Volver a tocar «Suscribirme» retoma el checkout recién creado en vez de abrir otra suscripción pendiente.
  const dayAgo = new Date(Date.now() - DAY).toISOString();
  const open = subs.find((s) => s.status === "pending" && s.plan === planId && s.amount === amount && s.checkout_url && !s.provider_id && s.created_at >= dayAgo);
  if (open?.checkout_url) return open.checkout_url;

  const subId = id("sub_");
  const ts = now();
  await run(
    `INSERT INTO subscriptions (id, workspace_id, user_id, plan, provider, status, amount, currency, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'mercadopago', 'creating', ?, 'ARS', ?, ?)`,
    [subId, ctx.workspace.id, ctx.user.id, planId, amount, ts, ts],
  );
  let mpPlan: PreapprovalPlan;
  try {
    mpPlan = await createPreapprovalPlan({
      reason: `ChapaGEO · Plan ${plan.name}`,
      amount,
      currency: "ARS",
      backUrl: `${appBaseUrl(origin)}/app/plan?retorno=${subId}`,
    });
  } catch (e) {
    await run("UPDATE subscriptions SET status = 'failed', raw = ?, updated_at = ? WHERE id = ?", [JSON.stringify({ error: String(e) }), now(), subId]);
    console.error("mp_create_plan", e);
    throw new BillingError("Mercado Pago no pudo iniciar la suscripción. Probá de nuevo en unos minutos.");
  }
  const url = mpPlan.init_point ?? null;
  await run("UPDATE subscriptions SET provider_plan_id = ?, status = 'pending', checkout_url = ?, raw = ?, updated_at = ? WHERE id = ?", [
    mpPlan.id,
    url,
    JSON.stringify(mpPlan),
    now(),
    subId,
  ]);
  await logEvent("checkout_started", { plan: planId, amount, workspace: ctx.workspace.id });
  if (!url) throw new BillingError("Mercado Pago no devolvió el link de pago. Probá de nuevo.");
  return url;
}

/** Aplica el estado que informa Mercado Pago a la suscripción local y al plan del workspace. */
export async function applyPreapproval(pre: Preapproval): Promise<Subscription | null> {
  const local =
    (await one<Subscription>("SELECT * FROM subscriptions WHERE provider = 'mercadopago' AND provider_id = ?", [pre.id])) ??
    (pre.preapproval_plan_id
      ? await one<Subscription>("SELECT * FROM subscriptions WHERE provider = 'mercadopago' AND provider_plan_id = ? AND provider_id IS NULL", [pre.preapproval_plan_id])
      : null) ??
    (pre.external_reference ? await one<Subscription>("SELECT * FROM subscriptions WHERE id = ? AND provider = 'mercadopago'", [pre.external_reference]) : null);
  if (!local) return null;
  const status = mapStatus(pre.status);
  const lastCharged = pre.summarized?.last_charged_date ?? local.last_charged_at;
  const ts = now();
  await run(
    `UPDATE subscriptions SET provider_id = ?, status = ?, payer_email = COALESCE(?, payer_email), last_charged_at = ?, next_payment_at = ?, raw = ?, updated_at = ?
     WHERE id = ?`,
    [pre.id, status, pre.payer_email || null, lastCharged ?? null, pre.next_payment_date ?? null, JSON.stringify(pre), ts, local.id],
  );
  const updated = { ...local, status, provider_id: pre.id, last_charged_at: lastCharged ?? null, next_payment_at: pre.next_payment_date ?? null };
  const until = accessUntil(updated);
  await run("UPDATE subscriptions SET paid_until = ? WHERE id = ?", [until ? until.toISOString() : null, local.id]);

  if (status !== local.status) {
    await logEvent("subscription_status", { plan: local.plan, from: local.status, to: status, workspace: local.workspace_id });
    // Al activar un plan nuevo, se dan de baja las otras suscripciones activas (cambio de plan).
    if (status === "authorized") {
      const others = await all<Subscription>(
        "SELECT * FROM subscriptions WHERE workspace_id = ? AND id != ? AND status IN ('authorized', 'paused') AND provider_id IS NOT NULL",
        [local.workspace_id, local.id],
      );
      for (const o of others) {
        try {
          await applyPreapproval(await updatePreapprovalStatus(o.provider_id!, "cancelled"));
        } catch (e) {
          console.error("mp_cancel_previous", o.id, e);
        }
      }
    }
  }
  await recomputeWorkspacePlan(local.workspace_id);
  return { ...updated, paid_until: until ? until.toISOString() : null, updated_at: ts };
}

export async function syncPreapproval(preapprovalId: string): Promise<Subscription | null> {
  return applyPreapproval(await getPreapproval(preapprovalId));
}

/** Al volver del checkout o abrir la página del plan: no dependemos de que el webhook haya llegado. */
export async function refreshWorkspaceSubscriptions(workspaceId: string): Promise<void> {
  if (!mpConfigured()) return;
  const stale = new Date(Date.now() - 2 * DAY).toISOString();
  const recent = new Date(Date.now() - 7 * DAY).toISOString();
  const subs = await all<Subscription>(
    `SELECT * FROM subscriptions WHERE workspace_id = ? AND (provider_id IS NOT NULL OR provider_plan_id IS NOT NULL)
       AND ((status = 'pending' AND created_at >= ?) OR (status = 'authorized' AND updated_at < ?)) LIMIT 5`,
    [workspaceId, recent, stale],
  );
  for (const s of subs) {
    try {
      if (s.provider_id) await syncPreapproval(s.provider_id);
      // Alta por plan todavía sin suscripción conocida: la buscamos por el id del plan.
      else for (const pre of await searchPreapprovalsByPlan(s.provider_plan_id!)) await applyPreapproval(pre);
    } catch (e) {
      console.error("mp_refresh", s.id, e);
    }
  }
  await recomputeWorkspacePlan(workspaceId);
}

export async function cancelSubscription(ctx: Ctx, subId: string): Promise<void> {
  const sub = await one<Subscription>("SELECT * FROM subscriptions WHERE id = ? AND workspace_id = ?", [subId, ctx.workspace.id]);
  if (!sub) throw new BillingError("Suscripción inexistente.");
  if (!sub.provider_id || sub.status === "cancelled" || sub.status === "failed" || sub.status === "creating") {
    await run("UPDATE subscriptions SET status = 'cancelled', updated_at = ? WHERE id = ?", [now(), sub.id]);
    await recomputeWorkspacePlan(ctx.workspace.id);
    return;
  }
  try {
    await applyPreapproval(await updatePreapprovalStatus(sub.provider_id, "cancelled"));
  } catch (e) {
    console.error("mp_cancel", sub.id, e);
    throw new BillingError("Mercado Pago no respondió. Probá de nuevo o cancelala desde tu cuenta de Mercado Pago.");
  }
  await logEvent("subscription_cancel_request", { plan: sub.plan, workspace: ctx.workspace.id });
}

/** Procesa una notificación de Mercado Pago. Devuelve qué hizo, para el registro. */
export async function handleNotification(topic: string, resourceId: string): Promise<string> {
  let result = "ignorado";
  let subId: string | null = null;
  try {
    if (topic === "subscription_preapproval" || topic === "preapproval") {
      const s = await syncPreapproval(resourceId);
      subId = s?.id ?? null;
      result = s ? `ok:${s.status}` : "desconocida";
    } else if (topic === "subscription_authorized_payment" || topic === "authorized_payment") {
      const pay = await getAuthorizedPayment(resourceId);
      if (pay.preapproval_id) {
        const s = await syncPreapproval(pay.preapproval_id);
        subId = s?.id ?? null;
        result = s ? `ok:pago_${pay.status ?? "?"}` : "desconocida";
      } else result = "pago_sin_suscripcion";
    }
  } catch (e) {
    result = "error";
    await run("INSERT INTO billing_events (id, provider, topic, resource_id, subscription_id, result, payload, created_at) VALUES (?, 'mercadopago', ?, ?, ?, ?, ?, ?)", [
      id("bev_"), topic, resourceId, subId, result, JSON.stringify({ error: String(e) }), now(),
    ]);
    throw e;
  }
  await run("INSERT INTO billing_events (id, provider, topic, resource_id, subscription_id, result, payload, created_at) VALUES (?, 'mercadopago', ?, ?, ?, ?, '{}', ?)", [
    id("bev_"), topic, resourceId, subId, result, now(),
  ]);
  return result;
}

// ---------------------------------------------------------------------------
// Límites del plan (el espacio demo no tiene topes de plan)
// ---------------------------------------------------------------------------

function monthStart(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export function canCreateBrand(ctx: Ctx, currentBrands: number): string | null {
  if (Number(ctx.workspace.is_demo ?? 0)) return null;
  const max = Math.min(ctx.plan.maxBrands, LIMITS.maxClientsPerAgency);
  if (currentBrands >= max)
    return `Tu plan ${ctx.plan.name} incluye ${max} ${max === 1 ? "cliente" : "clientes"}. ${PLAN_UPGRADE_HINT}`;
  return null;
}

export async function canStartAnalysis(ctx: Ctx, opts: { prompts: number; collectors: number; repetitions: number }): Promise<string | null> {
  if (Number(ctx.workspace.is_demo ?? 0)) return null;
  const p = ctx.plan;
  if (opts.prompts > p.promptPool) return `Tu plan ${p.name} permite hasta ${p.promptPool} preguntas por análisis (aprobaste ${opts.prompts}). ${PLAN_UPGRADE_HINT}`;
  if (opts.collectors > p.maxEngines) return `Tu plan ${p.name} permite hasta ${p.maxEngines} motores por análisis. ${PLAN_UPGRADE_HINT}`;
  if (opts.repetitions > p.repetitions)
    return `Tu plan ${p.name} permite ${p.repetitions} ${p.repetitions === 1 ? "repetición" : "repeticiones"} por pregunta. ${PLAN_UPGRADE_HINT}`;
  if (p.analysesPerMonth != null) {
    const r = await one<{ n: number }>("SELECT COUNT(*) AS n FROM runs WHERE workspace_id = ? AND COALESCE(is_demo, 0) = 0 AND created_at >= ?", [
      ctx.workspace.id,
      monthStart(),
    ]);
    if (Number(r?.n ?? 0) >= p.analysesPerMonth)
      return `Tu plan ${p.name} incluye ${p.analysesPerMonth} ${p.analysesPerMonth === 1 ? "análisis" : "análisis"} por mes y ya lo usaste. ${PLAN_UPGRADE_HINT}`;
  }
  return null;
}

/** Topes que la web muestra antes de iniciar un análisis (los mismos que valida canStartAnalysis). */
export function analysisCaps(ctx: Ctx): { maxPrompts: number; maxEngines: number; maxReps: number; planName: string | null } {
  if (Number(ctx.workspace.is_demo ?? 0)) return { maxPrompts: LIMITS.maxPrompts, maxEngines: 99, maxReps: LIMITS.maxRepetitions, planName: null };
  return {
    maxPrompts: Math.min(LIMITS.maxPrompts, ctx.plan.promptPool),
    maxEngines: ctx.plan.maxEngines,
    maxReps: Math.min(LIMITS.maxRepetitions, ctx.plan.repetitions),
    planName: ctx.plan.name,
  };
}

export function priceLabel(planId: PlanId): string | null {
  const v = planPriceArs(PLANS[planId]);
  return v ? `${formatArs(v)} / mes` : null;
}
