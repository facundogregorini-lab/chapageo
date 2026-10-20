import { PLANS, payLink, type PlanId } from "@/lib/config";
import { TrackLink } from "./Track";

const ORDER: PlanId[] = ["diagnostico", "marca", "agencia"];
const CTA: Record<string, string> = {
  diagnostico: "Quiero mi diagnóstico",
  marca: "Empezar monitoreo",
  agencia: "Hablar como agencia",
};

export function PricingCards() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {ORDER.map((pid) => {
        const p = PLANS[pid];
        const href = payLink(p) ?? `/contacto?oferta=${p.id}`;
        return (
          <div key={p.id} className={`card relative flex flex-col p-6 ${p.highlight ? "border-ink shadow-[0_10px_40px_-15px_rgba(11,18,32,0.35)]" : ""}`}>
            {p.highlight ? (
              <span className="absolute -top-3 left-6 rounded-full bg-sol px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-ink">
                Empezá por acá
              </span>
            ) : null}
            <div className="text-sm font-semibold text-mute">{p.name}</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-4xl font-bold tracking-tight">US${p.priceUsd}</span>
              <span className="text-sm text-mute">{p.period === "mes" ? "/ mes" : "pago único"}</span>
            </div>
            <p className="mt-2 text-sm text-mute">{p.tagline}</p>
            <ul className="mt-5 flex-1 space-y-2 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-celeste" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <TrackLink name="pricing_click" props={{ plan: p.id }} href={href} className={`mt-6 ${p.highlight ? "btn-primary" : "btn-ghost"}`}>
              {CTA[p.id]}
            </TrackLink>
          </div>
        );
      })}
    </div>
  );
}
