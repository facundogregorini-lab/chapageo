"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireCtx } from "@/lib/auth";
import { BillingError, cancelSubscription, startCheckout } from "@/lib/billing";

export type CheckoutState = { error?: string } | undefined;

async function requestOrigin(): Promise<string | undefined> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return undefined;
  return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
}

export async function checkoutAction(_: CheckoutState, form: FormData): Promise<CheckoutState> {
  const ctx = await requireCtx();
  let url: string;
  try {
    url = await startCheckout(ctx, String(form.get("plan") ?? ""), String(form.get("payer_email") ?? ctx.user.email), await requestOrigin());
  } catch (e) {
    if (e instanceof BillingError) return { error: e.message };
    console.error("checkout", e);
    return { error: "No pudimos iniciar el pago. Probá de nuevo." };
  }
  redirect(url);
}

export async function cancelSubscriptionAction(form: FormData) {
  const ctx = await requireCtx();
  try {
    await cancelSubscription(ctx, String(form.get("sub") ?? ""));
  } catch (e) {
    if (!(e instanceof BillingError)) throw e;
    redirect(`/app/plan?error=${encodeURIComponent(e.message)}`);
  }
  revalidatePath("/app", "layout");
  redirect("/app/plan?baja=1");
}
