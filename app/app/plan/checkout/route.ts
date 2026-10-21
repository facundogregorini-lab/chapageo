import { NextResponse, type NextRequest } from "next/server";
import { getCtx } from "@/lib/auth";
import { BillingError, startCheckout } from "@/lib/billing";
import { isSubscriptionPlan } from "@/lib/config";

export const dynamic = "force-dynamic";

// «Suscribirme» desde precios o después del registro: va directo al checkout de Mercado Pago.
// Sin cuenta real (o con la sesión de la demo abierta) manda a crear la cuenta con el plan elegido.
export async function GET(req: NextRequest) {
  const plan = req.nextUrl.searchParams.get("plan") ?? "";
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url));
  if (!isSubscriptionPlan(plan)) return to("/app/plan");
  const ctx = await getCtx();
  if (!ctx || Number(ctx.workspace.is_demo ?? 0)) return to(`/registro?plan=${plan}`);
  try {
    return NextResponse.redirect(await startCheckout(ctx, plan, req.nextUrl.origin));
  } catch (e) {
    const msg = e instanceof BillingError ? e.message : "No pudimos iniciar el pago. Probá de nuevo.";
    if (!(e instanceof BillingError)) console.error("checkout", e);
    return to(`/app/plan?plan=${plan}&error=${encodeURIComponent(msg)}`);
  }
}
