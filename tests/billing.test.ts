import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { before, beforeEach, test } from "node:test";
import { setupAgency, useTempDb } from "./helpers";

useTempDb();
process.env.MP_ACCESS_TOKEN = "TEST-token-de-prueba";
process.env.APP_URL = "https://chapageo.test";

type B = typeof import("../lib/billing");
type D = typeof import("../lib/db");
type A = typeof import("../lib/auth");
let b: B, dbm: D, auth: A;

// Mercado Pago simulado: guarda las suscripciones creadas y responde GET/PUT.
const mp = new Map<string, Record<string, unknown>>();
const payments = new Map<string, { id: string; preapproval_id: string; status: string }>();
let calls: { method: string; url: string; body: unknown }[] = [];

globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  calls.push({ method, url, body });
  const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  let m: RegExpMatchArray | null;
  if (method === "POST" && url.endsWith("/preapproval")) {
    const pre = { id: `pre${mp.size + 1}`, status: "pending", init_point: `https://mp.test/checkout/${mp.size + 1}`, date_created: new Date().toISOString(), ...body };
    mp.set(pre.id, pre);
    return json(201, pre);
  }
  if ((m = url.match(/\/preapproval\/([^/?]+)$/))) {
    const pre = mp.get(m[1]);
    if (!pre) return json(404, { message: "not found" });
    if (method === "PUT") Object.assign(pre, body);
    return json(200, pre);
  }
  if ((m = url.match(/\/authorized_payments\/([^/?]+)$/))) {
    const p = payments.get(m[1]);
    return p ? json(200, p) : json(404, { message: "not found" });
  }
  return json(500, { message: "ruta no simulada" });
}) as typeof fetch;

before(async () => {
  dbm = await import("../lib/db");
  b = await import("../lib/billing");
  auth = await import("../lib/auth");
  await dbm.db();
});

beforeEach(() => {
  calls = [];
});

async function ctxFor(ws: string) {
  const { PLANS } = await import("../lib/config");
  const workspace = (await dbm.one<import("../lib/types").Workspace>("SELECT * FROM workspaces WHERE id = ?", [ws]))!;
  return { user: { id: "usr_x", email: "dueno@agencia.com", name: null, workspace_id: ws }, workspace, plan: auth.effectivePlan(workspace) ?? PLANS.prueba, isAdmin: false } as import("../lib/auth").Ctx;
}

const wsPlan = async (ws: string) => (await dbm.one<{ plan: string; plan_expires_at: string | null }>("SELECT plan, plan_expires_at FROM workspaces WHERE id = ?", [ws]))!;

test("accessUntil: autorizada da acceso; cancelada conserva el período pago; pendiente no", () => {
  const at = new Date("2026-05-10T00:00:00Z");
  const created = "2026-05-01T00:00:00Z";
  assert.equal(b.accessUntil({ status: "pending", last_charged_at: null, created_at: created }, at), null);
  // Autorizada sin cobro todavía: acceso provisorio de 3 días.
  assert.equal(b.accessUntil({ status: "authorized", last_charged_at: null, created_at: "2026-05-09T00:00:00Z" }, at)?.toISOString(), "2026-05-12T00:00:00.000Z");
  assert.equal(b.accessUntil({ status: "authorized", last_charged_at: null, created_at: created }, at), null);
  // Cobrada el 1/5: vale hasta el 1/6 + 3 días de gracia.
  assert.equal(b.accessUntil({ status: "authorized", last_charged_at: created, created_at: created }, at)?.toISOString(), "2026-06-04T00:00:00.000Z");
  assert.equal(b.accessUntil({ status: "cancelled", last_charged_at: created, created_at: created }, at)?.toISOString(), "2026-06-04T00:00:00.000Z");
  assert.equal(b.accessUntil({ status: "cancelled", last_charged_at: created, created_at: created }, new Date("2026-06-05T00:00:00Z")), null);
  assert.equal(b.accessUntil({ status: "cancelled", last_charged_at: null, created_at: created }, at), null);
});

test("effectivePlan vuelve a prueba cuando vence el período", () => {
  assert.equal(auth.effectivePlan({ plan: "marca", plan_expires_at: "2026-01-01T00:00:00Z" }, new Date("2026-02-01")).id, "prueba");
  assert.equal(auth.effectivePlan({ plan: "marca", plan_expires_at: "2026-03-01T00:00:00Z" }, new Date("2026-02-01")).id, "marca");
  assert.equal(auth.effectivePlan({ plan: "agencia", plan_expires_at: null }).id, "agencia");
});

