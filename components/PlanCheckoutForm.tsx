"use client";

import { useActionState } from "react";
import { checkoutAction } from "@/app/app/plan/actions";

export function PlanCheckoutForm({ plan, email, label, primary }: { plan: string; email: string; label: string; primary?: boolean }) {
  const [state, action, pending] = useActionState(checkoutAction, undefined);
  return (
    <form action={action} className="mt-5 space-y-3">
      <input type="hidden" name="plan" value={plan} />
      <div>
        <label className="label" htmlFor={`payer-${plan}`}>Email de tu cuenta de Mercado Pago</label>
        <input id={`payer-${plan}`} name="payer_email" type="email" required defaultValue={email} className="input" />
      </div>
      {state?.error ? <p className="text-sm text-bad">{state.error}</p> : null}
      <button className={`${primary ? "btn-primary" : "btn-ghost"} w-full`} disabled={pending}>
        {pending ? "Abriendo Mercado Pago…" : label}
      </button>
    </form>
  );
}
