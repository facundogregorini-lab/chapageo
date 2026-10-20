import Link from "next/link";
import { PricingCards } from "@/components/PricingCards";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { TrackView } from "@/components/Track";

export const metadata = { title: "Precios" };

const COMPARE = [
  ["", "Diagnóstico", "Monitoreo", "Agencia"],
  ["Marcas", "1", "1", "Hasta 10"],
  ["Preguntas", "20", "20", "60 en pool compartido"],
  ["Motores", "ChatGPT + Gemini", "ChatGPT + Gemini", "ChatGPT, Gemini, Perplexity, Claude"],
  ["Repeticiones por pregunta", "3", "3", "3"],
  ["Frecuencia", "1 corte", "Semanal", "Semanal + a demanda"],
  ["Backlog de acciones con evidencia", "✓", "✓", "✓"],
  ["Borradores de contenido", "3", "Incluidos", "Incluidos"],
  ["Auditorías de prospección", "—", "—", "15 por mes"],
  ["Reportes white-label", "—", "—", "✓"],
  ["Sesión con el equipo", "30 min", "Revisión mensual", "Onboarding"],
];

export default function Page() {
  return (
    <>
      <TrackView name="pricing_view" />
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <div className="eyebrow">Precios</div>
          <h1 className="mt-3 text-4xl font-bold tracking-tight">Pagás por lo que te sirve, en pesos o en dólares.</h1>
          <p className="mt-3 text-mute">
            Precios en dólares de referencia; con Mercado Pago pagás en pesos al tipo de cambio del día. Si querés probar primero, el{" "}
            <Link href="/checker" className="font-semibold text-ink underline">checker</Link> es gratis.
          </p>
        </div>
        <div className="mt-12">
          <PricingCards />
        </div>
        <div className="card mt-12 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <tbody>
              {COMPARE.map((row, i) => (
                <tr key={i} className={i === 0 ? "bg-paper font-semibold" : "border-t border-line"}>
                  {row.map((c, j) => (
                    <td key={j} className={`px-4 py-3 ${j === 0 ? "font-medium" : "text-center"}`}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-6 text-center text-sm text-mute">
          ¿Necesitás más marcas, otros países o frecuencia diaria? <Link href="/contacto?oferta=agencia" className="font-semibold text-ink underline">Armamos un plan a medida</Link>.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
