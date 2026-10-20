"use client";

import { useActionState } from "react";
import { leadAction } from "@/app/actions";

export function LeadForm({
  source,
  offer,
  domain,
  auditId,
  cta = "Quiero que me contacten",
  compact = false,
  whatsapp,
}: {
  source: string;
  offer?: string;
  domain?: string;
  auditId?: string;
  cta?: string;
  compact?: boolean;
  whatsapp?: string | null;
}) {
  const [state, action, pending] = useActionState(leadAction, undefined);
  if (state?.ok) {
    return (
      <div className="rounded-2xl border border-ok/30 bg-ok-50 p-5 text-sm">
        <div className="font-semibold text-ok">¡Listo! Te escribimos en menos de 24 h hábiles.</div>
        <p className="mt-1 text-mute">Si querés ir más rápido, mandanos un WhatsApp con el dominio de tu marca.</p>
        {whatsapp ? (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm mt-3">
            Escribir por WhatsApp
          </a>
        ) : null}
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="offer" value={offer ?? ""} />
      <input type="hidden" name="audit_id" value={auditId ?? ""} />
      <div className={`grid gap-3 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2"}`}>
        <div>
          <label className="label" htmlFor="lead-name">Nombre</label>
          <input id="lead-name" name="name" className="input" autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="lead-email">Email *</label>
          <input id="lead-email" name="email" type="email" required className="input" autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="lead-company">Empresa / agencia</label>
          <input id="lead-company" name="company" className="input" autoComplete="organization" />
        </div>
        <div>
          <label className="label" htmlFor="lead-phone">WhatsApp</label>
          <input id="lead-phone" name="phone" className="input" placeholder="+54 9 11 …" autoComplete="tel" />
        </div>
      </div>
      {compact ? (
        <input type="hidden" name="domain" value={domain ?? ""} />
      ) : (
        <>
          <div>
            <label className="label" htmlFor="lead-domain">Sitio web de la marca</label>
            <input id="lead-domain" name="domain" defaultValue={domain} className="input" placeholder="tumarca.com.ar" />
          </div>
          <div>
            <label className="label" htmlFor="lead-note">¿Qué te gustaría saber?</label>
            <textarea id="lead-note" name="note" rows={3} className="input" placeholder="Ej: quiero saber si ChatGPT recomienda a mi competencia cuando buscan estudios contables en Córdoba." />
          </div>
        </>
      )}
      {state?.error ? <p className="text-sm text-bad">{state.error}</p> : null}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Enviando…" : cta}</button>
    </form>
  );
}
