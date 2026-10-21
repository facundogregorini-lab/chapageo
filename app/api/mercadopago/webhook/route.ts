import { NextResponse, type NextRequest } from "next/server";
import { handleNotification } from "@/lib/billing";
import { mpConfigured, verifyWebhookSignature } from "@/lib/mercadopago";

export const dynamic = "force-dynamic";

// Webhook de Mercado Pago ("Planes y suscripciones"). No confiamos en el cuerpo: solo tomamos el id
// y consultamos la suscripción a la API con nuestro token. Si hay MP_WEBHOOK_SECRET, además validamos la firma.
export async function POST(req: NextRequest) {
  if (!mpConfigured()) return NextResponse.json({ error: "pagos deshabilitados" }, { status: 503 });
  const q = req.nextUrl.searchParams;
  const body = (await req.json().catch(() => null)) as { type?: string; topic?: string; action?: string; data?: { id?: string | number } } | null;
  const topic = String(body?.type ?? body?.topic ?? q.get("type") ?? q.get("topic") ?? "");
  const resourceId = String(q.get("data.id") ?? body?.data?.id ?? q.get("id") ?? "");
  if (!topic || !resourceId) return NextResponse.json({ ok: true, ignored: true });

  const secret = process.env.MP_WEBHOOK_SECRET;
  if (secret) {
    const valid = verifyWebhookSignature({
      secret,
      signature: req.headers.get("x-signature"),
      requestId: req.headers.get("x-request-id"),
      dataId: q.get("data.id") ?? resourceId,
    });
    if (!valid) return NextResponse.json({ error: "firma inválida" }, { status: 401 });
  }

  try {
    const result = await handleNotification(topic, resourceId);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("mp_webhook", topic, resourceId, e);
    // 500: Mercado Pago reintenta la notificación más tarde.
    return NextResponse.json({ error: "no se pudo procesar" }, { status: 500 });
  }
}
