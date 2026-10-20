import { LeadForm } from "@/components/LeadForm";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { PLANS, payLink, salesWhatsapp, type PlanId } from "@/lib/config";

export const metadata = { title: "Contacto" };

export default async function Page({ searchParams }: { searchParams: Promise<{ oferta?: string; d?: string }> }) {
  const { oferta, d } = await searchParams;
  const plan = oferta && oferta in PLANS ? PLANS[oferta as PlanId] : null;
  const pay = plan ? payLink(plan) : null;
  const wa = salesWhatsapp(`Hola! Quiero ${plan ? "el plan " + plan.name : "info de ChapaGEO"}${d ? " para " + d : ""}.`);
  return (
    <>
      <SiteHeader />
      <main className="mx-auto grid max-w-5xl gap-10 px-4 py-16 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <div className="eyebrow">{plan ? plan.name : "Contacto"}</div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">
            {plan?.id === "diagnostico"
              ? "En 48 horas sabés cuándo la IA recomienda a tu competencia."
              : plan?.id === "agencia"
                ? "Sumá GEO a los servicios de tu agencia."
                : "Contanos de tu marca y te mostramos qué dice la IA."}
          </h1>
          {plan ? (
            <div className="mt-6 card p-5">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold">US${plan.priceUsd}</span>
                <span className="text-sm text-mute">{plan.period === "mes" ? "/ mes" : "pago único"}</span>
              </div>
              <ul className="mt-4 space-y-2 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-celeste" />
                    {f}
                  </li>
                ))}
              </ul>
              {pay ? (
                <a href={pay} className="btn-celeste mt-5 w-full" target="_blank" rel="noopener noreferrer">
                  Pagar ahora con Mercado Pago
                </a>
              ) : null}
            </div>
          ) : null}
          <p className="mt-6 text-sm text-mute">
            Te respondemos en menos de 24 h hábiles. Si preferís, escribinos por WhatsApp
            {wa ? (
              <>
                {" "}
                <a href={wa} className="font-semibold text-ink underline" target="_blank" rel="noopener noreferrer">
                  acá
                </a>
              </>
            ) : null}
            .
          </p>
        </div>
        <div className="card p-6">
          <LeadForm source="contacto" offer={plan?.id} domain={d} cta={plan?.id === "diagnostico" ? "Reservar mi diagnóstico" : "Enviar"} whatsapp={wa} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
