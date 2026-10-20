import Link from "next/link";
import { Badge, Bar, Empty, EngineBadge, fmtDate, pct } from "@/components/ui";
import { promptPoolUsed, workspaceBrands } from "@/lib/access";
import { requireCtx } from "@/lib/auth";
import { countryName } from "@/lib/config";
import { one } from "@/lib/db";
import { brandMetrics, brandTrend } from "@/lib/metrics";

export const metadata = { title: "Cartera" };

export default async function Cartera() {
  const ctx = await requireCtx();
  const brands = await workspaceBrands(ctx.workspace.id);
  const pool = await promptPoolUsed(ctx.workspace.id);
  const rows = await Promise.all(
    brands.map(async (b) => {
      const [m, trend, pending] = await Promise.all([
        brandMetrics(b),
        brandTrend(b, 2),
        one<{ n: number }>("SELECT COUNT(*) AS n FROM actions WHERE brand_id = ? AND status IN ('pendiente','en_curso')", [b.id]),
      ]);
      const delta = trend.length === 2 ? trend[1].mention - trend[0].mention : null;
      return { b, m, delta, pending: Number(pending?.n ?? 0) };
    }),
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cartera</h1>
          <p className="text-sm text-mute">
            {brands.length} marca{brands.length === 1 ? "" : "s"} · {pool} de {ctx.plan.promptPool} preguntas del pool en uso
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/app/prospeccion" className="btn-ghost">Auditar un prospecto</Link>
          <Link href="/app/marcas/nueva" className="btn-primary">+ Nueva marca</Link>
        </div>
      </div>

      {brands.length === 0 ? (
        <div className="mt-8">
          <Empty title="Todavía no configuraste ninguna marca">
            Cargá el sitio, el rubro y tus competidores: te sugerimos las preguntas y corremos la primera medición.
            <div className="mt-4">
              <Link href="/app/marcas/nueva" className="btn-primary">Configurar mi primera marca</Link>
            </div>
          </Empty>
        </div>
      ) : (
        <div className="mt-6 card overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-paper text-left text-xs font-semibold text-mute">
              <tr>
                <th className="px-5 py-3">Marca</th>
                <th className="px-3 py-3">Tasa de mención</th>
                <th className="px-3 py-3">Share of voice</th>
                <th className="px-3 py-3">Posición prom.</th>
                <th className="px-3 py-3">Motores</th>
                <th className="px-3 py-3">Acciones</th>
                <th className="px-5 py-3 text-right">Último corte</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ b, m, delta, pending }) => (
                <tr key={b.id} className="border-t border-line hover:bg-paper/50">
                  <td className="px-5 py-4">
                    <Link href={`/app/marcas/${b.id}`} className="font-semibold hover:underline">{b.name}</Link>
                    <div className="text-xs text-mute">{b.domain} · {b.city ?? countryName(b.country)}</div>
                  </td>
                  <td className="px-3 py-4">
                    {m.run ? (
                      <div className="w-40">
                        <div className="flex items-baseline justify-between">
                          <span className="font-semibold">{pct(m.mention.rate)}</span>
                          {delta != null ? (
                            <span className={`text-xs font-semibold ${delta > 0 ? "text-ok" : delta < 0 ? "text-bad" : "text-mute"}`}>
                              {delta > 0 ? "▲" : delta < 0 ? "▼" : "="} {Math.abs(Math.round(delta * 100))} pts
                            </span>
                          ) : null}
                        </div>
                        <Bar value={m.mention.rate} className="mt-1" />
                        <div className="mt-0.5 text-[11px] text-mute">{m.mention.num}/{m.mention.den}</div>
                      </div>
                    ) : (
                      <span className="text-mute">Sin datos</span>
                    )}
                  </td>
                  <td className="px-3 py-4 font-semibold">{m.run ? pct(m.sov.rate) : "—"}</td>
                  <td className="px-3 py-4">{m.avgPosition ?? "—"}</td>
                  <td className="px-3 py-4">
                    <div className="flex flex-wrap gap-1">
                      {b.engines.map((e) => (
                        <EngineBadge key={e} engine={e} />
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-4">{pending ? <Badge tone="sol">{pending} abiertas</Badge> : <span className="text-mute">—</span>}</td>
                  <td className="px-5 py-4 text-right text-xs text-mute">
                    {fmtDate(b.last_run_at)}
                    {m.simulated ? <div><Badge tone="sol">simulado</Badge></div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
