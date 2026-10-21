// Cliente mínimo de la API de suscripciones de Mercado Pago (Preapproval, sin plan asociado).
// Docs: https://www.mercadopago.com.ar/developers/es/reference/subscriptions/_preapproval/post
// Solo corre en el servidor: usa MP_ACCESS_TOKEN, que nunca llega al navegador.

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const API = process.env.MP_API_URL || "https://api.mercadopago.com";

export type PreapprovalStatus = "pending" | "authorized" | "paused" | "cancelled";

export type Preapproval = {
  id: string;
  status: PreapprovalStatus | string;
  external_reference?: string | null;
  payer_email?: string | null;
  payer_id?: number | null;
  init_point?: string | null;
  sandbox_init_point?: string | null;
  date_created?: string | null;
  last_modified?: string | null;
  next_payment_date?: string | null;
  auto_recurring?: { frequency?: number; frequency_type?: string; transaction_amount?: number; currency_id?: string };
  summarized?: { charged_quantity?: number | null; last_charged_date?: string | null; last_charged_amount?: number | null } | null;
};

export class MercadoPagoError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
  }
}

export function mpConfigured(): boolean {
  return Boolean(process.env.MP_ACCESS_TOKEN);
}

/** Credenciales de prueba (sandbox): las de un usuario vendedor de prueba o las que empiezan con TEST-. */
export function mpTestMode(): boolean {
  return process.env.MP_TEST_MODE === "1" || (process.env.MP_ACCESS_TOKEN ?? "").startsWith("TEST-");
}

async function call<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<T> {
  const tokenValue = process.env.MP_ACCESS_TOKEN;
  if (!tokenValue) throw new MercadoPagoError("Falta MP_ACCESS_TOKEN", 0, null);
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${tokenValue}`,
      "Content-Type": "application/json",
      ...(method === "POST" ? { "X-Idempotency-Key": randomUUID() } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    const msg = (json as { message?: string } | null)?.message ?? `HTTP ${res.status}`;
    throw new MercadoPagoError(`Mercado Pago: ${msg}`, res.status, json);
  }
  return json as T;
}

export type CreatePreapprovalInput = {
  reason: string;
  externalReference: string;
  payerEmail: string;
  amount: number;
  currency: string;
  backUrl: string;
};

/** Crea la suscripción en estado pendiente: el pagador la autoriza en el checkout de Mercado Pago (init_point). */
export function createPreapproval(i: CreatePreapprovalInput): Promise<Preapproval> {
  return call<Preapproval>("POST", "/preapproval", {
    reason: i.reason,
    external_reference: i.externalReference,
    payer_email: i.payerEmail,
    back_url: i.backUrl,
    status: "pending",
    auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: i.amount, currency_id: i.currency },
  });
}

export function getPreapproval(id: string): Promise<Preapproval> {
  return call<Preapproval>("GET", `/preapproval/${encodeURIComponent(id)}`);
}

export function updatePreapprovalStatus(id: string, status: "cancelled" | "paused" | "authorized"): Promise<Preapproval> {
  return call<Preapproval>("PUT", `/preapproval/${encodeURIComponent(id)}`, { status });
}

/** Cada cobro mensual es un "authorized payment"; de ahí sacamos a qué suscripción pertenece. */
export function getAuthorizedPayment(id: string): Promise<{ id: number | string; preapproval_id?: string | null; status?: string }> {
  return call("GET", `/authorized_payments/${encodeURIComponent(id)}`);
}

/**
 * Valida la firma x-signature de un webhook (clave secreta del panel de Webhooks de la app).
 * Manifiesto: id:<data.id>;request-id:<x-request-id>;ts:<ts>;  (se omiten las partes que no vienen).
 */
export function verifyWebhookSignature(opts: {
  secret: string;
  signature: string | null;
  requestId: string | null;
  dataId: string | null;
  maxAgeMs?: number;
  now?: number;
}): boolean {
  if (!opts.signature) return false;
  const parts = Object.fromEntries(
    opts.signature.split(",").map((p) => {
      const [k, ...v] = p.trim().split("=");
      return [k, v.join("=")];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1 || !/^[0-9a-f]+$/i.test(v1)) return false;
  if (opts.maxAgeMs) {
    // ts viene en milisegundos o en segundos según la versión de la notificación.
    const tsMs = ts.length > 11 ? Number(ts) : Number(ts) * 1000;
    if (!Number.isFinite(tsMs) || Math.abs((opts.now ?? Date.now()) - tsMs) > opts.maxAgeMs) return false;
  }
  const dataId = opts.dataId && /^[a-z0-9]+$/i.test(opts.dataId) ? opts.dataId.toLowerCase() : opts.dataId;
  let manifest = "";
  if (dataId) manifest += `id:${dataId};`;
  if (opts.requestId) manifest += `request-id:${opts.requestId};`;
  manifest += `ts:${ts};`;
  const expected = createHmac("sha256", opts.secret).update(manifest).digest();
  const given = Buffer.from(v1, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
