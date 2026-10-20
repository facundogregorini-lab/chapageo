import { notFound } from "next/navigation";
import { Badge, Stat, fmtDate } from "@/components/ui";
import { requireCtx } from "@/lib/auth";
import { all, one } from "@/lib/db";
import { FUNNEL } from "@/lib/events";
import { updateLeadAction } from "./actions";

export const metadata = { title: "Validación" };

type Lead = { id: string; email: string; name: string | null; company: string | null; phone: string | null; domain: string | null; source: string; offer: string | null; note: string | null; stage: string; amount_usd: number | null; created_at: string };

export default async function Page({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const ctx = await requireCtx();
  if (!ctx.isAdmin) notFound();
  const days = Number((await searchParams).dias ?? 7);
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const counts = await all<{ name: string; n: number; v: number }>(
    "SELECT name, COUNT(*) AS n, COUNT(DISTINCT visitor) AS v FROM events WHERE created_at >= ? GROUP BY name",
    [since],
  );
  const c = (name: string) => counts.find((x) => x.name === name);
  const leads = await all<Lead>("SELECT * FROM leads ORDER BY created_at DESC LIMIT 200");
  const paid = leads.filter((l) => l.stage === "pago");
  const revenue = paid.reduce((a, l) => a + Number(l.amount_usd ?? 0), 0);
  const agencies = paid.filter((l) => l.offer === "agencia").length;
  const runs = await one<{ n: number; cost: number }>("SELECT COUNT(*) AS n, COALESCE(SUM(cost_usd),0) AS cost FROM runs WHERE created_at >= ? AND simulated = 0", [since]);

  const goalMet = paid.length >= 3 || agencies >= 2;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Validación de product-market fit</h1>
          <p className="text-sm text-mute">Embudo, leads y criterio de continuar / iterar / frenar del plan de Astra.</p>
        </div>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <a key={d} href={`?dias=${d}`} className={`btn-sm ${days === d ? "btn-primary" : "btn-ghost"}`}>{d} días</a>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Compradores (pago)" value={String(paid.length)} hint={`Meta: 3 independientes o 2 agencias · ${agencies} agencias`} tone={goalMet ? "ok" : undefined} />
        <Stat label="Cobrado (USD)" value={`US$${revenue.toLocaleString("es-AR")}`} hint="Cargado a mano en cada lead" />
        <Stat label="Leads totales" value={String(leads.length)} hint={`${leads.filter((l) => l.created_at >= since).length} en ${days} días`} />
        <Stat label="Costo de medición real" value={`US$${Number(runs?.cost ?? 0).toFixed(2)}`} hint={`${runs?.n ?? 0} corridas no simuladas en ${days} días`} />
      </div>

      <div className="card p-5">
        <h2 className="font-bold">Embudo · últimos {days} días</h2>
        <div className="mt-4 space-y-2.5">
          {FUNNEL.map((f) => {
            const row = c(f.name);
            const top = Math.max(1, ...FUNNEL.map((x) => Number(c(x.name)?.n ?? 0)));
            const n = Number(row?.n ?? 0);
            return (
              <div key={f.name} className="grid grid-cols-[200px_1fr_90px] items-center gap-3 text-sm">
                <span>{f.label}</span>
                <div className="h-6 overflow-hidden rounded-lg bg-paper">
                  <div className="h-full rounded-lg bg-celeste/80" style={{ width: `${(n / top) * 100}%` }} />
                </div>
                <span className="text-right font-semibold">{n}<span className="ml-1 text-xs font-normal text-mute">{row?.v ? `(${row.v} únicos)` : ""}</span></span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["Continuar", "3 compradores independientes o 2 agencias pagas, >80% de entregas aceptadas y al menos 1 acepta continuidad.", goalMet ? "ok" : "neutral"],
          ["Iterar", "Hay llamadas y dolor pero nadie paga: probar ejecución más concreta o ticket mayor. Pagan auditoría pero no mensual: servicio productizado.", "sol"],
          ["Frenar / pivotar", "10 conversaciones calificadas y 20 propuestas sin pagos ni siguiente paso: pausar desarrollo.", "bad"],
        ].map(([t, d, tone]) => (
          <div key={t} className="card p-5">
            <Badge tone={tone as "ok"}>{t}</Badge>
            <p className="mt-2 text-sm text-mute">{d}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-bold">Leads</h2>
          <a href="/api/leads" className="btn-ghost btn-sm">Exportar CSV</a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-paper text-left text-xs text-mute">
              <tr><th className="px-5 py-2.5">Fecha</th><th className="px-3 py-2.5">Contacto</th><th className="px-3 py-2.5">Marca</th><th className="px-3 py-2.5">Origen</th><th className="px-3 py-2.5">Nota</th><th className="px-5 py-2.5">Etapa</th></tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="border-t border-line align-top">
                  <td className="px-5 py-3 text-xs text-mute">{fmtDate(l.created_at, true)}</td>
                  <td className="px-3 py-3">
                    <div className="font-semibold">{l.name ?? "—"} {l.company ? <span className="font-normal text-mute">· {l.company}</span> : null}</div>
                    <div className="text-xs"><a href={`mailto:${l.email}`} className="text-celeste-700">{l.email}</a> {l.phone ? `· ${l.phone}` : ""}</div>
                  </td>
                  <td className="px-3 py-3 text-xs">{l.domain ?? "—"}</td>
                  <td className="px-3 py-3 text-xs"><Badge>{l.source}</Badge> {l.offer ? <Badge tone="celeste">{l.offer}</Badge> : null}</td>
                  <td className="max-w-xs px-3 py-3 text-xs text-mute">{l.note ?? ""}</td>
                  <td className="px-5 py-3">
                    <form action={updateLeadAction.bind(null, l.id)} className="flex gap-1.5">
                      <select name="stage" defaultValue={l.stage} className="input w-auto py-1 text-xs">
                        {["nuevo", "contactado", "propuesta", "pago", "perdido"].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <input name="amount_usd" defaultValue={l.amount_usd ?? ""} placeholder="US$" className="input w-20 py-1 text-xs" />
                      <button className="btn-ghost btn-sm">OK</button>
                    </form>
                  </td>
                </tr>
              ))}
              {!leads.length ? <tr><td colSpan={6} className="px-5 py-8 text-center text-mute">Todavía no hay leads. Compartí el checker con tu red.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
