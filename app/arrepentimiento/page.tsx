import Link from "next/link";
import { LeadForm } from "@/components/LeadForm";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

export const metadata = { title: "Botón de arrepentimiento" };

// Ley 24.240 (art. 34) y Resolución 424/2020: revocar una contratación online dentro de los 10 días corridos.
export default function Page() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto grid max-w-5xl gap-10 px-4 py-16 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <div className="eyebrow">Botón de arrepentimiento</div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Revocá tu contratación</h1>
          <p className="mt-4 text-mute">
            Tenés 10 días corridos desde que contrataste un plan para arrepentirte, sin dar explicaciones y sin costo. Completá el formulario con el email
            de tu cuenta y te confirmamos la revocación y la devolución por email.
          </p>
          <p className="mt-4 text-sm text-mute">
            Si solo querés que no se te cobre más, podés cancelar la suscripción vos mismo desde{" "}
            <Link href="/app/plan" className="font-semibold text-ink underline">Plan y pago</Link>.
          </p>
        </div>
        <div className="card p-6">
          <LeadForm
            source="arrepentimiento"
            cta="Solicitar la revocación"
            noteLabel="Plan y fecha en que lo contrataste (opcional)"
            notePlaceholder="Ej: plan Monitoreo, contratado el 20 de octubre."
            done="Recibimos tu pedido de revocación. Te confirmamos por email el código de trámite y la devolución."
          />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
