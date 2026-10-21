"use client";

import { useActionState } from "react";
import { checkoutAction } from "@/app/app/plan/actions";

export function PlanCheckoutForm({ plan, label, primary }: { plan: string; label: string; primary?: boolean }) {
  const [state, action, pending] = useActionState(checkoutAction, undefined);
  return (
    <form action={action} className="mt-5 space-y-2">
      <input type="hidden" name="plan" value={plan} />
      {state?.error ? <p className="text-sm text-bad">{state.error}</p> : null}
      <button className={`${primary ? "btn-primary" : "btn-ghost"} w-full`} disabled={pending}>
        {pending ? "Abriendo Mercado Pago…" : label}
      </button>
      <p className="text-center text-xs text-mute">Pagás entrando con tu cuenta de Mercado Pago.</p>
    </form>
  );
}