test("alta completa: checkout, webhook autorizado, cobro, cambio de plan y baja", async () => {
  const { ws } = await setupAgency("Pagadora");
  const url = await b.startCheckout(await ctxFor(ws), "marca", "Comprador@Test.com");
  assert.equal(url, "https://mp.test/checkout/1");
  const post = calls.find((c) => c.method === "POST")!;
  const sent = post.body as { payer_email: string; back_url: string; auto_recurring: { transaction_amount: number; currency_id: string }; external_reference: string };
  assert.equal(sent.payer_email, "comprador@test.com");
  assert.equal(sent.auto_recurring.currency_id, "ARS");
  assert.equal(sent.auto_recurring.transaction_amount, 129000);
  assert.match(sent.back_url, /^https:\/\/chapageo\.test\/app\/plan\?retorno=sub_/);
  assert.equal((await wsPlan(ws)).plan, "prueba");

  // El comprador autoriza en Mercado Pago y llega el webhook.
  Object.assign(mp.get("pre1")!, { status: "authorized", summarized: { charged_quantity: 1, last_charged_date: new Date().toISOString() } });
  assert.equal(await b.handleNotification("subscription_preapproval", "pre1"), "ok:authorized");
  let w = await wsPlan(ws);
  assert.equal(w.plan, "marca");
  assert.ok(w.plan_expires_at && new Date(w.plan_expires_at) > new Date(Date.now() + 25 * 86_400_000));

  // Un cobro mensual llega como authorized_payment y resincroniza.
  payments.set("777", { id: "777", preapproval_id: "pre1", status: "processed" });
  assert.equal(await b.handleNotification("subscription_authorized_payment", "777"), "ok:pago_processed");

  // No deja suscribirse dos veces al mismo plan.
  await assert.rejects(b.startCheckout(await ctxFor(ws), "marca", "comprador@test.com"), /Ya tenés el plan/);

  // Cambio a Agencia: al autorizarse, la anterior se cancela sola.
  await b.startCheckout(await ctxFor(ws), "agencia", "comprador@test.com");
  Object.assign(mp.get("pre2")!, { status: "authorized" });
  await b.handleNotification("subscription_preapproval", "pre2");
  assert.equal(mp.get("pre1")!.status, "cancelled");
  assert.equal((await wsPlan(ws)).plan, "agencia");

  // Baja de Agencia: sin cobros todavía, vale el acceso provisorio y después vuelve a Monitoreo (período pago) .
  const ctx = await ctxFor(ws);
  const agencia = (await b.listSubscriptions(ws)).find((s) => s.plan === "agencia")!;
  await b.cancelSubscription(ctx, agencia.id);
  assert.equal(mp.get("pre2")!.status, "cancelled");
  assert.equal((await wsPlan(ws)).plan, "marca");

  const log = await dbm.all("SELECT * FROM billing_events WHERE resource_id = 'pre1'");
  assert.ok(log.length >= 1);
});

test("pausada sin cobros quita el acceso; suscripción ajena se ignora", async () => {
  const { ws } = await setupAgency("Pausada");
  await b.startCheckout(await ctxFor(ws), "marca", "otro@test.com");
  const preId = [...mp.keys()].at(-1)!;
  Object.assign(mp.get(preId)!, { status: "authorized", date_created: "2020-01-01T00:00:00Z" });
  await dbm.run("UPDATE subscriptions SET created_at = '2020-01-01T00:00:00Z' WHERE provider_id = ?", [preId]);
  await b.handleNotification("subscription_preapproval", preId);
  assert.equal((await wsPlan(ws)).plan, "prueba"); // autorizada hace mucho y nunca cobrada
  mp.set("ajena", { id: "ajena", status: "authorized", external_reference: "sub_de_otro" });
  assert.equal(await b.handleNotification("subscription_preapproval", "ajena"), "desconocida");
});

test("límites del plan de prueba", async () => {
  const { ws, brand } = await setupAgency("Limitada");
  const ctx = await ctxFor(ws);
  assert.equal(ctx.plan.id, "prueba");
  assert.match(b.canCreateBrand(ctx, 1)!, /1 cliente/);
  assert.equal(b.canCreateBrand(ctx, 0), null);
  assert.match((await b.canStartAnalysis(ctx, { prompts: 12, collectors: 1, repetitions: 1 }))!, /10 preguntas/);
  assert.match((await b.canStartAnalysis(ctx, { prompts: 5, collectors: 1, repetitions: 3 }))!, /repetición/);
  assert.equal(await b.canStartAnalysis(ctx, { prompts: 5, collectors: 2, repetitions: 1 }), null);
  await dbm.run("INSERT INTO runs (id, brand_id, workspace_id, status, created_at) VALUES ('run_x', ?, ?, 'completed', ?)", [brand, ws, dbm.now()]);
  assert.match((await b.canStartAnalysis(ctx, { prompts: 5, collectors: 2, repetitions: 1 }))!, /por mes/);
});

test("firma del webhook", async () => {
  const { verifyWebhookSignature } = await import("../lib/mercadopago");
  const secret = "secreto";
  const ts = "1704908010";
  const v1 = createHmac("sha256", secret).update(`id:abc123;request-id:req-1;ts:${ts};`).digest("hex");
  assert.ok(verifyWebhookSignature({ secret, signature: `ts=${ts},v1=${v1}`, requestId: "req-1", dataId: "ABC123" }));
  assert.ok(!verifyWebhookSignature({ secret, signature: `ts=${ts},v1=${v1}`, requestId: "req-2", dataId: "abc123" }));
  assert.ok(!verifyWebhookSignature({ secret, signature: null, requestId: "req-1", dataId: "abc123" }));
  assert.ok(!verifyWebhookSignature({ secret, signature: "ts=1,v1=zz", requestId: "req-1", dataId: "abc123" }));
});
